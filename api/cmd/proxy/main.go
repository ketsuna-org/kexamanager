package main

import (
	"crypto/tls"
	"flag"
	"fmt"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// getEnv returns the first non-empty environment variable value among keys.
// kept small helpers below; environment-driven configuration has been removed
// from the default code path so that builds do not rely on environment
// variables. Runtime flags (or PORT env) can be used when launching the
// binary in production.

// newReverseProxy creates a reverse proxy to target, stripping the given prefix from incoming requests.
// It mirrors Vite's proxy options: changeOrigin=true and secure=false (skip TLS verify).
func newReverseProxy(target *url.URL, stripPrefix string) *httputil.ReverseProxy {
	director := func(req *http.Request) {
		// Keep original host before changeOrigin
		originalHost := req.Host
		// Preserve original path but remove the proxy prefix
		p := req.URL.Path
		if stripPrefix != "" && strings.HasPrefix(p, stripPrefix) {
			p = strings.TrimPrefix(p, stripPrefix)
			if p == "" { // ensure at least "/"
				p = "/"
			}
		}

		// Join target base path with remaining path
		req.URL.Scheme = target.Scheme
		req.URL.Host = target.Host
		// Ensure single slash join between target.Path and p
		if target.Path == "" || target.Path == "/" {
			req.URL.Path = singleJoin("/", p)
		} else {
			req.URL.Path = singleJoin(target.Path, p)
		}

		// Query strings are preserved by default

		// changeOrigin: set Host header to target host
		req.Host = target.Host

		// Optionally you can forward original client IPs
		if ip := clientIP(req); ip != "" {
			// Append to X-Forwarded-For
			if prior := req.Header.Get("X-Forwarded-For"); prior != "" {
				req.Header.Set("X-Forwarded-For", prior+", "+ip)
			} else {
				req.Header.Set("X-Forwarded-For", ip)
			}
		}

		// Set X-Forwarded-Host and X-Forwarded-Proto for backend awareness
		req.Header.Set("X-Forwarded-Host", originalHost)
		if req.TLS != nil {
			req.Header.Set("X-Forwarded-Proto", "https")
		} else {
			req.Header.Set("X-Forwarded-Proto", "http")
		}
	}

	// secure: false -> InsecureSkipVerify for TLS
	transport := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		Proxy:           http.ProxyFromEnvironment,
		MaxIdleConns:    100,
		IdleConnTimeout: 90 * time.Second,
	}

	rp := &httputil.ReverseProxy{
		Director:  director,
		Transport: transport,
		ErrorHandler: func(rw http.ResponseWriter, req *http.Request, err error) {
			log.Printf("proxy error for %s %s: %v", req.Method, req.URL.String(), err)
			http.Error(rw, "Bad Gateway", http.StatusBadGateway)
		},
	}
	return rp
}

func singleJoin(a, b string) string {
	switch {
	case a == "" && b == "":
		return "/"
	case a == "":
		if strings.HasPrefix(b, "/") {
			return b
		}
		return "/" + b
	case b == "":
		if strings.HasSuffix(a, "/") {
			return a
		}
		return a + "/"
	default:
		as := strings.HasSuffix(a, "/")
		bp := strings.HasPrefix(b, "/")
		switch {
		case as && bp:
			return a + b[1:]
		case !as && !bp:
			return a + "/" + b
		default:
			return a + b
		}
	}
}

func clientIP(r *http.Request) string {
	// Best-effort: try X-Real-IP then RemoteAddr
	if ip := r.Header.Get("X-Real-IP"); ip != "" {
		return ip
	}
	// RemoteAddr may include port
	host := r.RemoteAddr
	if i := strings.LastIndex(host, ":"); i != -1 {
		return host[:i]
	}
	return host
}

func mustParse(raw string, name string) *url.URL {
	u, err := url.Parse(raw)
	if err != nil {
		log.Fatalf("invalid %s URL %q: %v", name, raw, err)
	}
	return u
}

func main() {
	// Vérifier les variables d'environnement obligatoires
	requiredEnvVars := []string{
		"VITE_API_ADMIN_URL",
		"VITE_API_PUBLIC_URL",
		"PORT",
	}

	for _, envVar := range requiredEnvVars {
		if value := strings.TrimSpace(os.Getenv(envVar)); value == "" {
			log.Fatalf("Required environment variable %s is not set", envVar)
		}
	}

	// Récupérer les valeurs des variables d'environnement
	adminTargetEnv := strings.TrimSpace(os.Getenv("VITE_API_ADMIN_URL"))
	publicTargetEnv := strings.TrimSpace(os.Getenv("VITE_API_PUBLIC_URL"))
	portEnv := strings.TrimSpace(os.Getenv("PORT"))

	// Flags (avec fallback sur les variables d'environnement)
	var (
		portFlag      = flag.String("port", portEnv, "Port to listen on")
		adminTarget   = flag.String("admin-target", adminTargetEnv, "Upstream URL for /api/admin reverse proxy")
		publicTarget  = flag.String("public-target", publicTargetEnv, "Upstream URL for /api/public reverse proxy")
		staticDirFlag = flag.String("static-dir", "./public", "Static files directory (relative to working dir)")
	)
	flag.Parse()

	// Utiliser les valeurs des flags (qui incluent maintenant les variables d'environnement)
	listenPort := strings.TrimSpace(*portFlag)
	if listenPort == "" {
		log.Fatalf("no port provided: PORT environment variable is required")
	}

	mux := http.NewServeMux()

	// Configuration des proxies avec les URLs obligatoires
	adminURL := mustParse(strings.TrimSpace(*adminTarget), "admin-target")
	adminProxy := newReverseProxy(adminURL, "/api/admin")
	mux.Handle("/api/admin/", adminProxy)
	log.Printf("/api/admin -> %s (changeOrigin: true, secure: false)\n", adminURL.Redacted())

	// Route pour retourner l'URL de VITE_API_PUBLIC_URL
	mux.HandleFunc("/api/getS3url", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(fmt.Sprintf(`{"url": "%s"}`, publicTargetEnv)))
	})
	log.Printf("/api/getS3url -> returns VITE_API_PUBLIC_URL: %s\n", publicTargetEnv)

	// Basic health endpoint for convenience
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	// Serve static files built by the frontend (if present).
	// Use the provided -static-dir flag (defaults to ./public). The Dockerfile
	// build will place compiled frontend files into /app/public and container
	// runtime should run the binary with working dir /app so ./public resolves.
	publicDir := strings.TrimSpace(*staticDirFlag)
	if publicDir == "" {
		publicDir = "./public"
	}
	if fi, err := os.Stat(publicDir); err == nil && fi.IsDir() {
		// Serve static files at root `/`, but keep /api/* handled by proxy above.
		fileServer := http.FileServer(http.Dir(publicDir))

		// Wrap file server to implement SPA fallback: if a file is not found,
		// return `index.html` so client-side routing works.
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			// If the request is for an API route, let it fall through (should be handled earlier)
			if strings.HasPrefix(r.URL.Path, "/api/") {
				http.NotFound(w, r)
				return
			}

			// Try to open the requested path
			p := filepath.Join(publicDir, strings.TrimPrefix(r.URL.Path, "/"))
			if f, err := os.Stat(p); err == nil && !f.IsDir() {
				fileServer.ServeHTTP(w, r)
				return
			}

			// Fallback to index.html for SPA
			index := filepath.Join(publicDir, "index.html")
			http.ServeFile(w, r, index)
		})

		log.Printf("Serving static files from %s at /\n", publicDir)
	} else {
		log.Printf("static public directory %s not found; not serving frontend files\n", publicDir)
	}

	addr := fmt.Sprintf(":%s", listenPort)
	srv := &http.Server{
		Addr:              addr,
		Handler:           loggingMiddleware(mux),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	log.Printf("Go proxy listening on %s", addr)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("server error: %v", err)
	}
}

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ww := &respWriter{ResponseWriter: w, status: 200}
		next.ServeHTTP(ww, r)
		log.Printf("%s %s %d %s", r.Method, r.URL.Path, ww.status, time.Since(start))
	})
}

type respWriter struct {
	http.ResponseWriter
	status int
}

func (w *respWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

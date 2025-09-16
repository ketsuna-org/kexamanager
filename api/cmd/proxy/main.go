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
	"strings"
	"time"
)

// getEnv returns the first non-empty environment variable value among keys.
func getEnv(keys ...string) string {
	for _, k := range keys {
		if v := strings.TrimSpace(os.Getenv(k)); v != "" {
			return v
		}
	}
	return ""
}

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
	// Flags
	var (
		port = flag.String("port", getEnv("PORT"), "Port to listen on (overrides PORT env)")
	)
	flag.Parse()

	// Targets from env (mirror vite.config.ts env names)
	adminTarget := getEnv("VITE_API_ADMIN_URL", "API_ADMIN_URL")
	publicTarget := getEnv("VITE_API_PUBLIC_URL", "API_PUBLIC_URL")

	if adminTarget == "" && publicTarget == "" {
		log.Println("warning: neither VITE_API_ADMIN_URL/API_ADMIN_URL nor VITE_API_PUBLIC_URL/API_PUBLIC_URL is set; the proxy will not forward any /api/* calls")
	}

	mux := http.NewServeMux()

	if adminTarget != "" {
		adminURL := mustParse(adminTarget, "VITE_API_ADMIN_URL")
		adminProxy := newReverseProxy(adminURL, "/api/admin")
		mux.Handle("/api/admin/", adminProxy)
		log.Printf("/api/admin -> %s (changeOrigin: true, secure: false)\n", adminURL.Redacted())
	}

	if publicTarget != "" {
		publicURL := mustParse(publicTarget, "VITE_API_PUBLIC_URL")
		publicProxy := newReverseProxy(publicURL, "/api/public")
		mux.Handle("/api/public/", publicProxy)
		log.Printf("/api/public -> %s (changeOrigin: true, secure: false)\n", publicURL.Redacted())
	}

	// Basic health endpoint for convenience
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	listenPort := "8080"
	if *port != "" {
		listenPort = *port
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

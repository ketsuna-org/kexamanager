package main

import (
	"crypto/tls"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/ketsuna-org/kexamanager/cmd/proxy/s3"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

var db *gorm.DB

// Fonctions exposées pour les handlers S3
var ValidateTokenFunc func(*http.Request) (uint, error) = validateToken
var GetS3ConfigFunc func(uint, uint) (s3.S3ConfigData, error) = getS3Config

// getS3Config récupère une config S3 depuis la DB
func getS3Config(configID uint, userID uint) (s3.S3ConfigData, error) {
	var config S3Config
	if err := db.Where("id = ? AND user_id = ?", configID, userID).First(&config).Error; err != nil {
		return s3.S3ConfigData{}, err
	}
	return s3.S3ConfigData{
		ID:             config.ID,
		UserID:         config.UserID,
		Name:           config.Name,
		Type:           config.Type,
		S3URL:          config.S3URL,
		AdminURL:       config.AdminURL,
		AdminToken:     config.AdminToken,
		ClientID:       config.ClientID,
		ClientSecret:   config.ClientSecret,
		Region:         config.Region,
		ForcePathStyle: config.ForcePathStyle,
	}, nil
}

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

func handleProjectRoutes(w http.ResponseWriter, r *http.Request) {
	// Parse path: /api/{project}/{endpoint}
	// For example: /api/123/v2/CreateBucket or /api/123/s3/list-buckets
	pathParts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/"), "/")
	if len(pathParts) < 2 {
		jsonError(w, "Invalid path", http.StatusNotFound)
		return
	}

	projectIDStr := pathParts[0]
	endpointStart := pathParts[1]

	projectID, err := strconv.Atoi(projectIDStr)
	if err != nil {
		jsonError(w, "Invalid project ID", http.StatusBadRequest)
		return
	}

	// Validate token and get user ID
	userID, err := validateToken(r)
	if err != nil {
		jsonError(w, err.Error(), http.StatusUnauthorized)
		return
	}

	// Get the S3 config for this project
	config, err := getS3Config(uint(projectID), userID)
	if err != nil {
		jsonError(w, "Project not found", http.StatusNotFound)
		return
	}

	// Determine service and remaining path
	var service string
	var remainingPath string

	if endpointStart == "s3" {
		service = "s3"
		remainingPath = "/" + strings.Join(pathParts[2:], "/")
	} else if strings.HasPrefix(endpointStart, "v2") {
		service = "admin"
		remainingPath = "/" + strings.Join(pathParts[1:], "/")
	} else {
		jsonError(w, "Invalid service", http.StatusNotFound)
		return
	}

	switch service {
	case "admin":
		handleAdminProxy(w, r, config, remainingPath)
	case "s3":
		handleS3Request(w, r, config, remainingPath)
	default:
		jsonError(w, "Invalid service", http.StatusNotFound)
	}
}

func handleAdminProxy(w http.ResponseWriter, r *http.Request, config s3.S3ConfigData, remainingPath string) {
	if config.AdminURL == "" {
		jsonError(w, "Admin URL not configured for this project", http.StatusBadRequest)
		return
	}

	adminURL, err := url.Parse(config.AdminURL)
	if err != nil {
		jsonError(w, "Invalid admin URL", http.StatusInternalServerError)
		return
	}

	// Extract project ID from the path to create stripPrefix
	pathParts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/"), "/")
	if len(pathParts) == 0 || pathParts[0] == "" {
		jsonError(w, "Project ID missing in path", http.StatusBadRequest)
		return
	}

	projectIDStr := pathParts[0]
	stripPrefix := "/api/" + projectIDStr + "/"

	// Create proxy with the stripPrefix
	proxy := newReverseProxy(adminURL, stripPrefix)

	// For admin requests, use the admin token instead of user's JWT
	if config.AdminToken != "" {
		r.Header.Set("Authorization", "Bearer "+config.AdminToken)
	}

	proxy.ServeHTTP(w, r)
}

func handleS3Request(w http.ResponseWriter, r *http.Request, config s3.S3ConfigData, endpoint string) {
	// Trim leading slash from endpoint
	endpoint = strings.TrimPrefix(endpoint, "/")

	// Map endpoints to handlers
	switch endpoint {
	case "list-buckets":
		s3.HandleListBucketsWithConfig(config).ServeHTTP(w, r)
	case "create-bucket":
		s3.HandleCreateBucketWithConfig(config).ServeHTTP(w, r)
	case "delete-bucket":
		s3.HandleDeleteBucketWithConfig(config).ServeHTTP(w, r)
	case "list-objects":
		s3.HandleListObjectsWithConfig(config).ServeHTTP(w, r)
	case "get-object":
		s3.HandleGetObjectWithConfig(config).ServeHTTP(w, r)
	case "put-object":
		s3.HandlePutObjectWithConfig(config).ServeHTTP(w, r)
	case "delete-object":
		s3.HandleDeleteObjectWithConfig(config).ServeHTTP(w, r)
	default:
		http.NotFound(w, r)
	}
}

func mustParse(raw string, name string) *url.URL {
	u, err := url.Parse(raw)
	if err != nil {
		log.Fatalf("invalid %s URL %q: %v", name, raw, err)
	}
	return u
}

func init() {
	// Créer le répertoire data s'il n'existe pas
	dataDir := "./data"
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		log.Fatalf("failed to create data directory: %v", err)
	}
}

// initRootUser initialise ou met à jour l'utilisateur root depuis les variables d'environnement
func initRootUser() {
	rootUsername := "root"

	rootPassword := strings.TrimSpace(os.Getenv("PASSWORD"))
	if rootPassword == "" {
		rootPassword = "admin"
	}

	// Hasher le mot de passe
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(rootPassword), bcrypt.DefaultCost)
	if err != nil {
		log.Fatalf("failed to hash root password: %v", err)
	}

	var rootUser User
	result := db.Where("username = ?", rootUsername).First(&rootUser)

	if result.Error != nil {
		// L'utilisateur root n'existe pas, le créer
		rootUser = User{
			Username: rootUsername,
			Password: string(hashedPassword),
			Role:     "admin",
		}
		if err := db.Create(&rootUser).Error; err != nil {
			log.Fatalf("failed to create root user: %v", err)
		}
		log.Printf("Root user '%s' created successfully", rootUsername)
	} else {
		// L'utilisateur root existe, vérifier si le mot de passe a changé
		if err := bcrypt.CompareHashAndPassword([]byte(rootUser.Password), []byte(rootPassword)); err != nil {
			// Le mot de passe a changé, le mettre à jour
			rootUser.Password = string(hashedPassword)
			rootUser.Role = "admin" // S'assurer que le rôle est admin
			if err := db.Save(&rootUser).Error; err != nil {
				log.Fatalf("failed to update root user password: %v", err)
			}
			log.Printf("Root user '%s' password updated", rootUsername)
		}
	}
}

func main() {

	// Récupérer les valeurs des variables d'environnement
	portEnv := strings.TrimSpace(os.Getenv("PORT"))

	// Flags (avec fallback sur les variables d'environnement)
	var (
		portFlag      = flag.String("port", portEnv, "Port to listen on")
		staticDirFlag = flag.String("static-dir", "./public", "Static files directory (relative to working dir)")
	)
	flag.Parse()

	// Initialiser la base de données
	var err error
	db, err = gorm.Open(sqlite.Open("./data/kexamanager.db"), &gorm.Config{})
	if err != nil {
		log.Fatalf("failed to connect database: %v", err)
	}

	// Exécuter les migrations
	if err := RunMigrations(db); err != nil {
		log.Fatalf("failed to run migrations: %v", err)
	}

	// Initialiser l'utilisateur root
	initRootUser()

	// Initialiser les handlers S3
	s3.InitHandlers(validateToken, getS3Config)

	// Utiliser les valeurs des flags (qui incluent maintenant les variables d'environnement)
	listenPort := strings.TrimSpace(*portFlag)
	if listenPort == "" {
		log.Fatalf("no port provided: PORT environment variable is required")
	}

	mux := http.NewServeMux()

	// Auth endpoints (not project-specific) - MUST be registered before /api/
	mux.HandleFunc("/api/auth/login", HandleLogin)
	mux.HandleFunc("/api/auth/create-user", HandleCreateUser)
	mux.HandleFunc("/api/auth/users/", func(w http.ResponseWriter, r *http.Request) {
		// Check if it's exactly /api/auth/users or /api/auth/users/ (list all users)
		if r.URL.Path == "/api/auth/users" || r.URL.Path == "/api/auth/users/" {
			if r.Method == http.MethodGet {
				HandleListUsers(w, r)
			} else {
				jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
			}
			return
		}

		// Otherwise it's /api/auth/users/{id}
		switch r.Method {
		case http.MethodPut:
			HandleUpdateUser(w, r)
		case http.MethodDelete:
			HandleDeleteUser(w, r)
		default:
			jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/s3-configs", HandleGetS3Configs)
	mux.HandleFunc("/api/s3-configs/create", HandleCreateS3Config)
	mux.HandleFunc("/api/s3-configs/update", HandleUpdateS3Config)
	mux.HandleFunc("/api/s3-configs/delete", HandleDeleteS3Config)

	// Dynamic admin proxy based on project ID - registered last as catch-all
	mux.HandleFunc("/api/", handleProjectRoutes)

	// Health endpoint with system metrics
	mux.HandleFunc("/health", HandleHealth)

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

// HealthResponse représente la réponse du endpoint /health
type HealthResponse struct {
	Status    string   `json:"status"`
	Timestamp string   `json:"timestamp"`
	Memory    Memory   `json:"memory"`
	CPU       CPU      `json:"cpu"`
	Database  Database `json:"database"`
}

type Memory struct {
	Alloc      uint64  `json:"alloc_bytes"`       // Mémoire allouée actuellement
	TotalAlloc uint64  `json:"total_alloc_bytes"` // Total alloué depuis le démarrage
	Sys        uint64  `json:"sys_bytes"`         // Mémoire obtenue du système
	NumGC      uint32  `json:"num_gc"`            // Nombre de GC exécutés
	AllocMB    float64 `json:"alloc_mb"`          // Mémoire allouée en MB
	SysMB      float64 `json:"sys_mb"`            // Mémoire système en MB
}

type CPU struct {
	NumCPU       int `json:"num_cpu"`       // Nombre de CPUs
	NumGoroutine int `json:"num_goroutine"` // Nombre de goroutines
}

type Database struct {
	Path      string  `json:"path"`
	SizeBytes int64   `json:"size_bytes"`
	SizeMB    float64 `json:"size_mb"`
}

// HandleHealth gère le endpoint /health avec les métriques système
func HandleHealth(w http.ResponseWriter, r *http.Request) {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	// Obtenir la taille de la base de données
	dbPath := "./data/kexamanager.db"
	dbSize := int64(0)
	if fileInfo, err := os.Stat(dbPath); err == nil {
		dbSize = fileInfo.Size()
	}

	response := HealthResponse{
		Status:    "ok",
		Timestamp: time.Now().Format(time.RFC3339),
		Memory: Memory{
			Alloc:      m.Alloc,
			TotalAlloc: m.TotalAlloc,
			Sys:        m.Sys,
			NumGC:      m.NumGC,
			AllocMB:    float64(m.Alloc) / 1024 / 1024,
			SysMB:      float64(m.Sys) / 1024 / 1024,
		},
		CPU: CPU{
			NumCPU:       runtime.NumCPU(),
			NumGoroutine: runtime.NumGoroutine(),
		},
		Database: Database{
			Path:      dbPath,
			SizeBytes: dbSize,
			SizeMB:    float64(dbSize) / 1024 / 1024,
		},
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

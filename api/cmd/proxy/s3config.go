package main

import (
	"encoding/json"
	"net/http"
	"strconv"

	"gorm.io/gorm"
)

type CreateS3ConfigRequest struct {
	Name           string `json:"name"`
	Type           string `json:"type"` // "garage" ou "s3"
	S3URL          string `json:"s3_url,omitempty"`
	AdminURL       string `json:"admin_url,omitempty"`
	AdminToken     string `json:"admin_token,omitempty"`
	ClientID       string `json:"client_id"`
	ClientSecret   string `json:"client_secret"`
	Region         string `json:"region,omitempty"`
	ForcePathStyle bool   `json:"force_path_style,omitempty"`
}

// HandleGetS3Configs retourne les configs S3 de l'utilisateur
func HandleGetS3Configs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID, err := validateToken(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}

	var configs []S3Config
	if err := db.Where("user_id = ?", userID).Find(&configs).Error; err != nil {
		http.Error(w, "Failed to fetch configs", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(configs)
}

// HandleCreateS3Config crée une nouvelle config S3
func HandleCreateS3Config(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID, err := validateToken(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}

	var req CreateS3ConfigRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if req.Type != "garage" && req.Type != "s3" {
		http.Error(w, "Type must be 'garage' or 's3'", http.StatusBadRequest)
		return
	}

	// For garage type, admin URL is optional but if provided, token is required
	if req.Type == "garage" && req.AdminURL != "" && req.AdminToken == "" {
		http.Error(w, "Admin Token required when Admin URL is provided for Garage type", http.StatusBadRequest)
		return
	}

	// For S3 type, admin URL should not be provided
	if req.Type == "s3" && req.AdminURL != "" {
		http.Error(w, "Admin URL not allowed for S3 type", http.StatusBadRequest)
		return
	}

	// Validation des credentials : requis pour S3 ou Garage sans AdminURL
	needsCredentials := req.Type == "s3" || (req.Type == "garage" && req.AdminURL == "")
	if needsCredentials && (req.ClientID == "" || req.ClientSecret == "") {
		http.Error(w, "Client ID and Client Secret are required", http.StatusBadRequest)
		return
	}

	config := S3Config{
		UserID:         userID,
		Name:           req.Name,
		Type:           req.Type,
		S3URL:          req.S3URL,
		AdminURL:       req.AdminURL,
		AdminToken:     req.AdminToken,
		ClientID:       req.ClientID,
		ClientSecret:   req.ClientSecret,
		Region:         req.Region,
		ForcePathStyle: req.ForcePathStyle,
	}

	if config.Region == "" {
		if config.Type == "garage" {
			config.Region = "garage"
		} else {
			config.Region = "us-east-1"
		}
	}

	if err := db.Create(&config).Error; err != nil {
		http.Error(w, "Failed to create config", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(config)
}

// HandleUpdateS3Config met à jour une config S3
func HandleUpdateS3Config(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID, err := validateToken(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}

	idStr := r.URL.Query().Get("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	var req CreateS3ConfigRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	var config S3Config
	if err := db.Where("id = ? AND user_id = ?", id, userID).First(&config).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			http.Error(w, "Config not found", http.StatusNotFound)
		} else {
			http.Error(w, "Database error", http.StatusInternalServerError)
		}
		return
	}

	// For garage type, admin URL is optional but if provided, token is required
	if req.Type == "garage" && req.AdminURL != "" && req.AdminToken == "" {
		http.Error(w, "Admin Token required when Admin URL is provided for Garage type", http.StatusBadRequest)
		return
	}

	// For S3 type, admin URL should not be provided
	if req.Type == "s3" && req.AdminURL != "" {
		http.Error(w, "Admin URL not allowed for S3 type", http.StatusBadRequest)
		return
	}

	// Validation des credentials : requis pour S3 ou Garage sans AdminURL
	needsCredentials := req.Type == "s3" || (req.Type == "garage" && req.AdminURL == "")
	if needsCredentials && (req.ClientID == "" || req.ClientSecret == "") {
		http.Error(w, "Client ID and Client Secret are required", http.StatusBadRequest)
		return
	}

	config.Name = req.Name
	config.Type = req.Type
	config.S3URL = req.S3URL
	config.AdminURL = req.AdminURL
	config.AdminToken = req.AdminToken
	config.ClientID = req.ClientID
	config.ClientSecret = req.ClientSecret
	config.Region = req.Region
	config.ForcePathStyle = req.ForcePathStyle

	if err := db.Save(&config).Error; err != nil {
		http.Error(w, "Failed to update config", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(config)
}

// HandleDeleteS3Config supprime une config S3
func HandleDeleteS3Config(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID, err := validateToken(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}

	idStr := r.URL.Query().Get("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	if err := db.Where("id = ? AND user_id = ?", id, userID).Delete(&S3Config{}).Error; err != nil {
		http.Error(w, "Failed to delete config", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

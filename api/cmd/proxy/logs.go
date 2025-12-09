package main

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"


	"gorm.io/gorm"
)

// ListLogsResponse represents the response for listing logs
type ListLogsResponse struct {
	Logs  []ProjectLog `json:"logs"`
	Total int64        `json:"total"`
	Page  int          `json:"page"`
	Limit int          `json:"limit"`
}

// LogActivity records a project activity
func LogActivity(db *gorm.DB, projectID uint, userID uint, action string, details string, status string) error {
	log := ProjectLog{
		ProjectID: projectID,
		UserID:    userID,
		Action:    action,
		Details:   details,
		Status:    status,
	}
	return db.Create(&log).Error
}

// HandleListLogs handles GET /api/{projectId}/logs
func HandleListLogs(w http.ResponseWriter, r *http.Request) {
	// Extract project ID from path /api/{projectId}/logs
	pathParts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/"), "/")
	if len(pathParts) < 2 {
		jsonError(w, "Invalid path", http.StatusBadRequest)
		return
	}

	projectIDStr := pathParts[0]
	projectID, err := strconv.Atoi(projectIDStr)
	if err != nil {
		jsonError(w, "Invalid project ID", http.StatusBadRequest)
		return
	}

	// Validate token
	userID, err := validateToken(r)
	if err != nil {
		jsonError(w, err.Error(), http.StatusUnauthorized)
		return
	}

	// Verify user has access to this project (reuse getS3Config logic or similar check)
	_, err = getS3Config(uint(projectID), userID)
	if err != nil {
		// Try admin check? For now, strictly owner.
		jsonError(w, "Project not found or access denied", http.StatusNotFound)
		return
	}

	// Pagination params
	pageStr := r.URL.Query().Get("page")
	limitStr := r.URL.Query().Get("limit")

	page := 1
	limit := 50

	if pageStr != "" {
		if p, err := strconv.Atoi(pageStr); err == nil && p > 0 {
			page = p
		}
	}
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 100 {
			limit = l
		}
	}

	offset := (page - 1) * limit

	var logs []ProjectLog
	var total int64

	query := db.Where("project_id = ?", projectID)

	if err := query.Model(&ProjectLog{}).Count(&total).Error; err != nil {
		jsonError(w, "Failed to count logs", http.StatusInternalServerError)
		return
	}

	if err := query.Order("created_at desc").Limit(limit).Offset(offset).Find(&logs).Error; err != nil {
		jsonError(w, "Failed to fetch logs", http.StatusInternalServerError)
		return
	}

	response := ListLogsResponse{
		Logs:  logs,
		Total: total,
		Page:  page,
		Limit: limit,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// LogActivityMiddleware is a helper adapter if we needed it, but we will call LogActivity directly

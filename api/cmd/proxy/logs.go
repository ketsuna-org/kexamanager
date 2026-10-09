package main

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode"

	"gorm.io/gorm"
)

// LogEntry est une entree du journal telle que servie au front : l'entree
// stockee plus le nom de son auteur (vide pour une action systeme).
type LogEntry struct {
	ID        uint      `json:"ID"`
	CreatedAt time.Time `json:"CreatedAt"`
	ProjectID uint      `json:"project_id"`
	UserID    uint      `json:"user_id"`
	Username  string    `json:"username"`
	Action    string    `json:"action"`
	Details   string    `json:"details"`
	Status    string    `json:"status"`
}

// ListLogsResponse represents the response for listing logs
type ListLogsResponse struct {
	Logs  []LogEntry `json:"logs"`
	Total int64      `json:"total"`
	Page  int        `json:"page"`
	Limit int        `json:"limit"`
}

// maxLogExport borne l'export CSV pour ne pas charger tout le journal en memoire.
const maxLogExport = 10000

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

// parseLogSince accepte une date RFC3339 ou une duree relative ("24h", "7d").
func parseLogSince(raw string, now time.Time) (time.Time, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return time.Time{}, false
	}
	if t, err := time.Parse(time.RFC3339, raw); err == nil {
		return t, true
	}
	if strings.HasSuffix(raw, "d") {
		if days, err := strconv.Atoi(strings.TrimSuffix(raw, "d")); err == nil && days > 0 {
			return now.Add(-time.Duration(days) * 24 * time.Hour), true
		}
		return time.Time{}, false
	}
	if d, err := time.ParseDuration(raw); err == nil && d > 0 {
		return now.Add(-d), true
	}
	return time.Time{}, false
}

// filteredLogs applique les filtres de la page Activite a la requete du journal.
func filteredLogs(projectID uint, values map[string][]string, now time.Time) *gorm.DB {
	get := func(key string) string {
		if v := values[key]; len(v) > 0 {
			return strings.TrimSpace(v[0])
		}
		return ""
	}
	query := db.Table("project_logs").
		Select("project_logs.id, project_logs.created_at, project_logs.project_id, project_logs.user_id, COALESCE(users.username, '') AS username, project_logs.action, project_logs.details, project_logs.status").
		Joins("LEFT JOIN users ON users.id = project_logs.user_id").
		Where("project_logs.project_id = ? AND project_logs.deleted_at IS NULL", projectID)

	if action := get("action"); action != "" {
		actions := strings.Split(action, ",")
		query = query.Where("project_logs.action IN ?", actions)
	}
	if status := get("status"); status != "" {
		query = query.Where("project_logs.status = ?", status)
	}
	if user := get("user"); user != "" {
		if uid, err := strconv.Atoi(user); err == nil {
			query = query.Where("project_logs.user_id = ?", uid)
		}
	}
	if q := get("q"); q != "" {
		like := "%" + strings.ToLower(q) + "%"
		query = query.Where("LOWER(project_logs.details) LIKE ? OR LOWER(project_logs.action) LIKE ?", like, like)
	}
	if since, ok := parseLogSince(get("since"), now); ok {
		query = query.Where("project_logs.created_at >= ?", since)
	}
	return query
}

// HandleListLogs handles GET /api/{projectId}/logs.
//
// Filtres : action (liste separee par des virgules), status, user (id),
// q (texte libre), since (RFC3339 ou "24h"/"7d"). format=csv exporte les
// entrees filtrees (au plus maxLogExport).
func HandleListLogs(w http.ResponseWriter, r *http.Request, projectID uint) {
	params := r.URL.Query()
	page := 1
	limit := 50
	if p, err := strconv.Atoi(params.Get("page")); err == nil && p > 0 {
		page = p
	}
	if l, err := strconv.Atoi(params.Get("limit")); err == nil && l > 0 && l <= 100 {
		limit = l
	}

	now := time.Now()
	if params.Get("format") == "csv" {
		var logs []LogEntry
		if err := filteredLogs(projectID, params, now).Order("project_logs.created_at desc").Limit(maxLogExport).Scan(&logs).Error; err != nil {
			jsonError(w, "Failed to fetch logs", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"activity-%d.csv\"", projectID))
		writeLogsCSV(w, logs)
		return
	}

	var total int64
	if err := filteredLogs(projectID, params, now).Count(&total).Error; err != nil {
		jsonError(w, "Failed to count logs", http.StatusInternalServerError)
		return
	}

	var logs []LogEntry
	offset := (page - 1) * limit
	if err := filteredLogs(projectID, params, now).Order("project_logs.created_at desc").Limit(limit).Offset(offset).Scan(&logs).Error; err != nil {
		jsonError(w, "Failed to fetch logs", http.StatusInternalServerError)
		return
	}
	if logs == nil {
		logs = []LogEntry{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ListLogsResponse{Logs: logs, Total: total, Page: page, Limit: limit})
}

func writeLogsCSV(w http.ResponseWriter, logs []LogEntry) {
	out := csv.NewWriter(w)
	out.Write([]string{"date", "user", "action", "status", "details"})
	for _, entry := range logs {
		user := entry.Username
		if user == "" {
			user = "system"
		}
		out.Write([]string{entry.CreatedAt.UTC().Format(time.RFC3339), user, entry.Action, entry.Status, entry.Details})
	}
	out.Flush()
}

// adminActionName convertit un endpoint Garage ("CreateBucket") en nom
// d'action du journal ("create_bucket"), le format des actions S3.
func adminActionName(endpoint string) string {
	var b strings.Builder
	for i, r := range endpoint {
		if unicode.IsUpper(r) {
			if i > 0 {
				b.WriteByte('_')
			}
			b.WriteRune(unicode.ToLower(r))
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}

// isAdminMutation dit si un appel /v2/{endpoint} modifie le cluster. Les
// lectures en POST (ListWorkers, GetBlockInfo...) ne sont pas journalisees.
func isAdminMutation(method, endpoint string) bool {
	if method == http.MethodGet || method == http.MethodHead || method == http.MethodOptions {
		return false
	}
	for _, prefix := range []string{"Get", "List", "Preview", "Inspect", "Check"} {
		if strings.HasPrefix(endpoint, prefix) {
			return false
		}
	}
	return endpoint != ""
}

// adminLogFields sont les champs d'une requete admin qui identifient la cible
// d'une action. Les secrets (secretAccessKey, token...) n'en font jamais partie.
var adminLogFields = []string{"id", "name", "globalAlias", "localAlias", "bucketId", "accessKeyId", "node", "version", "blockHashes", "operation"}

// adminLogDetails resume la cible d'une mutation admin a partir de la query et
// du corps JSON.
func adminLogDetails(query map[string][]string, body []byte) string {
	values := map[string]string{}
	for _, key := range adminLogFields {
		if v := query[key]; len(v) > 0 && v[0] != "" {
			values[key] = v[0]
		}
	}
	var payload map[string]any
	if len(body) > 0 && json.Unmarshal(body, &payload) == nil {
		for _, key := range adminLogFields {
			v, ok := payload[key]
			if !ok || v == nil {
				continue
			}
			switch typed := v.(type) {
			case string:
				if typed != "" {
					values[key] = typed
				}
			case float64:
				values[key] = strconv.FormatFloat(typed, 'f', -1, 64)
			case []any:
				values[key] = fmt.Sprintf("%d item(s)", len(typed))
			case map[string]any:
				// operation de reparation : {"type": "..."} ou chaine simple
				if t, ok := typed["type"].(string); ok {
					values[key] = t
				}
			}
		}
	}
	parts := make([]string, 0, len(values))
	for _, key := range adminLogFields {
		if v, ok := values[key]; ok {
			parts = append(parts, key+"="+v)
		}
	}
	return strings.Join(parts, ", ")
}

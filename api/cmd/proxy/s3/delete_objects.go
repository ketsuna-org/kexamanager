package s3

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/minio/minio-go/v7"
)

// mapRemoveObjectError traduit un echec unitaire de suppression au contrat.
func mapRemoveObjectError(failure minio.RemoveObjectError) DeleteObjectsError {
	mapped := DeleteObjectsError{Key: failure.ObjectName}

	var errResponse minio.ErrorResponse
	switch {
	case failure.Err == nil:
		mapped.Code = "InternalError"
		mapped.Message = "delete failed without error details"
	case errors.As(failure.Err, &errResponse):
		mapped.Code = errResponse.Code
		mapped.Message = errResponse.Message
	default:
		mapped.Code = "InternalError"
		mapped.Message = failure.Err.Error()
	}
	if mapped.Message == "" && failure.Err != nil {
		mapped.Message = failure.Err.Error()
	}
	return mapped
}

// collectRemoveErrors separe les echecs par cle de l'echec global (nom d'objet vide),
// ce dernier signalant que le lot n'a pas pu etre traite du tout.
func collectRemoveErrors(failures <-chan minio.RemoveObjectError) (map[string]DeleteObjectsError, *DeleteObjectsError) {
	byKey := make(map[string]DeleteObjectsError)
	var general *DeleteObjectsError

	for failure := range failures {
		mapped := mapRemoveObjectError(failure)
		if failure.ObjectName == "" {
			general = &mapped
			continue
		}
		byKey[failure.ObjectName] = mapped
	}
	return byKey, general
}

// removeObjects supprime les cles en lot et repartit succes et echecs dans le contrat.
// Une cle inexistante est un succes pour S3 : elle ressort dans deleted.
func removeObjects(ctx context.Context, client *minio.Client, bucket string, keys []string) DeleteObjectsResponse {
	objectsCh := make(chan minio.ObjectInfo)
	go func() {
		defer close(objectsCh)
		for _, key := range keys {
			select {
			case objectsCh <- minio.ObjectInfo{Key: key}:
			case <-ctx.Done():
				return
			}
		}
	}()

	failures, general := collectRemoveErrors(client.RemoveObjects(ctx, bucket, objectsCh, minio.RemoveObjectsOptions{}))

	resp := DeleteObjectsResponse{Deleted: []string{}, Errors: []DeleteObjectsError{}}
	if general != nil {
		// Aucun resultat fiable : ne rien annoncer comme supprime.
		resp.Errors = append(resp.Errors, *general)
		for _, key := range keys {
			if failure, failed := failures[key]; failed {
				resp.Errors = append(resp.Errors, failure)
			}
		}
		return resp
	}

	seen := make(map[string]bool, len(keys))
	for _, key := range keys {
		if seen[key] {
			continue
		}
		seen[key] = true
		if failure, failed := failures[key]; failed {
			resp.Errors = append(resp.Errors, failure)
			continue
		}
		resp.Deleted = append(resp.Deleted, key)
	}
	return resp
}

// deleteObjectsLogStatus resume l'issue d'un lot pour le journal d'actions.
func deleteObjectsLogStatus(resp DeleteObjectsResponse) string {
	switch {
	case len(resp.Errors) == 0:
		return "success"
	case len(resp.Deleted) == 0:
		return "error"
	default:
		return "partial"
	}
}

// decodeDeleteObjectsRequest valide la methode et decode le corps JSON.
func decodeDeleteObjectsRequest(w http.ResponseWriter, r *http.Request) (DeleteObjectsRequest, bool) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return DeleteObjectsRequest{}, false
	}

	var req DeleteObjectsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return DeleteObjectsRequest{}, false
	}
	return req, true
}

// serveDeleteObjects execute la suppression groupee pour une config deja resolue.
func serveDeleteObjects(w http.ResponseWriter, r *http.Request, config S3ConfigData, req DeleteObjectsRequest) {
	creds, err := GetS3Credentials(config, req.KeyId, req.Token)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to get credentials: %v", err), http.StatusUnauthorized)
		return
	}

	client, err := CreateS3Client(creds)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to create S3 client: %v", err), http.StatusInternalServerError)
		return
	}

	resp := removeObjects(r.Context(), client, req.Bucket, req.Keys)

	if LogActionFunc != nil {
		LogActionFunc(config.ID, UserIDFromRequest(r), "delete_objects",
			fmt.Sprintf("Deleted %d/%d objects in %s", len(resp.Deleted), len(req.Keys), req.Bucket),
			deleteObjectsLogStatus(resp))
	}

	w.Header().Set("Content-Type", "application/json")
	// Un lot integralement en echec ne doit jamais repondre 200.
	if len(resp.Deleted) == 0 && len(resp.Errors) > 0 {
		w.WriteHeader(http.StatusBadGateway)
	}
	json.NewEncoder(w).Encode(resp)
}

// HandleDeleteObjects handles the bulk delete objects request
func HandleDeleteObjects() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		req, ok := decodeDeleteObjectsRequest(w, r)
		if !ok {
			return
		}

		// Valider le token et récupérer l'user ID
		userID, err := ValidateTokenFunc(r)
		if err != nil {
			http.Error(w, err.Error(), http.StatusUnauthorized)
			return
		}

		// Récupérer la config S3
		config, err := GetS3ConfigFunc(req.ConfigID, userID)
		if err != nil {
			http.Error(w, "Config not found", http.StatusNotFound)
			return
		}

		serveDeleteObjects(w, r, config, req)
	}
}

// HandleDeleteObjectsWithConfig handles the bulk delete objects request with pre-validated config
func HandleDeleteObjectsWithConfig(config S3ConfigData) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		req, ok := decodeDeleteObjectsRequest(w, r)
		if !ok {
			return
		}

		serveDeleteObjects(w, r, config, req)
	}
}

package s3

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/minio/minio-go/v7"
)

// copyObject copie un objet cote serveur et rend l'ETag de la destination.
// Sans directive de metadonnees, S3 conserve celles de la source.
func copyObject(ctx context.Context, client *minio.Client, req CopyObjectRequest) (CopyObjectResponse, error) {
	info, err := client.CopyObject(ctx,
		minio.CopyDestOptions{Bucket: req.DestinationBucket, Object: req.DestinationKey},
		minio.CopySrcOptions{Bucket: req.SourceBucket, Object: req.SourceKey},
	)
	if err != nil {
		return CopyObjectResponse{}, err
	}

	return CopyObjectResponse{
		Success: true,
		Key:     req.DestinationKey,
		ETag:    trimETag(info.ETag),
	}, nil
}

// decodeCopyObjectRequest valide la methode et decode le corps JSON.
func decodeCopyObjectRequest(w http.ResponseWriter, r *http.Request) (CopyObjectRequest, bool) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return CopyObjectRequest{}, false
	}

	var req CopyObjectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return CopyObjectRequest{}, false
	}
	return req, true
}

// serveCopyObject execute la copie pour une config deja resolue.
func serveCopyObject(w http.ResponseWriter, r *http.Request, config S3ConfigData, req CopyObjectRequest) {
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

	resp, err := copyObject(r.Context(), client, req)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to copy object: %v", err), http.StatusInternalServerError)
		return
	}

	if LogActionFunc != nil {
		LogActionFunc(config.ID, UserIDFromRequest(r), "copy_object", fmt.Sprintf("Copied %s/%s to %s/%s", req.SourceBucket, req.SourceKey, req.DestinationBucket, req.DestinationKey), "success")
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// HandleCopyObject handles the copy object request
func HandleCopyObject() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		req, ok := decodeCopyObjectRequest(w, r)
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

		serveCopyObject(w, r, config, req)
	}
}

// HandleCopyObjectWithConfig handles the copy object request with pre-validated config
func HandleCopyObjectWithConfig(config S3ConfigData) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		req, ok := decodeCopyObjectRequest(w, r)
		if !ok {
			return
		}

		serveCopyObject(w, r, config, req)
	}
}

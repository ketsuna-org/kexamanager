package s3

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/minio/minio-go/v7"
)

// HandleListObjects handles the list objects request
func HandleListObjects() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req ListObjectsRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
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

		opts := minio.ListObjectsOptions{
			Prefix: req.Prefix,
		}

		objectCh := client.ListObjects(r.Context(), req.Bucket, opts)

		var objects []S3Object
		for object := range objectCh {
			if object.Err != nil {
				http.Error(w, fmt.Sprintf("Failed to list objects: %v", object.Err), http.StatusInternalServerError)
				return
			}
			objects = append(objects, S3Object{
				Key:          object.Key,
				Size:         object.Size,
				LastModified: object.LastModified.Format(time.RFC3339),
				ETag:         object.ETag,
			})
		}

		// Calculate total bucket size by listing all objects without prefix
		totalOpts := minio.ListObjectsOptions{}
		totalObjectCh := client.ListObjects(r.Context(), req.Bucket, totalOpts)
		var totalSize int64
		for object := range totalObjectCh {
			if object.Err != nil {
				// If we can't get total size, set to -1 to indicate unknown
				totalSize = -1
				break
			}
			totalSize += object.Size
		}

		resp := ListObjectsResponse{
			Objects:   objects,
			TotalSize: totalSize,
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}
}

// HandleListObjectsWithConfig handles the list objects request with pre-validated config
func HandleListObjectsWithConfig(config S3ConfigData) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req ListObjectsRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}

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

		opts := minio.ListObjectsOptions{
			Prefix: req.Prefix,
		}

		objectCh := client.ListObjects(r.Context(), req.Bucket, opts)

		var objects []S3Object
		for object := range objectCh {
			if object.Err != nil {
				http.Error(w, fmt.Sprintf("Failed to list objects: %v", object.Err), http.StatusInternalServerError)
				return
			}
			objects = append(objects, S3Object{
				Key:          object.Key,
				Size:         object.Size,
				LastModified: object.LastModified.Format(time.RFC3339),
				ETag:         object.ETag,
			})
		}

		// Calculate total bucket size by listing all objects without prefix
		totalOpts := minio.ListObjectsOptions{}
		totalObjectCh := client.ListObjects(r.Context(), req.Bucket, totalOpts)
		var totalSize int64
		for object := range totalObjectCh {
			if object.Err != nil {
				// If we can't get total size, set to -1 to indicate unknown
				totalSize = -1
				break
			}
			totalSize += object.Size
		}

		resp := ListObjectsResponse{
			Objects:   objects,
			TotalSize: totalSize,
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}
}

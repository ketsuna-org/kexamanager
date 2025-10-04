package s3

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/minio/minio-go/v7"
)

// HandleCreateBucket handles the create bucket request
func HandleCreateBucket() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req CreateBucketRequest
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

		err = client.MakeBucket(r.Context(), req.Bucket, minio.MakeBucketOptions{Region: creds.Region})
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to create bucket: %v", err), http.StatusInternalServerError)
			return
		}

		resp := CreateBucketResponse{Success: true}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}
}

// HandleCreateBucketWithConfig handles the create bucket request with pre-validated config
func HandleCreateBucketWithConfig(config S3ConfigData) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req CreateBucketRequest
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

		err = client.MakeBucket(r.Context(), req.Bucket, minio.MakeBucketOptions{Region: creds.Region})
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to create bucket: %v", err), http.StatusInternalServerError)
			return
		}

		resp := CreateBucketResponse{Success: true}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}
}

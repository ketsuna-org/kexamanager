package s3

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// HandleListBuckets handles the list buckets request
func HandleListBuckets() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req ListBucketsRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}

		if len(req.Token) > 10 {
			fmt.Printf("DEBUG: Token starts with: %s...\n", req.Token[:10])
		} else {
			fmt.Printf("DEBUG: Token: %s\n", req.Token)
		}

		creds, err := GetS3Credentials(req.KeyId, req.Token)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to get credentials: %v", err), http.StatusUnauthorized)
			return
		}

		client, err := CreateS3Client(creds)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to create S3 client: %v", err), http.StatusInternalServerError)
			return
		}

		buckets, err := client.ListBuckets(r.Context())
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to list buckets: %v", err), http.StatusInternalServerError)
			return
		}

		respBuckets := make([]Bucket, len(buckets))
		for i, b := range buckets {
			respBuckets[i] = Bucket{
				Name:         b.Name,
				CreationDate: b.CreationDate.Format(time.RFC3339),
			}
		}

		resp := ListBucketsResponse{Buckets: respBuckets}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}
}

package s3

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// HandlePutObject handles the put object request
func HandlePutObject() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req PutObjectRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
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

		psClient := s3.NewPresignClient(client)
		presignReq, err := psClient.PresignPutObject(r.Context(), &s3.PutObjectInput{
			Bucket:      &req.Bucket,
			Key:         &req.Key,
			ContentType: &req.ContentType,
		}, s3.WithPresignExpires(15*time.Minute))
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to presign put object: %v", err), http.StatusInternalServerError)
			return
		}

		resp := PutObjectResponse{PresignedURL: presignReq.URL}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}
}

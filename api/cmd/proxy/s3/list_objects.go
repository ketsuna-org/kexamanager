package s3

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/s3"
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

		input := &s3.ListObjectsV2Input{
			Bucket: &req.Bucket,
		}
		if req.Prefix != "" {
			input.Prefix = &req.Prefix
		}

		result, err := client.ListObjectsV2(r.Context(), input)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to list objects: %v", err), http.StatusInternalServerError)
			return
		}

		objects := make([]S3Object, len(result.Contents))
		for i, obj := range result.Contents {
			size := int64(0)
			if obj.Size != nil {
				size = *obj.Size
			}
			etag := ""
			if obj.ETag != nil {
				etag = *obj.ETag
			}
			objects[i] = S3Object{
				Key:          *obj.Key,
				Size:         size,
				LastModified: obj.LastModified.Format(time.RFC3339),
				ETag:         etag,
			}
		}

		resp := ListObjectsResponse{
			Objects:     objects,
			IsTruncated: result.IsTruncated != nil && *result.IsTruncated,
		}
		if result.NextContinuationToken != nil {
			resp.ContinuationToken = *result.NextContinuationToken
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}
}

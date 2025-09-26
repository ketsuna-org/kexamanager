package s3

import (
	"fmt"
	"net/http"
	"os"

	"github.com/minio/minio-go/v7"
)

// HandlePutObject handles the put object request
func HandlePutObject() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		maxMemory := int64(256 << 20) // 256MB

		// Let's see in env MAX_UPLOAD_MEMORY
		// Parse multipart form
		if v := os.Getenv("MAX_UPLOAD_MEMORY"); v != "" {
			var parsed int64
			_, err := fmt.Sscanf(v, "%d", &parsed)
			if err == nil && parsed > 0 {
				maxMemory = parsed
			}
		}

		err := r.ParseMultipartForm(maxMemory) // (256MB, default, can be adjusted with MAX_UPLOAD_MEMORY env var)
		if err != nil {
			http.Error(w, "Failed to parse multipart form", http.StatusBadRequest)
			return
		}

		keyId := r.FormValue("keyId")
		token := r.FormValue("token")
		bucket := r.FormValue("bucket")
		key := r.FormValue("key")

		if keyId == "" || token == "" || bucket == "" || key == "" {
			http.Error(w, "Missing required fields", http.StatusBadRequest)
			return
		}

		// Get the file from the form
		file, header, err := r.FormFile("file")
		if err != nil {
			http.Error(w, "Failed to get file from form", http.StatusBadRequest)
			return
		}
		defer file.Close()

		creds, err := GetS3Credentials(keyId, token)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to get credentials: %v", err), http.StatusUnauthorized)
			return
		}

		client, err := CreateS3Client(creds)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to create S3 client: %v", err), http.StatusInternalServerError)
			return
		}

		// Determine content type
		contentType := header.Header.Get("Content-Type")
		if contentType == "" {
			contentType = "application/octet-stream"
		}

		// Upload the file directly to S3
		_, err = client.PutObject(r.Context(), bucket, key, file, header.Size, minio.PutObjectOptions{
			ContentType: contentType,
		})
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to upload object: %v", err), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success": true}`))
	}
}

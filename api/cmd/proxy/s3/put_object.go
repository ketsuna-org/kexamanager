package s3

import (
	"fmt"
	"io"
	"net/http"

	"github.com/minio/minio-go/v7"
)

// HandlePutObject handles the put object request
func HandlePutObject() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Use r.MultipartReader instead of ParseMultipartForm
		mr, err := r.MultipartReader()
		if err != nil {
			http.Error(w, "Invalid multipart form", http.StatusBadRequest)
			return
		}

		var (
			keyId, token, bucket, key string
			filePart                  io.ReadCloser
			fileSize                  int64
			fileContentType           string
		)

		// Walk through all parts
		for {
			part, err := mr.NextPart()
			if err == io.EOF {
				break
			}
			if err != nil {
				http.Error(w, "Failed to read multipart data", http.StatusBadRequest)
				return
			}

			switch part.FormName() {
			case "keyId":
				buf, _ := io.ReadAll(part)
				keyId = string(buf)
			case "token":
				buf, _ := io.ReadAll(part)
				token = string(buf)
			case "bucket":
				buf, _ := io.ReadAll(part)
				bucket = string(buf)
			case "key":
				buf, _ := io.ReadAll(part)
				key = string(buf)
			case "file":
				// Don't read into memory! Pass stream to S3
				filePart = part
				fileContentType = part.Header.Get("Content-Type")
				// If file size is not available from header, you may need to remove 'header.Size'
				// Client should add 'Content-Length' if possible, otherwise, use -1
				fileSize = -1
			}
		}

		if keyId == "" || token == "" || bucket == "" || key == "" || filePart == nil {
			http.Error(w, "Missing required fields", http.StatusBadRequest)
			return
		}

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

		if fileContentType == "" {
			fileContentType = "application/octet-stream"
		}

		_, err = client.PutObject(r.Context(), bucket, key, filePart, fileSize, minio.PutObjectOptions{
			ContentType: fileContentType,
		})
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to upload object: %v", err), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success": true}`))
	}
}

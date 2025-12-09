package s3

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/minio/minio-go/v7"
)

// HandlePutObject handles the put object request
func HandlePutObject() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusMethodNotAllowed)
			w.Write([]byte(`{"error": "Method not allowed", "details": "Only POST method is allowed"}`))
			return
		}

		// Parse multipart form
		// Increase limit to 512MB for memory buffer
		err := r.ParseMultipartForm(512 << 20)
		if err != nil {
			fmt.Printf("DEBUG: Failed to parse multipart form: %v\n", err)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			escapedErr := strings.ReplaceAll(fmt.Sprintf("%v", err), `"`, `\"`)
			escapedErr = strings.ReplaceAll(escapedErr, "\n", "\\n")
			escapedErr = strings.ReplaceAll(escapedErr, "\r", "\\r")
			escapedErr = strings.ReplaceAll(escapedErr, "\t", "\\t")
			w.Write([]byte(fmt.Sprintf(`{"error": "Invalid multipart form", "details": "%s"}`, escapedErr)))
			return
		}

		keyId := r.FormValue("keyId")
		token := r.FormValue("token")
		bucket := r.FormValue("bucket")
		key := r.FormValue("key")
		configIdStr := r.FormValue("configId")
		fileSizeStr := r.FormValue("fileSize")

		fmt.Printf("DEBUG: Received upload request - keyId: %s, bucket: %s, key: %s, configId: %s, fileSizeStr: %s\n", keyId, bucket, key, configIdStr, fileSizeStr)

		configID, err := strconv.Atoi(configIdStr)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"error": "Invalid configId"}`))
			return
		}

		// Valider le token et récupérer l'user ID
		userID, err := ValidateTokenFunc(r)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			w.Write([]byte(fmt.Sprintf(`{"error": "Unauthorized", "details": "%s"}`, err.Error())))
			return
		}

		// Récupérer la config S3
		config, err := GetS3ConfigFunc(uint(configID), userID)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusNotFound)
			w.Write([]byte(`{"error": "Config not found"}`))
			return
		}

		fileSize := int64(-1)
		if fileSizeStr != "" {
			if size, err := strconv.ParseInt(fileSizeStr, 10, 64); err == nil {
				fileSize = size
			}
		}

		file, header, err := r.FormFile("file")
		if err != nil {
			fmt.Printf("DEBUG: Failed to get file from form: %v\n", err)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			escapedErr := strings.ReplaceAll(fmt.Sprintf("%v", err), `"`, `\"`)
			escapedErr = strings.ReplaceAll(escapedErr, "\n", "\\n")
			escapedErr = strings.ReplaceAll(escapedErr, "\r", "\\r")
			escapedErr = strings.ReplaceAll(escapedErr, "\t", "\\t")
			w.Write([]byte(fmt.Sprintf(`{"error": "Failed to get file from form", "details": "%s"}`, escapedErr)))
			return
		}
		defer file.Close()

		fmt.Printf("DEBUG: File header - Filename: %s, Size: %d, Content-Type: %s\n", header.Filename, header.Size, header.Header.Get("Content-Type"))

		if bucket == "" || key == "" {
			fmt.Printf("DEBUG: Missing required fields - bucket: %s, key: %s\n", bucket, key)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"error": "Missing required fields", "details": "bucket and key are required"}`))
			return
		}

		creds, err := GetS3Credentials(config, keyId, token)
		if err != nil {
			fmt.Printf("DEBUG: Failed to get credentials: %v\n", err)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			escapedErr := strings.ReplaceAll(fmt.Sprintf("%v", err), `"`, `\"`)
			escapedErr = strings.ReplaceAll(escapedErr, "\n", "\\n")
			escapedErr = strings.ReplaceAll(escapedErr, "\r", "\\r")
			escapedErr = strings.ReplaceAll(escapedErr, "\t", "\\t")
			w.Write([]byte(fmt.Sprintf(`{"error": "Failed to get credentials", "details": "%s"}`, escapedErr)))
			return
		}

		fmt.Printf("DEBUG: Got credentials - endpoint: %s, region: %s\n", creds.Endpoint, creds.Region)

		client, err := CreateS3Client(creds)
		if err != nil {
			fmt.Printf("DEBUG: Failed to create S3 client: %v\n", err)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			escapedErr := strings.ReplaceAll(fmt.Sprintf("%v", err), `"`, `\"`)
			escapedErr = strings.ReplaceAll(escapedErr, "\n", "\\n")
			escapedErr = strings.ReplaceAll(escapedErr, "\r", "\\r")
			escapedErr = strings.ReplaceAll(escapedErr, "\t", "\\t")
			w.Write([]byte(fmt.Sprintf(`{"error": "Failed to create S3 client", "details": "%s"}`, escapedErr)))
			return
		}

		contentType := header.Header.Get("Content-Type")
		if contentType == "" {
			contentType = "application/octet-stream"
		}

		fmt.Printf("DEBUG: Starting PutObject - bucket: %s, key: %s, fileSize: %d, contentType: %s\n", bucket, key, fileSize, contentType)

		_, err = client.PutObject(r.Context(), bucket, key, file, fileSize, minio.PutObjectOptions{
			ContentType: contentType,
		})
		if err != nil {
			fmt.Printf("DEBUG: Failed to upload object: %v\n", err)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			// Escape the error message to prevent JSON breaking
			escapedErr := strings.ReplaceAll(fmt.Sprintf("%v", err), `"`, `\"`)
			escapedErr = strings.ReplaceAll(escapedErr, "\n", "\\n")
			escapedErr = strings.ReplaceAll(escapedErr, "\r", "\\r")
			escapedErr = strings.ReplaceAll(escapedErr, "\t", "\\t")
			w.Write([]byte(fmt.Sprintf(`{"error": "Failed to upload object", "details": "%s", "bucket": "%s", "key": "%s"}`, escapedErr, bucket, key)))
			return
		}

		fmt.Printf("DEBUG: Successfully uploaded object: %s/%s\n", bucket, key)

		if LogActionFunc != nil {
			LogActionFunc(uint(configID), userID, "upload_file", fmt.Sprintf("Uploaded file %s/%s (%d bytes)", bucket, key, fileSize), "success")
		}

		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success": true}`))
	}
}

// HandlePutObjectWithConfig handles the put object request with pre-validated config
func HandlePutObjectWithConfig(config S3ConfigData) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusMethodNotAllowed)
			w.Write([]byte(`{"error": "Method not allowed", "details": "Only POST method is allowed"}`))
			return
		}

		// Parse multipart form
		// Increase limit to 512MB for memory buffer
		err := r.ParseMultipartForm(512 << 20)
		if err != nil {
			fmt.Printf("DEBUG: Failed to parse multipart form: %v\n", err)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			escapedErr := strings.ReplaceAll(fmt.Sprintf("%v", err), `"`, `\"`)
			escapedErr = strings.ReplaceAll(escapedErr, "\n", "\\n")
			escapedErr = strings.ReplaceAll(escapedErr, "\r", "\\r")
			escapedErr = strings.ReplaceAll(escapedErr, "\t", "\\t")
			w.Write([]byte(fmt.Sprintf(`{"error": "Invalid multipart form", "details": "%s"}`, escapedErr)))
			return
		}

		bucket := r.FormValue("bucket")
		key := r.FormValue("key")
		keyId := r.FormValue("keyId")
		token := r.FormValue("token")
		fileSizeStr := r.FormValue("fileSize")

		fmt.Printf("DEBUG: Received upload request - bucket: %s, key: %s, fileSizeStr: %s\n", bucket, key, fileSizeStr)

		fileSize := int64(-1)
		if fileSizeStr != "" {
			if size, err := strconv.ParseInt(fileSizeStr, 10, 64); err == nil {
				fileSize = size
			}
		}

		if bucket == "" || key == "" {
			fmt.Printf("DEBUG: Missing required fields - bucket: %s, key: %s\n", bucket, key)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"error": "Missing required fields", "details": "bucket and key are required"}`))
			return
		}

		file, header, err := r.FormFile("file")
		if err != nil {
			fmt.Printf("DEBUG: Failed to get file from form: %v\n", err)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			escapedErr := strings.ReplaceAll(fmt.Sprintf("%v", err), `"`, `\"`)
			escapedErr = strings.ReplaceAll(escapedErr, "\n", "\\n")
			escapedErr = strings.ReplaceAll(escapedErr, "\r", "\\r")
			escapedErr = strings.ReplaceAll(escapedErr, "\t", "\\t")
			w.Write([]byte(fmt.Sprintf(`{"error": "Failed to get file from form", "details": "%s"}`, escapedErr)))
			return
		}
		defer file.Close()

		fmt.Printf("DEBUG: File info - filename: %s, size: %d, header size: %d\n", header.Filename, fileSize, header.Size)

		creds, err := GetS3Credentials(config, keyId, token)
		if err != nil {
			fmt.Printf("DEBUG: Failed to get credentials: %v\n", err)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			escapedErr := strings.ReplaceAll(fmt.Sprintf("%v", err), `"`, `\"`)
			escapedErr = strings.ReplaceAll(escapedErr, "\n", "\\n")
			escapedErr = strings.ReplaceAll(escapedErr, "\r", "\\r")
			escapedErr = strings.ReplaceAll(escapedErr, "\t", "\\t")
			w.Write([]byte(fmt.Sprintf(`{"error": "Failed to get credentials", "details": "%s"}`, escapedErr)))
			return
		}

		fmt.Printf("DEBUG: Got credentials - endpoint: %s, region: %s\n", creds.Endpoint, creds.Region)

		client, err := CreateS3Client(creds)
		if err != nil {
			fmt.Printf("DEBUG: Failed to create S3 client: %v\n", err)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			escapedErr := strings.ReplaceAll(fmt.Sprintf("%v", err), `"`, `\"`)
			escapedErr = strings.ReplaceAll(escapedErr, "\n", "\\n")
			escapedErr = strings.ReplaceAll(escapedErr, "\r", "\\r")
			escapedErr = strings.ReplaceAll(escapedErr, "\t", "\\t")
			w.Write([]byte(fmt.Sprintf(`{"error": "Failed to create S3 client", "details": "%s"}`, escapedErr)))
			return
		}

		fmt.Printf("DEBUG: Created S3 client successfully\n")

		// Upload the file
		info, err := client.PutObject(r.Context(), bucket, key, file, fileSize, minio.PutObjectOptions{
			ContentType: header.Header.Get("Content-Type"),
		})
		if err != nil {
			fmt.Printf("DEBUG: Failed to upload object: %v\n", err)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			// Escape the error message to prevent JSON breaking
			escapedErr := strings.ReplaceAll(fmt.Sprintf("%v", err), `"`, `\"`)
			escapedErr = strings.ReplaceAll(escapedErr, "\n", "\\n")
			escapedErr = strings.ReplaceAll(escapedErr, "\r", "\\r")
			escapedErr = strings.ReplaceAll(escapedErr, "\t", "\\t")
			w.Write([]byte(fmt.Sprintf(`{"error": "Failed to upload object", "details": "%s", "bucket": "%s", "key": "%s"}`, escapedErr, bucket, key)))
			return
		}

		fmt.Printf("DEBUG: Successfully uploaded object: %s/%s, size: %d\n", bucket, key, info.Size)

		if LogActionFunc != nil {
			LogActionFunc(config.ID, 0, "upload_file", fmt.Sprintf("Uploaded file %s/%s (%d bytes)", bucket, key, info.Size), "success")
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(fmt.Sprintf(`{"message": "File uploaded successfully", "bucket": "%s", "key": "%s", "size": %d, "etag": "%s"}`, bucket, key, info.Size, info.ETag)))
	}
}

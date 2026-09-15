package s3

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/minio/minio-go/v7"
)

const (
	// defaultMaxKeys est la taille de page par defaut du contrat list-objects.
	defaultMaxKeys = 500
	// maxMaxKeys plafonne maxKeys pour garder la reponse bornee.
	maxMaxKeys = 1000
)

// normalizeMaxKeys applique le defaut et le plafond du contrat.
func normalizeMaxKeys(maxKeys int) int {
	switch {
	case maxKeys <= 0:
		return defaultMaxKeys
	case maxKeys > maxMaxKeys:
		return maxMaxKeys
	default:
		return maxKeys
	}
}

// trimETag retire les guillemets dont S3 entoure l'ETag.
func trimETag(etag string) string {
	return strings.Trim(strings.TrimSpace(etag), `"`)
}

// objectInfoToS3Object traduit une entree de listing au contrat S3Object.
func objectInfoToS3Object(info minio.ObjectInfo) S3Object {
	return S3Object{
		Key:          info.Key,
		Size:         info.Size,
		LastModified: info.LastModified.Format(time.RFC3339),
		ETag:         trimETag(info.ETag),
		ContentType:  info.ContentType,
	}
}

// listResultToResponse traduit une page ListObjectsV2 au contrat list-objects.
// KeyCount et TotalSize ne decrivent que les objets de ce niveau, jamais extrapoles.
func listResultToResponse(res minio.ListBucketV2Result) ListObjectsResponse {
	objects := make([]S3Object, 0, len(res.Contents))
	var totalSize int64
	for _, info := range res.Contents {
		objects = append(objects, objectInfoToS3Object(info))
		totalSize += info.Size
	}

	prefixes := make([]string, 0, len(res.CommonPrefixes))
	for _, commonPrefix := range res.CommonPrefixes {
		prefixes = append(prefixes, commonPrefix.Prefix)
	}

	return ListObjectsResponse{
		Objects:               objects,
		CommonPrefixes:        prefixes,
		NextContinuationToken: res.NextContinuationToken,
		ContinuationToken:     res.NextContinuationToken,
		IsTruncated:           res.IsTruncated,
		KeyCount:              len(objects),
		TotalSize:             totalSize,
		Delimiter:             res.Delimiter,
	}
}

// listObjectsPage interroge S3 (ListObjectsV2) et rend la page traduite.
// Le Core client est necessaire : il est le seul a exposer CommonPrefixes,
// IsTruncated et NextContinuationToken que l'API paginee automatiquement masque.
func listObjectsPage(client *minio.Client, req ListObjectsRequest) (ListObjectsResponse, error) {
	core := minio.Core{Client: client}
	res, err := core.ListObjectsV2(req.Bucket, req.Prefix, "", req.ContinuationToken, req.Delimiter, normalizeMaxKeys(req.MaxKeys))
	if err != nil {
		return ListObjectsResponse{}, err
	}
	return listResultToResponse(res), nil
}

// decodeListObjectsRequest valide la methode et decode le corps JSON.
func decodeListObjectsRequest(w http.ResponseWriter, r *http.Request) (ListObjectsRequest, bool) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return ListObjectsRequest{}, false
	}

	var req ListObjectsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return ListObjectsRequest{}, false
	}
	return req, true
}

// serveListObjects execute le listing pour une config deja resolue.
func serveListObjects(w http.ResponseWriter, r *http.Request, config S3ConfigData, req ListObjectsRequest) {
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

	resp, err := listObjectsPage(client, req)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to list objects: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// HandleListObjects handles the list objects request
func HandleListObjects() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		req, ok := decodeListObjectsRequest(w, r)
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

		serveListObjects(w, r, config, req)
	}
}

// HandleListObjectsWithConfig handles the list objects request with pre-validated config
func HandleListObjectsWithConfig(config S3ConfigData) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		req, ok := decodeListObjectsRequest(w, r)
		if !ok {
			return
		}

		serveListObjects(w, r, config, req)
	}
}

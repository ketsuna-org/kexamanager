package s3

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/minio/minio-go/v7"
)

// amzMetaPrefix est le prefixe des metadonnees utilisateur posees sur un objet.
const amzMetaPrefix = "X-Amz-Meta-"

// statHeaderNames liste les en-tetes de service exposes dans la fiche objet.
var statHeaderNames = []string{"cache-control", "content-disposition", "content-encoding"}

// hasPrefixFold compare un prefixe d'en-tete sans tenir compte de la casse :
// S3 ne garantit pas la casse canonique des en-tetes qu'il renvoie.
func hasPrefixFold(value, prefix string) bool {
	return len(value) >= len(prefix) && strings.EqualFold(value[:len(prefix)], prefix)
}

// metadataFromInfo ne conserve que les en-tetes x-amz-meta-*, la cle restant
// telle que la bibliotheque l'expose (casse canonique X-Amz-Meta-*).
func metadataFromInfo(info minio.ObjectInfo) map[string]string {
	metadata := make(map[string]string)
	for key, values := range info.Metadata {
		if !hasPrefixFold(key, amzMetaPrefix) || len(values) == 0 {
			continue
		}
		metadata[key] = values[0]
	}
	return metadata
}

// headersFromInfo expose les en-tetes de service de l'objet, en minuscules.
func headersFromInfo(info minio.ObjectInfo) map[string]string {
	headers := make(map[string]string)
	for _, name := range statHeaderNames {
		value := info.Headers.Get(name)
		if value == "" {
			// Headers n'est rempli que par StatObject/GetObject ; Metadata sert de repli.
			value = info.Metadata.Get(name)
		}
		if value != "" {
			headers[name] = value
		}
	}
	return headers
}

// statObjectToResponse traduit une reponse HeadObject au contrat stat-object.
func statObjectToResponse(info minio.ObjectInfo) StatObjectResponse {
	return StatObjectResponse{
		Key:          info.Key,
		Size:         info.Size,
		ContentType:  info.ContentType,
		ETag:         trimETag(info.ETag),
		LastModified: info.LastModified.Format(time.RFC3339),
		StorageClass: info.StorageClass,
		Metadata:     metadataFromInfo(info),
		Headers:      headersFromInfo(info),
	}
}

// decodeStatObjectRequest valide la methode et decode le corps JSON.
func decodeStatObjectRequest(w http.ResponseWriter, r *http.Request) (StatObjectRequest, bool) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return StatObjectRequest{}, false
	}

	var req StatObjectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return StatObjectRequest{}, false
	}
	return req, true
}

// serveStatObject execute le HeadObject pour une config deja resolue.
func serveStatObject(w http.ResponseWriter, r *http.Request, config S3ConfigData, req StatObjectRequest) {
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

	info, err := client.StatObject(r.Context(), req.Bucket, req.Key, minio.StatObjectOptions{})
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to stat object: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(statObjectToResponse(info))
}

// HandleStatObject handles the stat object request
func HandleStatObject() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		req, ok := decodeStatObjectRequest(w, r)
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

		serveStatObject(w, r, config, req)
	}
}

// HandleStatObjectWithConfig handles the stat object request with pre-validated config
func HandleStatObjectWithConfig(config S3ConfigData) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		req, ok := decodeStatObjectRequest(w, r)
		if !ok {
			return
		}

		serveStatObject(w, r, config, req)
	}
}

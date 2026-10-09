package s3

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"path"
	"time"
)

const (
	defaultPresignExpiry = 15 * time.Minute
	minPresignExpiry     = time.Minute
	// maxPresignExpiry est la limite imposee par SigV4 aux URL presignees.
	maxPresignExpiry = 7 * 24 * time.Hour
)

// presignExpiry convertit la validite demandee (secondes) en duree bornee.
func presignExpiry(seconds int64) time.Duration {
	if seconds <= 0 {
		return defaultPresignExpiry
	}
	d := time.Duration(seconds) * time.Second
	if d < minPresignExpiry {
		return minPresignExpiry
	}
	if d > maxPresignExpiry {
		return maxPresignExpiry
	}
	return d
}

// presignParams ajoute Content-Disposition: attachment quand le client veut
// telecharger l'objet plutot que l'afficher.
func presignParams(req GetObjectRequest) url.Values {
	if !req.Download {
		return nil
	}
	params := url.Values{}
	params.Set("response-content-disposition", fmt.Sprintf("attachment; filename=%q", path.Base(req.Key)))
	return params
}

func servePresignedGet(w http.ResponseWriter, r *http.Request, config S3ConfigData, req GetObjectRequest, userID uint) {
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

	expiry := presignExpiry(req.ExpiresIn)
	presignedURL, err := client.PresignedGetObject(r.Context(), req.Bucket, req.Key, expiry, presignParams(req))
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to presign get object: %v", err), http.StatusInternalServerError)
		return
	}

	if req.ExpiresIn > 0 && LogActionFunc != nil {
		LogActionFunc(config.ID, userID, "share_link", fmt.Sprintf("Signed link for %s/%s valid %s", req.Bucket, req.Key, expiry), "success")
	}

	resp := GetObjectResponse{
		PresignedURL: presignedURL.String(),
		ExpiresAt:    time.Now().Add(expiry).UTC().Format(time.RFC3339),
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// HandleGetObject handles the get object request
func HandleGetObject() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req GetObjectRequest
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

		servePresignedGet(w, r, config, req, userID)
	}
}

// HandleGetObjectWithConfig handles the get object request with pre-validated config
func HandleGetObjectWithConfig(config S3ConfigData) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req GetObjectRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}

		servePresignedGet(w, r, config, req, UserIDFromRequest(r))
	}
}

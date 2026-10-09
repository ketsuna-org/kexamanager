package main

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/ketsuna-org/kexamanager/cmd/proxy/s3"
)

// TestS3ConfigRequest reprend le formulaire de projet ; ID permet de tester un
// projet existant sans retaper ses secrets (les champs vides reprennent les
// valeurs enregistrees).
type TestS3ConfigRequest struct {
	CreateS3ConfigRequest
	ID uint `json:"id,omitempty"`
}

// ConnectionCheck est le resultat d'une verification (S3 ou admin).
type ConnectionCheck struct {
	Tested  bool   `json:"tested"`
	OK      bool   `json:"ok"`
	Error   string `json:"error,omitempty"`
	Buckets int    `json:"buckets,omitempty"`
	Status  string `json:"status,omitempty"`
	Nodes   int    `json:"nodes,omitempty"`
	NodesUp int    `json:"nodesUp,omitempty"`
}

type TestS3ConfigResponse struct {
	S3    ConnectionCheck `json:"s3"`
	Admin ConnectionCheck `json:"admin"`
}

const connectionTestTimeout = 10 * time.Second

// HandleTestS3Config verifie un projet avant de l'enregistrer (POST /api/s3-configs/test) :
// ListBuckets sur le point d'acces S3 si une cle est fournie, GetClusterHealth sur
// l'API d'administration si elle est configuree.
func HandleTestS3Config(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID, err := validateToken(r)
	if err != nil {
		jsonError(w, err.Error(), http.StatusUnauthorized)
		return
	}
	var req TestS3ConfigRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	config := s3.S3ConfigData{
		Type:           req.Type,
		S3URL:          strings.TrimSpace(req.S3URL),
		AdminURL:       strings.TrimSpace(req.AdminURL),
		AdminToken:     req.AdminToken,
		ClientID:       strings.TrimSpace(req.ClientID),
		ClientSecret:   req.ClientSecret,
		Region:         req.Region,
		ForcePathStyle: req.ForcePathStyle,
	}
	if req.ID != 0 {
		stored, err := getS3Config(req.ID, userID)
		if err != nil {
			jsonError(w, "Project not found", http.StatusNotFound)
			return
		}
		if config.AdminToken == "" {
			config.AdminToken = stored.AdminToken
		}
		if config.ClientSecret == "" && config.ClientID == stored.ClientID {
			config.ClientSecret = stored.ClientSecret
		}
	}

	ctx, cancel := context.WithTimeout(r.Context(), connectionTestTimeout)
	defer cancel()

	resp := TestS3ConfigResponse{
		S3:    testS3Connection(ctx, config),
		Admin: testAdminConnection(ctx, config),
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func testS3Connection(ctx context.Context, config s3.S3ConfigData) ConnectionCheck {
	if config.S3URL == "" || config.ClientID == "" || config.ClientSecret == "" {
		return ConnectionCheck{}
	}
	check := ConnectionCheck{Tested: true}
	creds, err := s3.GetS3Credentials(config, "", "")
	if err != nil {
		check.Error = err.Error()
		return check
	}
	client, err := s3.CreateS3Client(creds)
	if err != nil {
		check.Error = err.Error()
		return check
	}
	buckets, err := client.ListBuckets(ctx)
	if err != nil {
		check.Error = err.Error()
		return check
	}
	check.OK = true
	check.Buckets = len(buckets)
	return check
}

type clusterHealthProbe struct {
	Status         string `json:"status"`
	KnownNodes     int    `json:"knownNodes"`
	ConnectedNodes int    `json:"connectedNodes"`
}

func testAdminConnection(ctx context.Context, config s3.S3ConfigData) ConnectionCheck {
	if config.AdminURL == "" {
		return ConnectionCheck{}
	}
	check := ConnectionCheck{Tested: true}
	var health clusterHealthProbe
	if err := adminGetJSON(ctx, config, http.MethodGet, "/v2/GetClusterHealth", &health); err != nil {
		check.Error = err.Error()
		return check
	}
	check.OK = true
	check.Status = health.Status
	check.Nodes = health.KnownNodes
	check.NodesUp = health.ConnectedNodes
	return check
}

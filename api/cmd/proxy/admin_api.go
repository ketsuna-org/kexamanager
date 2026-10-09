package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/ketsuna-org/kexamanager/cmd/proxy/s3"
	"golang.org/x/sync/errgroup"
)

const (
	adminRequestTimeout = 10 * time.Second
	adminMaxBodyBytes   = 4 << 20
	statsTimeout        = 60 * time.Second
	adminConcurrency    = 8
)

// ------------------------------------------------------- client admin Garage

var adminHTTPClient = &http.Client{Timeout: adminRequestTimeout}

// adminGetJSON appelle l'API admin Garage. out==nil => la reponse n'est pas decodee.
func adminGetJSON(ctx context.Context, config s3.S3ConfigData, method, path string, out any) error {
	if config.AdminURL == "" {
		return fmt.Errorf("admin URL not configured")
	}
	endpoint := strings.TrimRight(config.AdminURL, "/") + path
	req, err := http.NewRequestWithContext(ctx, method, endpoint, nil)
	if err != nil {
		return err
	}
	if config.AdminToken != "" {
		req.Header.Set("Authorization", "Bearer "+config.AdminToken)
	}
	resp, err := adminHTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("admin %s: %w", path, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, adminMaxBodyBytes))
	if err != nil {
		return fmt.Errorf("admin %s: %w", path, err)
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf("admin %s: HTTP %d: %s", path, resp.StatusCode, truncate(strings.TrimSpace(string(body)), 200))
	}
	if out == nil {
		return nil
	}
	if err := json.Unmarshal(body, out); err != nil {
		return fmt.Errorf("admin %s: invalid JSON: %w", path, err)
	}
	return nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

// writeJSON ecrit une reponse JSON avec le statut donne.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		// La reponse est deja engagee : on trace sans pouvoir changer le statut.
		log.Printf("writeJSON: %v", err)
	}
}

// ---------------------------------------------------- endpoints admin: buckets

type adminLocalAlias struct {
	AccessKeyID string `json:"accessKeyId"`
	Alias       string `json:"alias"`
}

type adminBucketListItem struct {
	Created       string            `json:"created"`
	GlobalAliases []string          `json:"globalAliases"`
	ID            string            `json:"id"`
	LocalAliases  []adminLocalAlias `json:"localAliases"`
}

type adminBucketQuotas struct {
	MaxObjects *int64 `json:"maxObjects"`
	MaxSize    *int64 `json:"maxSize"`
}

type adminBucketInfo struct {
	Bytes                          int64             `json:"bytes"`
	Created                        string            `json:"created"`
	GlobalAliases                  []string          `json:"globalAliases"`
	ID                             string            `json:"id"`
	Objects                        int64             `json:"objects"`
	Quotas                         adminBucketQuotas `json:"quotas"`
	UnfinishedMultipartUploadBytes int64             `json:"unfinishedMultipartUploadBytes"`
	UnfinishedMultipartUploadParts int64             `json:"unfinishedMultipartUploadParts"`
	WebsiteAccess                  bool              `json:"websiteAccess"`
	Keys                           []adminBucketKey  `json:"keys"`
}

// adminBucketKey est une cle autorisee sur le bucket ; seul le nombre de cles
// remonte dans les stats, le detail reste servi par GetBucketInfo.
type adminBucketKey struct {
	AccessKeyID string `json:"accessKeyId"`
}

// ListBuckets liste les buckets du cluster (GET /v2/ListBuckets).
func ListBuckets(ctx context.Context, config s3.S3ConfigData) ([]adminBucketListItem, error) {
	var buckets []adminBucketListItem
	if err := adminGetJSON(ctx, config, http.MethodGet, "/v2/ListBuckets", &buckets); err != nil {
		return nil, err
	}
	if buckets == nil {
		buckets = []adminBucketListItem{}
	}
	return buckets, nil
}

// GetBucketInfo retourne les compteurs d'un bucket (GET /v2/GetBucketInfo).
func GetBucketInfo(ctx context.Context, config s3.S3ConfigData, bucketID string) (*adminBucketInfo, error) {
	var info adminBucketInfo
	path := "/v2/GetBucketInfo?id=" + url.QueryEscape(bucketID)
	if err := adminGetJSON(ctx, config, http.MethodGet, path, &info); err != nil {
		return nil, err
	}
	return &info, nil
}

// ---------------------------------------------------- endpoints admin: cluster

type adminClusterHealth struct {
	Status           string `json:"status"`
	ConnectedNodes   int    `json:"connectedNodes"`
	KnownNodes       int    `json:"knownNodes"`
	StorageNodes     int    `json:"storageNodes"`
	StorageNodesUp   int    `json:"storageNodesUp"`
	StorageNodesOk   int    `json:"storageNodesOk"`
	Partitions       int    `json:"partitions"`
	PartitionsAllOk  int    `json:"partitionsAllOk"`
	PartitionsQuorum int    `json:"partitionsQuorum"`
}

// storageNodesOk accepte storageNodesUp (nom v2 Garage) comme source equivalente.
func (h adminClusterHealth) storageNodesOk() int {
	if h.StorageNodesOk != 0 {
		return h.StorageNodesOk
	}
	return h.StorageNodesUp
}

type adminNodeRole struct {
	Capacity *int64   `json:"capacity"`
	Tags     []string `json:"tags"`
	Zone     string   `json:"zone"`
}

type adminFreeSpace struct {
	Available *int64 `json:"available"`
	Total     *int64 `json:"total"`
}

type adminNode struct {
	ID            string          `json:"id"`
	Hostname      string          `json:"hostname"`
	IsUp          bool            `json:"isUp"`
	Draining      bool            `json:"draining"`
	DataPartition *adminFreeSpace `json:"dataPartition"`
	Role          *adminNodeRole  `json:"role"`
}

type adminClusterStatus struct {
	LayoutVersion int64       `json:"layoutVersion"`
	Nodes         []adminNode `json:"nodes"`
}

type adminLayoutRole struct {
	ID       string `json:"id"`
	Capacity *int64 `json:"capacity"`
	Zone     string `json:"zone"`
}

type adminClusterLayout struct {
	Version int64             `json:"version"`
	Roles   []adminLayoutRole `json:"roles"`
}

type adminFreeform struct {
	Freeform string `json:"freeform"`
}

// GetClusterHealth interroge GET /v2/GetClusterHealth.
func GetClusterHealth(ctx context.Context, config s3.S3ConfigData) (adminClusterHealth, error) {
	var health adminClusterHealth
	err := adminGetJSON(ctx, config, http.MethodGet, "/v2/GetClusterHealth", &health)
	return health, err
}

// GetClusterStatus interroge GET /v2/GetClusterStatus (liste des noeuds).
func GetClusterStatus(ctx context.Context, config s3.S3ConfigData) (adminClusterStatus, error) {
	var status adminClusterStatus
	err := adminGetJSON(ctx, config, http.MethodGet, "/v2/GetClusterStatus", &status)
	return status, err
}

// GetClusterLayout interroge GET /v2/GetClusterLayout (version et roles).
func GetClusterLayout(ctx context.Context, config s3.S3ConfigData) (adminClusterLayout, error) {
	var layout adminClusterLayout
	err := adminGetJSON(ctx, config, http.MethodGet, "/v2/GetClusterLayout", &layout)
	return layout, err
}

// GetClusterStatistics interroge GET /v2/GetClusterStatistics (texte non structure).
func GetClusterStatistics(ctx context.Context, config s3.S3ConfigData) (adminFreeform, error) {
	var stats adminFreeform
	err := adminGetJSON(ctx, config, http.MethodGet, "/v2/GetClusterStatistics", &stats)
	return stats, err
}

// GetNodeStatistics interroge GET /v2/GetNodeStatistics pour un noeud donne.
func GetNodeStatistics(ctx context.Context, config s3.S3ConfigData, nodeID string) (adminFreeform, error) {
	var stats adminFreeform
	path := "/v2/GetNodeStatistics?id=" + url.QueryEscape(nodeID)
	err := adminGetJSON(ctx, config, http.MethodGet, path, &stats)
	return stats, err
}

// toClusterNodes fusionne GetClusterStatus (noeuds) et GetClusterLayout (roles) :
// la zone et la capacite viennent du role du noeud, ou du layout a defaut.
func toClusterNodes(nodes []adminNode, roles []adminLayoutRole) []ClusterNode {
	byID := make(map[string]adminLayoutRole, len(roles))
	for _, role := range roles {
		byID[role.ID] = role
	}
	result := make([]ClusterNode, 0, len(nodes))
	for _, n := range nodes {
		node := ClusterNode{
			ID:            n.ID,
			Hostname:      n.Hostname,
			IsUp:          n.IsUp,
			Draining:      n.Draining,
			DataPartition: n.DataPartition,
		}
		if n.Role != nil {
			node.Zone = n.Role.Zone
			node.Capacity = n.Role.Capacity
		}
		if role, ok := byID[n.ID]; ok {
			if node.Zone == "" {
				node.Zone = role.Zone
			}
			if node.Capacity == nil {
				node.Capacity = role.Capacity
			}
		}
		result = append(result, node)
	}
	return result
}

// fetchNodeStatistics fan-out GetNodeStatistics sur les noeuds, une entree par noeud.
func fetchNodeStatistics(ctx context.Context, config s3.S3ConfigData, nodes []adminNode) map[string]FreeformStats {
	results := make([]FreeformStats, len(nodes))
	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(adminConcurrency)
	for i := range nodes {
		i := i
		g.Go(func() error {
			raw, err := GetNodeStatistics(gctx, config, nodes[i].ID)
			results[i] = freeformFromCall(raw, err)
			return nil
		})
	}
	_ = g.Wait()

	out := make(map[string]FreeformStats, len(nodes))
	for i, n := range nodes {
		out[n.ID] = results[i]
	}
	return out
}

// freeformFromCall n'invente jamais de champ : soit le texte est du JSON objet
// et il est expose dans parsed, soit parsed reste null et raw est conserve tel quel.
func freeformFromCall(raw adminFreeform, callErr error) FreeformStats {
	if callErr != nil {
		return FreeformStats{Available: false, Raw: "", Parsed: nil}
	}
	stats := FreeformStats{Available: true, Raw: raw.Freeform}
	var parsed map[string]any
	if err := json.Unmarshal([]byte(raw.Freeform), &parsed); err == nil {
		stats.Parsed = parsed
	}
	return stats
}

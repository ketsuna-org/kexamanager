package main

import (
	"context"
	"fmt"
	"math"
	"net/http"
	"time"

	"github.com/ketsuna-org/kexamanager/cmd/proxy/s3"
	"golang.org/x/sync/errgroup"
)

// ------------------------------- contrat de GET /api/{project}/stats/buckets

// BucketStat est une ligne de GET /api/{project}/stats/buckets.
type BucketStat struct {
	ID                             string            `json:"id"`
	Name                           string            `json:"name"`
	GlobalAliases                  []string          `json:"globalAliases"`
	LocalAliases                   []adminLocalAlias `json:"localAliases"`
	Created                        string            `json:"created"`
	Objects                        int64             `json:"objects"`
	Bytes                          int64             `json:"bytes"`
	Quotas                         adminBucketQuotas `json:"quotas"`
	QuotaUsagePercent              *float64          `json:"quotaUsagePercent"`
	StatsAvailable                 bool              `json:"statsAvailable"`
	StatsError                     *string           `json:"statsError"`
	UnfinishedMultipartUploadParts int64             `json:"unfinishedMultipartUploadParts"`
	UnfinishedMultipartUploadBytes int64             `json:"unfinishedMultipartUploadBytes"`
	WebsiteAccess                  bool              `json:"websiteAccess"`
	KeyCount                       int               `json:"keyCount"`
}

type BucketStatsTotals struct {
	Buckets         int   `json:"buckets"`
	Objects         int64 `json:"objects"`
	Bytes           int64 `json:"bytes"`
	ObjectsComplete bool  `json:"objectsComplete"`
	BytesComplete   bool  `json:"bytesComplete"`
}

type BucketStatsOverview struct {
	Totals      BucketStatsTotals `json:"totals"`
	Buckets     []BucketStat      `json:"buckets"`
	GeneratedAt string            `json:"generatedAt"`
	Stale       bool              `json:"stale"`
}

// ------------------------------- contrat de GET /api/{project}/stats/cluster

// ClusterHealth reprend exactement les champs de GET /v2/GetClusterHealth.
type ClusterHealth struct {
	Status           string `json:"status"`
	ConnectedNodes   int    `json:"connectedNodes"`
	KnownNodes       int    `json:"knownNodes"`
	StorageNodes     int    `json:"storageNodes"`
	StorageNodesOk   int    `json:"storageNodesOk"`
	Partitions       int    `json:"partitions"`
	PartitionsAllOk  int    `json:"partitionsAllOk"`
	PartitionsQuorum int    `json:"partitionsQuorum"`
}

type ClusterNode struct {
	ID            string          `json:"id"`
	Hostname      string          `json:"hostname"`
	IsUp          bool            `json:"isUp"`
	Draining      bool            `json:"draining"`
	Zone          string          `json:"zone"`
	Capacity      *int64          `json:"capacity"`
	DataPartition *adminFreeSpace `json:"dataPartition"`
}

// FreeformStats expose du texte Garage non structure sans jamais inventer de champ.
type FreeformStats struct {
	Available bool           `json:"available"`
	Raw       string         `json:"raw"`
	Parsed    map[string]any `json:"parsed"`
}

type ClusterStats struct {
	Health         ClusterHealth            `json:"health"`
	LayoutVersion  int64                    `json:"layoutVersion"`
	Nodes          []ClusterNode            `json:"nodes"`
	Statistics     FreeformStats            `json:"statistics"`
	NodeStatistics map[string]FreeformStats `json:"nodeStatistics,omitempty"`
	GeneratedAt    string                   `json:"generatedAt"`
}

// ------------------------------------------------------------------- routage

// handleProjectStats route /api/{project}/stats/{...}.
func handleProjectStats(w http.ResponseWriter, r *http.Request, projectID uint, config s3.S3ConfigData, pathParts []string) {
	action := ""
	if len(pathParts) > 2 {
		action = pathParts[2]
	}
	switch action {
	case "buckets":
		HandleBucketStats(w, r, projectID, config)
	case "cluster":
		HandleClusterStats(w, r, projectID, config)
	default:
		jsonError(w, "Invalid stats endpoint", http.StatusNotFound)
	}
}

// ------------------------------------------------------------- stats buckets

// HandleBucketStats sert GET /api/{project}/stats/buckets (ListBuckets + N x GetBucketInfo).
// Cache 30 s avec stale-while-revalidate : une entree perimee est servie
// immediatement avec stale=true et rafraichie une seule fois en tache de fond.
func HandleBucketStats(w http.ResponseWriter, r *http.Request, projectID uint, config s3.S3ConfigData) {
	if r.Method != http.MethodGet {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	serveStats(w, r, statsRequest[BucketStatsOverview]{
		cache:      bucketStatsCache,
		key:        cacheKey(projectID, "stats-buckets"),
		timeout:    statsTimeout,
		adminReady: config.AdminURL != "" && config.AdminToken != "",
		markStale:  markBucketStatsStale,
	}, func(ctx context.Context) (BucketStatsOverview, error) {
		buckets, err := ListBuckets(ctx, config)
		if err != nil {
			return BucketStatsOverview{}, err
		}
		stats := make([]BucketStat, len(buckets))
		g, gctx := errgroup.WithContext(ctx)
		g.SetLimit(adminConcurrency)
		for i := range buckets {
			i := i
			g.Go(func() error {
				// Une erreur locale ne casse jamais l'agregat : elle est exposee par bucket.
				info, infoErr := GetBucketInfo(gctx, config, buckets[i].ID)
				stats[i] = toBucketStat(buckets[i], info, infoErr)
				return nil
			})
		}
		// Toutes les goroutines retournent nil : l'agregat peut toujours etre servi.
		_ = g.Wait()
		return aggregateBucketStats(stats), nil
	})
}

// markBucketStatsStale marque une reponse servie depuis une valeur perimee.
func markBucketStatsStale(overview BucketStatsOverview) BucketStatsOverview {
	overview.Stale = true
	return overview
}

// toBucketStat construit une ligne en n'inventant jamais de valeur : si
// GetBucketInfo echoue, la ligne est marquee indisponible et les compteurs
// restent a zero avec *Complete=false cote agregat.
func toBucketStat(item adminBucketListItem, info *adminBucketInfo, infoErr error) BucketStat {
	stat := BucketStat{
		ID:            item.ID,
		Name:          bucketDisplayName(item),
		GlobalAliases: item.GlobalAliases,
		LocalAliases:  item.LocalAliases,
		Created:       item.Created,
	}
	if stat.GlobalAliases == nil {
		stat.GlobalAliases = []string{}
	}
	if stat.LocalAliases == nil {
		stat.LocalAliases = []adminLocalAlias{}
	}
	if infoErr != nil {
		msg := infoErr.Error()
		stat.StatsError = &msg
		return stat
	}
	stat.StatsAvailable = true
	stat.Objects = info.Objects
	stat.Bytes = info.Bytes
	stat.Quotas = info.Quotas
	stat.QuotaUsagePercent = quotaUsagePercent(info.Bytes, info.Quotas.MaxSize)
	stat.UnfinishedMultipartUploadParts = info.UnfinishedMultipartUploadParts
	stat.UnfinishedMultipartUploadBytes = info.UnfinishedMultipartUploadBytes
	stat.WebsiteAccess = info.WebsiteAccess
	stat.KeyCount = len(info.Keys)
	return stat
}

func bucketDisplayName(item adminBucketListItem) string {
	if len(item.GlobalAliases) > 0 && item.GlobalAliases[0] != "" {
		return item.GlobalAliases[0]
	}
	return item.ID
}

func quotaUsagePercent(bytes int64, maxSize *int64) *float64 {
	if maxSize == nil || *maxSize <= 0 {
		return nil
	}
	percent := math.Round(float64(bytes)/float64(*maxSize)*1000) / 10
	return &percent
}

func aggregateBucketStats(stats []BucketStat) BucketStatsOverview {
	overview := BucketStatsOverview{
		Totals: BucketStatsTotals{
			Buckets:         len(stats),
			ObjectsComplete: true,
			BytesComplete:   true,
		},
		Buckets:     stats,
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
	}
	if overview.Buckets == nil {
		overview.Buckets = []BucketStat{}
	}
	for _, s := range stats {
		if !s.StatsAvailable {
			overview.Totals.ObjectsComplete = false
			overview.Totals.BytesComplete = false
			continue
		}
		overview.Totals.Objects += s.Objects
		overview.Totals.Bytes += s.Bytes
	}
	return overview
}

// ------------------------------------------------------------- stats cluster

// HandleClusterStats sert GET /api/{project}/stats/cluster.
// include=nodeStats active GetNodeStatistics (couteux) pour chaque noeud.
// Le contrat de cet endpoint n'expose pas de drapeau "stale" : une entree
// perimee est donc rechargee en bloquant, jamais servie perimee en silence.
func HandleClusterStats(w http.ResponseWriter, r *http.Request, projectID uint, config s3.S3ConfigData) {
	if r.Method != http.MethodGet {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	withNodeStats := r.URL.Query().Get("include") == "nodeStats"
	serveStats(w, r, statsRequest[ClusterStats]{
		cache:      clusterStatsCache,
		key:        cacheKey(projectID, "stats-cluster", fmt.Sprintf("nodeStats=%t", withNodeStats)),
		timeout:    statsTimeout,
		adminReady: config.AdminURL != "" && config.AdminToken != "",
	}, func(ctx context.Context) (ClusterStats, error) {
		return loadClusterStats(ctx, config, withNodeStats)
	})
}

// loadClusterStats agrege health, status, layout et statistiques freeform.
// health et status sont obligatoires, layout et statistiques sont optionnels.
func loadClusterStats(ctx context.Context, config s3.S3ConfigData, withNodeStats bool) (ClusterStats, error) {
	var (
		health    adminClusterHealth
		status    adminClusterStatus
		layout    adminClusterLayout
		rawStats  adminFreeform
		healthErr error
		statusErr error
		layoutErr error
		statsErr  error
	)
	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(adminConcurrency)
	g.Go(func() error { health, healthErr = GetClusterHealth(gctx, config); return nil })
	g.Go(func() error { status, statusErr = GetClusterStatus(gctx, config); return nil })
	g.Go(func() error { layout, layoutErr = GetClusterLayout(gctx, config); return nil })
	g.Go(func() error { rawStats, statsErr = GetClusterStatistics(gctx, config); return nil })
	_ = g.Wait()

	if healthErr != nil {
		return ClusterStats{}, healthErr
	}
	if statusErr != nil {
		return ClusterStats{}, statusErr
	}
	layoutVersion := status.LayoutVersion
	if layoutErr == nil {
		layoutVersion = layout.Version
	}
	result := ClusterStats{
		Health: ClusterHealth{
			Status:           health.Status,
			ConnectedNodes:   health.ConnectedNodes,
			KnownNodes:       health.KnownNodes,
			StorageNodes:     health.StorageNodes,
			StorageNodesOk:   health.storageNodesOk(),
			Partitions:       health.Partitions,
			PartitionsAllOk:  health.PartitionsAllOk,
			PartitionsQuorum: health.PartitionsQuorum,
		},
		LayoutVersion: layoutVersion,
		Nodes:         toClusterNodes(status.Nodes, layout.Roles),
		Statistics:    freeformFromCall(rawStats, statsErr),
		GeneratedAt:   time.Now().UTC().Format(time.RFC3339),
	}
	if withNodeStats {
		// ctx (et non gctx) : le contexte de l'errgroup est annule des Wait() retourne.
		result.NodeStatistics = fetchNodeStatistics(ctx, config, status.Nodes)
	}
	return result, nil
}

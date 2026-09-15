package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/ketsuna-org/kexamanager/cmd/proxy/s3"
)

// --------------------------------------------------------------- utilitaires

type fakeAdmin struct {
	server *httptest.Server
	mu     sync.Mutex
	hits   map[string]int
}

// newFakeAdmin demarre un faux admin Garage : routes indexees par chemin, les
// chemins non declares renvoient 404.
func newFakeAdmin(t *testing.T, routes map[string]http.HandlerFunc) *fakeAdmin {
	t.Helper()
	fake := &fakeAdmin{hits: map[string]int{}}
	fake.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fake.mu.Lock()
		fake.hits[r.URL.Path]++
		fake.mu.Unlock()

		if handler, ok := routes[r.URL.Path]; ok {
			handler(w, r)
			return
		}
		http.Error(w, "unknown admin endpoint "+r.URL.Path, http.StatusNotFound)
	}))
	t.Cleanup(fake.server.Close)
	return fake
}

func (f *fakeAdmin) config() s3.S3ConfigData {
	return s3.S3ConfigData{
		AdminURL:   f.server.URL,
		AdminToken: "admin-token",
		S3URL:      "https://s3.example.com",
		Region:     "garage",
	}
}

func (f *fakeAdmin) hitsFor(path string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.hits[path]
}

func decodeJSON[T any](t *testing.T, rec *httptest.ResponseRecorder) T {
	t.Helper()
	var out T
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("reponse non decodable (%v): %s", err, rec.Body.String())
	}
	return out
}

func int64Ptr(v int64) *int64 { return &v }

func resetStatsCaches() {
	bucketStatsCache.Clear()
	clusterStatsCache.Clear()
	clearCapabilityCaches()
}

// ------------------------------------------------------------------ ttlCache

func TestTTLCacheExpiryAndInvalidate(t *testing.T) {
	now := time.Unix(1700000000, 0)
	cache := newTTLCache[int](time.Minute)
	cache.now = func() time.Time { return now }

	if _, ok := cache.Get("absent"); ok {
		t.Fatal("Get sur une cle absente doit retourner ok=false")
	}

	cache.Set("k", 42)
	if v, ok := cache.Get("k"); !ok || v != 42 {
		t.Fatalf("Get = (%v, %v), want (42, true)", v, ok)
	}

	now = now.Add(59 * time.Second)
	if _, ok := cache.Get("k"); !ok {
		t.Fatal("la valeur doit rester valide avant expiration du TTL")
	}

	now = now.Add(2 * time.Second)
	if _, ok := cache.Get("k"); ok {
		t.Fatal("la valeur doit etre expiree apres le TTL")
	}

	cache.Set("k", 7)
	cache.Invalidate("k")
	if _, ok := cache.Get("k"); ok {
		t.Fatal("Invalidate doit rendre la cle immediatement indisponible")
	}
}

func TestTTLCachePerEntryTTL(t *testing.T) {
	now := time.Unix(1700000000, 0)
	cache := newTTLCache[string](time.Minute)
	cache.now = func() time.Time { return now }

	cache.SetTTL("negatif", "down", 30*time.Second)
	now = now.Add(31 * time.Second)
	if _, ok := cache.Get("negatif"); ok {
		t.Fatal("un TTL par entree plus court doit etre respecte")
	}
}

// ------------------------------------------------------------- stats buckets

// bucketListJSON imite Garage v2.3.0 : ListBuckets n'existe QU'en GET. Un faux
// admin laxiste sur la methode a deja laisse passer un POST casse en production.
func bucketListJSON(buckets ...adminBucketListItem) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeJSON(w, http.StatusBadRequest, map[string]any{
				"error": "Unknown API endpoint: " + r.Method + " " + r.URL.Path,
			})
			return
		}
		writeJSON(w, http.StatusOK, buckets)
	}
}

func safeBucketInfoMock(info map[string]any) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("id") == "" {
			http.Error(w, "missing id", http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusOK, info)
	}
}

func TestBucketStatsAggregateWithOneFailingBucket(t *testing.T) {
	resetStatsCaches()
	admin := newFakeAdmin(t, map[string]http.HandlerFunc{
		"/v2/ListBuckets": bucketListJSON(
			adminBucketListItem{ID: "b1", Created: "2026-05-26T00:00:00Z", GlobalAliases: []string{"bot-creator"},
				LocalAliases: []adminLocalAlias{{AccessKeyID: "GK1", Alias: "alias-local"}}},
			adminBucketListItem{ID: "b2", Created: "2026-05-27T00:00:00Z", GlobalAliases: []string{"config-bcm"}},
			adminBucketListItem{ID: "b3", Created: "2026-05-28T00:00:00Z"},
		),
		"/v2/GetBucketInfo": func(w http.ResponseWriter, r *http.Request) {
			switch r.URL.Query().Get("id") {
			case "b1":
				writeJSON(w, http.StatusOK, map[string]any{
					"bytes": 310568960, "objects": 3,
					"quotas":                         map[string]any{"maxObjects": nil, "maxSize": 5368709120},
					"unfinishedMultipartUploads":     1,
					"unfinishedMultipartUploadParts": 2, "unfinishedMultipartUploadBytes": 4096,
				})
			case "b2":
				writeJSON(w, http.StatusOK, map[string]any{"bytes": 1000, "objects": 100, "quotas": map[string]any{}})
			default:
				http.Error(w, "internal error for "+r.URL.Query().Get("id"), http.StatusInternalServerError)
			}
		},
	})

	rec := httptest.NewRecorder()
	HandleBucketStats(rec, httptest.NewRequest(http.MethodGet, "/api/101/stats/buckets", nil), 101, admin.config())

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body %s)", rec.Code, rec.Body.String())
	}
	overview := decodeJSON[BucketStatsOverview](t, rec)
	if len(overview.Buckets) != 3 {
		t.Fatalf("buckets = %d, want 3", len(overview.Buckets))
	}
	if overview.Totals.Buckets != 3 {
		t.Errorf("totals.buckets = %d, want 3", overview.Totals.Buckets)
	}
	if overview.Totals.Objects != 103 || overview.Totals.Bytes != 310569960 {
		t.Errorf("totaux = %d objets / %d octets, want 103 / 310569960 (2 buckets valides seulement)",
			overview.Totals.Objects, overview.Totals.Bytes)
	}
	if overview.Totals.ObjectsComplete || overview.Totals.BytesComplete {
		t.Error("*Complete = true alors qu'un GetBucketInfo a echoue (l'agregat mentirait)")
	}
	if overview.GeneratedAt == "" {
		t.Error("generatedAt vide")
	}
	if overview.Stale {
		t.Error("stale = true sur une reponse fraiche")
	}

	byID := map[string]BucketStat{}
	for _, b := range overview.Buckets {
		byID[b.ID] = b
	}
	if b := byID["b1"]; !b.StatsAvailable || b.StatsError != nil || b.Objects != 3 || b.Bytes != 310568960 {
		t.Errorf("b1 = %+v, want stats disponibles 3 objets / 310568960 octets", b)
	}
	if b := byID["b1"]; b.Name != "bot-creator" {
		t.Errorf("b1.name = %q, want le premier globalAlias", b.Name)
	}
	if b := byID["b1"]; b.QuotaUsagePercent == nil || *b.QuotaUsagePercent != 5.8 {
		t.Errorf("b1.quotaUsagePercent = %v, want 5.8", b.QuotaUsagePercent)
	}
	if b := byID["b1"]; b.Quotas.MaxObjects != nil || b.Quotas.MaxSize == nil || *b.Quotas.MaxSize != 5368709120 {
		t.Errorf("b1.quotas = %+v, want maxObjects null et maxSize 5368709120", b.Quotas)
	}
	if b := byID["b3"]; b.StatsAvailable || b.StatsError == nil || b.Objects != 0 || b.Bytes != 0 {
		t.Errorf("b3 = %+v, want statsAvailable=false, statsError non nul, compteurs a zero", b)
	}
	if b := byID["b3"]; b.Name != "b3" {
		t.Errorf("b3.name = %q, want l'id quand aucun alias global n'existe", b.Name)
	}
	if b := byID["b2"]; b.QuotaUsagePercent != nil {
		t.Errorf("b2.quotaUsagePercent = %v, want null (aucun quota maxSize)", b.QuotaUsagePercent)
	}
}

func TestBucketStatsUnfinishedMultipartExposed(t *testing.T) {
	resetStatsCaches()
	admin := newFakeAdmin(t, map[string]http.HandlerFunc{
		"/v2/ListBuckets": bucketListJSON(adminBucketListItem{ID: "b1", GlobalAliases: []string{"bucket"}}),
		"/v2/GetBucketInfo": safeBucketInfoMock(map[string]any{
			"bytes": 42, "objects": 1, "quotas": map[string]any{},
			"unfinishedMultipartUploadParts": 7, "unfinishedMultipartUploadBytes": 8192,
		}),
	})

	rec := httptest.NewRecorder()
	HandleBucketStats(rec, httptest.NewRequest(http.MethodGet, "/api/102/stats/buckets", nil), 102, admin.config())

	overview := decodeJSON[BucketStatsOverview](t, rec)
	if overview.Buckets[0].UnfinishedMultipartUploadParts != 7 || overview.Buckets[0].UnfinishedMultipartUploadBytes != 8192 {
		t.Errorf("unfinishedMultipart* = %+v, want 7 / 8192 (valeurs admin transmises)",
			overview.Buckets[0])
	}
}

// TestBucketStatsCacheExpiryAndInvalidation verifie le cycle du cache buckets :
// frais dans le TTL, stale-while-revalidate apres expiration, puis rechargement
// bloquant apres Invalidate.
func TestBucketStatsCacheExpiryAndInvalidation(t *testing.T) {
	resetStatsCaches()
	admin := newFakeAdmin(t, map[string]http.HandlerFunc{
		"/v2/ListBuckets":   bucketListJSON(adminBucketListItem{ID: "b1", GlobalAliases: []string{"bucket"}}),
		"/v2/GetBucketInfo": safeBucketInfoMock(map[string]any{"bytes": 1, "objects": 1, "quotas": map[string]any{}}),
	})

	now := time.Unix(1700000000, 0)
	originalNow := bucketStatsCache.now
	t.Cleanup(func() {
		bucketStatsCache.now = originalNow
		bucketStatsCache.Clear()
	})
	bucketStatsCache.now = func() time.Time { return now }

	for i := 0; i < 2; i++ {
		rec := httptest.NewRecorder()
		HandleBucketStats(rec, httptest.NewRequest(http.MethodGet, "/api/103/stats/buckets", nil), 103, admin.config())
		if rec.Code != http.StatusOK {
			t.Fatalf("appel %d: status = %d", i, rec.Code)
		}
		if overview := decodeJSON[BucketStatsOverview](t, rec); overview.Stale {
			t.Fatalf("appel %d: stale=true dans le TTL", i)
		}
	}
	if hits := admin.hitsFor("/v2/ListBuckets"); hits != 1 {
		t.Fatalf("ListBuckets appele %d fois, want 1 (cache 30 s)", hits)
	}

	// TTL expire : la valeur precedente est servie avec stale=true et un
	// rafraichissement unique part en tache de fond.
	now = now.Add(31 * time.Second)
	rec := httptest.NewRecorder()
	HandleBucketStats(rec, httptest.NewRequest(http.MethodGet, "/api/103/stats/buckets", nil), 103, admin.config())
	if overview := decodeJSON[BucketStatsOverview](t, rec); !overview.Stale {
		t.Error("stale=false apres expiration du TTL (valeur perimee non signalee)")
	}
	waitForHits(t, admin, "/v2/ListBuckets", 2)
	if hits := admin.hitsFor("/v2/ListBuckets"); hits != 2 {
		t.Fatalf("ListBuckets appele %d fois apres expiration du TTL, want 2 (1 refresh de fond)", hits)
	}

	// Apres Invalidate, le prochain appel repart de zero : rechargement bloquant.
	invalidateProjectStatsCache(103)
	rec = httptest.NewRecorder()
	HandleBucketStats(rec, httptest.NewRequest(http.MethodGet, "/api/103/stats/buckets", nil), 103, admin.config())
	if overview := decodeJSON[BucketStatsOverview](t, rec); overview.Stale {
		t.Error("stale=true apres Invalidate (la valeur precedente doit avoir ete oubliee)")
	}
	if hits := admin.hitsFor("/v2/ListBuckets"); hits != 3 {
		t.Fatalf("ListBuckets appele %d fois apres invalidation, want 3", hits)
	}
}

func TestBucketStatsAdminNotConfigured(t *testing.T) {
	resetStatsCaches()
	rec := httptest.NewRecorder()
	HandleBucketStats(rec, httptest.NewRequest(http.MethodGet, "/api/104/stats/buckets", nil), 104,
		s3.S3ConfigData{S3URL: "https://s3.example.com"})

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 sans admin configure", rec.Code)
	}
}

func TestBucketStatsListBucketsFailure(t *testing.T) {
	resetStatsCaches()
	admin := newFakeAdmin(t, map[string]http.HandlerFunc{
		"/v2/ListBuckets": func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, "cluster unreachable", http.StatusBadGateway)
		},
	})

	rec := httptest.NewRecorder()
	HandleBucketStats(rec, httptest.NewRequest(http.MethodGet, "/api/105/stats/buckets", nil), 105, admin.config())

	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502 quand ListBuckets echoue", rec.Code)
	}
	if _, ok := bucketStatsCache.Get(cacheKey(105, "stats-buckets")); ok {
		t.Error("un echec ListBuckets ne doit pas etre mis en cache")
	}
}

// TestListBucketsUsesGetMethod verrouille la methode de l'appel admin : Garage
// v2.3.0 ne sert que GET /v2/ListBuckets, un POST repond 400 Unknown API endpoint.
func TestListBucketsUsesGetMethod(t *testing.T) {
	var mu sync.Mutex
	var methods []string
	admin := newFakeAdmin(t, map[string]http.HandlerFunc{
		"/v2/ListBuckets": func(w http.ResponseWriter, r *http.Request) {
			mu.Lock()
			methods = append(methods, r.Method)
			mu.Unlock()
			if r.Method != http.MethodGet {
				writeJSON(w, http.StatusBadRequest, map[string]any{
					"error": "Unknown API endpoint: " + r.Method + " /v2/ListBuckets",
				})
				return
			}
			writeJSON(w, http.StatusOK, []adminBucketListItem{{ID: "b1", GlobalAliases: []string{"bucket"}}})
		},
	})

	buckets, err := ListBuckets(context.Background(), admin.config())
	if err != nil {
		t.Fatalf("ListBuckets: %v (un POST vers l'admin Garage renvoie 400)", err)
	}
	if len(buckets) != 1 || buckets[0].ID != "b1" {
		t.Fatalf("buckets = %+v, want un seul bucket b1", buckets)
	}

	mu.Lock()
	defer mu.Unlock()
	if len(methods) != 1 || methods[0] != http.MethodGet {
		t.Fatalf("methodes appelees = %v, want [GET]", methods)
	}
}

// ------------------------------------------------------------- stats cluster

func clusterRoutes(health map[string]any, status map[string]any, layout map[string]any, statistics string) map[string]http.HandlerFunc {
	routes := map[string]http.HandlerFunc{}
	if health != nil {
		routes["/v2/GetClusterHealth"] = func(w http.ResponseWriter, r *http.Request) { writeJSON(w, http.StatusOK, health) }
	}
	if status != nil {
		routes["/v2/GetClusterStatus"] = func(w http.ResponseWriter, r *http.Request) { writeJSON(w, http.StatusOK, status) }
	}
	if layout != nil {
		routes["/v2/GetClusterLayout"] = func(w http.ResponseWriter, r *http.Request) { writeJSON(w, http.StatusOK, layout) }
	}
	if statistics != "" {
		routes["/v2/GetClusterStatistics"] = func(w http.ResponseWriter, r *http.Request) {
			writeJSON(w, http.StatusOK, map[string]any{"freeform": statistics})
		}
	}
	return routes
}

func TestClusterStatsHealthNodesAndLayout(t *testing.T) {
	resetStatsCaches()
	admin := newFakeAdmin(t, clusterRoutes(
		map[string]any{
			"status": "degraded", "connectedNodes": 2, "knownNodes": 3, "storageNodes": 3,
			"storageNodesUp": 2, "partitions": 256, "partitionsAllOk": 200, "partitionsQuorum": 256,
		},
		map[string]any{
			"layoutVersion": 11,
			"nodes": []map[string]any{
				{"id": "n1", "hostname": "node-1", "isUp": true, "draining": false,
					"role":          map[string]any{"zone": "dc1", "capacity": 1000000000, "tags": []string{}},
					"dataPartition": map[string]any{"available": 10, "total": 100}},
				{"id": "n2", "hostname": "node-2", "isUp": false, "draining": true},
			},
		},
		map[string]any{"version": 12, "roles": []map[string]any{
			{"id": "n2", "zone": "dc2", "capacity": 500000000},
		}},
		`{"data_avail": 1, "index_size": 2}`,
	))

	rec := httptest.NewRecorder()
	HandleClusterStats(rec, httptest.NewRequest(http.MethodGet, "/api/201/stats/cluster", nil), 201, admin.config())

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body %s)", rec.Code, rec.Body.String())
	}
	stats := decodeJSON[ClusterStats](t, rec)
	if stats.Health.Status != "degraded" || stats.Health.ConnectedNodes != 2 || stats.Health.KnownNodes != 3 ||
		stats.Health.StorageNodes != 3 || stats.Health.Partitions != 256 || stats.Health.PartitionsAllOk != 200 ||
		stats.Health.PartitionsQuorum != 256 {
		t.Errorf("health = %+v, want les valeurs de GetClusterHealth", stats.Health)
	}
	if stats.Health.StorageNodesOk != 2 {
		t.Errorf("health.storageNodesOk = %d, want 2 (source: storageNodesUp de Garage)", stats.Health.StorageNodesOk)
	}
	if stats.LayoutVersion != 12 {
		t.Errorf("layoutVersion = %d, want 12 (GetClusterLayout)", stats.LayoutVersion)
	}
	if len(stats.Nodes) != 2 {
		t.Fatalf("nodes = %d, want 2", len(stats.Nodes))
	}
	if n := stats.Nodes[0]; n.ID != "n1" || n.Hostname != "node-1" || !n.IsUp || n.Zone != "dc1" ||
		n.Capacity == nil || *n.Capacity != 1000000000 || n.DataPartition == nil || *n.DataPartition.Available != 10 {
		t.Errorf("nodes[0] = %+v, want node-1/up/dc1/1000000000", n)
	}
	if n := stats.Nodes[1]; n.IsUp || !n.Draining || n.Zone != "dc2" || n.Capacity == nil || *n.Capacity != 500000000 {
		t.Errorf("nodes[1] = %+v, want zone/capacite reprises du layout (role absente)", n)
	}
	if !stats.Statistics.Available || stats.Statistics.Raw != `{"data_avail": 1, "index_size": 2}` {
		t.Errorf("statistics = %+v, want available=true et raw conserve", stats.Statistics)
	}
	if stats.Statistics.Parsed == nil || stats.Statistics.Parsed["data_avail"] != float64(1) {
		t.Errorf("statistics.parsed = %v, want la map decodee", stats.Statistics.Parsed)
	}
	if stats.NodeStatistics != nil {
		t.Error("nodeStatistics doit rester vide sans include=nodeStats")
	}
	if hits := admin.hitsFor("/v2/GetNodeStatistics"); hits != 0 {
		t.Errorf("GetNodeStatistics appele %d fois, want 0 sans include=nodeStats", hits)
	}
}

func TestClusterStatsFreeformNotJSON(t *testing.T) {
	resetStatsCaches()
	admin := newFakeAdmin(t, clusterRoutes(
		map[string]any{"status": "healthy", "storageNodesUp": 1},
		map[string]any{"layoutVersion": 3, "nodes": []map[string]any{}},
		map[string]any{"version": 3, "roles": []map[string]any{}},
		"----- CLUSTER STATS -----\nnot json at all",
	))

	rec := httptest.NewRecorder()
	HandleClusterStats(rec, httptest.NewRequest(http.MethodGet, "/api/202/stats/cluster", nil), 202, admin.config())

	stats := decodeJSON[ClusterStats](t, rec)
	if !stats.Statistics.Available {
		t.Error("statistics.available = false alors que GetClusterStatistics a repondu")
	}
	if stats.Statistics.Parsed != nil {
		t.Errorf("statistics.parsed = %v, want null (contenu non-JSON, aucun champ invente)", stats.Statistics.Parsed)
	}
	if stats.Statistics.Raw != "----- CLUSTER STATS -----\nnot json at all" {
		t.Errorf("statistics.raw = %q, want le texte brut integral", stats.Statistics.Raw)
	}

	var raw map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &raw); err != nil {
		t.Fatalf("reponse non JSON: %v", err)
	}
	statistics := raw["statistics"].(map[string]any)
	if parsed, ok := statistics["parsed"]; !ok || parsed != nil {
		t.Errorf("statistics.parsed serialise = %v (present=%v), want null", parsed, ok)
	}
	if _, ok := statistics["freeform"]; ok {
		t.Error("le champ freeform ne doit jamais fuiter tel quel dans la reponse")
	}
}

func TestClusterStatsStatisticsUnavailable(t *testing.T) {
	resetStatsCaches()
	routes := clusterRoutes(
		map[string]any{"status": "healthy", "storageNodesUp": 1},
		map[string]any{"layoutVersion": 3, "nodes": []map[string]any{}},
		map[string]any{"version": 3, "roles": []map[string]any{}},
		"ignored",
	)
	routes["/v2/GetClusterStatistics"] = func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "stats timeout", http.StatusGatewayTimeout)
	}
	admin := newFakeAdmin(t, routes)

	rec := httptest.NewRecorder()
	HandleClusterStats(rec, httptest.NewRequest(http.MethodGet, "/api/203/stats/cluster", nil), 203, admin.config())

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (les stats freeform sont optionnelles)", rec.Code)
	}
	stats := decodeJSON[ClusterStats](t, rec)
	if stats.Statistics.Available || stats.Statistics.Raw != "" || stats.Statistics.Parsed != nil {
		t.Errorf("statistics = %+v, want available=false, raw vide, parsed null", stats.Statistics)
	}
}

func TestClusterStatsHealthFailureIsReported(t *testing.T) {
	resetStatsCaches()
	routes := clusterRoutes(nil, map[string]any{"layoutVersion": 1, "nodes": []map[string]any{}}, nil, "")
	routes["/v2/GetClusterHealth"] = func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "unavailable", http.StatusServiceUnavailable)
	}
	admin := newFakeAdmin(t, routes)

	rec := httptest.NewRecorder()
	HandleClusterStats(rec, httptest.NewRequest(http.MethodGet, "/api/204/stats/cluster", nil), 204, admin.config())

	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502 quand GetClusterHealth echoue", rec.Code)
	}
}

func TestClusterStatsIncludeNodeStats(t *testing.T) {
	resetStatsCaches()
	routes := clusterRoutes(
		map[string]any{"status": "healthy", "storageNodesUp": 2},
		map[string]any{"layoutVersion": 4, "nodes": []map[string]any{{"id": "n1", "hostname": "node-1", "isUp": true}}},
		map[string]any{"version": 4, "roles": []map[string]any{}},
		"{}",
	)
	routes["/v2/GetNodeStatistics"] = func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Query().Get("id")
		if id == "" {
			http.Error(w, "missing id", http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"freeform": `{"node": "` + id + `"}`})
	}
	admin := newFakeAdmin(t, routes)

	rec := httptest.NewRecorder()
	HandleClusterStats(rec, httptest.NewRequest(http.MethodGet, "/api/205/stats/cluster?include=nodeStats", nil), 205, admin.config())

	stats := decodeJSON[ClusterStats](t, rec)
	if len(stats.NodeStatistics) != 1 {
		t.Fatalf("nodeStatistics = %v, want une entree pour n1", stats.NodeStatistics)
	}
	entry, ok := stats.NodeStatistics["n1"]
	if !ok || !entry.Available || entry.Parsed["node"] != "n1" {
		t.Errorf("nodeStatistics[n1] = %+v, want available=true et parsed.node=n1", entry)
	}
	if hits := admin.hitsFor("/v2/GetNodeStatistics"); hits != 1 {
		t.Errorf("GetNodeStatistics appele %d fois, want 1", hits)
	}
}

func TestClusterStatsCacheKeyDependsOnInclude(t *testing.T) {
	resetStatsCaches()
	routes := clusterRoutes(
		map[string]any{"status": "healthy", "storageNodesUp": 2},
		map[string]any{"layoutVersion": 4, "nodes": []map[string]any{{"id": "n1", "isUp": true}}},
		map[string]any{"version": 4, "roles": []map[string]any{}},
		"{}",
	)
	routes["/v2/GetNodeStatistics"] = func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"freeform": "{}"})
	}
	admin := newFakeAdmin(t, routes)

	rec := httptest.NewRecorder()
	HandleClusterStats(rec, httptest.NewRequest(http.MethodGet, "/api/206/stats/cluster", nil), 206, admin.config())
	plain := decodeJSON[ClusterStats](t, rec)
	if plain.NodeStatistics != nil {
		t.Error("la reponse mise en cache sans nodeStats ne doit pas contenir nodeStatistics")
	}

	rec = httptest.NewRecorder()
	HandleClusterStats(rec, httptest.NewRequest(http.MethodGet, "/api/206/stats/cluster?include=nodeStats", nil), 206, admin.config())
	withNodes := decodeJSON[ClusterStats](t, rec)
	if len(withNodes.NodeStatistics) != 1 {
		t.Errorf("nodeStatistics = %v, want 1 entree (cache distinct de la variante sans nodeStats)", withNodes.NodeStatistics)
	}
}

// ------------------------------------------------------------------- routage

func TestHandleProjectStatsRouting(t *testing.T) {
	resetStatsCaches()
	admin := newFakeAdmin(t, map[string]http.HandlerFunc{
		"/v2/ListBuckets":   bucketListJSON(),
		"/v2/GetBucketInfo": safeBucketInfoMock(map[string]any{"bytes": 0, "objects": 0, "quotas": map[string]any{}}),
	})
	config := admin.config()

	cases := []struct {
		name       string
		path       string
		wantStatus int
	}{
		{"buckets", "/api/301/stats/buckets", http.StatusOK},
		{"inconnu", "/api/301/stats/nodes", http.StatusNotFound},
		{"vide", "/api/301/stats", http.StatusNotFound},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			parts := []string{"301", "stats"}
			if rest := tc.path[len("/api/301/stats"):]; rest != "" {
				parts = append(parts, rest[1:])
			}
			handleProjectStats(rec, httptest.NewRequest(http.MethodGet, tc.path, nil), 301, config, parts)
			if rec.Code != tc.wantStatus {
				t.Errorf("status = %d, want %d", rec.Code, tc.wantStatus)
			}
		})
	}
}

func TestClusterStatsAdminNotConfigured(t *testing.T) {
	resetStatsCaches()
	rec := httptest.NewRecorder()
	HandleClusterStats(rec, httptest.NewRequest(http.MethodGet, "/api/302/stats/cluster", nil), 302, s3.S3ConfigData{})

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 sans admin configure", rec.Code)
	}
}

func TestClusterStatsMethodNotAllowed(t *testing.T) {
	rec := httptest.NewRecorder()
	HandleClusterStats(rec, httptest.NewRequest(http.MethodPost, "/api/303/stats/cluster", nil), 303, s3.S3ConfigData{})

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", rec.Code)
	}
}

func TestQuotaUsagePercent(t *testing.T) {
	if got := quotaUsagePercent(100, nil); got != nil {
		t.Errorf("quotaUsagePercent(sans quota) = %v, want nil", *got)
	}
	if got := quotaUsagePercent(100, int64Ptr(0)); got != nil {
		t.Errorf("quotaUsagePercent(maxSize=0) = %v, want nil (0 = pas de quota Garage)", *got)
	}
	if got := quotaUsagePercent(5, int64Ptr(1000)); got == nil || *got != 0.5 {
		t.Errorf("quotaUsagePercent(5/1000) = %v, want 0.5", got)
	}
}

func TestAdminGetJSONRejectsNon2xx(t *testing.T) {
	admin := newFakeAdmin(t, map[string]http.HandlerFunc{
		"/v2/GetClusterHealth": func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, "nope", http.StatusForbidden)
		},
	})
	err := adminGetJSON(t.Context(), admin.config(), http.MethodGet, "/v2/GetClusterHealth", nil)
	if err == nil {
		t.Fatal("adminGetJSON doit retourner une erreur sur un statut non 2xx")
	}
	if _, ok := err.(*url.Error); ok {
		t.Errorf("erreur inattendue de transport: %v", err)
	}
}

// ------------------------------------------------- stale-while-revalidate

// waitForHits attend qu'un chemin admin ait ete appele au moins want fois.
func waitForHits(t *testing.T, admin *fakeAdmin, path string, want int) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for admin.hitsFor(path) < want {
		if time.Now().After(deadline) {
			t.Fatalf("%s appele %d fois, want au moins %d", path, admin.hitsFor(path), want)
		}
		time.Sleep(2 * time.Millisecond)
	}
}

// waitForCacheState attend que la cle atteigne l'etat voulu et retourne la valeur.
func waitForCacheState[T any](t *testing.T, cache *ttlCache[T], key string, want cacheState) T {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for {
		lookup := cache.Lookup(key)
		if lookup.State == want {
			return lookup.Value
		}
		if time.Now().After(deadline) {
			t.Fatalf("cache %q: state = %v, want %v", key, lookup.State, want)
		}
		time.Sleep(2 * time.Millisecond)
	}
}

func TestTTLCacheLookupStatesAndSingleFlightRefresh(t *testing.T) {
	now := time.Unix(1700000000, 0)
	cache := newTTLCache[int](time.Minute)
	cache.now = func() time.Time { return now }

	if lookup := cache.Lookup("k"); lookup.State != cacheMiss {
		t.Fatalf("Lookup sur une cle absente = %v, want miss", lookup.State)
	}
	cache.Set("k", 1)
	if lookup := cache.Lookup("k"); lookup.State != cacheFresh || lookup.Value != 1 {
		t.Fatalf("Lookup = (%v, %v), want (1, fresh)", lookup.Value, lookup.State)
	}
	now = now.Add(61 * time.Second)
	if lookup := cache.Lookup("k"); lookup.State != cacheStale || lookup.Value != 1 {
		t.Fatalf("Lookup apres expiration = (%v, %v), want (1, stale)", lookup.Value, lookup.State)
	}

	release := make(chan struct{})
	var fetches atomic.Int64
	fetch := func(ctx context.Context) (int, error) {
		fetches.Add(1)
		select {
		case <-release:
			return 2, nil
		case <-ctx.Done():
			return 0, ctx.Err()
		}
	}

	if !cache.RefreshStale(context.Background(), "k", time.Minute, fetch) {
		t.Fatal("RefreshStale doit demarrer un rafraichissement")
	}
	if cache.RefreshStale(context.Background(), "k", time.Minute, fetch) {
		t.Error("RefreshStale doit refuser un second rafraichissement concurrent (single-flight)")
	}
	close(release)
	if refreshed := waitForCacheState(t, cache, "k", cacheFresh); refreshed != 2 {
		t.Errorf("valeur rafraichie = %d, want 2", refreshed)
	}
	if got := fetches.Load(); got != 1 {
		t.Errorf("fetch appele %d fois, want 1 (single-flight)", got)
	}

	// Un fetch en echec ne remplace jamais la valeur precedente.
	now = now.Add(61 * time.Second)
	attempted := make(chan struct{})
	failing := func(context.Context) (int, error) {
		close(attempted)
		return 0, errTestRefresh
	}
	if !cache.RefreshStale(context.Background(), "k", time.Minute, failing) {
		t.Fatal("RefreshStale doit pouvoir retenter apres la fin du precedent")
	}
	select {
	case <-attempted:
	case <-time.After(3 * time.Second):
		t.Fatal("le rafraichissement en echec n'a pas ete execute")
	}
	if lookup := cache.Lookup("k"); lookup.State != cacheStale || lookup.Value != 2 {
		t.Errorf("Lookup apres un refresh en echec = (%v, %v), want (2, stale)", lookup.Value, lookup.State)
	}
}

var errTestRefresh = errors.New("refresh en echec")

func TestBucketStatsColdEntryBlocksAndInvalidateResetsStale(t *testing.T) {
	resetStatsCaches()
	admin := newFakeAdmin(t, map[string]http.HandlerFunc{
		"/v2/ListBuckets":   bucketListJSON(adminBucketListItem{ID: "b1", GlobalAliases: []string{"bucket"}}),
		"/v2/GetBucketInfo": safeBucketInfoMock(map[string]any{"bytes": 1, "objects": 1, "quotas": map[string]any{}}),
	})
	key := cacheKey(403, "stats-buckets")
	request := func() *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		HandleBucketStats(rec, httptest.NewRequest(http.MethodGet, "/api/403/stats/buckets", nil), 403, admin.config())
		return rec
	}

	// Aucune valeur precedente : chargement bloquant, stale=false, un seul appel admin.
	rec := request()
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body %s)", rec.Code, rec.Body.String())
	}
	if cold := decodeJSON[BucketStatsOverview](t, rec); cold.Stale {
		t.Error("stale=true alors qu'aucune valeur precedente n'existe (chargement bloquant)")
	}
	if hits := admin.hitsFor("/v2/ListBuckets"); hits != 1 {
		t.Fatalf("ListBuckets appele %d fois, want 1 (un seul appel bloquant)", hits)
	}

	// Apres Invalidate, le prochain appel repart de zero : aucun stale servi.
	invalidateProjectStatsCache(403)
	if lookup := bucketStatsCache.Lookup(key); lookup.State != cacheMiss {
		t.Fatalf("apres Invalidate: state = %v, want miss", lookup.State)
	}
	rec = request()
	if after := decodeJSON[BucketStatsOverview](t, rec); after.Stale {
		t.Error("stale=true apres Invalidate (la valeur precedente doit avoir ete oubliee)")
	}
	if hits := admin.hitsFor("/v2/ListBuckets"); hits != 2 {
		t.Fatalf("ListBuckets appele %d fois apres Invalidate, want 2 (aucun refresh de fond)", hits)
	}
}

func TestBucketStatsStaleServedImmediatelyWithSingleFlightRefresh(t *testing.T) {
	resetStatsCaches()
	var calls atomic.Int64
	refreshGate := make(chan struct{})
	admin := newFakeAdmin(t, map[string]http.HandlerFunc{
		"/v2/ListBuckets": func(w http.ResponseWriter, r *http.Request) {
			switch calls.Add(1) {
			case 1:
				writeJSON(w, http.StatusOK, []adminBucketListItem{{ID: "b1", GlobalAliases: []string{"bucket"}}})
			default:
				<-refreshGate
				writeJSON(w, http.StatusOK, []adminBucketListItem{{ID: "b2", GlobalAliases: []string{"bucket"}}})
			}
		},
		"/v2/GetBucketInfo": safeBucketInfoMock(map[string]any{"bytes": 1, "objects": 1, "quotas": map[string]any{}}),
	})

	now := time.Unix(1700000000, 0)
	originalNow := bucketStatsCache.now
	t.Cleanup(func() {
		bucketStatsCache.now = originalNow
		bucketStatsCache.Clear()
	})
	bucketStatsCache.now = func() time.Time { return now }
	key := cacheKey(401, "stats-buckets")

	// 1. chargement initial : stale=false, un seul appel admin.
	rec := httptest.NewRecorder()
	HandleBucketStats(rec, httptest.NewRequest(http.MethodGet, "/api/401/stats/buckets", nil), 401, admin.config())
	if initial := decodeJSON[BucketStatsOverview](t, rec); initial.Stale || len(initial.Buckets) != 1 || initial.Buckets[0].ID != "b1" {
		t.Fatalf("premier appel = %+v, want b1 frais", initial)
	}

	// 2. expiration du TTL : la valeur precedente doit etre servie immediatement.
	now = now.Add(31 * time.Second)
	const concurrent = 5
	recorders := make([]*httptest.ResponseRecorder, concurrent)
	var wg sync.WaitGroup
	for i := 0; i < concurrent; i++ {
		recorders[i] = httptest.NewRecorder()
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			HandleBucketStats(recorders[i], httptest.NewRequest(http.MethodGet, "/api/401/stats/buckets", nil), 401, admin.config())
		}(i)
	}
	wg.Wait()

	// Le refresh est encore bloque sur refreshGate : ces reponses prouvent que la
	// valeur perimee a ete servie sans attendre le rafraichissement.
	for i, rec := range recorders {
		if rec.Code != http.StatusOK {
			t.Fatalf("requete %d: status = %d, want 200", i, rec.Code)
		}
		stale := decodeJSON[BucketStatsOverview](t, rec)
		if !stale.Stale {
			t.Errorf("requete %d: stale=false, want true (valeur precedente servie)", i)
		}
		if len(stale.Buckets) != 1 || stale.Buckets[0].ID != "b1" {
			t.Errorf("requete %d: buckets = %+v, want la valeur precedente b1", i, stale.Buckets)
		}
	}
	waitForHits(t, admin, "/v2/ListBuckets", 2)
	if hits := admin.hitsFor("/v2/ListBuckets"); hits != 2 {
		t.Fatalf("ListBuckets appele %d fois, want 2 (1 chargement + 1 seul refresh single-flight)", hits)
	}
	if hits := admin.hitsFor("/v2/GetBucketInfo"); hits != 1 {
		t.Fatalf("GetBucketInfo appele %d fois, want 1 (aucun travail admin par requete concurrente)", hits)
	}

	// 3. le refresh de fond remplace la valeur precedente : stale repasse a false.
	close(refreshGate)
	if refreshed := waitForCacheState(t, bucketStatsCache, key, cacheFresh); refreshed.Buckets[0].ID != "b2" {
		t.Fatalf("cache rafraichi = %+v, want b2", refreshed.Buckets)
	}
	rec = httptest.NewRecorder()
	HandleBucketStats(rec, httptest.NewRequest(http.MethodGet, "/api/401/stats/buckets", nil), 401, admin.config())
	if after := decodeJSON[BucketStatsOverview](t, rec); after.Stale || after.Buckets[0].ID != "b2" {
		t.Errorf("apres rafraichissement = %+v, want b2 frais", after)
	}
}

func TestBucketStatsFailedBackgroundRefreshKeepsPreviousValue(t *testing.T) {
	resetStatsCaches()
	var calls atomic.Int64
	admin := newFakeAdmin(t, map[string]http.HandlerFunc{
		"/v2/ListBuckets": func(w http.ResponseWriter, r *http.Request) {
			if calls.Add(1) == 1 {
				writeJSON(w, http.StatusOK, []adminBucketListItem{{ID: "b1", GlobalAliases: []string{"bucket"}}})
				return
			}
			http.Error(w, "admin down", http.StatusServiceUnavailable)
		},
		"/v2/GetBucketInfo": safeBucketInfoMock(map[string]any{"bytes": 4, "objects": 2, "quotas": map[string]any{}}),
	})

	now := time.Unix(1700000000, 0)
	originalNow := bucketStatsCache.now
	t.Cleanup(func() {
		bucketStatsCache.now = originalNow
		bucketStatsCache.Clear()
	})
	bucketStatsCache.now = func() time.Time { return now }
	key := cacheKey(404, "stats-buckets")

	rec := httptest.NewRecorder()
	HandleBucketStats(rec, httptest.NewRequest(http.MethodGet, "/api/404/stats/buckets", nil), 404, admin.config())
	if initial := decodeJSON[BucketStatsOverview](t, rec); initial.Stale || initial.Buckets[0].ID != "b1" {
		t.Fatalf("premier appel = %+v, want b1 frais", initial)
	}

	now = now.Add(31 * time.Second)
	rec = httptest.NewRecorder()
	HandleBucketStats(rec, httptest.NewRequest(http.MethodGet, "/api/404/stats/buckets", nil), 404, admin.config())
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (un refresh de fond en echec ne doit pas produire de 502)", rec.Code)
	}
	stale := decodeJSON[BucketStatsOverview](t, rec)
	if !stale.Stale || len(stale.Buckets) != 1 || stale.Buckets[0].ID != "b1" {
		t.Fatalf("reponse = %+v, want la valeur precedente b1 avec stale=true", stale)
	}

	// Le refresh de fond a bien ete tente puis a echoue : la valeur precedente reste.
	waitForHits(t, admin, "/v2/ListBuckets", 2)
	time.Sleep(50 * time.Millisecond)
	lookup := bucketStatsCache.Lookup(key)
	if lookup.State != cacheStale || len(lookup.Value.Buckets) != 1 || lookup.Value.Buckets[0].ID != "b1" {
		t.Fatalf("cache = (%v, %+v), want la valeur precedente b1 encore presente", lookup.State, lookup.Value.Buckets)
	}

	rec = httptest.NewRecorder()
	HandleBucketStats(rec, httptest.NewRequest(http.MethodGet, "/api/404/stats/buckets", nil), 404, admin.config())
	if rec.Code != http.StatusOK {
		t.Fatalf("status apres echec du refresh = %d, want 200", rec.Code)
	}
	if again := decodeJSON[BucketStatsOverview](t, rec); !again.Stale || again.Buckets[0].ID != "b1" {
		t.Errorf("reponse = %+v, want encore la valeur precedente b1 avec stale=true", again)
	}
}

func TestInvalidateProjectStatsCacheScopedToProject(t *testing.T) {
	resetStatsCaches()
	bucketStatsCache.Set(cacheKey(501, "stats-buckets"), BucketStatsOverview{GeneratedAt: "projet-501"})
	bucketStatsCache.Set(cacheKey(5010, "stats-buckets"), BucketStatsOverview{GeneratedAt: "projet-5010"})
	clusterStatsCache.Set(cacheKey(501, "stats-cluster", "nodeStats=true"), ClusterStats{LayoutVersion: 5})
	clusterStatsCache.Set(cacheKey(5010, "stats-cluster", "nodeStats=true"), ClusterStats{LayoutVersion: 7})

	invalidateProjectStatsCache(501)

	if lookup := bucketStatsCache.Lookup(cacheKey(501, "stats-buckets")); lookup.State != cacheMiss {
		t.Errorf("stats/buckets du projet 501: state = %v, want miss", lookup.State)
	}
	if lookup := clusterStatsCache.Lookup(cacheKey(501, "stats-cluster", "nodeStats=true")); lookup.State != cacheMiss {
		t.Errorf("stats/cluster du projet 501: state = %v, want miss", lookup.State)
	}
	if lookup := bucketStatsCache.Lookup(cacheKey(5010, "stats-buckets")); lookup.State != cacheFresh {
		t.Errorf("stats/buckets du projet 5010: state = %v, want fresh (autre projet intact)", lookup.State)
	}
	if lookup := clusterStatsCache.Lookup(cacheKey(5010, "stats-cluster", "nodeStats=true")); lookup.State != cacheFresh {
		t.Errorf("stats/cluster du projet 5010: state = %v, want fresh (autre projet intact)", lookup.State)
	}
}

func TestServeBucketMutationInvalidatesStatsCacheOnSuccessOnly(t *testing.T) {
	resetStatsCaches()
	fill := func(projectID uint) {
		bucketStatsCache.Set(cacheKey(projectID, "stats-buckets"), BucketStatsOverview{GeneratedAt: "pre-mutation"})
	}
	created := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	refused := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		jsonError(w, "bucket introuvable", http.StatusConflict)
	})

	fill(601)
	rec := httptest.NewRecorder()
	serveBucketMutation(rec, httptest.NewRequest(http.MethodPost, "/api/601/s3/create-bucket", nil), s3.S3ConfigData{ID: 601}, created)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if lookup := bucketStatsCache.Lookup(cacheKey(601, "stats-buckets")); lookup.State != cacheMiss {
		t.Errorf("apres une mutation 2xx: state = %v, want miss (cache stats invalide)", lookup.State)
	}

	fill(602)
	rec = httptest.NewRecorder()
	serveBucketMutation(rec, httptest.NewRequest(http.MethodPost, "/api/602/s3/delete-bucket", nil), s3.S3ConfigData{ID: 602}, refused)
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409 (statut du handler preserve)", rec.Code)
	}
	if lookup := bucketStatsCache.Lookup(cacheKey(602, "stats-buckets")); lookup.State != cacheFresh {
		t.Errorf("apres une mutation en echec: state = %v, want fresh (cache stats conserve)", lookup.State)
	}
}

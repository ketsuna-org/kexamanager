package s3

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestBucketUsageCacheExpiration(t *testing.T) {
	clearBucketUsageCache()
	key := usageCacheKey(1, []string{"bot-creator"}, defaultMaxObjectsPerBucket)

	storeBucketUsage(key, BucketUsageResponse{GeneratedAt: "2026-09-15T14:20:00Z"})
	if _, ok := loadBucketUsage(key); !ok {
		t.Fatal("entree fraiche non servie")
	}
	if _, ok := loadBucketUsage(usageCacheKey(2, []string{"bot-creator"}, defaultMaxObjectsPerBucket)); ok {
		t.Error("la cle d'un autre projet ne doit pas servir le cache")
	}
	if _, ok := loadBucketUsage(usageCacheKey(1, []string{"audio"}, defaultMaxObjectsPerBucket)); ok {
		t.Error("une autre liste de buckets ne doit pas servir le cache")
	}
	if _, ok := loadBucketUsage(usageCacheKey(1, []string{"bot-creator"}, 2)); ok {
		t.Error("un plafond different ne doit pas servir le cache du plafond par defaut")
	}

	bucketUsageMu.Lock()
	bucketUsageCache[key] = bucketUsageEntry{expires: time.Now().Add(-time.Second)}
	bucketUsageMu.Unlock()

	if _, ok := loadBucketUsage(key); ok {
		t.Error("une entree perimee ne doit pas etre servie")
	}
	clearBucketUsageCache()
}

func TestDecodeBucketUsageRequest(t *testing.T) {
	rec := httptest.NewRecorder()
	if _, ok := decodeBucketUsageRequest(rec, httptest.NewRequest(http.MethodGet, "/s3/bucket-usage", nil)); ok {
		t.Fatal("une methode GET doit etre refusee")
	}
	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("status = %d, want 405", rec.Code)
	}

	rec = httptest.NewRecorder()
	bad := httptest.NewRequest(http.MethodPost, "/s3/bucket-usage", bytes.NewReader([]byte("{pas du json")))
	if _, ok := decodeBucketUsageRequest(rec, bad); ok {
		t.Fatal("un corps non JSON doit etre refuse")
	}
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", rec.Code)
	}

	rec = httptest.NewRecorder()
	good := httptest.NewRequest(http.MethodPost, "/s3/bucket-usage", bytes.NewReader([]byte(`{"buckets":["a"],"maxBuckets":1}`)))
	req, ok := decodeBucketUsageRequest(rec, good)
	if !ok {
		t.Fatalf("corps valide refuse: %s", rec.Body.String())
	}
	if len(req.Buckets) != 1 || req.Buckets[0] != "a" || req.MaxBuckets != 1 {
		t.Errorf("requete decodee = %+v", req)
	}
}

func TestResolveBucketNamesPlafonne(t *testing.T) {
	names, err := resolveBucketNames(t.Context(), nil, []string{"a", "b", "c"}, 2)
	if err != nil {
		t.Fatalf("resolveBucketNames: %v", err)
	}
	if len(names) != 2 || names[0] != "a" || names[1] != "b" {
		t.Errorf("buckets = %v, attendu les 2 premiers (plafond maxBuckets)", names)
	}
}

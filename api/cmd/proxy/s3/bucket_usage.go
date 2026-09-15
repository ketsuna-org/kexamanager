package s3

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/minio/minio-go/v7"
)

const (
	usagePageSize              = 1000             // taille de page de la marche paginee (plafond S3)
	defaultMaxObjectsPerBucket = 5000             // plafond d'objets par bucket si la requete est muette
	hardMaxObjectsPerBucket    = 50000            // plafond absolu, insensible a la requete
	defaultMaxBuckets          = 20               // buckets traites si la requete est muette
	hardMaxBuckets             = 100              // plafond absolu du nombre de buckets traites
	bucketUsageTTL             = 60 * time.Second // validite du cache (projet + buckets + plafond)
	// maxUsagePages borne la marche meme si un backend renvoyait sans fin des
	// jetons de continuation : le plafond d'objets est atteint bien avant.
	maxUsagePages = hardMaxObjectsPerBucket/usagePageSize + 1
)

// StorageClassUsage est la part d'un bucket portee par une classe de stockage.
type StorageClassUsage struct {
	Objects int64 `json:"objects"`
	Bytes   int64 `json:"bytes"`
}

// BucketUsageBucket est le releve d'un bucket : Complete passe a false des que le
// plafond d'objets est atteint ou que le listing echoue, les compteurs restent
// alors partiels (le front affiche ">=") mais jamais extrapoles.
type BucketUsageBucket struct {
	Name           string                       `json:"name"`
	Objects        int64                        `json:"objects"`
	Bytes          int64                        `json:"bytes"`
	Complete       bool                         `json:"complete"`
	Prefixes       int                          `json:"prefixes"`
	StorageClasses map[string]StorageClassUsage `json:"storageClasses"`
	Error          *string                      `json:"error"`
}

// BucketUsageTotals agrege les releves : *Complete reste false des qu'un bucket
// manque a l'appel (plafond atteint ou erreur).
type BucketUsageTotals struct {
	Buckets         int   `json:"buckets"`
	Objects         int64 `json:"objects"`
	Bytes           int64 `json:"bytes"`
	ObjectsComplete bool  `json:"objectsComplete"`
	BucketsComplete bool  `json:"bucketsComplete"`
}

// objectPageSource lit une page de listing : le Core client en production, une
// source synthetique dans les tests.
type objectPageSource func(prefix, token, delimiter string, maxKeys int) (minio.ListBucketV2Result, error)

// corePageSource branche la marche paginee sur le Core client, seul client a
// exposer CommonPrefixes, IsTruncated et NextContinuationToken.
func corePageSource(client *minio.Client, bucket string) objectPageSource {
	core := minio.Core{Client: client}
	return func(prefix, token, delimiter string, maxKeys int) (minio.ListBucketV2Result, error) {
		return core.ListObjectsV2(bucket, prefix, "", token, delimiter, maxKeys)
	}
}

// normalizeUsageLimits applique le defaut si la requete est muette et le plafond
// absolu si elle demande plus : une requete ne peut jamais elargir les bornes.
func normalizeUsageLimits(req BucketUsageRequest) (maxObjects, maxBuckets int) {
	clamp := func(requested, fallback, hard int) int {
		switch {
		case requested <= 0:
			return fallback
		case requested > hard:
			return hard
		default:
			return requested
		}
	}
	return clamp(req.MaxObjectsPerBucket, defaultMaxObjectsPerBucket, hardMaxObjectsPerBucket),
		clamp(req.MaxBuckets, defaultMaxBuckets, hardMaxBuckets)
}

// addObjectUsage cumule un objet et sa classe de stockage (une classe vide n'est
// pas inventee : le listing ne transporte pas toujours x-amz-storage-class).
func addObjectUsage(bucket *BucketUsageBucket, info minio.ObjectInfo) {
	bucket.Objects++
	bucket.Bytes += info.Size
	if info.StorageClass == "" {
		return
	}
	class := bucket.StorageClasses[info.StorageClass]
	class.Objects++
	class.Bytes += info.Size
	bucket.StorageClasses[info.StorageClass] = class
}

// bucketUsageOf mesure un bucket : marche paginee bornee par maxObjects, puis
// comptage des prefixes de premier niveau (un appel a delimiter="/" suffit). Un
// plafond atteint ou un echec rendent le releve incomplet, sans perdre le partiel.
func bucketUsageOf(bucketName string, maxObjects int, list objectPageSource) BucketUsageBucket {
	usage := BucketUsageBucket{Name: bucketName, StorageClasses: map[string]StorageClassUsage{}}
	token := ""

	for page := 0; page < maxUsagePages; page++ {
		res, err := list("", token, "", usagePageSize)
		if err != nil {
			usage.Error = errorText(err)
			return usage
		}
		for _, info := range res.Contents {
			if usage.Objects >= int64(maxObjects) {
				return usage
			}
			addObjectUsage(&usage, info)
		}
		if !res.IsTruncated {
			usage.Complete = true
			break
		}
		if res.NextContinuationToken == "" || res.NextContinuationToken == token {
			usage.Error = errorText(fmt.Errorf("listing tronque sans jeton de continuation exploitable"))
			return usage
		}
		token = res.NextContinuationToken
	}

	if !usage.Complete && usage.Error == nil {
		usage.Error = errorText(fmt.Errorf("listing interrompu apres %d pages", maxUsagePages))
		return usage
	}

	prefixes, err := list("", "", "/", usagePageSize)
	if err != nil {
		usage.Complete = false
		usage.Error = errorText(err)
		return usage
	}
	usage.Prefixes = len(prefixes.CommonPrefixes)
	return usage
}

// aggregateBucketUsage somme les releves sans jamais masquer ce qui manque.
func aggregateBucketUsage(buckets []BucketUsageBucket) BucketUsageTotals {
	totals := BucketUsageTotals{Buckets: len(buckets), ObjectsComplete: true, BucketsComplete: true}
	for _, bucket := range buckets {
		totals.Objects += bucket.Objects
		totals.Bytes += bucket.Bytes
		if !bucket.Complete {
			totals.ObjectsComplete = false
		}
		if bucket.Error != nil {
			totals.ObjectsComplete = false
			totals.BucketsComplete = false
		}
	}
	return totals
}

type bucketUsageEntry struct {
	response BucketUsageResponse
	expires  time.Time
}

var (
	bucketUsageMu    sync.Mutex
	bucketUsageCache = map[string]bucketUsageEntry{}
)

// usageCacheKey identifie un releve : un plafond different ne doit jamais servir
// le releve d'un autre plafond.
func usageCacheKey(projectID uint, buckets []string, maxObjects int) string {
	return fmt.Sprintf("%d|%s|%d", projectID, strings.Join(buckets, ","), maxObjects)
}

func loadBucketUsage(key string) (BucketUsageResponse, bool) {
	bucketUsageMu.Lock()
	defer bucketUsageMu.Unlock()
	entry, ok := bucketUsageCache[key]
	if !ok || time.Now().After(entry.expires) {
		return BucketUsageResponse{}, false
	}
	return entry.response, true
}

func storeBucketUsage(key string, response BucketUsageResponse) {
	bucketUsageMu.Lock()
	defer bucketUsageMu.Unlock()
	bucketUsageCache[key] = bucketUsageEntry{response: response, expires: time.Now().Add(bucketUsageTTL)}
}

// clearBucketUsageCache vide le cache d'usage (utilise par les tests).
func clearBucketUsageCache() {
	bucketUsageMu.Lock()
	defer bucketUsageMu.Unlock()
	bucketUsageCache = map[string]bucketUsageEntry{}
}

// resolveBucketNames rend les buckets a mesurer : ceux de la requete, ou ceux de
// ListBuckets si elle est muette. Dans les deux cas la liste est plafonnee, donc
// le pire cas d'un appel reste connu (maxBuckets x maxObjects).
func resolveBucketNames(ctx context.Context, client *minio.Client, requested []string, maxBuckets int) ([]string, error) {
	if len(requested) > maxBuckets {
		requested = requested[:maxBuckets]
	}
	if len(requested) > 0 {
		return requested, nil
	}

	listed, err := client.ListBuckets(ctx)
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(listed))
	for _, bucket := range listed {
		names = append(names, bucket.Name)
	}
	if len(names) > maxBuckets {
		names = names[:maxBuckets]
	}
	return names, nil
}

// decodeBucketUsageRequest valide la methode et decode le corps JSON.
func decodeBucketUsageRequest(w http.ResponseWriter, r *http.Request) (BucketUsageRequest, bool) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return BucketUsageRequest{}, false
	}

	var req BucketUsageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return BucketUsageRequest{}, false
	}
	return req, true
}

// serveBucketUsage mesure les buckets demandes pour une config deja resolue.
func serveBucketUsage(w http.ResponseWriter, r *http.Request, config S3ConfigData, req BucketUsageRequest) {
	maxObjects, maxBuckets := normalizeUsageLimits(req)

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

	buckets, err := resolveBucketNames(r.Context(), client, req.Buckets, maxBuckets)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to list buckets: %v", err), http.StatusBadGateway)
		return
	}

	key := usageCacheKey(config.ID, buckets, maxObjects)
	if cached, ok := loadBucketUsage(key); ok {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(cached)
		return
	}

	measurements := make([]BucketUsageBucket, 0, len(buckets))
	for _, name := range buckets {
		measurements = append(measurements, bucketUsageOf(name, maxObjects, corePageSource(client, name)))
	}

	response := BucketUsageResponse{
		Totals:      aggregateBucketUsage(measurements),
		Buckets:     measurements,
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
	}
	storeBucketUsage(key, response)

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(response); err != nil {
		http.Error(w, fmt.Sprintf("Failed to encode response: %v", err), http.StatusInternalServerError)
	}
}

// HandleBucketUsageWithConfig sert POST /s3/bucket-usage pour une config resolue.
func HandleBucketUsageWithConfig(config S3ConfigData) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		req, ok := decodeBucketUsageRequest(w, r)
		if !ok {
			return
		}
		serveBucketUsage(w, r, config, req)
	}
}

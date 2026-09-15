package s3

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/cors"
	"github.com/minio/minio-go/v7/pkg/lifecycle"
	"github.com/minio/minio-go/v7/pkg/sse"
	"github.com/minio/minio-go/v7/pkg/tags"
)

// BucketRulesValue est le corps `{ "rules": n }` des fonctionnalites qui
// s'expriment en nombre de regles (cors, chiffrement).
type BucketRulesValue struct {
	Rules int `json:"rules"`
}

// BucketFeatureString decrit une fonctionnalite dont la valeur est une chaine
// (region du bucket, etat du versioning). supported=false => valeur absente et
// error rempli : le front masque la fonctionnalite.
type BucketFeatureString struct {
	Supported bool    `json:"supported"`
	Value     *string `json:"value"`
	Error     *string `json:"error"`
}

// BucketFeatureTags decrit les tags du bucket (map vide si aucun tag n'est pose).
type BucketFeatureTags struct {
	Supported bool              `json:"supported"`
	Value     map[string]string `json:"value"`
	Error     *string           `json:"error"`
}

// BucketFeatureCount decrit une fonctionnalite exprimee en nombre (lifecycle).
type BucketFeatureCount struct {
	Supported bool    `json:"supported"`
	Value     *int    `json:"value"`
	Error     *string `json:"error"`
}

// BucketFeatureRules decrit une fonctionnalite exprimee en nombre de regles.
type BucketFeatureRules struct {
	Supported bool              `json:"supported"`
	Value     *BucketRulesValue `json:"value"`
	Error     *string           `json:"error"`
}

// bucketConfigProber isole les six lectures S3 sondees independamment : le client
// minio-go en production, une doublure deterministe dans les tests unitaires.
type bucketConfigProber interface {
	GetBucketLocation(ctx context.Context, bucketName string) (string, error)
	GetBucketVersioning(ctx context.Context, bucketName string) (minio.BucketVersioningConfiguration, error)
	GetBucketTagging(ctx context.Context, bucketName string) (*tags.Tags, error)
	GetBucketLifecycle(ctx context.Context, bucketName string) (*lifecycle.Configuration, error)
	GetBucketCors(ctx context.Context, bucketName string) (*cors.Config, error)
	GetBucketEncryption(ctx context.Context, bucketName string) (*sse.Configuration, error)
}

// errorText traduit une erreur en texte non vide : aucun contrat ne doit exposer
// une erreur vide (bucket-config comme bucket-usage, qui partagent ce format).
func errorText(err error) *string {
	message := strings.TrimSpace(err.Error())
	if message == "" {
		message = "erreur S3 sans message"
	}
	return &message
}

// featureError traduit une erreur S3 en diagnostic court et non vide : c'est le
// diagnostic d'une fonctionnalite REELLEMENT indisponible (NotImplemented / 501)
// ou d'une lecture refusee (AccessDenied...). Une fonctionnalite supportee mais
// non configuree ne passe PAS par ici : voir isEmptyConfigState.
func featureError(err error) *string {
	if err == nil {
		return nil
	}

	response := minio.ToErrorResponse(err)
	switch {
	case response.Code == "":
		return errorText(err)
	case response.Message == "" || isNotImplemented(response):
		return errorText(fmt.Errorf("%s", response.Code))
	default:
		return errorText(fmt.Errorf("%s: %s", response.Code, response.Message))
	}
}

// isNotImplemented detecte la reponse "fonctionnalite absente du backend" :
// minio-go expose le code NotImplemented et un statut HTTP 501.
func isNotImplemented(response minio.ErrorResponse) bool {
	return response.Code == minio.NotImplemented || response.StatusCode == http.StatusNotImplemented
}

// isEmptyConfigState distingue "le backend supporte la fonctionnalite mais rien
// n'est configure" d'une indisponibilite reelle. Sans cette distinction, un bucket
// sans tags (NoSuchTagSet) ou sans lifecycle serait annonce supported=false et le
// front masquerait une section qui existe pourtant : l'utilisateur perdrait une
// information disponible. Codes observes : NoSuchTagSet,
// NoSuchLifecycleConfiguration, NoSuchCORSConfiguration,
// ServerSideEncryptionConfigurationNotFoundError. NoSuchBucket est exclu : un
// bucket absent donne un 404 pour l'appel entier.
func isEmptyConfigState(response minio.ErrorResponse) bool {
	switch response.Code {
	case "NoSuchTagSet", "NoSuchLifecycleConfiguration", "NoSuchCORSConfiguration",
		"ServerSideEncryptionConfigurationNotFoundError",
		"NoSuchPublicAccessBlockConfiguration", "NoSuchObjectLockConfiguration",
		"NoSuchBucketPolicy", "NoSuchWebsiteConfiguration":
		return true
	}

	// Variantes "NoSuchXxx" non listees. NoSuchBucket est exclu : un bucket absent
	// est deja traite par un 404 pour l'appel entier.
	return strings.HasPrefix(response.Code, "NoSuch") && response.Code != "NoSuchBucket"
}

// normalizeVersioningStatus ramene l'etat du versioning au vocabulaire du
// contrat (Enabled / Suspended / null) : un backend sans versioning repond une
// configuration vide, qui vaut "null" et non "desactive".
func normalizeVersioningStatus(status string) string {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "enabled":
		return "Enabled"
	case "suspended":
		return "Suspended"
	default:
		return "null"
	}
}

// probeLocation sonde la region du bucket.
func probeLocation(ctx context.Context, prober bucketConfigProber, bucket string) BucketFeatureString {
	value, err := prober.GetBucketLocation(ctx, bucket)
	if err != nil {
		return BucketFeatureString{Error: featureError(err)}
	}
	return BucketFeatureString{Supported: true, Value: &value}
}

// probeVersioning sonde l'etat du versioning.
func probeVersioning(ctx context.Context, prober bucketConfigProber, bucket string) BucketFeatureString {
	config, err := prober.GetBucketVersioning(ctx, bucket)
	if err != nil {
		return BucketFeatureString{Error: featureError(err)}
	}
	status := normalizeVersioningStatus(config.Status)
	return BucketFeatureString{Supported: true, Value: &status}
}

// probeTagging sonde les tags du bucket.
func probeTagging(ctx context.Context, prober bucketConfigProber, bucket string) BucketFeatureTags {
	tagSet, err := prober.GetBucketTagging(ctx, bucket)
	if err != nil {
		if isEmptyConfigState(minio.ToErrorResponse(err)) {
			return BucketFeatureTags{Supported: true, Value: map[string]string{}}
		}
		return BucketFeatureTags{Error: featureError(err)}
	}

	value := map[string]string{}
	if tagSet != nil {
		value = tagSet.ToMap()
	}
	return BucketFeatureTags{Supported: true, Value: value}
}

// probeLifecycle sonde le cycle de vie et rend le nombre de regles.
func probeLifecycle(ctx context.Context, prober bucketConfigProber, bucket string) BucketFeatureCount {
	config, err := prober.GetBucketLifecycle(ctx, bucket)
	if err != nil {
		if isEmptyConfigState(minio.ToErrorResponse(err)) {
			noRule := 0
			return BucketFeatureCount{Supported: true, Value: &noRule}
		}
		return BucketFeatureCount{Error: featureError(err)}
	}

	rules := 0
	if config != nil {
		rules = len(config.Rules)
	}
	return BucketFeatureCount{Supported: true, Value: &rules}
}

// probeCors sonde les regles CORS et rend leur nombre.
func probeCors(ctx context.Context, prober bucketConfigProber, bucket string) BucketFeatureRules {
	config, err := prober.GetBucketCors(ctx, bucket)
	if err != nil {
		if isEmptyConfigState(minio.ToErrorResponse(err)) {
			return BucketFeatureRules{Supported: true, Value: &BucketRulesValue{Rules: 0}}
		}
		return BucketFeatureRules{Error: featureError(err)}
	}

	rules := 0
	if config != nil {
		rules = len(config.CORSRules)
	}
	return BucketFeatureRules{Supported: true, Value: &BucketRulesValue{Rules: rules}}
}

// probeEncryption sonde le chiffrement au repos et rend le nombre de regles.
func probeEncryption(ctx context.Context, prober bucketConfigProber, bucket string) BucketFeatureRules {
	config, err := prober.GetBucketEncryption(ctx, bucket)
	if err != nil {
		if isEmptyConfigState(minio.ToErrorResponse(err)) {
			return BucketFeatureRules{Supported: true, Value: &BucketRulesValue{Rules: 0}}
		}
		return BucketFeatureRules{Error: featureError(err)}
	}

	rules := 0
	if config != nil {
		rules = len(config.Rules)
	}
	return BucketFeatureRules{Supported: true, Value: &BucketRulesValue{Rules: rules}}
}

// probeBucketConfig sonde chaque fonctionnalite independamment : l'echec de
// l'une n'en condamne jamais une autre et n'echoue jamais l'appel entier.
func probeBucketConfig(ctx context.Context, prober bucketConfigProber, bucket string) BucketConfigResponse {
	return BucketConfigResponse{
		Bucket:     bucket,
		Location:   probeLocation(ctx, prober, bucket),
		Versioning: probeVersioning(ctx, prober, bucket),
		Tagging:    probeTagging(ctx, prober, bucket),
		Lifecycle:  probeLifecycle(ctx, prober, bucket),
		Cors:       probeCors(ctx, prober, bucket),
		Encryption: probeEncryption(ctx, prober, bucket),
	}
}

// decodeBucketConfigRequest valide la methode et decode le corps JSON.
func decodeBucketConfigRequest(w http.ResponseWriter, r *http.Request) (BucketConfigRequest, bool) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return BucketConfigRequest{}, false
	}

	var req BucketConfigRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return BucketConfigRequest{}, false
	}
	if strings.TrimSpace(req.Bucket) == "" {
		http.Error(w, "bucket is required", http.StatusBadRequest)
		return BucketConfigRequest{}, false
	}
	return req, true
}

// serveBucketConfig sonde un bucket pour une config deja resolue. Un bucket
// inexistant est un 404 de l'appel entier ; une fonctionnalite absente du
// backend reste une sonde locale a false.
func serveBucketConfig(w http.ResponseWriter, r *http.Request, config S3ConfigData, req BucketConfigRequest) {
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

	// BucketExists tranche l'existence : une reponse vide de GetBucketLocation ne
	// distingue pas un bucket vide d'un bucket absent.
	exists, err := client.BucketExists(r.Context(), req.Bucket)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to check bucket: %v", err), http.StatusBadGateway)
		return
	}
	if !exists {
		http.Error(w, "Bucket not found", http.StatusNotFound)
		return
	}

	response := probeBucketConfig(r.Context(), client, req.Bucket)
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(response); err != nil {
		http.Error(w, fmt.Sprintf("Failed to encode response: %v", err), http.StatusInternalServerError)
	}
}

// HandleBucketConfigWithConfig sert POST /s3/bucket-config pour une config deja resolue.
func HandleBucketConfigWithConfig(config S3ConfigData) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		req, ok := decodeBucketConfigRequest(w, r)
		if !ok {
			return
		}
		serveBucketConfig(w, r, config, req)
	}
}

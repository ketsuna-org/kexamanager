package s3

import (
	"fmt"
	"strings"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// S3ConfigData represents S3 configuration
type S3ConfigData struct {
	ID             uint   `json:"id"`
	UserID         uint   `json:"user_id"`
	Name           string `json:"name"`
	Type           string `json:"type"`
	S3URL          string `json:"s3_url"`
	AdminURL       string `json:"admin_url"`
	AdminToken     string `json:"admin_token"`
	ClientID       string `json:"client_id"`
	ClientSecret   string `json:"client_secret"`
	Region         string `json:"region"`
	ForcePathStyle bool   `json:"force_path_style"`
}

// S3Credentials represents S3 credentials
type S3Credentials struct {
	Endpoint        string `json:"endpoint"`
	AccessKeyID     string `json:"accessKeyId"`
	SecretAccessKey string `json:"secretAccessKey"`
	Region          string `json:"region,omitempty"`
	ForcePathStyle  bool   `json:"forcePathStyle,omitempty"`
}

// Common request/response types
type ListBucketsRequest struct {
	KeyId    string `json:"keyId"`
	Token    string `json:"token"`
	ConfigID uint   `json:"configId"`
}

type ListBucketsResponse struct {
	Buckets []Bucket `json:"buckets"`
}

type Bucket struct {
	Name         string `json:"name"`
	CreationDate string `json:"creationDate"`
}

// ListObjectsRequest liste les objets d'un bucket.
// Delimiter vide => listing recursif (comportement historique).
// Delimiter "/" => listing "dossier courant" : les sous-dossiers remontent dans CommonPrefixes.
type ListObjectsRequest struct {
	KeyId             string `json:"keyId"`
	Token             string `json:"token"`
	Bucket            string `json:"bucket"`
	Prefix            string `json:"prefix,omitempty"`
	Delimiter         string `json:"delimiter,omitempty"`
	MaxKeys           int    `json:"maxKeys,omitempty"`
	ContinuationToken string `json:"continuationToken,omitempty"`
	ConfigID          uint   `json:"configId"`
}

type ListObjectsResponse struct {
	Objects               []S3Object `json:"objects"`
	CommonPrefixes        []string   `json:"commonPrefixes"`
	NextContinuationToken string     `json:"nextContinuationToken,omitempty"`
	// Deprecated: ancien nom du jeton de continuation, conserve pour l'explorateur
	// historique (S3Browser.tsx) jusqu'a sa suppression (Phase 3 du plan storage).
	ContinuationToken string `json:"continuationToken,omitempty"`
	IsTruncated       bool   `json:"isTruncated"`
	KeyCount          int    `json:"keyCount"`
	TotalSize         int64  `json:"totalSize"`
	Delimiter         string `json:"delimiter"`
}

type S3Object struct {
	Key          string `json:"key"`
	Size         int64  `json:"size"`
	LastModified string `json:"lastModified"`
	ETag         string `json:"etag"`
	ContentType  string `json:"contentType,omitempty"`
}

// StatObjectRequest demande les metadonnees d'un objet (HeadObject cote S3).
type StatObjectRequest struct {
	KeyId    string `json:"keyId"`
	Token    string `json:"token"`
	Bucket   string `json:"bucket"`
	Key      string `json:"key"`
	ConfigID uint   `json:"configId"`
}

// StatObjectResponse expose ce que HeadObject permet d'afficher dans la fiche objet.
// StorageClass reste vide sur Garage (notion inexistante) : le front affiche "-".
type StatObjectResponse struct {
	Key          string            `json:"key"`
	Size         int64             `json:"size"`
	ContentType  string            `json:"contentType"`
	ETag         string            `json:"etag"`
	LastModified string            `json:"lastModified"`
	StorageClass string            `json:"storageClass"`
	Metadata     map[string]string `json:"metadata"` // en-tetes x-amz-meta-*
	Headers      map[string]string `json:"headers"`  // cache-control, content-disposition, content-encoding
}

// CopyObjectRequest copie un objet (S3 CopyObject, supporte par Garage).
type CopyObjectRequest struct {
	KeyId             string `json:"keyId"`
	Token             string `json:"token"`
	SourceBucket      string `json:"sourceBucket"`
	SourceKey         string `json:"sourceKey"`
	DestinationBucket string `json:"destinationBucket"`
	DestinationKey    string `json:"destinationKey"`
	ConfigID          uint   `json:"configId"`
}

type CopyObjectResponse struct {
	Success bool   `json:"success"`
	Key     string `json:"key"`
	ETag    string `json:"etag"`
}

// DeleteObjectsRequest supprime des objets en lot (S3 DeleteObjects, supporte par Garage).
type DeleteObjectsRequest struct {
	KeyId    string   `json:"keyId"`
	Token    string   `json:"token"`
	Bucket   string   `json:"bucket"`
	Keys     []string `json:"keys"`
	ConfigID uint     `json:"configId"`
}

type DeleteObjectsError struct {
	Key     string `json:"key"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

type DeleteObjectsResponse struct {
	Deleted []string             `json:"deleted"`
	Errors  []DeleteObjectsError `json:"errors"`
}

type GetObjectRequest struct {
	KeyId    string `json:"keyId"`
	Token    string `json:"token"`
	Bucket   string `json:"bucket"`
	Key      string `json:"key"`
	ConfigID uint   `json:"configId"`
	// ExpiresIn est la validite du lien en secondes (0 = 15 minutes, borne a 7 jours).
	// Un lien demande avec une validite explicite est un lien de partage : il est journalise.
	ExpiresIn int64 `json:"expiresIn,omitempty"`
	// Download force le telechargement (Content-Disposition: attachment).
	Download bool `json:"download,omitempty"`
}

type GetObjectResponse struct {
	PresignedURL string `json:"presignedUrl"`
	ExpiresAt    string `json:"expiresAt"`
}

type PutObjectRequest struct {
	KeyId       string `json:"keyId"`
	Token       string `json:"token"`
	Bucket      string `json:"bucket"`
	Key         string `json:"key"`
	ContentType string `json:"contentType,omitempty"`
	ConfigID    uint   `json:"configId"`
}

type PutObjectResponse struct {
	PresignedURL string `json:"presignedUrl"`
}

type DeleteObjectRequest struct {
	KeyId    string `json:"keyId"`
	Token    string `json:"token"`
	Bucket   string `json:"bucket"`
	Key      string `json:"key"`
	ConfigID uint   `json:"configId"`
}

type DeleteObjectResponse struct {
	Success bool `json:"success"`
}

type CreateBucketRequest struct {
	KeyId    string `json:"keyId"`
	Token    string `json:"token"`
	Bucket   string `json:"bucket"`
	ConfigID uint   `json:"configId"`
}

type CreateBucketResponse struct {
	Success bool `json:"success"`
}

type DeleteBucketRequest struct {
	KeyId    string `json:"keyId"`
	Token    string `json:"token"`
	Bucket   string `json:"bucket"`
	ConfigID uint   `json:"configId"`
}

type DeleteBucketResponse struct {
	Success bool `json:"success"`
}

// BucketUsageRequest demande les statistiques S3 (sans admin) de buckets nommes.
type BucketUsageRequest struct {
	KeyId               string   `json:"keyId"`
	Token               string   `json:"token"`
	ConfigID            uint     `json:"configId"`
	Buckets             []string `json:"buckets,omitempty"`
	MaxObjectsPerBucket int      `json:"maxObjectsPerBucket,omitempty"`
	MaxBuckets          int      `json:"maxBuckets,omitempty"`
}

// BucketUsageResponse agrege des releves S3 (le front affiche ">=" si un drapeau *Complete est false).
type BucketUsageResponse struct {
	Totals      BucketUsageTotals   `json:"totals"`
	Buckets     []BucketUsageBucket `json:"buckets"`
	GeneratedAt string              `json:"generatedAt"`
	Stale       bool                `json:"stale"`
}

// BucketConfigRequest demande ce que le bucket S3 dit de lui-meme.
type BucketConfigRequest struct {
	KeyId    string `json:"keyId"`
	Token    string `json:"token"`
	Bucket   string `json:"bucket"`
	ConfigID uint   `json:"configId"`
}

// BucketConfigResponse expose une sonde independante par fonctionnalite (absente ou non configuree => supported=false + error rempli).
type BucketConfigResponse struct {
	Bucket     string              `json:"bucket"`
	Location   BucketFeatureString `json:"location"`
	Versioning BucketFeatureString `json:"versioning"`
	Tagging    BucketFeatureTags   `json:"tagging"`
	Lifecycle  BucketFeatureCount  `json:"lifecycle"`
	Cors       BucketFeatureRules  `json:"cors"`
	Encryption BucketFeatureRules  `json:"encryption"`
}

// getS3Credentials creates S3 credentials from the config, with optional override from request
func GetS3Credentials(config S3ConfigData, requestKeyId, requestToken string) (S3Credentials, error) {
	keyId := config.ClientID
	secretAccessKey := config.ClientSecret

	// For Garage configs, allow credentials to be overridden by request
	if config.Type == "garage" && requestKeyId != "" && requestToken != "" {
		keyId = requestKeyId
		secretAccessKey = requestToken
	} else if keyId == "" || secretAccessKey == "" {
		return S3Credentials{}, fmt.Errorf("clientId and clientSecret are required in config")
	}

	endpoint := config.S3URL
	if endpoint == "" {
		return S3Credentials{}, fmt.Errorf("S3 URL not configured")
	}

	// Ensure endpoint has protocol
	if !strings.HasPrefix(endpoint, "http://") && !strings.HasPrefix(endpoint, "https://") {
		endpoint = "http://" + endpoint // Try HTTP instead of HTTPS
	}

	region := config.Region
	if region == "" {
		if config.Type == "garage" {
			region = "garage" // Default region for Garage S3 compatibility
		} else {
			region = "us-east-1"
		}
	}

	return S3Credentials{
		Endpoint:        endpoint,
		AccessKeyID:     keyId,
		SecretAccessKey: secretAccessKey,
		Region:          region,
		ForcePathStyle:  config.ForcePathStyle,
	}, nil
}

func CreateS3Client(creds S3Credentials) (*minio.Client, error) {
	// Parse endpoint to remove protocol for MinIO
	endpoint := creds.Endpoint
	if strings.HasPrefix(endpoint, "https://") {
		endpoint = strings.TrimPrefix(endpoint, "https://")
	} else if strings.HasPrefix(endpoint, "http://") {
		endpoint = strings.TrimPrefix(endpoint, "http://")
	}

	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(creds.AccessKeyID, creds.SecretAccessKey, ""),
		Secure: strings.HasPrefix(creds.Endpoint, "https://"),
		Region: creds.Region,
	})
	if err != nil {
		return nil, err
	}

	return client, nil
}

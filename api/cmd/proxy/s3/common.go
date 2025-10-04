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

type ListObjectsRequest struct {
	KeyId    string `json:"keyId"`
	Token    string `json:"token"`
	Bucket   string `json:"bucket"`
	Prefix   string `json:"prefix,omitempty"`
	ConfigID uint   `json:"configId"`
}

type ListObjectsResponse struct {
	Objects           []S3Object `json:"objects"`
	ContinuationToken string     `json:"continuationToken,omitempty"`
	IsTruncated       bool       `json:"isTruncated"`
	TotalSize         int64      `json:"totalSize"`
}

type S3Object struct {
	Key          string `json:"key"`
	Size         int64  `json:"size"`
	LastModified string `json:"lastModified"`
	ETag         string `json:"etag"`
}

type GetObjectRequest struct {
	KeyId    string `json:"keyId"`
	Token    string `json:"token"`
	Bucket   string `json:"bucket"`
	Key      string `json:"key"`
	ConfigID uint   `json:"configId"`
}

type GetObjectResponse struct {
	PresignedURL string `json:"presignedUrl"`
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

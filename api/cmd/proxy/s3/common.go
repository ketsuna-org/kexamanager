package s3

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

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
	KeyId string `json:"keyId"`
	Token string `json:"token"`
}

type ListBucketsResponse struct {
	Buckets []Bucket `json:"buckets"`
}

type Bucket struct {
	Name         string `json:"name"`
	CreationDate string `json:"creationDate"`
}

type ListObjectsRequest struct {
	KeyId  string `json:"keyId"`
	Token  string `json:"token"`
	Bucket string `json:"bucket"`
	Prefix string `json:"prefix,omitempty"`
}

type ListObjectsResponse struct {
	Objects           []S3Object `json:"objects"`
	ContinuationToken string     `json:"continuationToken,omitempty"`
	IsTruncated       bool       `json:"isTruncated"`
}

type S3Object struct {
	Key          string `json:"key"`
	Size         int64  `json:"size"`
	LastModified string `json:"lastModified"`
	ETag         string `json:"etag"`
}

type GetObjectRequest struct {
	KeyId  string `json:"keyId"`
	Token  string `json:"token"`
	Bucket string `json:"bucket"`
	Key    string `json:"key"`
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
}

type PutObjectResponse struct {
	PresignedURL string `json:"presignedUrl"`
}

type DeleteObjectRequest struct {
	KeyId  string `json:"keyId"`
	Token  string `json:"token"`
	Bucket string `json:"bucket"`
	Key    string `json:"key"`
}

type DeleteObjectResponse struct {
	Success bool `json:"success"`
}

type CreateBucketRequest struct {
	KeyId  string `json:"keyId"`
	Token  string `json:"token"`
	Bucket string `json:"bucket"`
}

type CreateBucketResponse struct {
	Success bool `json:"success"`
}

type DeleteBucketRequest struct {
	KeyId  string `json:"keyId"`
	Token  string `json:"token"`
	Bucket string `json:"bucket"`
}

type DeleteBucketResponse struct {
	Success bool `json:"success"`
}

// getS3Credentials creates S3 credentials from the provided keyId and secretAccessKey
func GetS3Credentials(keyId, secretAccessKey string) (S3Credentials, error) {
	if keyId == "" || secretAccessKey == "" {
		return S3Credentials{}, fmt.Errorf("keyId and secretAccessKey are required")
	}

	var claims map[string]interface{}
	parsedJWT := false

	// Debug: check if secretAccessKey looks like a JWT (AWSV4 token)
	if strings.Contains(secretAccessKey, ".") {
		fmt.Printf("DEBUG: Token contains dots, might be JWT or AWSV4 token\n")
		parts := strings.Split(secretAccessKey, ".")
		if len(parts) == 3 {
			fmt.Printf("DEBUG: Token has 3 parts, likely JWT\n")
			// Parse JWT to extract credentials
			payload, err := base64.RawURLEncoding.DecodeString(parts[1])
			if err != nil {
				return S3Credentials{}, fmt.Errorf("failed to decode JWT payload: %v", err)
			}
			if err := json.Unmarshal(payload, &claims); err != nil {
				return S3Credentials{}, fmt.Errorf("failed to unmarshal JWT claims: %v", err)
			}
			fmt.Printf("DEBUG: JWT claims: %+v\n", claims)
			parsedJWT = true
			var secret string
			var found bool
			for _, field := range []string{"secretAccessKey", "secret", "key", "access_secret"} {
				if s, ok := claims[field].(string); ok && s != "" {
					secret = s
					found = true
					fmt.Printf("DEBUG: Found secret in field '%s'\n", field)
					break
				}
			}
			if !found {
				return S3Credentials{}, fmt.Errorf("secretAccessKey not found in JWT claims (tried fields: secretAccessKey, secret, key, access_secret)")
			}
			secretAccessKey = secret
			if ak, ok := claims["accessKeyId"].(string); ok && ak != "" {
				keyId = ak
				fmt.Printf("DEBUG: Overriding accessKeyId from JWT: %s\n", ak)
			}
		} else {
			fmt.Printf("DEBUG: Token has %d parts\n", len(parts))
		}
	} else {
		fmt.Printf("DEBUG: Token does not contain dots, treating as secret key\n")
	}

	// Get endpoint and region from environment
	endpoint := os.Getenv("GARAGE_S3_URL")
	if endpoint == "" {
		return S3Credentials{}, fmt.Errorf("GARAGE_S3_URL environment variable not set")
	}

	// Ensure endpoint has protocol
	if !strings.HasPrefix(endpoint, "http://") && !strings.HasPrefix(endpoint, "https://") {
		endpoint = "http://" + endpoint // Try HTTP instead of HTTPS
	}

	region := os.Getenv("GARAGE_REGION")
	if region == "" {
		region = "garage" // Default region for Garage S3 compatibility
	}

	// Override from JWT if present
	if parsedJWT {
		if reg, ok := claims["region"].(string); ok && reg != "" {
			region = reg
			fmt.Printf("DEBUG: Overriding region from JWT: %s\n", reg)
		}
		if ep, ok := claims["endpoint"].(string); ok && ep != "" {
			endpoint = ep
			fmt.Printf("DEBUG: Overriding endpoint from JWT: %s\n", ep)
		}
	}

	return S3Credentials{
		Endpoint:        endpoint,
		AccessKeyID:     keyId,
		SecretAccessKey: secretAccessKey,
		Region:          region,
		ForcePathStyle:  true, // For Garage S3 compatibility
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

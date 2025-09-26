package main

import (
	"context"
	"fmt"
	"log"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

func main() {
	// Initialize MinIO client
	client, err := minio.New("s3.ketsuna.com", &minio.Options{
		Creds:  credentials.NewStaticV4("GKa2d714c865866ce15d595f1a", "cdfbe8ee94623e13736059452665b6bc32d05216b4452882b56f6627bc4186d5", ""),
		Secure: true,
		Region: "garage",
	})
	if err != nil {
		log.Fatalf("failed to create MinIO client: %v", err)
	}

	// List buckets
	buckets, err := client.ListBuckets(context.Background())
	if err != nil {
		log.Fatalf("failed to list buckets: %v", err)
	}

	fmt.Println("Buckets:")
	for _, bucket := range buckets {
		fmt.Println(bucket.Name)
	}
}

//go:build integration

package s3

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/minio/minio-go/v7"
)

func findObject(t *testing.T, label string, objects []S3Object, key string) S3Object {
	t.Helper()

	for _, object := range objects {
		if object.Key == key {
			return object
		}
	}
	t.Fatalf("%s: %q absent de %v", label, key, objectKeys(objects))
	return S3Object{}
}

// putProbeObject depose un objet de test et le retire a la fin du test.
func putProbeObject(t *testing.T, client *minio.Client, bucket, key, content string) {
	t.Helper()

	_, err := client.PutObject(context.Background(), bucket, key, strings.NewReader(content), int64(len(content)),
		minio.PutObjectOptions{ContentType: "text/plain"})
	if err != nil {
		t.Fatalf("upload de %s: %v", key, err)
	}
	t.Cleanup(func() {
		_ = client.RemoveObject(context.Background(), bucket, key, minio.RemoveObjectOptions{})
	})
}

func statObject(t *testing.T, config S3ConfigData, key string) StatObjectResponse {
	t.Helper()

	status, body := callEndpoint(t, HandleStatObjectWithConfig(config), StatObjectRequest{
		Bucket: itBucket, Key: key, ConfigID: 1,
	})
	var resp StatObjectResponse
	decodeInto(t, "stat-object "+key, http.StatusOK, status, body, &resp)
	return resp
}

func TestS3ObjectLifecycleAgainstHarness(t *testing.T) {
	config := harnessConfig(t)
	client := harnessClient(t, config)

	t.Run("d/stat-object-metadonnees", func(t *testing.T) {
		listing := listObjects(t, config, ListObjectsRequest{Bucket: itBucket, Prefix: itFolder})
		reference := findObject(t, "listing", listing.Objects, itMetaKey)
		resp := statObject(t, config, itMetaKey)

		if resp.Size != reference.Size {
			t.Errorf("size = %d, attendu %d (taille du listing)", resp.Size, reference.Size)
		}
		if resp.ETag != reference.ETag {
			t.Errorf("etag = %q, attendu %q (etag du listing)", resp.ETag, reference.ETag)
		}
		if got := resp.Metadata["X-Amz-Meta-Owner"]; got != "jeremy" {
			t.Errorf("metadata[X-Amz-Meta-Owner] = %q, attendu jeremy (metadata = %v)", got, resp.Metadata)
		}
		if got := resp.Metadata["X-Amz-Meta-Project"]; got != "kexamanager" {
			t.Errorf("metadata[X-Amz-Meta-Project] = %q, attendu kexamanager (metadata = %v)", got, resp.Metadata)
		}
		if _, err := time.Parse(time.RFC3339, resp.LastModified); err != nil {
			t.Errorf("lastModified = %q, non RFC3339: %v", resp.LastModified, err)
		}
		if resp.ContentType == "" {
			t.Error("contentType vide alors que le listing en expose un")
		}
	})

	t.Run("e/copy-object-puis-stat", func(t *testing.T) {
		t.Cleanup(func() {
			_ = client.RemoveObject(context.Background(), itBucket, itCopyKey, minio.RemoveObjectOptions{})
		})

		status, body := callEndpoint(t, HandleCopyObjectWithConfig(config), CopyObjectRequest{
			SourceBucket: itBucket, SourceKey: itMetaKey,
			DestinationBucket: itBucket, DestinationKey: itCopyKey, ConfigID: 1,
		})
		var copied CopyObjectResponse
		decodeInto(t, "copy-object "+itMetaKey+" -> "+itCopyKey, http.StatusOK, status, body, &copied)

		if !copied.Success {
			t.Error("success = false")
		}
		if copied.Key != itCopyKey {
			t.Errorf("key = %q, attendu %q", copied.Key, itCopyKey)
		}
		if copied.ETag == "" {
			t.Error("etag vide dans la reponse de copie")
		}

		source := statObject(t, config, itMetaKey)
		dest := statObject(t, config, itCopyKey)

		if dest.Size != source.Size {
			t.Errorf("taille de la copie = %d, attendu %d", dest.Size, source.Size)
		}
		if dest.ETag != source.ETag {
			t.Errorf("etag de la copie = %q, attendu %q", dest.ETag, source.ETag)
		}
		if dest.Metadata["X-Amz-Meta-Owner"] != "jeremy" {
			t.Errorf("metadata de la copie = %v, attendu X-Amz-Meta-Owner = jeremy (copie sans directive)", dest.Metadata)
		}
	})

	t.Run("f/delete-objects-cle-inexistante", func(t *testing.T) {
		existing := itProbeDir + "del-existing.txt"
		missing := itProbeDir + "del-missing-inexistant.txt"
		putProbeObject(t, client, itBucket, existing, "supprime-moi")

		status, body := callEndpoint(t, HandleDeleteObjectsWithConfig(config), DeleteObjectsRequest{
			Bucket: itBucket, Keys: []string{existing, missing}, ConfigID: 1,
		})
		var resp DeleteObjectsResponse
		decodeInto(t, "delete-objects [existante, inexistante]", http.StatusOK, status, body, &resp)

		if len(resp.Deleted) != 2 {
			t.Errorf("deleted = %v, attendu 2 entrees (une cle inexistante est un succes S3)", resp.Deleted)
		}
		if len(resp.Errors) != 0 {
			t.Errorf("errors = %v, attendu vide", resp.Errors)
		}
		if _, err := client.StatObject(context.Background(), itBucket, existing, minio.StatObjectOptions{}); err == nil {
			t.Errorf("%s existe encore apres suppression", existing)
		}
	})

	t.Run("g/delete-objects-echec-total-502", func(t *testing.T) {
		status, body := callEndpoint(t, HandleDeleteObjectsWithConfig(config), DeleteObjectsRequest{
			Bucket: "bucket-inexistant-integration-probe", Keys: []string{"a.txt", "b.txt"}, ConfigID: 1,
		})
		var resp DeleteObjectsResponse
		decodeInto(t, "delete-objects bucket inexistant", http.StatusBadGateway, status, body, &resp)

		if len(resp.Deleted) != 0 {
			t.Errorf("deleted = %v, attendu vide", resp.Deleted)
		}
		if len(resp.Errors) == 0 {
			t.Error("errors vide, attendu au moins un echec")
		}
	})
}

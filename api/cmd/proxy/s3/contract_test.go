package s3

import (
	"net/http"
	"testing"
	"time"

	"github.com/minio/minio-go/v7"
)

func TestNormalizeMaxKeys(t *testing.T) {
	cases := []struct {
		name    string
		maxKeys int
		want    int
	}{
		{name: "absent", maxKeys: 0, want: defaultMaxKeys},
		{name: "negatif", maxKeys: -12, want: defaultMaxKeys},
		{name: "demande explicite", maxKeys: 2, want: 2},
		{name: "plafond exact", maxKeys: maxMaxKeys, want: maxMaxKeys},
		{name: "au dessus du plafond", maxKeys: 5000, want: maxMaxKeys},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := normalizeMaxKeys(tc.maxKeys); got != tc.want {
				t.Fatalf("normalizeMaxKeys(%d) = %d, attendu %d", tc.maxKeys, got, tc.want)
			}
		})
	}
}

func TestObjectInfoToS3Object(t *testing.T) {
	info := minio.ObjectInfo{
		Key:          "releases/v2.1.16/bot_creator-linux-x64-steam.zip",
		Size:         121962496,
		ETag:         `"3247e2c41a504c53d577da7247bdb813"`,
		LastModified: time.Date(2026, 9, 14, 21, 36, 41, 0, time.UTC),
		ContentType:  "application/zip",
	}

	got := objectInfoToS3Object(info)

	if got.Key != info.Key {
		t.Errorf("Key = %q, attendu %q", got.Key, info.Key)
	}
	if got.Size != info.Size {
		t.Errorf("Size = %d, attendu %d", got.Size, info.Size)
	}
	if got.ETag != "3247e2c41a504c53d577da7247bdb813" {
		t.Errorf("ETag = %q, les guillemets doivent etre retires", got.ETag)
	}
	if got.LastModified != "2026-09-14T21:36:41Z" {
		t.Errorf("LastModified = %q, attendu RFC3339 2026-09-14T21:36:41Z", got.LastModified)
	}
	if got.ContentType != "application/zip" {
		t.Errorf("ContentType = %q, attendu application/zip", got.ContentType)
	}
}

func TestListResultToResponse(t *testing.T) {
	res := minio.ListBucketV2Result{
		Contents: []minio.ObjectInfo{
			{Key: "a.txt", Size: 10, ETag: `"aa"`, LastModified: time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC), ContentType: "text/plain"},
			{Key: "b.txt", Size: 32, ETag: `"bb"`, LastModified: time.Date(2026, 1, 2, 3, 4, 6, 0, time.UTC), ContentType: "text/plain"},
		},
		CommonPrefixes:        []minio.CommonPrefix{{Prefix: "releases/"}, {Prefix: "tmp/"}},
		IsTruncated:           true,
		NextContinuationToken: "jeton-suivant",
		Delimiter:             "/",
	}

	got := listResultToResponse(res)

	if len(got.Objects) != 2 {
		t.Fatalf("Objects = %d entrees, attendu 2", len(got.Objects))
	}
	if got.KeyCount != 2 {
		t.Errorf("KeyCount = %d, attendu 2", got.KeyCount)
	}
	if got.TotalSize != 42 {
		t.Errorf("TotalSize = %d, attendu 42 (somme des objets de ce niveau)", got.TotalSize)
	}
	if len(got.CommonPrefixes) != 2 || got.CommonPrefixes[0] != "releases/" || got.CommonPrefixes[1] != "tmp/" {
		t.Errorf("CommonPrefixes = %v, attendu [releases/ tmp/]", got.CommonPrefixes)
	}
	if !got.IsTruncated {
		t.Error("IsTruncated = false, attendu true")
	}
	if got.NextContinuationToken != "jeton-suivant" {
		t.Errorf("NextContinuationToken = %q, attendu jeton-suivant", got.NextContinuationToken)
	}
	if got.ContinuationToken != got.NextContinuationToken {
		t.Errorf("alias ContinuationToken = %q, attendu le meme jeton que NextContinuationToken", got.ContinuationToken)
	}
	if got.Delimiter != "/" {
		t.Errorf("Delimiter = %q, attendu /", got.Delimiter)
	}
	if got.Objects[0].ETag != "aa" {
		t.Errorf("ETag = %q, les guillemets doivent etre retires", got.Objects[0].ETag)
	}
}

func TestMetadataFromInfo(t *testing.T) {
	info := minio.ObjectInfo{
		Metadata: http.Header{
			"X-Amz-Meta-Owner":    {"jeremy"},
			"X-Amz-Meta-Project":  {"kexamanager"},
			"Content-Type":        {"application/zip"},
			"X-Amz-Storage-Class": {"STANDARD"},
			"X-Amz-Meta-Empty":    {},
		},
	}

	got := metadataFromInfo(info)

	if len(got) != 2 {
		t.Fatalf("metadata = %v, attendu uniquement les 2 en-tetes x-amz-meta-*", got)
	}
	if got["X-Amz-Meta-Owner"] != "jeremy" {
		t.Errorf("metadata[X-Amz-Meta-Owner] = %q, attendu jeremy", got["X-Amz-Meta-Owner"])
	}
	if got["X-Amz-Meta-Project"] != "kexamanager" {
		t.Errorf("metadata[X-Amz-Meta-Project] = %q, attendu kexamanager", got["X-Amz-Meta-Project"])
	}
	if _, found := got["Content-Type"]; found {
		t.Error("Content-Type ne doit pas apparaitre dans metadata")
	}
	if _, found := got["X-Amz-Meta-Empty"]; found {
		t.Error("un en-tete x-amz-meta-* sans valeur ne doit pas apparaitre dans metadata")
	}
}

func TestMetadataFromInfoCasseNonCanonique(t *testing.T) {
	info := minio.ObjectInfo{
		Metadata: http.Header{"x-amz-meta-owner": {"jeremy"}},
	}

	got := metadataFromInfo(info)

	if len(got) != 1 {
		t.Fatalf("metadata = %v, attendu 1 entree", got)
	}
	// La cle est conservee telle que la bibliotheque l'expose.
	if got["x-amz-meta-owner"] != "jeremy" {
		t.Errorf("metadata = %v, attendu la cle brute x-amz-meta-owner = jeremy", got)
	}
}

func TestHeadersFromInfo(t *testing.T) {
	t.Run("depuis les en-tetes bruts", func(t *testing.T) {
		info := minio.ObjectInfo{
			Headers: http.Header{
				"Cache-Control":       {"max-age=3600"},
				"Content-Disposition": {`attachment; filename="labelled.zip"`},
				"Content-Encoding":    {"gzip"},
				"Content-Length":      {"293000"},
			},
		}

		got := headersFromInfo(info)

		if got["cache-control"] != "max-age=3600" {
			t.Errorf("cache-control = %q, attendu max-age=3600", got["cache-control"])
		}
		if got["content-disposition"] != `attachment; filename="labelled.zip"` {
			t.Errorf("content-disposition = %q", got["content-disposition"])
		}
		if got["content-encoding"] != "gzip" {
			t.Errorf("content-encoding = %q, attendu gzip", got["content-encoding"])
		}
		if _, found := got["content-length"]; found {
			t.Error("content-length ne fait pas partie du contrat headers")
		}
	})

	t.Run("repli sur Metadata", func(t *testing.T) {
		info := minio.ObjectInfo{
			Metadata: http.Header{"Cache-Control": {"no-cache"}},
		}

		got := headersFromInfo(info)

		if got["cache-control"] != "no-cache" {
			t.Errorf("cache-control = %q, attendu no-cache", got["cache-control"])
		}
		if _, found := got["content-encoding"]; found {
			t.Error("un en-tete absent ne doit pas apparaitre dans headers")
		}
	})
}

func TestStatObjectToResponse(t *testing.T) {
	info := minio.ObjectInfo{
		Key:          "releases/v2.1.16/labelled.zip",
		Size:         293000,
		ETag:         `"3247e2c41a504c53d577da7247bdb813"`,
		LastModified: time.Date(2026, 9, 15, 12, 42, 32, 0, time.UTC),
		ContentType:  "application/octet-stream",
		Metadata: http.Header{
			"X-Amz-Meta-Owner": {"jeremy"},
			"Content-Type":     {"application/octet-stream"},
		},
	}

	got := statObjectToResponse(info)

	if got.Size != 293000 {
		t.Errorf("Size = %d, attendu 293000", got.Size)
	}
	if got.ETag != "3247e2c41a504c53d577da7247bdb813" {
		t.Errorf("ETag = %q, les guillemets doivent etre retires", got.ETag)
	}
	if got.LastModified != "2026-09-15T12:42:32Z" {
		t.Errorf("LastModified = %q, attendu 2026-09-15T12:42:32Z", got.LastModified)
	}
	if got.ContentType != "application/octet-stream" {
		t.Errorf("ContentType = %q, attendu application/octet-stream", got.ContentType)
	}
	if got.StorageClass != "" {
		t.Errorf("StorageClass = %q, attendu vide quand le serveur ne le fournit pas", got.StorageClass)
	}
	if got.Metadata["X-Amz-Meta-Owner"] != "jeremy" {
		t.Errorf("Metadata = %v, attendu X-Amz-Meta-Owner = jeremy", got.Metadata)
	}
}

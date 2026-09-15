//go:build integration

package s3

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// postS3JSON poste un corps JSON sur un handler S3 et rend le statut et le corps brut.
func postS3JSON[T any](t *testing.T, handler http.HandlerFunc, body T) (int, []byte) {
	t.Helper()

	payload, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("encodage de la requete: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/s3/endpoint", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, req)
	return recorder.Code, recorder.Body.Bytes()
}

// decodeS3JSON exige un statut donne, decode le corps brut et le journalise tel quel.
func decodeS3JSON[T any](t *testing.T, label string, wantStatus, status int, body []byte, dest *T) {
	t.Helper()

	if status != wantStatus {
		t.Fatalf("%s: statut %d attendu, recu %d, corps: %s", label, wantStatus, status, body)
	}
	if err := json.Unmarshal(body, dest); err != nil {
		t.Fatalf("%s: reponse JSON invalide (%v): %s", label, err, body)
	}
	t.Logf("%s => %s", label, body)
}

// requireCoherent refuse une sonde qui se contredit : une fonctionnalite
// supportee ne porte pas d'erreur, une fonctionnalite masquee en porte une.
func requireCoherent(t *testing.T, label string, supported bool, errorMessage *string) {
	t.Helper()

	switch {
	case supported && errorMessage != nil:
		t.Errorf("%s: supported=true mais error=%q", label, *errorMessage)
	case !supported && errorMessage == nil:
		t.Errorf("%s: supported=false sans error : le front ne peut pas expliquer le masquage", label)
	}
}

func TestBucketUsageAgainstHarness(t *testing.T) {
	config := harnessConfig(t)
	clearBucketUsageCache()

	t.Run("a/usage-complet", func(t *testing.T) {
		status, body := postS3JSON(t, HandleBucketUsageWithConfig(config), BucketUsageRequest{
			ConfigID: 1,
			Buckets:  []string{itBucket},
		})
		var resp BucketUsageResponse
		decodeS3JSON(t, "bucket-usage "+itBucket, http.StatusOK, status, body, &resp)

		if len(resp.Buckets) != 1 {
			t.Fatalf("buckets = %d, attendu 1", len(resp.Buckets))
		}
		usage := resp.Buckets[0]
		if usage.Name != itBucket {
			t.Errorf("name = %q, attendu %q", usage.Name, itBucket)
		}
		if usage.Objects != 5 {
			t.Errorf("objects = %d, attendu 5", usage.Objects)
		}
		if usage.Bytes != 13200000 {
			t.Errorf("bytes = %d, attendu 13200000", usage.Bytes)
		}
		if !usage.Complete {
			t.Error("complete = false, attendu true sur un bucket entierement parcouru")
		}
		if usage.Error != nil {
			t.Errorf("error = %q, attendu null", *usage.Error)
		}
		if usage.Prefixes < 1 {
			t.Errorf("prefixes = %d, attendu au moins 1 (releases/)", usage.Prefixes)
		}
		if resp.Totals.Buckets != 1 || resp.Totals.Objects != 5 || resp.Totals.Bytes != 13200000 {
			t.Errorf("totals = %+v, attendu 1 bucket / 5 objets / 13200000 octets", resp.Totals)
		}
		if !resp.Totals.ObjectsComplete || !resp.Totals.BucketsComplete {
			t.Errorf("totals = %+v, attendu complet sur les deux axes", resp.Totals)
		}
		if resp.Stale {
			t.Error("stale = true sur un releve frais")
		}
		if resp.GeneratedAt == "" {
			t.Error("generatedAt vide")
		}
		// Le harnais est libre de ne pas annoncer de classe de stockage : on
		// journalise sans l'exiger (contrat : un objet par classe rencontree).
		t.Logf("storageClasses = %v", usage.StorageClasses)
	})

	t.Run("b/plafond-d-objets", func(t *testing.T) {
		status, body := postS3JSON(t, HandleBucketUsageWithConfig(config), BucketUsageRequest{
			ConfigID:            1,
			Buckets:             []string{itBucket},
			MaxObjectsPerBucket: 2,
		})
		var resp BucketUsageResponse
		decodeS3JSON(t, "bucket-usage cap 2", http.StatusOK, status, body, &resp)

		if len(resp.Buckets) != 1 {
			t.Fatalf("buckets = %d, attendu 1", len(resp.Buckets))
		}
		usage := resp.Buckets[0]
		if usage.Complete {
			t.Error("complete = true, attendu false quand le plafond d'objets est atteint")
		}
		if usage.Objects > 2 {
			t.Errorf("objects = %d, attendu <= 2 (plafond)", usage.Objects)
		}
		if usage.Bytes <= 0 {
			t.Errorf("bytes = %d, attendu la somme partielle des objets mesures", usage.Bytes)
		}
		if resp.Totals.ObjectsComplete {
			t.Errorf("totals = %+v, objectsComplete doit passer a false quand un bucket est tronque", resp.Totals)
		}
		if !resp.Totals.BucketsComplete {
			t.Error("bucketsComplete = false : l'appel a bien couvert tous les buckets demandes")
		}
	})

	t.Run("c/deux-buckets-agreges", func(t *testing.T) {
		requested := []string{itBucket, "audio"}
		status, body := postS3JSON(t, HandleBucketUsageWithConfig(config), BucketUsageRequest{
			ConfigID: 1,
			Buckets:  requested,
		})
		var resp BucketUsageResponse
		decodeS3JSON(t, "bucket-usage 2 buckets", http.StatusOK, status, body, &resp)

		if len(resp.Buckets) != len(requested) {
			t.Fatalf("buckets = %d, attendu %d", len(resp.Buckets), len(requested))
		}

		var totalObjects, totalBytes int64
		for _, usage := range resp.Buckets {
			if usage.Error != nil {
				t.Errorf("%s: error = %q, attendu null", usage.Name, *usage.Error)
			}
			totalObjects += usage.Objects
			totalBytes += usage.Bytes
		}
		if resp.Totals.Objects != totalObjects || resp.Totals.Bytes != totalBytes {
			t.Errorf("totals = %+v, attendu la somme des buckets (%d objets / %d octets)", resp.Totals, totalObjects, totalBytes)
		}
	})
}

func TestBucketConfigAgainstHarness(t *testing.T) {
	config := harnessConfig(t)

	t.Run("d/bucket-existant", func(t *testing.T) {
		status, body := postS3JSON(t, HandleBucketConfigWithConfig(config), BucketConfigRequest{
			ConfigID: 1,
			Bucket:   itBucket,
		})
		var resp BucketConfigResponse
		decodeS3JSON(t, "bucket-config "+itBucket, http.StatusOK, status, body, &resp)

		if resp.Bucket != itBucket {
			t.Errorf("bucket = %q, attendu %q", resp.Bucket, itBucket)
		}
		if !resp.Location.Supported || resp.Location.Value == nil || *resp.Location.Value == "" {
			t.Errorf("location = %+v, attendu supporte avec une region non vide", resp.Location)
		}
		requireCoherent(t, "location", resp.Location.Supported, resp.Location.Error)

		// MinIO supporte le versioning : la valeur doit rester dans le vocabulaire
		// du contrat (Enabled / Suspended / null).
		requireCoherent(t, "versioning", resp.Versioning.Supported, resp.Versioning.Error)
		if resp.Versioning.Supported {
			if resp.Versioning.Value == nil {
				t.Fatal("versioning supporte sans valeur")
			}
			switch *resp.Versioning.Value {
			case "Enabled", "Suspended", "null":
			default:
				t.Errorf("versioning.value = %q, attendu Enabled, Suspended ou null", *resp.Versioning.Value)
			}
		}

		// Le chiffrement est annonce par MinIO mais reste une fonctionnalite que le
		// backend peut refuser : les deux reponses sont acceptables, pas l'incoherence.
		requireCoherent(t, "encryption", resp.Encryption.Supported, resp.Encryption.Error)
		if resp.Encryption.Supported && resp.Encryption.Value == nil {
			t.Error("encryption supporte sans valeur")
		}

		requireCoherent(t, "tagging", resp.Tagging.Supported, resp.Tagging.Error)
		requireCoherent(t, "cors", resp.Cors.Supported, resp.Cors.Error)
		requireCoherent(t, "lifecycle", resp.Lifecycle.Supported, resp.Lifecycle.Error)
		if resp.Lifecycle.Supported && resp.Lifecycle.Value == nil {
			t.Error("lifecycle supporte sans nombre de regles")
		}
	})

	t.Run("e/bucket-inexistant", func(t *testing.T) {
		status, body := postS3JSON(t, HandleBucketConfigWithConfig(config), BucketConfigRequest{
			ConfigID: 1,
			Bucket:   "kexa-bucket-inexistant",
		})
		if status != http.StatusNotFound {
			t.Fatalf("statut %d attendu, recu %d, corps: %s", http.StatusNotFound, status, body)
		}
		t.Logf("bucket-config bucket inexistant => %d %s", status, strings.TrimSpace(string(body)))
	})
}

//go:build integration

package s3

import (
	"bytes"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/minio/minio-go/v7"
)

const (
	itBucket   = "bot-creator"
	itFolder   = "releases/v2.1.16/"
	itMetaKey  = "releases/v2.1.16/labelled.zip"
	itProbeDir = "integration-probe/"
	itCopyKey  = itProbeDir + "labelled-copy.zip"
)

// harnessConfig construit la config du harnais S3 et saute le test s'il est injoignable.
func harnessConfig(t *testing.T) S3ConfigData {
	t.Helper()

	endpoint := os.Getenv("KEXA_TEST_S3_ENDPOINT")
	if endpoint == "" {
		endpoint = "http://kexa-s3:9000"
	}
	parsed, err := url.Parse(endpoint)
	if err != nil {
		t.Fatalf("KEXA_TEST_S3_ENDPOINT invalide (%q): %v", endpoint, err)
	}

	conn, err := net.DialTimeout("tcp", parsed.Host, 3*time.Second)
	if err != nil {
		t.Skipf("harnais S3 injoignable sur %s: %v", parsed.Host, err)
	}
	conn.Close()

	key := os.Getenv("KEXA_TEST_S3_KEY")
	if key == "" {
		key = "kexa"
	}
	secret := os.Getenv("KEXA_TEST_S3_SECRET")
	if secret == "" {
		secret = "kexa-secret"
	}

	return S3ConfigData{
		ID:             1,
		UserID:         1,
		Name:           "harnais-integration",
		Type:           "minio",
		S3URL:          endpoint,
		ClientID:       key,
		ClientSecret:   secret,
		Region:         "us-east-1",
		ForcePathStyle: true,
	}
}

func harnessClient(t *testing.T, config S3ConfigData) *minio.Client {
	t.Helper()

	creds, err := GetS3Credentials(config, "", "")
	if err != nil {
		t.Fatalf("identifiants S3: %v", err)
	}
	client, err := CreateS3Client(creds)
	if err != nil {
		t.Fatalf("client S3: %v", err)
	}
	return client
}

// itRequest regroupe les corps de requete des endpoints S3 testes.
type itRequest interface {
	ListObjectsRequest | StatObjectRequest | CopyObjectRequest | DeleteObjectsRequest
}

// itResponse regroupe les corps de reponse des endpoints S3 testes.
type itResponse interface {
	ListObjectsResponse | StatObjectResponse | CopyObjectResponse | DeleteObjectsResponse
}

// callEndpoint poste le corps JSON sur un handler S3 et rend le statut et le corps brut.
func callEndpoint[T itRequest](t *testing.T, handler http.HandlerFunc, body T) (int, []byte) {
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

// decodeInto exige un statut donne, decode le corps brut et le journalise tel quel.
func decodeInto[T itResponse](t *testing.T, label string, wantStatus, status int, body []byte, dest *T) {
	t.Helper()

	if status != wantStatus {
		t.Fatalf("%s: statut %d attendu, recu %d, corps: %s", label, wantStatus, status, body)
	}
	if err := json.Unmarshal(body, dest); err != nil {
		t.Fatalf("%s: reponse JSON invalide (%v): %s", label, err, body)
	}
	t.Logf("%s => %s", label, body)
}

func objectKeys(objects []S3Object) []string {
	keys := make([]string, 0, len(objects))
	for _, object := range objects {
		keys = append(keys, object.Key)
	}
	return keys
}

func containsString(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

// listObjects interroge l'endpoint list-objects et rend la reponse decodee.
func listObjects(t *testing.T, config S3ConfigData, req ListObjectsRequest) ListObjectsResponse {
	t.Helper()

	req.ConfigID = 1
	status, body := callEndpoint(t, HandleListObjectsWithConfig(config), req)
	var resp ListObjectsResponse
	decodeInto(t, "list-objects "+req.Prefix+" (delimiter="+req.Delimiter+")", http.StatusOK, status, body, &resp)
	return resp
}

func TestS3ListingAgainstHarness(t *testing.T) {
	config := harnessConfig(t)

	t.Run("a/list-objects-delimiter", func(t *testing.T) {
		resp := listObjects(t, config, ListObjectsRequest{Bucket: itBucket, Delimiter: "/", MaxKeys: 100})

		if !containsString(resp.CommonPrefixes, "releases/") {
			t.Errorf("commonPrefixes = %v, attendu releases/", resp.CommonPrefixes)
		}
		if len(resp.Objects) != 1 || resp.Objects[0].Key != "readme.md" {
			t.Errorf("objects = %v, attendu [readme.md] seulement", objectKeys(resp.Objects))
		}
		if resp.Delimiter != "/" {
			t.Errorf("delimiter = %q, attendu /", resp.Delimiter)
		}
		if resp.IsTruncated {
			t.Error("isTruncated = true, attendu false (1 objet + 1 prefixe)")
		}
		if resp.KeyCount != len(resp.Objects) {
			t.Errorf("keyCount = %d, attendu %d", resp.KeyCount, len(resp.Objects))
		}
	})

	t.Run("b/list-objects-prefixe-feuille", func(t *testing.T) {
		resp := listObjects(t, config, ListObjectsRequest{Bucket: itBucket, Prefix: itFolder, Delimiter: "/"})

		if len(resp.Objects) != 3 {
			t.Errorf("objects = %v, attendu 3 objets", objectKeys(resp.Objects))
		}
		if len(resp.CommonPrefixes) != 0 {
			t.Errorf("commonPrefixes = %v, attendu vide sous un prefixe feuille", resp.CommonPrefixes)
		}

		var sum int64
		for _, object := range resp.Objects {
			sum += object.Size
		}
		if resp.TotalSize != sum {
			t.Errorf("totalSize = %d, attendu %d", resp.TotalSize, sum)
		}
	})

	t.Run("c/pagination-par-jeton", func(t *testing.T) {
		first := listObjects(t, config, ListObjectsRequest{Bucket: itBucket, MaxKeys: 2})

		if len(first.Objects) != 2 {
			t.Fatalf("page 1 = %v, attendu 2 objets", objectKeys(first.Objects))
		}
		if !first.IsTruncated {
			t.Error("page 1: isTruncated = false, attendu true")
		}
		if first.NextContinuationToken == "" {
			t.Fatal("page 1: nextContinuationToken vide alors que le listing est tronque")
		}
		if first.ContinuationToken != first.NextContinuationToken {
			t.Errorf("page 1: alias continuationToken = %q, attendu le meme jeton", first.ContinuationToken)
		}

		second := listObjects(t, config, ListObjectsRequest{Bucket: itBucket, MaxKeys: 2, ContinuationToken: first.NextContinuationToken})
		if len(second.Objects) != 2 {
			t.Fatalf("page 2 = %v, attendu 2 objets", objectKeys(second.Objects))
		}

		seen := make(map[string]bool, len(first.Objects))
		for _, object := range first.Objects {
			seen[object.Key] = true
		}
		for _, object := range second.Objects {
			if seen[object.Key] {
				t.Errorf("page 2: %q deja present dans la page 1", object.Key)
			}
		}
		if second.NextContinuationToken == first.NextContinuationToken {
			t.Error("page 2: le jeton de continuation n'a pas avance")
		}
	})
}

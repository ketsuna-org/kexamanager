package s3

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/cors"
	"github.com/minio/minio-go/v7/pkg/lifecycle"
	"github.com/minio/minio-go/v7/pkg/sse"
	"github.com/minio/minio-go/v7/pkg/tags"
)

// fakeProber rejoue chaque lecture S3 independamment : une fonctionnalite en
// erreur ne doit jamais empecher les autres d'etre sondees.
type fakeProber struct {
	location        string
	locationErr     error
	versioning      string
	versioningErr   error
	tags            *tags.Tags
	tagsErr         error
	lifecycleRules  int
	lifecycleErr    error
	corsRules       int
	corsErr         error
	encryptionRules int
	encryptionErr   error
}

func (f fakeProber) GetBucketLocation(context.Context, string) (string, error) {
	return f.location, f.locationErr
}

func (f fakeProber) GetBucketVersioning(context.Context, string) (minio.BucketVersioningConfiguration, error) {
	return minio.BucketVersioningConfiguration{Status: f.versioning}, f.versioningErr
}

func (f fakeProber) GetBucketTagging(context.Context, string) (*tags.Tags, error) {
	return f.tags, f.tagsErr
}

func (f fakeProber) GetBucketLifecycle(context.Context, string) (*lifecycle.Configuration, error) {
	return &lifecycle.Configuration{Rules: make([]lifecycle.Rule, f.lifecycleRules)}, f.lifecycleErr
}

func (f fakeProber) GetBucketCors(context.Context, string) (*cors.Config, error) {
	return &cors.Config{CORSRules: make([]cors.Rule, f.corsRules)}, f.corsErr
}

func (f fakeProber) GetBucketEncryption(context.Context, string) (*sse.Configuration, error) {
	return &sse.Configuration{Rules: make([]sse.Rule, f.encryptionRules)}, f.encryptionErr
}

// notImplemented reproduit la reponse d'un backend qui ne connait pas la fonctionnalite.
func notImplemented() error {
	return minio.ErrorResponse{Code: minio.NotImplemented, StatusCode: http.StatusNotImplemented}
}

func TestProbeBucketConfigNotImplemented(t *testing.T) {
	prober := fakeProber{
		location:       "us-east-1",
		versioning:     "Enabled",
		lifecycleRules: 2,
		tagsErr:        notImplemented(),
		corsErr:        notImplemented(),
		encryptionErr:  notImplemented(),
	}

	resp := probeBucketConfig(context.Background(), prober, "bot-creator")

	if resp.Bucket != "bot-creator" {
		t.Errorf("bucket = %q, attendu bot-creator", resp.Bucket)
	}
	if !resp.Location.Supported || resp.Location.Value == nil || *resp.Location.Value != "us-east-1" {
		t.Errorf("location = %+v, attendu supporte et value us-east-1", resp.Location)
	}
	if !resp.Versioning.Supported || resp.Versioning.Value == nil || *resp.Versioning.Value != "Enabled" {
		t.Errorf("versioning = %+v, attendu supporte et value Enabled", resp.Versioning)
	}
	if !resp.Lifecycle.Supported || resp.Lifecycle.Value == nil || *resp.Lifecycle.Value != 2 {
		t.Errorf("lifecycle = %+v, attendu supporte et 2 regles", resp.Lifecycle)
	}

	for name, probe := range map[string]struct {
		supported bool
		value     *BucketRulesValue
		message   *string
	}{
		"cors":       {resp.Cors.Supported, resp.Cors.Value, resp.Cors.Error},
		"encryption": {resp.Encryption.Supported, resp.Encryption.Value, resp.Encryption.Error},
	} {
		if probe.supported {
			t.Errorf("%s: supported = true, want false (NotImplemented)", name)
		}
		if probe.value != nil {
			t.Errorf("%s: value = %+v, want null quand la fonctionnalite est absente", name, probe.value)
		}
		if probe.message == nil || *probe.message != minio.NotImplemented {
			t.Errorf("%s: error = %v, want le code NotImplemented", name, probe.message)
		}
	}

	if resp.Tagging.Supported || resp.Tagging.Value != nil || resp.Tagging.Error == nil {
		t.Errorf("tagging = %+v, attendu supported=false, value=null et error rempli", resp.Tagging)
	}
}

func TestProbeBucketConfigErreursIndependantes(t *testing.T) {
	prober := fakeProber{
		versioningErr:  minio.ErrorResponse{Code: "NotImplemented", StatusCode: http.StatusNotImplemented},
		tags:           mustTags(t, map[string]string{"env": "dev"}),
		lifecycleRules: 1,
		corsRules:      1,
		encryptionErr:  minio.ErrorResponse{Code: "AccessDenied", Message: "Access Denied.", StatusCode: http.StatusForbidden},
	}

	resp := probeBucketConfig(context.Background(), prober, "bot-creator")

	if !resp.Tagging.Supported || resp.Tagging.Value["env"] != "dev" {
		t.Errorf("tagging = %+v, attendu les tags du bucket", resp.Tagging)
	}
	if !resp.Lifecycle.Supported || !resp.Cors.Supported {
		t.Errorf("les fonctionnalites saines doivent rester supportees: %+v / %+v", resp.Lifecycle, resp.Cors)
	}
	if resp.Versioning.Supported || resp.Versioning.Error == nil {
		t.Errorf("versioning = %+v, attendu supported=false avec error", resp.Versioning)
	}
	if resp.Encryption.Supported {
		t.Errorf("encryption = %+v, attendu supported=false", resp.Encryption)
	}
	if resp.Encryption.Error == nil || *resp.Encryption.Error != "AccessDenied: Access Denied." {
		t.Errorf("encryption.error = %v, attendu le code et le message du backend", resp.Encryption.Error)
	}
}

func TestProbeBucketConfigSansConfiguration(t *testing.T) {
	prober := fakeProber{tagsErr: minio.ErrorResponse{Code: "NoSuchTagSet", StatusCode: http.StatusNotFound}}

	resp := probeBucketConfig(context.Background(), prober, "audio")

	if !resp.Tagging.Supported {
		t.Error("tagging doit rester SUPPORTE quand le backend n'a simplement aucun tag")
	}
	if resp.Tagging.Error != nil {
		t.Errorf("tagging.error = %v, attendu nil (absence de configuration, pas indisponibilite)", *resp.Tagging.Error)
	}
	if resp.Tagging.Value == nil || len(resp.Tagging.Value) != 0 {
		t.Errorf("tagging.value = %+v, attendu une map vide", resp.Tagging.Value)
	}
	if resp.Versioning.Value == nil || *resp.Versioning.Value != "null" {
		t.Errorf("versioning = %+v, attendu la valeur null sans configuration", resp.Versioning)
	}
}

func TestNormalizeVersioningStatus(t *testing.T) {
	cases := map[string]string{
		"Enabled":     "Enabled",
		"enabled":     "Enabled",
		"Suspended":   "Suspended",
		" suspended ": "Suspended",
		"":            "null",
		"autre":       "null",
	}

	for input, want := range cases {
		if got := normalizeVersioningStatus(input); got != want {
			t.Errorf("normalizeVersioningStatus(%q) = %q, attendu %q", input, got, want)
		}
	}
}

func TestIsNotImplemented(t *testing.T) {
	if !isNotImplemented(minio.ErrorResponse{Code: minio.NotImplemented}) {
		t.Error("le code NotImplemented doit etre reconnu")
	}
	if !isNotImplemented(minio.ErrorResponse{Code: "Weird", StatusCode: http.StatusNotImplemented}) {
		t.Error("un statut 501 doit etre reconnu comme fonctionnalite absente")
	}
	if isNotImplemented(minio.ErrorResponse{Code: "AccessDenied", StatusCode: http.StatusForbidden}) {
		t.Error("une erreur reelle ne doit pas passer pour une fonctionnalite absente")
	}
}

func TestFeatureError(t *testing.T) {
	if got := featureError(nil); got != nil {
		t.Errorf("featureError(nil) = %v, attendu nil", got)
	}

	plain := featureError(errors.New(""))
	if plain == nil || *plain == "" {
		t.Error("une erreur sans message doit tout de meme produire un diagnostic non vide")
	}

	if got := featureError(minio.ErrorResponse{Code: "NoSuchBucket", Message: "absent"}); got == nil || *got != "NoSuchBucket: absent" {
		t.Errorf("featureError = %v, attendu NoSuchBucket: absent", got)
	}
	if got := featureError(notImplemented()); got == nil || *got != minio.NotImplemented {
		t.Errorf("featureError = %v, attendu NotImplemented seul", got)
	}
}

func TestDecodeBucketConfigRequest(t *testing.T) {
	rec := httptest.NewRecorder()
	if _, ok := decodeBucketConfigRequest(rec, httptest.NewRequest(http.MethodGet, "/s3/bucket-config", nil)); ok {
		t.Fatal("une methode GET doit etre refusee")
	}
	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("status = %d, want 405", rec.Code)
	}

	rec = httptest.NewRecorder()
	empty := httptest.NewRequest(http.MethodPost, "/s3/bucket-config", bytes.NewReader([]byte(`{"bucket":"  "}`)))
	if _, ok := decodeBucketConfigRequest(rec, empty); ok {
		t.Fatal("un bucket vide doit etre refuse")
	}
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", rec.Code)
	}

	rec = httptest.NewRecorder()
	good := httptest.NewRequest(http.MethodPost, "/s3/bucket-config", bytes.NewReader([]byte(`{"bucket":"bot-creator"}`)))
	req, ok := decodeBucketConfigRequest(rec, good)
	if !ok {
		t.Fatalf("corps valide refuse: %s", rec.Body.String())
	}
	if req.Bucket != "bot-creator" {
		t.Errorf("bucket = %q, attendu bot-creator", req.Bucket)
	}
}

func mustTags(t *testing.T, values map[string]string) *tags.Tags {
	t.Helper()

	tagSet, err := tags.NewTags(values, false)
	if err != nil {
		t.Fatalf("tags de test: %v", err)
	}
	return tagSet
}

package s3

import (
	"net/http"
	"testing"

	"github.com/minio/minio-go/v7"
)

// TestIsEmptyConfigState encode la distinction qui evite de masquer a tort une
// section du front : "non configure" (supported=true, valeur vide) n'est PAS
// "indisponible" (supported=false + diagnostic).
func TestIsEmptyConfigState(t *testing.T) {
	cases := []struct {
		name     string
		response minio.ErrorResponse
		want     bool
	}{
		{"tags absents", minio.ErrorResponse{Code: "NoSuchTagSet"}, true},
		{"lifecycle absent", minio.ErrorResponse{Code: "NoSuchLifecycleConfiguration"}, true},
		{"cors absent", minio.ErrorResponse{Code: "NoSuchCORSConfiguration"}, true},
		{"chiffrement absent", minio.ErrorResponse{Code: "ServerSideEncryptionConfigurationNotFoundError"}, true},
		{"bucket absent", minio.ErrorResponse{Code: "NoSuchBucket"}, false},
		{"fonctionnalite absente du backend", minio.ErrorResponse{Code: minio.NotImplemented, StatusCode: http.StatusNotImplemented}, false},
		{"acces refuse", minio.ErrorResponse{Code: "AccessDenied"}, false},
		{"code vide", minio.ErrorResponse{}, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := isEmptyConfigState(tc.response); got != tc.want {
				t.Errorf("isEmptyConfigState(%q) = %v, attendu %v", tc.response.Code, got, tc.want)
			}
		})
	}
}

// TestFeatureErrorNeverEmpty garantit qu'un masquage est toujours explicable.
func TestFeatureErrorNeverEmpty(t *testing.T) {
	empty := featureError(nil)
	if empty != nil {
		t.Errorf("featureError(nil) = %v, attendu nil", *empty)
	}

	message := featureError(minio.ErrorResponse{Code: "AccessDenied", Message: "Access Denied."})
	if message == nil || *message == "" {
		t.Error("featureError doit produire un diagnostic non vide")
	}
}

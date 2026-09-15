package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/ketsuna-org/kexamanager/cmd/proxy/s3"
)

// Les deux groupes du contrat /capabilities v2 (section 7 / D9 du plan).
var capabilitiesShape = map[string][]string{
	"s3":    {"versioning", "tagging", "lifecycle", "cors", "location", "encryption", "storageClasses"},
	"admin": {"available", "bucketUsage", "quotas", "multipart", "bucketKeys", "objectInspect", "clusterStats", "website"},
}

// capabilitiesOf appelle le handler et rend la reponse decodee et sa forme brute.
func capabilitiesOf(t *testing.T, projectID uint, config s3.S3ConfigData) (Capabilities, map[string]any) {
	t.Helper()

	rec := httptest.NewRecorder()
	HandleProjectCapabilities(rec, httptest.NewRequest(http.MethodGet, "/api/1/capabilities", nil), projectID, config)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body %s)", rec.Code, rec.Body.String())
	}

	var raw map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &raw); err != nil {
		t.Fatalf("reponse non JSON: %v", err)
	}
	return decodeJSON[Capabilities](t, rec), raw
}

func requireFlags(t *testing.T, label string, flags []struct {
	name  string
	value bool
}, want bool) {
	t.Helper()

	for _, flag := range flags {
		if flag.value != want {
			t.Errorf("%s: %s = %v, want %v", label, flag.name, flag.value, want)
		}
	}
}

func adminFlags(caps AdminCapabilities) []struct {
	name  string
	value bool
} {
	return []struct {
		name  string
		value bool
	}{
		{"available", caps.Available},
		{"bucketUsage", caps.BucketUsage},
		{"quotas", caps.Quotas},
		{"multipart", caps.Multipart},
		{"bucketKeys", caps.BucketKeys},
		{"objectInspect", caps.ObjectInspect},
		{"clusterStats", caps.ClusterStats},
		{"website", caps.Website},
	}
}

func s3Flags(caps S3Capabilities) []struct {
	name  string
	value bool
} {
	return []struct {
		name  string
		value bool
	}{
		{"versioning", caps.Versioning},
		{"tagging", caps.Tagging},
		{"lifecycle", caps.Lifecycle},
		{"cors", caps.Cors},
		{"location", caps.Location},
		{"encryption", caps.Encryption},
		{"storageClasses", caps.StorageClasses},
	}
}

func TestCapabilitiesS3Only(t *testing.T) {
	clearCapabilityCaches()
	config := s3.S3ConfigData{Type: "s3", S3URL: "https://s3.example.com", Region: "us-east-1"}

	caps, _ := capabilitiesOf(t, 1, config)

	if caps.Admin.Available {
		t.Error("admin.available = true, want false sans AdminURL/AdminToken")
	}
	requireFlags(t, "groupe admin", adminFlags(caps.Admin), false)
	// Sur un backend s3 pur les sept fonctionnalites sont declarees disponibles :
	// c'est bucket-config qui tranche au cas par cas.
	requireFlags(t, "groupe s3", s3Flags(caps.S3), true)

	if caps.S3URL != "https://s3.example.com" || caps.Region != "us-east-1" {
		t.Errorf("s3Url/region = %q/%q, want les valeurs de la config", caps.S3URL, caps.Region)
	}
	if _, ok := adminProbeCache.Get(cacheKey(1, "admin-probe", "")); ok {
		t.Error("une sonde a ete memorisee alors qu'aucun admin n'est configure")
	}
}

func TestCapabilitiesGarageLimits(t *testing.T) {
	clearCapabilityCaches()
	config := s3.S3ConfigData{Type: "garage", S3URL: "https://s3.example.com", Region: "garage"}

	caps, _ := capabilitiesOf(t, 2, config)

	for _, flag := range []struct {
		name  string
		value bool
	}{
		{"versioning", caps.S3.Versioning},
		{"tagging", caps.S3.Tagging},
		{"storageClasses", caps.S3.StorageClasses},
	} {
		if flag.value {
			t.Errorf("garage: s3.%s = true, want false (limite Garage documentee)", flag.name)
		}
	}
	for _, flag := range []struct {
		name  string
		value bool
	}{
		{"lifecycle", caps.S3.Lifecycle},
		{"cors", caps.S3.Cors},
		{"location", caps.S3.Location},
		{"encryption", caps.S3.Encryption},
	} {
		if !flag.value {
			t.Errorf("garage: s3.%s = false, want true", flag.name)
		}
	}
	requireFlags(t, "groupe admin", adminFlags(caps.Admin), false)
}

func TestCapabilitiesAdminReachableAndCached(t *testing.T) {
	clearCapabilityCaches()
	admin := newFakeAdmin(t, map[string]http.HandlerFunc{
		"/v2/GetClusterHealth": func(w http.ResponseWriter, r *http.Request) {
			if got := r.Header.Get("Authorization"); got != "Bearer admin-token" {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"status": "healthy", "storageNodesUp": 3})
		},
	})
	config := admin.config()
	config.Type = "garage"

	for i := 0; i < 2; i++ {
		caps, _ := capabilitiesOf(t, 7, config)
		requireFlags(t, "groupe admin", adminFlags(caps.Admin), true)
		// Les limites Garage ne disparaissent pas parce que l'admin repond.
		if caps.S3.Versioning || caps.S3.Tagging || caps.S3.StorageClasses {
			t.Errorf("appel %d: une limite Garage est levee alors qu'elle vient du backend S3: %+v", i, caps.S3)
		}
	}
	if hits := admin.hitsFor("/v2/GetClusterHealth"); hits != 1 {
		t.Errorf("sonde appelee %d fois, want 1 (cache 5 min)", hits)
	}
}

func TestCapabilitiesAdminDeclaredButUnreachable(t *testing.T) {
	clearCapabilityCaches()
	admin := newFakeAdmin(t, map[string]http.HandlerFunc{
		"/v2/GetClusterHealth": func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, "boom", http.StatusInternalServerError)
		},
	})
	config := admin.config()

	for i := 0; i < 2; i++ {
		caps, _ := capabilitiesOf(t, 9, config)
		if caps.Admin.Available {
			t.Fatalf("appel %d: admin.available = true alors que GetClusterHealth echoue", i)
		}
		requireFlags(t, "groupe admin", adminFlags(caps.Admin), false)
	}
	if hits := admin.hitsFor("/v2/GetClusterHealth"); hits != 1 {
		t.Errorf("sonde appelee %d fois, want 1 (cache negatif 30 s)", hits)
	}
}

func TestCapabilitiesAdminTokenMissing(t *testing.T) {
	clearCapabilityCaches()
	config := s3.S3ConfigData{Type: "garage", AdminURL: "http://127.0.0.1:1", S3URL: "https://s3.example.com"}

	caps, _ := capabilitiesOf(t, 11, config)

	if caps.Admin.Available {
		t.Error("admin.available = true avec un AdminURL mais sans AdminToken")
	}
}

func TestCapabilitiesMethodNotAllowed(t *testing.T) {
	rec := httptest.NewRecorder()
	HandleProjectCapabilities(rec, httptest.NewRequest(http.MethodPost, "/api/1/capabilities", nil), 1, s3.S3ConfigData{})

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", rec.Code)
	}
}

func TestCapabilitiesJSONShape(t *testing.T) {
	clearCapabilityCaches()
	_, raw := capabilitiesOf(t, 1, s3.S3ConfigData{Type: "garage", S3URL: "https://s3.example.com", Region: "garage"})

	if len(raw) != 4 {
		t.Errorf("la reponse contient %d champs, want 4 (s3, admin, s3Url, region): %v", len(raw), raw)
	}
	for _, field := range []string{"s3", "admin", "s3Url", "region"} {
		if _, ok := raw[field]; !ok {
			t.Errorf("champ %q absent de la reponse", field)
		}
	}

	for group, want := range capabilitiesShape {
		nested, ok := raw[group].(map[string]any)
		if !ok {
			t.Fatalf("%s: groupe absent ou mal forme (%T)", group, raw[group])
		}
		if len(nested) != len(want) {
			t.Errorf("groupe %s: %d cles, want %d (%v)", group, len(nested), len(want), nested)
		}
		for _, key := range want {
			if _, ok := nested[key]; !ok {
				t.Errorf("groupe %s: cle %q absente", group, key)
			}
		}
	}
}

package main

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/ketsuna-org/kexamanager/cmd/proxy/s3"
)

const (
	// TTL du resultat de la sonde admin (duree de validite d'un "admin disponible").
	adminProbeTTL = 5 * time.Minute
	// TTL du cache negatif : un admin injoignable ne doit pas etre re-sonde a chaque requete.
	adminProbeNegativeTTL = 30 * time.Second
	// Duree maximale de la sonde : une requete front ne bloque jamais plus longtemps.
	adminProbeTimeout = 2 * time.Second
)

// S3Capabilities decrit ce que la couche S3 annonce pour un projet.
// C'est un contrat declaratif : chaque fonctionnalite est confirmee au cas par
// cas par bucket-config (D11), qui interroge le bucket lui-meme.
type S3Capabilities struct {
	Versioning     bool `json:"versioning"`
	Tagging        bool `json:"tagging"`
	Lifecycle      bool `json:"lifecycle"`
	Cors           bool `json:"cors"`
	Location       bool `json:"location"`
	Encryption     bool `json:"encryption"`
	StorageClasses bool `json:"storageClasses"`
}

// AdminCapabilities decrit ce que l'API admin Garage fournit. Toutes ces
// capacites ne sont annoncees que si la sonde reelle les a confirmees.
type AdminCapabilities struct {
	Available     bool `json:"available"`
	BucketUsage   bool `json:"bucketUsage"`
	Quotas        bool `json:"quotas"`
	Multipart     bool `json:"multipart"`
	BucketKeys    bool `json:"bucketKeys"`
	ObjectInspect bool `json:"objectInspect"`
	ClusterStats  bool `json:"clusterStats"`
	Website       bool `json:"website"`
}

// Capabilities decrit ce qui est reellement faisable pour un projet donne, en
// deux groupes : s3 (toujours disponible, via l'API S3 seule) et admin
// (Garage seulement). Le front affiche s3 en permanence et masque les elements
// admin quand le groupe admin n'est pas disponible.
type Capabilities struct {
	S3     S3Capabilities    `json:"s3"`
	Admin  AdminCapabilities `json:"admin"`
	S3URL  string            `json:"s3Url"`
	Region string            `json:"region"`
}

// s3CapabilitiesFor applique les limites Garage documentees : le versioning est
// un stub qui repond toujours "desactive", le tagging d'objet repond 501 et les
// classes de stockage n'existent pas. Sur un backend s3, tout est declare
// disponible : c'est le bucket qui tranche au moment de la lecture.
func s3CapabilitiesFor(configType string) S3Capabilities {
	if strings.EqualFold(strings.TrimSpace(configType), "garage") {
		return S3Capabilities{Lifecycle: true, Cors: true, Location: true, Encryption: true}
	}
	return S3Capabilities{
		Versioning:     true,
		Tagging:        true,
		Lifecycle:      true,
		Cors:           true,
		Location:       true,
		Encryption:     true,
		StorageClasses: true,
	}
}

// allAdminCapabilities arme le groupe admin quand la sonde a confirme l'acces,
// et le laisse entierement a false sinon : jamais d'admin annonce non verifie.
func allAdminCapabilities(available bool) AdminCapabilities {
	return AdminCapabilities{
		Available:     available,
		BucketUsage:   available,
		Quotas:        available,
		Multipart:     available,
		BucketKeys:    available,
		ObjectInspect: available,
		ClusterStats:  available,
		Website:       available,
	}
}

// adminProbeCache memorise le resultat de la sonde GetClusterHealth.
var adminProbeCache = newTTLCache[bool](adminProbeTTL)

// probeAdminReachable confirme par un appel reel a l'API admin que la capacite
// annoncee existe. Resultat positif cache 5 min, resultat negatif cache 30 s.
func probeAdminReachable(projectID uint, config s3.S3ConfigData) bool {
	key := cacheKey(projectID, "admin-probe", config.AdminURL)
	if reachable, ok := adminProbeCache.Get(key); ok {
		return reachable
	}

	ctx, cancel := context.WithTimeout(context.Background(), adminProbeTimeout)
	defer cancel()

	reachable := adminGetJSON(ctx, config, http.MethodGet, "/v2/GetClusterHealth", nil) == nil

	ttl := adminProbeTTL
	if !reachable {
		ttl = adminProbeNegativeTTL
	}
	adminProbeCache.SetTTL(key, reachable, ttl)
	return reachable
}

// HandleProjectCapabilities sert GET /api/{project}/capabilities.
func HandleProjectCapabilities(w http.ResponseWriter, r *http.Request, projectID uint, config s3.S3ConfigData) {
	if r.Method != http.MethodGet {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Le groupe admin n'est annonce qu'apres confirmation par la sonde.
	adminAvailable := config.AdminURL != "" && config.AdminToken != ""
	if adminAvailable {
		adminAvailable = probeAdminReachable(projectID, config)
	}

	writeJSON(w, http.StatusOK, Capabilities{
		S3:     s3CapabilitiesFor(config.Type),
		Admin:  allAdminCapabilities(adminAvailable),
		S3URL:  config.S3URL,
		Region: config.Region,
	})
}

// clearCapabilityCaches vide les caches capacite (utilise par les tests).
func clearCapabilityCaches() {
	adminProbeCache.Clear()
}

func cacheKey(projectID uint, parts ...string) string {
	key := strconv.FormatUint(uint64(projectID), 10)
	for _, p := range parts {
		key += "|" + p
	}
	return key
}

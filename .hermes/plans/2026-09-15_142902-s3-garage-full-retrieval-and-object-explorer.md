# Récupération S3/Garage complète & Explorateur d'objets — Plan d'implémentation

> **For Hermes:** Use `subagent-driven-development` skill to implement this plan task-by-task.
> Plan précédent (Tier 0/Tier 1 UX, déjà livré et vérifié) : `.hermes/plans/ux-modernization.md`

**Goal :** Donner à Kexamanager une récupération S3/Garage **complète** (métadonnées de bucket et de cluster, quand l'API admin Garage est disponible) et une expérience de navigation buckets/objets comparable à Cloudflare R2 : vue d'ensemble avec compteurs d'objets et tailles, explorateur de fichiers avec dossiers, fiche objet avec métadonnées et aperçu.

**Architecture :** L'agrégation coûteuse se fait **côté proxy Go** (une seule requête front, cache TTL, concurrence bornée), pas dans le navigateur. Le front consomme un contrat stable (`/api/{project}/capabilities`, `/stats/*`, `/s3/*`) qui dégrade proprement quand seul du S3 est configuré. Les métadonnées d'objet ont deux sources : standard (S3 `HeadObject`) et Garage (admin `InspectObject`, pour le détail bloc/version).

**Tech Stack :** Go 1.27 + net/http + minio-go v7.3 + `golang.org/x/sync/errgroup` · React 19 + TypeScript 6 + MUI 9 + Vite 8 + i18next 26 · `bun test` (runner intégré, zéro dépendance ajoutée).

---

## 0. État vérifié du code (ne pas supposer, tout est mesuré)

| Élément | État réel | Source |
|---|---|---|
| Routage proxy | `/api/auth/*`, `/api/s3-configs*`, `/api/{project}/{v2\|s3\|logs}` | `api/cmd/proxy/main.go:373-405` |
| Proxy admin | Reverse proxy **transparent** vers `config.AdminURL` avec `Authorization: Bearer <AdminToken>` | `api/cmd/proxy/main.go` → `handleAdminProxy` |
| Admin non configuré | `400 Admin URL not configured for this project` | idem |
| Endpoints admin typés | **46** endpoints v2 déjà générés (GetBucketInfo, ListBuckets, InspectObject, GetClusterStatistics, GetNodeStatistics, LaunchRepairOperation, …) | `front/src/types/openapi.ts` |
| Client admin front | fonctions typées (`GetBucketInfo`, `GetClusterStatus`, `GetClusterHealth`, `GetClusterStatistics`, …) | `front/src/utils/apiWrapper.ts:33-140` |
| Handlers S3 | 7 : `list-buckets`, `list-objects`, `get-object`, `put-object`, `delete-object`, `create-bucket`, `delete-bucket` | `api/cmd/proxy/s3/*.go` |
| `list-objects` — **lacune majeure** | La requête n'a **ni `Delimiter`, ni `MaxKeys`, ni `ContinuationToken`** → tout le bucket est listé et les dossiers sont **synthétisés côté client** (préfixes bricolés `dir:` dans `ObjectsList.tsx:172`) | `api/cmd/proxy/s3/common.go:51-57` |
| `stat-object` / `HeadObject` | **Inexistant** → aucune métadonnée d'objet exploitable aujourd'hui | grep `StatObject\|HeadObject` sur `api/` = 0 |
| `copy-object` | **Inexistant** (le `CopyObjectDialog` du front est branché sur `onCopy={() => {}}`) | grep `CopyObject` sur `api/` = 0 |
| Suppression groupée | Le front boucle des `delete-object` unitaires | `S3Browser.tsx:292,438` |
| `GetBucketInfo` (admin) | Renvoie **`bytes`, `objects`, `quotas{maxObjects,maxSize}`, `keys[]`, `globalAliases[]`, `unfinishedMultipartUpload*`** → stats par bucket en 1 appel | `front/src/types/openapi.ts:1188-1236` |
| `ListBuckets` (admin) | Renvoie `{id, created, globalAliases, localAliases}` — **aucune stat** → l'agrégat cluster-wide est forcément en N+1 | `front/src/types/openapi.ts:1436-1441` |
| `InspectObject` (admin) | `{bucketId, key, versions[{blocks[{hash,offset,partNumber,size}], headers[[k,v]], etag, encrypted, deleteMarker, aborted}]}` → introspecteur bloc/version, spécifique Garage | `front/src/types/openapi.ts` |
| `GetClusterStatistics` | `{freeform: string}` → format à découvrir à l'exécution | `front/src/types/openapi.ts` |

### Compatibilité Garage (documentation officielle Deuxfleurs, vérifiée)

| Capacité | Garage | Conséquence pour ce plan |
|---|---|---|
| `HeadObject` | ✅ | Base des métadonnées d'objet (Content-Type, ETag, Last-Modified, `x-amz-meta-*`) |
| `ListObjects` / `ListObjectsV2` | ✅ | Explorateur par préfixe possible |
| `CopyObject` | ✅ | Action « copier vers… » possible |
| `DeleteObjects` (groupé) | ✅ | Suppression en masse possible nativement |
| URLs présignées | ✅ | Aperçu et upload directs possibles (déjà utilisés) |
| CORS | ✅ | Onglet Réglages possible |
| Lifecycle | ⚠️ partiel — **uniquement** `Expiration` et `AbortIncompleteMultipartUpload` | Onglet Réglages : exposer seulement ces 2 actions |
| **Versioning** | ❌ **absent** (stub qui répond toujours « désactivé ») | **Ne pas** construire d'UI de versions |
| **Object tagging** | ❌ absent (501) | **Ne pas** afficher d'onglet Tags |
| **Storage class** | ❌ absent | La colonne « Storage Class » de R2 n'a **pas** d'équivalent → afficher « — » |

### Ce que ce plan n'implémente PAS (et pourquoi)

- **Colonne « Storage Class »** comme dans R2 : Garage n'a pas de classes de stockage. La colonne existe, valeur `—`, mais aucun filtre/tri dessus.
- **Onglet « Metrics » par bucket avec courbes** (stockage moyen, Class A/B ops, Data Retrieved comme dans R2) : Garage **n'expose pas de série temporelle** par bucket. `GetClusterStatistics`/`GetNodeStatistics` renvoient du `freeform` agrégé cluster/nœud, et l'endpoint Prometheus `/metrics` exige le `metrics_token` (≠ `admin_token`). L'onglet s'appellera **« Statistiques »** et n'affichera que des valeurs **actuelles** (objets, octets, quota, répartition par nœud) + un état « historique indisponible sur Garage » plutôt que de fausses courbes.
- **Versioning / corbeille / tags d'objet** : non supportés par Garage.
- **Palette de commandes ⌘K, migration de données** (onglet « Data migration » de R2) : hors périmètre, à traiter plus tard (serveur-à-serveur, `rclone`-like).

---

## 1. Décisions d'architecture (tranchées ici — les sous-tâches ne les rediscutent pas)

**D1 — Capacité explicite, jamais de détection implicite.**
Nouveau `GET /api/{project}/capabilities`. Le front n'appelle un endpoint admin que si `capabilities.admin` est vrai. Règle unique de dégradation : **admin disponible → cluster-wide ; sinon → S3 seul**, avec mention visible dans l'UI (jamais de colonne vide silencieuse).

**D2 — L'agrégation est côté proxy, jamais côté navigateur.**
`ListBuckets` + N×`GetBucketInfo` (concurrence bornée à 8 via `errgroup.SetLimit`) = 1 appel front. Cache TTL en mémoire (30 s buckets, 15 s cluster), clé = `projectID`, invalidé à la mutation (création/suppression/alias). Pas de cache persistant : c'est un proxy, pas une base.

**D3 — Contrat d'API figé** (section 2). Les endpoints S3 gardent le style existant (`POST`, body JSON, `{keyId, token, configId}`) pour ne pas casser les handlers actuels ; les nouveaux endpoints d'agrégat sont sous `/stats/` et lisent la config côté serveur.

**D4 — Un dossier = un `CommonPrefix` S3, pas une convention client.**
Fini le préfixe `dir:` bricolé dans `ObjectsList.tsx`. Le proxy expose `objects[]` **et** `commonPrefixes[]` ; le front ne fait plus de groupement heuristique.

**D5-bis — Régression transitoire assumée (à ne pas oublier).** Le nouveau `list-objects` applique `maxKeys` (défaut 500) **aussi au listing récursif**, là où l'ancien endpoint chargeait tout le bucket. Tant que la Phase 3 n'a pas remplacé `S3Browser.tsx`, l'explorateur historique ne voit donc que la première page (500 objets) et ignore `nextContinuationToken`. C'est acceptable (l'ancien comportement était un problème de perf sur ~9,8 k objets) mais cela **doit** être résorbé par la Phase 3, pas oublié.

**D5 — Routes : une seule surface de navigation du stockage.**
- `/buckets` → **vue d'ensemble stockage** (ex-`Buckets.tsx`, enrichie).
- `/buckets/:bucketId?tab=objects|settings|stats` → **page bucket** (remplace l'écran monolithique `S3Browser.tsx`, 756 lignes).
- `/s3` → **redirige** vers `/buckets`. `S3Browser.tsx` et `ObjectsList.tsx` sont **supprimés** après migration (pas de doublon : c'était deux explorateurs pour la même donnée).
- Convention `?tab=` déjà utilisée par `/cluster?tab=…` (`Sidebar.tsx`), donc cohérente avec l'existant.

**D6 — Deux sources de métadonnées, jamais mélangées.**
- Standard, toujours : `stat-object` (S3 `HeadObject`) → taille, type MIME, ETag, dernière modification, `x-amz-meta-*`.
- Garage, si `capabilities.objectInspect` : `InspectObject` → version/blocs/hash/chiffrement, dans un panneau **« Placement »** explicitement étiqueté Garage.

**D7 — Dégradation testée, pas espérée.**
Deux configurations de dev : projet Garage (AdminURL + AdminToken) et projet S3 pur (sans AdminURL). Chaque phase de validation rejoue les deux.

**D8 — Réutilisation stricte de l'existant.**
`DataTable`, `PageHeader`, `EmptyState`, `ErrorState`, `LoadingState`, `useFeedback().notify`, `useProject()`, `formatBytes`/`formatDateTime` (`front/src/utils/format.ts`), thème MUI 9 à variables CSS. Aucun nouveau composant si l'existant couvre le besoin. Zéro texte en dur (i18n FR+EN en parité stricte, script de contrôle en CI locale).

---

## 2. Contrats d'API (gelés — implémenter exactement ça)

### 2.1 `GET /api/{project}/capabilities`

```json
{
  "admin": true,
  "bucketStats": true,
  "clusterStats": true,
  "objectInspect": true,
  "quotas": true,
  "website": true,
  "cors": true,
  "lifecycle": true,
  "versioning": false,
  "objectTagging": false,
  "storageClasses": false,
  "s3Url": "https://s3.example.com",
  "region": "garage"
}
```
`admin=false` ⇒ tous les autres `false` sauf `s3Url`/`region`. Détection : `config.AdminURL != "" && config.AdminToken != ""`, **confirmée** par un appel réel `GetClusterHealth` (résultat en cache 5 min) pour ne pas mentir si l'admin est injoignable.

### 2.2 `GET /api/{project}/stats/buckets` (cache 30 s)

```json
{
  "totals": { "buckets": 12, "objects": 10231, "bytes": 411592704, "objectsComplete": true, "bytesComplete": true },
  "buckets": [
    {
      "id": "b3a1…",
      "name": "bot-creator",
      "globalAliases": ["bot-creator"],
      "localAliases": [{ "accessKeyId": "GK…", "alias": "alias-local" }],
      "created": "2026-05-26T00:00:00Z",
      "objects": 3,
      "bytes": 310568960,
      "quotas": { "maxObjects": null, "maxSize": 5368709120 },
      "quotaUsagePercent": 5.8,
      "statsAvailable": true,
      "statsError": null,
      "unfinishedMultipartUploadParts": 0,
      "unfinishedMultipartUploadBytes": 0
    }
  ],
  "generatedAt": "2026-09-15T14:20:00Z",
  "stale": false
}
```
**Règles :** si `GetBucketInfo` échoue pour **un** bucket → `statsAvailable:false` + `statsError` localisé, et `totals.*Complete:false` (l'agrégat ne ment jamais). `name` = premier `globalAlias`, sinon `id`.

### 2.3 `GET /api/{project}/stats/cluster` (cache 15 s)

```json
{
  "health": { "status": "healthy", "connectedNodes": 3, "knownNodes": 3, "storageNodes": 3, "storageNodesOk": 3, "partitions": 256, "partitionsAllOk": 256, "partitionsQuorum": 256 },
  "layoutVersion": 12,
  "nodes": [{ "id": "…", "hostname": "…", "isUp": true, "draining": false, "zone": "dc1", "capacity": 1000000000, "dataPartition": [] }],
  "statistics": { "available": true, "raw": "…", "parsed": null },
  "generatedAt": "2026-09-15T14:20:00Z"
}
```

### 2.4 `POST /api/{project}/s3/list-objects` (contrat étendu, rétrocompatible)

Requête :
```json
{ "keyId": "…", "token": "…", "configId": 1, "bucket": "bot-creator",
  "prefix": "releases/v2/", "delimiter": "/", "maxKeys": 500, "continuationToken": "…" }
```
Réponse :
```json
{ "objects": [{ "key": "releases/v2/a.zip", "size": 121962496, "lastModified": "2026-09-14T21:36:41Z", "etag": "…", "contentType": "application/zip" }],
  "commonPrefixes": ["releases/v2/docs/"],
  "nextContinuationToken": "…", "isTruncated": true, "keyCount": 500,
  "totalSize": 411592704, "delimiter": "/" }
```
`delimiter` absent ou `""` ⇒ listing récursif (comportement actuel conservé). `totalSize` = somme des **objets listés** sur ce niveau (jamais extrapolée).

> **Mesuré le 15/09 sur le harnais MinIO :** `contentType` **n'est pas** renseigné par `ListObjectsV2` (S3 ne transporte pas le Content-Type dans un listing). Le champ reste donc présent au contrat mais généralement vide. Conséquence pour l'UI : la colonne « Type » de l'explorateur est **déduite de l'extension** (aucun appel réseau), et la valeur autoritative n'est affichée que dans la fiche objet, issue de `stat-object`. Ne jamais faire un `HEAD` par ligne (N+1 inacceptable sur un bucket de 9,8 k objets).

### 2.5 `POST /api/{project}/s3/stat-object`

Requête `{keyId, token, configId, bucket, key}` →
```json
{ "key": "…", "size": 121962496, "contentType": "application/zip", "etag": "…",
  "lastModified": "2026-09-14T21:36:41Z", "storageClass": "", 
  "metadata": { "x-amz-meta-owner": "jeremy" },
  "headers": { "cache-control": "…", "content-disposition": "…" } }
```

### 2.6 `POST /api/{project}/s3/copy-object`
Requête `{keyId, token, configId, sourceBucket, sourceKey, destinationBucket, destinationKey}` → `{success, etag}`.

### 2.7 `POST /api/{project}/s3/delete-objects` (groupé)
Requête `{keyId, token, configId, bucket, keys: ["a","b"]}` →
```json
{ "deleted": ["a"], "errors": [{ "key": "b", "code": "AccessDenied", "message": "…" }] }
```

---

## 3. Phases et tâches

Règle de granularité : **une tâche = une modification vérifiable en moins de 15 min**, toujours terminée par `bun run build` vert (front) ou `go build ./... && go vet ./...` vert (API).

### Phase 0 — Fondations (outillage + contrat + capacité)

#### Task 0.1 — Rendre l'outillage de vérification durable (repo, pas Temp)

**Objective :** Sortir les scripts de contrôle du dossier temporaire pour qu'ils soient versionnés et exécutables par n'importe qui.

**Files :**
- Create: `tools/i18n/check-parity.py` (actuel `%LOCALAPPDATA%\Temp\i18n-check.py`)
- Create: `tools/i18n/check-keys.py` (actuel `i18n-keys-used.py`)
- Create: `tools/e2e/browser-proof.cjs`, `tools/e2e/route-sweep.cjs` (actuels scripts CDP)
- Modify: `Makefile` (cibles `i18n-check`, `e2e-render`)

**Steps :**
1. Copier les 4 scripts dans `tools/` en remplaçant les chemins absolus `C:\Users\user\...` par une racine résolue (`Path(__file__).resolve().parents[2]`).
2. Ajouter au Makefile :
```make
i18n-check:
	python tools/i18n/check-parity.py && python tools/i18n/check-keys.py

e2e-render:
	node tools/e2e/browser-proof.cjs
	node tools/e2e/route-sweep.cjs
```
3. Vérifier : `make i18n-check` → `cles FR=428 EN=428` + `OK - 0 cle manquante`, exit 0.

**Commit :** `chore(tools): rendre durables les scripts i18n et de preuve navigateur`

#### Task 0.2 — Endpoint `/capabilities` (Go)

**Objective :** Exposer explicitement ce que la config du projet permet.

**Files :**
- Create: `api/cmd/proxy/capabilities.go`
- Modify: `api/cmd/proxy/main.go:402` (route avant `/api/`)

**Step 1 — le handler :**
```go
package main

import (
	"encoding/json"
	"net/http"
	"sync"
	"time"
)

// Capabilities décrit ce qui est réellement faisable pour un projet donné.
// admin=false ⇒ tous les autres drapeaux admin-sourcés sont false.
type Capabilities struct {
	Admin           bool   `json:"admin"`
	BucketStats     bool   `json:"bucketStats"`
	ClusterStats    bool   `json:"clusterStats"`
	ObjectInspect   bool   `json:"objectInspect"`
	Quotas          bool   `json:"quotas"`
	Website         bool   `json:"website"`
	Cors            bool   `json:"cors"`
	Lifecycle       bool   `json:"lifecycle"`
	Versioning      bool   `json:"versioning"`
	ObjectTagging   bool   `json:"objectTagging"`
	StorageClasses  bool   `json:"storageClasses"`
	S3URL           string `json:"s3Url"`
	Region          string `json:"region"`
}

type capsCacheEntry struct {
	caps     Capabilities
	expires  time.Time
}

var (
	capsMu    sync.Mutex
	capsCache = map[uint]capsCacheEntry{}
)

// HandleProjectCapabilities: GET /api/{project}/capabilities
func HandleProjectCapabilities(w http.ResponseWriter, r *http.Request, projectID uint, config s3.S3ConfigData) {
	// 1. admin declare ?
	caps := Capabilities{
		Admin:          config.AdminURL != "" && config.AdminToken != "",
		Versioning:     false, // Garage: non supporte (stub)
		ObjectTagging:  false, // Garage: 501
		StorageClasses: false, // Garage: notion inexistante
		S3URL:          config.S3URL,
		Region:         config.Region,
	}
	if caps.Admin {
		// 2. admin joignable ? (cache 5 min, on ne ment jamais sur la capacite)
		caps.Admin = probeAdminReachable(projectID, config) // GET /v2/GetClusterHealth
	}
	if caps.Admin {
		caps.BucketStats, caps.ClusterStats, caps.ObjectInspect = true, true, true
		caps.Quotas, caps.Website, caps.Cors, caps.Lifecycle = true, true, true, true
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(caps)
}
```
3. Route à ajouter dans `main.go` : dans `handleProjectRoutes`, traiter `endpointStart == "capabilities"` **avant** les autres services et appeler le handler avec `config`.
4. `probeAdminReachable(projectID, config)` fait un `GET {AdminURL}/v2/GetClusterHealth` avec le bearer admin, timeout 2 s ; résultat caché 5 min par `projectID` (ne jamais bloquer une requête front plus de 2 s).

**Vérification :**
```bash
cd api && CGO_ENABLED=1 go build ./... && go vet ./...
# live (projet Garage) :
curl -s -H "Authorization: Bearer $T" http://localhost:8080/api/1/capabilities | python -m json.tool
# live (projet S3 pur) : attendu admin=false partout
```
**Commit :** `feat(api): endpoint capabilities (admin Garage disponible ou non)`

#### Task 0.3 — Client front typé + hooks

**Objective :** Une couche d'accès unique pour le stockage, typée, cachée, réutilisable.

**Files :**
- Create: `front/src/api/storage.ts`
- Create: `front/src/api/types.ts`
- Create: `front/src/hooks/useCapabilities.ts`, `useStorageOverview.ts`, `useObjectListing.ts`
- Modify: `front/package.json` (script `test` → `bun test`)

**Step 1 — types :**
```ts
// front/src/api/types.ts
export interface Capabilities {
  admin: boolean; bucketStats: boolean; clusterStats: boolean; objectInspect: boolean;
  quotas: boolean; website: boolean; cors: boolean; lifecycle: boolean;
  versioning: boolean; objectTagging: boolean; storageClasses: boolean;
  s3Url: string; region: string;
}

export interface BucketStat {
  id: string; name: string; globalAliases: string[]; created: string;
  objects: number; bytes: number;
  quotas: { maxObjects: number | null; maxSize: number | null };
  quotaUsagePercent: number | null;
  statsAvailable: boolean; statsError: string | null;
}
export interface StorageOverview {
  totals: { buckets: number; objects: number; bytes: number; objectsComplete: boolean; bytesComplete: boolean };
  buckets: BucketStat[]; generatedAt: string; stale: boolean;
}
export interface ObjectEntry { key: string; size: number; lastModified: string; etag: string; contentType?: string }
export interface ObjectListing {
  objects: ObjectEntry[]; commonPrefixes: string[];
  nextContinuationToken?: string; isTruncated: boolean; keyCount: number; totalSize: number;
}
export interface ObjectStat {
  key: string; size: number; contentType: string; etag: string; lastModified: string;
  storageClass: string; metadata: Record<string, string>; headers: Record<string, string>;
}
```
**Step 2 — fonctions (source unique) :**
```ts
// front/src/api/storage.ts
export const getCapabilities = (projectId: number) => adminGet<Capabilities>(`/capabilities`, { projectId })
export const getStorageOverview = (projectId: number) => adminGet<StorageOverview>(`/stats/buckets`, { projectId })
export const listObjects = (projectId: number, body: ListObjectsBody) => s3ApiRequest<ObjectListing>('list-objects', body, projectId)
export const statObject  = (projectId: number, body: {bucket: string; key: string}) => s3ApiRequest<ObjectStat>('stat-object', body, projectId)
```
Les helpers existants (`adminGet`, `s3ApiRequest`) sont réutilisés — **ne pas** créer de second client HTTP.

**Step 3 — premier test unitaire (`bun test`) :**
```ts
// front/src/api/__tests__/storage.test.ts
import { describe, expect, test } from "bun:test";
import { buildPrefixPath, buildBreadcrumb, isPrefixEntry } from "../storage";

test("buildBreadcrumb découpe un préfixe S3 en segments cliquables", () => {
  expect(buildBreadcrumb("releases/v2/")).toEqual([
    { label: "releases", prefix: "releases/" },
    { label: "v2", prefix: "releases/v2/" },
  ]);
});
```
Exécuter : `cd front && bun test` → doit échouer (fonctions absentes), puis les implémenter, puis repasser au vert.

**Vérification :** `bun test` vert · `bun run build` vert · `bun run lint` 0 erreur.
**Commit :** `feat(front): couche d'accès stockage typée + premiers tests bun`

---

### Phase 1 — Récupération complète (proxy Go)

#### Task 1.1 — Agrégat `/stats/buckets` avec concurrence bornée et cache

**Objective :** Obtenir objets+taille+quota de **tous** les buckets en un appel front, sans jamais mentir si un sous-appel échoue.

**Files :**
- Create: `api/cmd/proxy/stats.go`
- Modify: `api/cmd/proxy/main.go` (route `stats`)
- Add dep: `golang.org/x/sync` (`go get golang.org/x/sync@latest`)

**Step 1 — cache générique d'abord (testable sans réseau) :**
```go
type ttlCache[T any] struct {
	mu   sync.Mutex
	data map[string]entry[T]
	ttl  time.Duration
}
type entry[T any] struct { v T; exp time.Time }

func (c *ttlCache[T]) Get(key string) (T, bool) { /* … */ }
func (c *ttlCache[T]) Set(key string, v T)      { /* … */ }
func (c *ttlCache[T]) Invalidate(key string)    { /* … */ }
```
**Test unitaire (`api/cmd/proxy/stats_test.go`) :** TTL expiré ⇒ `ok=false` ; `Invalidate` ⇒ immédiatement `ok=false`.

**Step 2 — handler :**
```go
func HandleBucketStats(w http.ResponseWriter, r *http.Request, projectID uint, config s3.S3ConfigData) {
	if cached, ok := bucketStatsCache.Get(key(projectID)); ok {
		writeJSON(w, cached); return
	}
	// 1. lister les buckets via l'admin (fallback S3 si admin absent)
	ids, err := adminListBuckets(config)          // POST /v2/ListBuckets
	if err != nil { jsonError(w, err.Error(), http.StatusBadGateway); return }

	// 2. stats par bucket en parallele, borne a 8
	stats := make([]BucketStat, len(ids))
	g, ctx := errgroup.WithContext(r.Context())
	g.SetLimit(8)
	for i, id := range ids {
		g.Go(func() error {
			info, err := adminGetBucketInfo(ctx, config, id)  // GET /v2/GetBucketInfo?id=…
			stats[i] = toBucketStat(id, info, err)            // err => statsAvailable=false, jamais de 0 trompeur
			return nil                                        // une erreur locale ne casse pas l'agregat
		})
	}
	_ = g.Wait()
	overview := aggregate(stats)  // totals + *Complete=false si un bucket a echoue
	overview.GeneratedAt = time.Now().UTC().Format(time.RFC3339)
	bucketStatsCache.Set(key(projectID), overview)
	writeJSON(w, overview)
}
```
**Step 3 — tests table-driven sur `aggregate` :** 3 buckets dont 1 en échec ⇒ `objects`/`bytes` = somme des 2 valides, `objectsComplete=false`.

**Vérification :**
```bash
cd api && CGO_ENABLED=1 go test ./... && go vet ./...
curl -s -H "Authorization: Bearer $T" http://localhost:8080/api/1/stats/buckets | python -m json.tool | head -40
```
Attendu : un `objects` par bucket **cohérent avec** `garage bucket info <nom>` côté serveur. Coller la sortie brute des deux dans le rapport.

**Commit :** `feat(api): agregat /stats/buckets (ListBuckets + GetBucketInfo parallele, cache 30s)`

#### Task 1.2 — Agrégat `/stats/cluster`

**Objective :** Exposer l'état cluster (santé, nœuds, layout, stats) en un appel, avec `freeform` traité honnêtement.

**Files :** Modify `api/cmd/proxy/stats.go`, `main.go`
**Steps :**
1. Appeler en parallèle : `GetClusterHealth`, `GetClusterStatus`, `GetClusterLayout`(version), `GetClusterStatistics`.
2. `GetClusterStatistics.freeform` → tenter `json.Unmarshal` dans `map[string]any` ; **si ça échoue, renvoyer `statistics.available=true, parsed=null, raw=<texte>`** et ne pas inventer de champs (`parsed` typé `any`).
3. `GetNodeStatistics` par nœud : **uniquement à la demande** (`?include=nodeStats`) car coûteux → évite de ralentir la page Cluster existante.
4. Cache 15 s.

**Vérification :** `curl …/stats/cluster` → `health.status` identique à `cluster.health` de l'app actuelle ; coller les deux sorties.
**Commit :** `feat(api): agregat /stats/cluster (sante, noeuds, layout, stats freeform)`

#### Task 1.3 — `list-objects` v2 : préfixes réels + pagination

**Objective :** Supprimer le bricolage de dossiers côté client et permettre la pagination sur les gros buckets (le bucket `config-bcm` réel contient ~9,8 k objets).

**Files :** Modify `api/cmd/proxy/s3/common.go:51-63`, `api/cmd/proxy/s3/list_objects.go`
**Step 1 — probe d'abord (TDD) :** écrire `api/cmd/proxy/s3/list_objects_integration_test.go` (build tag `//go:build integration`) qui, sur un bucket de test à 2 niveaux de préfixes, vérifie que le listing non récursif renvoie bien les `CommonPrefixes` attendus. Utiliser le **Core client** de minio-go :
```go
core := client.Core
res, err := core.ListObjectsV2(ctx, bucket, prefix, continuationToken, delimiter, maxKeys)
// res.Objects, res.Prefixes, res.IsTruncated, res.NextContinuationToken
```
> **À valider :** la disponibilité exacte de cette signature en minio-go v7.3. Si elle diffère, adapter l'adaptateur — **le contrat JSON de la section 2.4 ne change pas.**

**Step 2 — structs étendues :**
```go
type ListObjectsRequest struct {
	KeyId             string `json:"keyId"`
	Token             string `json:"token"`
	Bucket            string `json:"bucket"`
	Prefix            string `json:"prefix,omitempty"`
	Delimiter         string `json:"delimiter,omitempty"`
	MaxKeys           int    `json:"maxKeys,omitempty"`
	ContinuationToken string `json:"continuationToken,omitempty"`
	ConfigID          uint   `json:"configId"`
}

type ListObjectsResponse struct {
	Objects               []S3Object `json:"objects"`
	CommonPrefixes        []string   `json:"commonPrefixes"`
	NextContinuationToken string     `json:"nextContinuationToken,omitempty"`
	IsTruncated           bool       `json:"isTruncated"`
	KeyCount              int        `json:"keyCount"`
	TotalSize             int64      `json:"totalSize"`
	Delimiter             string     `json:"delimiter"`
}
```
`maxKeys` par défaut 500, plafonné à 1000. `S3Object` gagne `ContentType` (déjà renvoyé par `ObjectInfo.ContentType`).

**Vérification :** `go test ./...` + curl sur un préfixe réel à 2 niveaux : coller `objects`/`commonPrefixes`/`isTruncated`.
**Commit :** `feat(api): list-objects avec delimiter, maxKeys et continuation token`

#### Task 1.4 — `stat-object` (métadonnées)

**Files :** Create `api/cmd/proxy/s3/stat_object.go` (+ registration dans `init.go`/`main.go`)
**Code :**
```go
info, err := client.StatObject(r.Context(), req.Bucket, req.Key, minio.StatObjectOptions{})
// → info.Size, info.ContentType, info.ETag, info.LastModified, info.MetaData (map[string]string : x-amz-meta-*)
```
Mapper `info.MetaData` en `metadata` (clés `x-amz-meta-*` uniquement) et `headers` (`cache-control`, `content-disposition`, `content-encoding`).
**Vérification :** `stat-object` sur un objet connu → comparer taille/etag avec `ListObjects` (doivent être identiques) + uploader un objet avec un header `x-amz-meta-owner` et le retrouver dans la réponse.
**Commit :** `feat(api): stat-object (HeadObject) pour les metadonnees d'objet`

#### Task 1.5 — `copy-object` et `delete-objects`

**Files :** Create `api/cmd/proxy/s3/copy_object.go`, `api/cmd/proxy/s3/delete_objects.go`
`DeleteObjects` : `client.RemoveObjects(ctx, bucket, ch, minio.RemoveObjectsOptions{})` alimenté par un channel, résultats agrégés en `{deleted[], errors[]}` ; **jamais de 200 si tout a échoué** (200 seulement si au moins une clé supprimée, sinon 502 avec le détail).
**Vérification :** copier un objet puis `stat-object` sur la destination (même taille/ETag) ; supprimer 3 clés dont 1 inexistante → `deleted` contient 2 entrées.
**Commit :** `feat(api): copy-object et suppression groupee`

---

### Phase 2 — Vue d'ensemble stockage (UX buckets)

#### Task 2.1 — Colonnes Objets / Taille / Quota dans `/buckets`

**Files :** Modify `front/src/pages/dashboard/Buckets.tsx`
**Steps :**
1. Remplacer l'appel `list-buckets` par `useStorageOverview(projectId)` (Task 0.3) quand `capabilities.bucketStats` ; sinon garder l'appel S3 actuel.
2. Ajouter 3 colonnes au `DataTable` existant :
```tsx
{ id: "objects", header: t("buckets.col.objects"), align: "right", numeric: true,
  sortValue: (r) => r.objects, cell: (r) => r.statsAvailable ? r.objects.toLocaleString(i18n.language) : "—" },
{ id: "bytes", header: t("buckets.col.size"), align: "right", numeric: true,
  sortValue: (r) => r.bytes, cell: (r) => formatBytes(r.bytes, i18n.language) },
{ id: "quota", header: t("buckets.col.quota"), cell: (r) => <QuotaBar percent={r.quotaUsagePercent} /> },
```
3. `QuotaBar` : `LinearProgress` + libellé `x % de <taille>` ; si `quotaUsagePercent === null` ⇒ `—` (pas de barre à 0 %).
4. Si `capabilities.bucketStats === false` : les 3 colonnes **ne sont pas rendues** (pas de colonne vide) et un `Alert severity="info"` explique « Statistiques indisponibles : aucun accès admin Garage pour ce projet ».

**Vérification :** build + lint + `?` en navigateur via `make e2e-render` (le sweep doit montrer `tables=1`), et les deux modes (avec/sans admin).
**Commit :** `feat(buckets): compteurs d'objets, tailles et quotas (quand l'admin est disponible)`

#### Task 2.2 — Panneau « Usage » (équivalent R2 Usage)

**Files :** Create `front/src/pages/dashboard/components/StorageUsagePanel.tsx`, Modify `Buckets.tsx`
**Contenu :** total octets, total objets, nombre de buckets, top 5 buckets par taille (`LinearProgress` relative), alertes quota (buckets > 80 %).
**Vérification :** la somme du panneau == `totals.bytes` de `/stats/buckets` (comparer les deux valeurs dans le rapport).
**Commit :** `feat(buckets): panneau usage agrege`

#### Task 2.3 — i18n + états

Toutes les clés ajoutées en FR **et** EN (`buckets.col.*`, `storageUsage.*`), `make i18n-check` vert, `EmptyState`/`ErrorState` utilisés pour les modes dégradés.
**Commit :** `chore(i18n): cles du stockage`

---

### Phase 3 — Explorateur d'objets

#### Task 3.1 — Route `/buckets/:bucketId` avec onglets

**Files :** Create `front/src/pages/dashboard/BucketDetail.tsx`, Modify `App.tsx` (route + `RequireProject`), `Sidebar.tsx` (libellés), `DashboardLayout.tsx` (`routeTitleKeys`)
**Steps :** route protégée ; onglets via `?tab=objects|settings|stats` (même convention que `/cluster`) ; `PageHeader` avec `title` = nom du bucket, `subtitle` = `objects · taille`, `badge` = projet (via `useProject()`), `action` = Upload / Rafraîchir.
**Vérification :** `make e2e-render` → l'URL `/buckets/<id>?tab=objects` rend un `PageHeader` et une table.
**Commit :** `feat(buckets): page bucket avec onglets`

#### Task 3.2 — Explorateur par préfixe (fin du `dir:`)

**Files :** Create `front/src/pages/dashboard/components/ObjectExplorer.tsx`, Delete `front/src/pages/dashboard/S3Browser.tsx` + `components/ObjectsList.tsx` (après migration complète, dans un commit dédié)
**Steps :**
1. État local : `{ prefix, delimiter: "/", token, history[] }` ; `useObjectListing({projectId, bucket, prefix, token})`.
2. Lignes = `commonPrefixes` (type `prefix`) puis `objects` (type `object`), dossiers d'abord, tri secondaire par nom.
3. `key` de ligne = préfixe complet (jamais un `dir:` synthétique).
4. `DataTable` avec colonnes : Nom (icône dossier/fichier + **type déduit de l'extension**, jamais du listing qui ne transporte pas le Content-Type), Taille, Modifié, ETag (tronqué), Actions.
5. Sélection multiple : **les préfixes ne sont pas sélectionnables** (`isSelectable: (row) => row.kind === "object"`) — corrige le défaut relevé précédemment.
**Vérification :** navigateur réel : entrer dans `releases/`, revenir à la racine ; le sweep CDP confirme `lignes > 0` sur un bucket peuplé.
**Commit :** `feat(storage): explorateur par prefixe (dossiers S3 reels)`

#### Task 3.3 — Fil d'Ariane + tri + « Voir les préfixes comme dossiers »

**Steps :** `buildBreadcrumb(prefix)` (testé unitairement en Task 0.3) ; case à cocher (persistée en `localStorage`) qui, décochée, passe `delimiter: ""` (listing plat, comportement « tout voir »).
**Commit :** `feat(storage): fil d'ariane et bascule prefixes/dossiers`

#### Task 3.4 — Pagination réelle

Alimenter `nextContinuationToken` du `DataTable` ; afficher « X objets sur ce niveau, Y octets (cumul du niveau) » — **ne jamais** afficher un total de bucket extrapolé depuis un listing paginé : le total du bucket vient de `/stats/buckets`.
**Commit :** `feat(storage): pagination par continuation token`

#### Task 3.5 — Upload (file d'attente + glisser-déposer)

**Files :** Create `front/src/pages/dashboard/components/UploadQueue.tsx`
Réutiliser `put-object` (URL présignée) déjà éprouvé, avec `XMLHttpRequest` pour la progression par fichier ; `<input type="file" webkitdirectory>` pour les dossiers ; politique de conflit (écraser / ignorer / renommer) ; vitesse et temps restant ; annulation ; erreurs par fichier via `notify`.
**Vérification :** uploader 3 fichiers dont 1 de 20 Mo → progression par fichier, puis `list-objects` montre les 3 clés et `stat-object` les bonnes tailles.
**Commit :** `feat(storage): file d'upload avec progression par fichier`

---

### Phase 4 — Fiche objet (métadonnées R2-like)

#### Task 4.1 — Tiroir objet : « Détails de l'objet »

**Files :** Create `front/src/pages/dashboard/components/ObjectDetailsDrawer.tsx`
Champs : clé (copiable), taille, **type** (`contentType`), ETag, dernière modification, **Storage Class = `—`** (Garage n'en a pas — libellé i18n `storage.class_unavailable` avec tooltip explicatif), URL S3 (si base connue).
**Vérification :** ouvrir un objet réel → les valeurs doivent correspondre à `stat-object` (coller les deux).
**Commit :** `feat(storage): tiroir details d'objet`

#### Task 4.2 — « Métadonnées personnalisées »

Table `x-amz-meta-*` depuis `stat-object.metadata` ; si vide ⇒ `EmptyState size="inline"` « Aucune métadonnée personnalisée » (comme R2). Édition hors périmètre (S3 `CopyObject` sur soi-même requis) — **ne pas** promettre.
**Commit :** `feat(storage): affichage des metadonnees personnalisees`

#### Task 4.3 — Aperçu

Réutiliser `PreviewDialog`/`previewSession` (déjà fonctionnels, presigned URL) : image, PDF (iframe), vidéo, audio, texte tronqué, sinon « Aperçu indisponible » avec taille affichée.
**Commit :** `feat(storage): apercu objet unifie`

#### Task 4.4 — Panneau « Placement » (Garage, quand disponible)

Section repliable, **uniquement si `capabilities.objectInspect`** : `InspectObject` → versions, blocs (hash blake2, offset, partNumber, taille), chiffrement, marqueurs de suppression. Libellé explicite « Informations Garage » pour ne pas faire croire à une métadonnée S3 standard.
**Vérification :** ouvrir un objet multipart de 116 Mo (`releases/v2.1.16/…zip` vu dans la config réelle) → plusieurs blocs listés, somme des tailles == `size`.
**Commit :** `feat(storage): panneau placement Garage (InspectObject)`

---

### Phase 5 — Réglages bucket et actions (quand disponible)

#### Task 5.1 — Onglet « Réglages » : Général

Nom + alias globaux (ajout/suppression via `/v2/AddBucketAlias` / `RemoveBucketAlias`), ID, date de création, quotas (`maxSize`, `maxObjects` via `/v2/UpdateBucket`), clés ayant accès (`GetBucketInfo.keys` + `AllowBucketKey`/`DenyBucketKey`), site web statique (`websiteConfig`).
**Commit :** `feat(storage): reglages bucket (alias, quotas, acces, site web)`

#### Task 5.2 — CORS et cycle de vie (limités à ce que Garage supporte)

CORS (✅) : liste/ajout/suppression de règles. Lifecycle (⚠️) : **exposer uniquement** `Expiration` et `AbortIncompleteMultipartUpload`, avec un encart expliquant que Garage ne supporte pas les transitions de classe ni le versioning.
**Commit :** `feat(storage): CORS et cycle de vie (perimetre Garage)`

#### Task 5.3 — Vider / supprimer un bucket

« Vider » = listing paginé + `delete-objects` par lots de 1000 avec progression et compte supprimé ; « Supprimer » = `ConfirmDialog` exigeant la saisie du nom du bucket (pattern déjà en place ailleurs).
**Commit :** `feat(storage): vider et supprimer un bucket avec confirmation forte`

---

### Phase 6 — Vue cluster-wide

#### Task 6.1 — Onglet « Statistiques » du bucket + Top buckets cluster

Valeurs **actuelles** uniquement (objets, octets, quota, multipart en cours) + tableau « Répartition par nœud » (`GetNodeStatistics` freeform parsé si possible, sinon brut repliable). Mention explicite « Historique indisponible sur Garage » là où R2 affiche des courbes.
**Commit :** `feat(storage): statistiques actuelles et repartition par noeud`

#### Task 6.2 — Sélecteur de préfixe/objet transversal (recherche cluster)

Recherche d'une clé par préfixe sur tous les buckets autorisés (appels parallèles bornés à 4 buckets), résultats groupés par bucket. Utile pour le cas réel « où est ce fichier ? » sur plusieurs buckets.
**Commit :** `feat(storage): recherche d'objet multi-buckets`

---

## 4. Validation (à rejouer à chaque phase, commandes exactes)

**API (le build CGO est obligatoire : sqlite) :**
```bash
cd api && CGO_ENABLED=1 go build ./... && CGO_ENABLED=1 go vet ./... && CGO_ENABLED=1 go test ./...
# si le gcc local est cassé (cf. skill kexamanager-local-dev) : passer par le conteneur
docker run --rm -v "C:/Users/user/Code/kexamanager/api:/src" -w /src \
  -v kexa-go-mod:/go/pkg/mod golang:1.27-alpine \
  sh -c "apk add --no-cache gcc musl-dev sqlite-dev && go build ./... && go test ./..."
```

**Front :**
```bash
cd front && bun run lint && bun test && bun run build && cd .. && make i18n-check
```

**E2E réel (les deux modes, c'est le cœur de « quand disponible ») :**
```bash
make dev-api                                   # API sur :8080
cd front && bun dev                            # front sur :5173
# etat frais obligatoire si les dependances ont bouge :
rm -rf front/node_modules/.vite
node tools/e2e/browser-proof.cjs               # login + rendu + capture
node tools/e2e/route-sweep.cjs                 # toutes les routes : tables/lignes/recherche/erreurs JS
```

**Critères d'acceptation par phase :**
| Phase | Critère mesurable |
|---|---|
| 0 | `curl …/capabilities` renvoie `admin:true` sur un projet Garage et `admin:false` sur un projet S3 pur |
| 1 | `objects`/`bytes` de `/stats/buckets` **identiques** à `garage bucket info <nom>` pour 3 buckets |
| 1 | `list-objects` avec `delimiter=/` sur un préfixe à 2 niveaux renvoie les `commonPrefixes` attendus |
| 2 | la somme du panneau Usage == `totals.bytes` ; en mode S3 pur, aucune colonne vide (colonnes masquées) |
| 3 | l'explorateur descend `releases/` → `v2.1.16/` → fichier sans aucun appel hors contrat |
| 4 | fiche objet : valeurs == `stat-object` ; panneau Garage : somme(blocs) == taille |
| 5 | vider un bucket de test supprime exactement N objets, `delete-objects` rapportant 0 erreur |
| 6 | recherche d'une clé connue la retrouve dans le bon bucket |

---

## 5. Risques, dette et questions ouvertes

**Risques techniques**
1. **N+1 sur `GetBucketInfo`** : avec beaucoup de buckets (30+), l'agrégat coûte N appels admin. Mitigation : concurrence 8 + cache 30 s + `stale-while-revalidate` (servir le cache périmé pendant le rafraîchissement). À surveiller : compte de buckets réel chez Jérémy.
2. **`GetClusterStatistics.freeform`** : format non garanti. Traitement imposé : jamais de parsing optimiste, `raw` toujours renvoyé, `parsed` optionnel. Si le contenu se révèle inexploitable, la vue cluster reste telle qu'aujourd'hui.
3. **minio-go `ListObjectsV2`** : signature à confirmer en v7.3 (task 1.3 step 1, probe avant implémentation). Le **contrat JSON** ne dépend pas de la signature interne.
4. **Gros buckets** (~9,8 k objets constatés) : sans `maxKeys`, l'ancien endpoint chargeait tout. La pagination est donc une correction de perf, pas un confort.
5. **Pas de tests Go aujourd'hui** : les phases 1 introduisent `go test` (httptest + table-driven). C'est un prérequis, pas un bonus.
6. **Fichier `DataTable.tsx` à ~430 lignes** (dette déjà notée) : l'explorateur va lui demander une ligne extensible ou un rendu de ligne custom. **Décider avant la phase 3** : soit extraire `DataTableToolbar`/`DataTableHead`, soit accepter une prop `renderRow`. Recommandé : extraire d'abord, ajouter ensuite.

**Dette assumée**
- Pas de versioning, tags, storage classes : limitation Garage, documentée dans l'UI (tooltip), pas contournée.
- Pas de métriques temporelles : Garage n'a pas d'API de série temporelle ; l'onglet s'appelle « Statistiques » et l'assume.
- Édition des métadonnées personnalisées : possible seulement via un copy-on-self ; hors périmètre tant que ce n'est pas demandé.

**Questions ouvertes (à trancher par Jérémy avant la phase 2)**
1. **Environnement de recette** : il faut **une URL admin Garage + un admin token** (et idéalement un bucket de test jetable) pour les critères d'acceptation des phases 1, 4, 5, 6. Sans ça, ces phases ne peuvent être validées qu'en mode S3 pur.
2. **Devise de l'agrégat** : `/stats/buckets` doit-il mettre en cache **aussi** en cas d'erreur admin (pour ne pas marteler un admin down) ? Proposition : oui, cache négatif 30 s.
3. **Navigation** : confirmer la suppression de l'entrée « Navigateur S3 » de la sidebar au profit de `/buckets/:id` (D5) — c'est un changement de parcours visible.
4. **Retour arrière** : veut-on garder `/s3` comme alias permanent ou le retirer après une version ?

---

## 7. Amendement 15/09 (demande Jérémy) — « toutes les stats S3, et Garage en plus »

**Demande :** afficher côté front **toutes** les statistiques obtenables sur un bucket **sans Garage**
(via l'API S3), masquer ce que Garage ne peut pas fournir, et l'afficher **quand** Garage est disponible.

### D9 — `/capabilities` expose DEUX groupes (contrat remplaçant le plat actuel)

```json
{
  "s3": {
    "versioning": true, "tagging": true, "lifecycle": true, "cors": true,
    "location": true, "encryption": true, "storageClasses": true
  },
  "admin": {
    "available": true, "bucketUsage": true, "quotas": true, "multipart": true,
    "bucketKeys": true, "objectInspect": true, "clusterStats": true, "website": true
  },
  "s3Url": "http://…", "region": "garage"
}
```
Règles : `type == "garage"` => `s3.versioning/tagging/storageClasses = false` (limites Garage documentées),
le reste `true` ; `admin.* = false` si pas d'AdminURL/Token (comme aujourd'hui, sonde réelle 5 min).
`type == "s3"` => `s3.*` déclarés `true` (**déclaratif** : c'est le bucket qui tranche, voir D11) et `admin.* = false`.

### D10 — `POST /api/{project}/s3/bucket-usage` (stats 100 % S3, sans admin)

Marche paginée `ListObjectsV2` par bucket, bornée, avec cache TTL 60 s :

```json
requête  : { "keyId": "", "token": "", "configId": 1, "buckets": ["a","b"], "maxObjectsPerBucket": 5000, "maxBuckets": 20 }
réponse  : {
  "totals": { "buckets": 3, "objects": 7, "bytes": 13800000, "objectsComplete": true, "bucketsComplete": true },
  "buckets": [ { "name": "bot-creator", "objects": 5, "bytes": 13200000, "complete": true,
                 "prefixes": 3, "storageClasses": { "STANDARD": { "objects": 5, "bytes": 13200000 } }, "error": null } ],
  "generatedAt": "…", "stale": false
}
```
Boucle impossible à faire déraper : `maxObjectsPerBucket` (défaut 5000) et `maxBuckets` (défaut 20) ;
au-delà, le bucket est marqué `complete:false` et les `totals.*Complete` passent à `false`. Le front affiche `≥`.

### D11 — `POST /api/{project}/s3/bucket-config` (ce que le bucket S3 dit de lui-même)

Chaque fonctionnalité est sondée **indépendamment** ; le front masque celles qui répondent `supported:false` :

```json
{ "bucket": "x" }
→ {
  "bucket": "x",
  "location":   { "supported": true, "value": "us-east-1", "error": null },
  "versioning": { "supported": true, "value": "Enabled",   "error": null },
  "tagging":    { "supported": true, "value": {"env":"dev"}, "error": null },
  "lifecycle":  { "supported": true, "value": 2, "error": null },
  "cors":       { "supported": true, "value": {"rules": 1}, "error": null },
  "encryption": { "supported": false, "value": null, "error": "NotImplemented" }
}
```

### D12 — Règles d'affichage (masquer / montrer)

| Élément | Source | Affiché quand |
|---|---|---|
| Colonnes `Objets` / `Taille` | S3 (`bucket-usage`) | **toujours** (`≥` si `complete:false`) |
| Colonne `Quota` + barre | Garage admin | `admin.quotas` |
| Panneau « Usage du stockage » | Garage admin (autoritatif) sinon S3 (somme), avec mention de la source | toujours, source affichée |
| Versioning / tags / lifecycle / CORS / région / chiffrement | S3 (`bucket-config`) | par fonctionnalité : seulement si `supported:true` |
| Multipart en cours, clés/permissions, inspection bloc/version, stats cluster | Garage admin | `admin.*` correspondant |
| `/buckets` | — | **tous les types de projet** : la redirection `isS3Only` vers `/s3` est supprimée |

### Tâches additionnelles (à exécuter dans la vague en cours)

- **A1 (Go)** : `/capabilities` v2 (2 groupes) ; `s3/bucket-usage` ; `s3/bucket-config` ; tests unitaires (mapping,
  bornes du cap, agrégation partielle) + tests d'intégration contre le harnais S3 (versioning activé/désactivé,
  tags posés/absents, feature non supportée).
- **F1 (Front)** : types + hooks du nouveau contrat ; `/buckets` unifié pour tous les types avec masquage par source ;
  suppression de la redirection `isS3Only` dans `App.tsx` ; panneau d'usage avec mention de la source ; clés i18n FR/EN.
- **F2 (plus tard, Phase 5)** : sections de réglages du bucket alimentées par `bucket-config`.

---

## 8. Amendement 2 - corrige apres preuve navigateur (2 bugs reels)

### 8.1 `bucket-config` confondait "non configure" et "non supporte"
`NoSuchTagSet`, `NoSuchLifecycleConfiguration`, `NoSuchCORSConfiguration`,
`ServerSideEncryptionConfigurationNotFoundError` etaient annonces
`supported=false` : le front aurait donc MASQUE une section que le backend
sert parfaitement, en perdant une information disponible. Corrige par
`isEmptyConfigState` (`api/cmd/proxy/s3/bucket_config.go`) : ces codes
renvoient `supported=true` avec une valeur vide (`{}`, `0`, `{rules:0}`).
`supported=false` est desormais reserve a une indisponibilite reelle
(`NotImplemented`/501) ou a une lecture refusee (`AccessDenied`), qui porte
toujours un diagnostic. Les 2 tests unitaires qui encodaient l'ancienne
intention ont ete reecrits (`bucket_config_test.go`) et un test dedie ajoute
(`bucket_config_state_test.go`).

### 8.2 Le chemin S3 pur dependait de l'API d'administration
`/buckets` listait les buckets via `GET /v2/ListBuckets` (endpoint admin) :
impossible a servir sur un projet sans admin Garage, d'ou une ligne
"Impossible de charger" et une alerte "aucune source". Deux corrections :
1. Le listing d'un projet sans agregat admin vient de l'API S3
   (`POST /s3/list-buckets`) via le nouveau `listS3Buckets` (`api/storage.ts`).
2. Le portail client `hasStoredS3Credentials()` est supprime : le proxy resout
   deja la paire de cles depuis la configuration du projet
   (`s3/common.go:GetS3Credentials`, override par creds de requete reserve a
   `garage`). Exiger des identifiants dans le navigateur bloquait un appel que
   le proxy sait servir.
Consequence : `StatsSources.counters` n'est plus nullable. Il n'existe plus
d'etat "aucune source" ; l'echec reel du balayage S3 s'affiche via
`buckets.stats.usage_error`, et les cles `buckets.stats.unavailable` /
`unavailable_desc` (branche inatteignable) ont ete supprimees des 2 locales.

### 8.3 Preuve (navigateur, 2 projets, memes donnees)
| | S3 pur (MinIO) | Garage (mock admin) |
|---|---|---|
| Colonnes | ID, Alias, Date, **Objets, Taille**, Actions | + **Quota** |
| Source affichee | "calcul S3" | "Garage (admin)" |
| Objets/Taille | `1` / `292.97 Kio` (balayage borne) | identique (agregat admin) |
| Erreurs JS | 0 | 0 |
Tests : `go build`/`vet` verts, unitaires + **integration MinIO** verts ; front
36 tests verts (dont integration live contre l'API reelle), lint 0, build OK,
i18n 449/449. Captures : `%TEMP%/kexa-artifacts/buckets-p1.png` et `buckets-p2.png`.

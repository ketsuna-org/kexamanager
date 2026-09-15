<div align="right">English • Français</div>

# Kexamanager

React + TypeScript app (Vite) with a Go reverse proxy for API routing and S3 operations.

The frontend uses Vite for development. To mimic Vite's `server.proxy` behavior without running Vite (e.g., local production preview or integration), a Go proxy is provided mirroring `front/vite.config.ts` rules.

Repository layout:
- Frontend: `front/`
- Go proxy: `api/cmd/proxy/` (Go module root is `api/`)

## English

### Prerequisites
- Node.js 24 LTS or newer
- `bun` 1.4+ (the only package manager used by this repo)
- Go 1.27+ (or compatible with the repo's `go.mod`)
- A C compiler for cgo — required by the sqlite driver (`gcc` + sqlite headers). Not needed if you run the proxy through `make dev-api` / Docker.

### Environment variables
**Required:**
- `PORT` — Port for the application server (default: 7400)
- `PASSWORD` — Admin password for the `root` account (default: `admin` when unset)

### Local development

Frontend (Vite dev server, hot reload) — proxies `/api` to `http://localhost:8080`:
```bash
cd front
bun install
bun dev          # http://localhost:5173
```

Go proxy — the simplest path, works even without a local C toolchain:
```bash
make dev-api     # builds and runs the proxy in a container on http://localhost:8080
```

Native alternative (requires a working cgo toolchain):
```bash
cd api
PORT=8080 PASSWORD=your-admin-password go run ./cmd/proxy
```

Sign in at `http://localhost:5173` with `root` / `PASSWORD`.

Quick verification:
```bash
curl -s http://localhost:8080/health
curl -s -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"root","password":"admin"}'
```

Endpoints:
- `GET /health` — health check
- Reverse proxy: `"/api/admin"`
- S3 operations: `"/api/s3/*"` (bucket and object management)

#### S3 API Endpoints
The proxy provides direct S3 operations through secure endpoints:
- `POST /api/s3/list-buckets` — List all S3 buckets
- `POST /api/s3/create-bucket` — Create a new S3 bucket
- `POST /api/s3/delete-bucket` — Delete an S3 bucket
- `POST /api/s3/list-objects` — List objects in a bucket
- `POST /api/s3/get-object` — Get presigned URL for downloading/viewing an object
- `POST /api/s3/put-object` — Upload an object directly through the proxy (32MB limit)
- `POST /api/s3/delete-object` — Delete an object from a bucket

All S3 endpoints require authentication via `keyId` and `token` in the request body.

### Production build
```bash
make build       # frontend into output/public, then the Go binary into output/bin/proxy
```
Serve `output/public` with your web server of choice and configure a proxy (Nginx, Caddy, Traefik, or the Go proxy) to route `"/api/*"` to your backends. `make build` requires a cgo toolchain for the Go part; `make build-front` builds the frontend alone.

### Docker deployment (recommended)

#### Quick start with Docker
```bash
# Pull the latest multi-arch image (supports ARM64/AMD64)
docker pull ghcr.io/ketsuna-org/kexamanager:latest

# Run with your configuration
docker run -d \
  --name kexamanager \
  -p 7400:7400 \
  -e PORT=7400 \
  -e PASSWORD="your-admin-password" \
  ghcr.io/ketsuna-org/kexamanager:latest
```

#### Docker Compose example
Create a `docker-compose.yml`:
```yaml
services:
  kexamanager:
    image: ghcr.io/ketsuna-org/kexamanager:latest
    ports:
      - "7400:7400"
    volumes:
      - ./data:/app/data
    environment:
      - PORT=7400
      - PASSWORD=your-admin-password
    restart: unless-stopped
```

Then run:
```bash
docker compose up -d
```

> The repository itself carries no `docker-compose.yml`: the CI workflow runs `docker compose pull/up` on the server from the checkout directory, so a local compose file would hijack the production deployment.

#### Available Docker tags
- `ghcr.io/ketsuna-org/kexamanager:latest` — Latest stable release
- `ghcr.io/ketsuna-org/kexamanager:<git-sha>` — Commit-tagged image

#### Supported architectures
- `linux/amd64` (Intel/AMD x64)
- `linux/arm64` (ARM64, including Raspberry Pi 4/5)

Access the application at `http://localhost:7400` after startup.

### Troubleshooting
- Ensure all **required** environment variables are set: `PORT` and `PASSWORD`.
- The sqlite driver needs cgo. If the proxy panics at startup with `go-sqlite3 requires cgo to work. This is a stub`, your `go env CGO_ENABLED` is `0`: rebuild with `CGO_ENABLED=1`, or use `make dev-api`.
- Provide an auth token in localStorage under the key `"kexamanager:token"` if your API requires it (see `front/src/utils/adminClient.ts`).
- S3 operations (upload, download, preview) go through the Go proxy at `/api/s3/*` endpoints.

### Useful scripts (frontend)
From `front/`:
- `bun dev` — Vite dev server
- `bun run build` — production build (`tsc -b && vite build`)
- `bun run preview` — preview built artifacts
- `bun run lint` — lint
- `bun run generate:openapi` — regenerate the Garage admin API types

---

## Français

### Présentation
Application React + TypeScript (Vite) avec un proxy Go pour router les appels API et les opérations S3.

Le frontend utilise Vite en développement. Pour reproduire le comportement de `server.proxy` de Vite sans lancer Vite (ex: prévisualisation locale ou intégration), un proxy Go est fourni et reflète les règles de `front/vite.config.ts`.

### Prérequis
- Node.js 24 LTS ou plus récent
- `bun` 1.4+ (seul gestionnaire de paquets du repo)
- Go 1.27+ (ou compatible avec le `go.mod` du repo)
- Un compilateur C pour cgo — requis par le driver sqlite (`gcc` + en-têtes sqlite). Inutile si vous passez par `make dev-api` / Docker.

### Variables d'environnement
**Obligatoires:**
- `PORT` — Port du serveur d'application (par défaut: 7400)
- `PASSWORD` — Mot de passe administrateur du compte `root` (défaut: `admin` si non défini)

### Démarrage en local

Frontend (serveur de dev Vite, rechargement à chaud) — proxifie `/api` vers `http://localhost:8080` :
```bash
cd front
bun install
bun dev          # http://localhost:5173
```

Proxy Go — le chemin le plus simple, fonctionne même sans outillage C local :
```bash
make dev-api     # construit et lance le proxy dans un conteneur sur http://localhost:8080
```

Alternative native (nécessite une toolchain cgo fonctionnelle) :
```bash
cd api
PORT=8080 PASSWORD=votre-mot-de-passe go run ./cmd/proxy
```

Connexion sur `http://localhost:5173` avec `root` / `PASSWORD`.

Vérification rapide :
```bash
curl -s http://localhost:8080/health
curl -s -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"root","password":"admin"}'
```

Points exposés :
- `GET /health` — vérification rapide
- Reverse proxy : `"/api/admin"`
- Opérations S3 : `"/api/s3/*"` (gestion des buckets et objets)

#### Points de terminaison API S3
Le proxy fournit des opérations S3 directes via des endpoints sécurisés :
- `POST /api/s3/list-buckets` — Lister tous les buckets S3
- `POST /api/s3/create-bucket` — Créer un nouveau bucket S3
- `POST /api/s3/delete-bucket` — Supprimer un bucket S3
- `POST /api/s3/list-objects` — Lister les objets dans un bucket
- `POST /api/s3/get-object` — Obtenir une URL présignée pour télécharger/visualiser un objet
- `POST /api/s3/put-object` — Télécharger un objet directement via le proxy (limite 32 Mo)
- `POST /api/s3/delete-object` — Supprimer un objet d'un bucket

Tous les endpoints S3 nécessitent une authentification via `keyId` et `token` dans le corps de la requête.

### Build de production
```bash
make build       # frontend dans output/public, puis le binaire Go dans output/bin/proxy
```
Servez `output/public` avec votre serveur web et configurez un proxy (Nginx, Caddy, Traefik, ou le proxy Go) pour router `"/api/*"` vers vos backends. `make build` exige une toolchain cgo pour la partie Go ; `make build-front` ne construit que le frontend.

### Déploiement Docker (recommandé)

#### Démarrage rapide avec Docker
```bash
# Télécharger l'image multi-arch (supporte ARM64/AMD64)
docker pull ghcr.io/ketsuna-org/kexamanager:latest

# Lancer avec votre configuration
docker run -d \
  --name kexamanager \
  -p 7400:7400 \
  -e PORT=7400 \
  -e PASSWORD="votre-mot-de-passe-admin" \
  ghcr.io/ketsuna-org/kexamanager:latest
```

#### Exemple Docker Compose
Créez un fichier `docker-compose.yml` :
```yaml
services:
  kexamanager:
    image: ghcr.io/ketsuna-org/kexamanager:latest
    ports:
      - "7400:7400"
    volumes:
      - ./data:/app/data
    environment:
      - PORT=7400
      - PASSWORD=votre-mot-de-passe-admin
    restart: unless-stopped
```

Puis lancez :
```bash
docker compose up -d
```

> Le dépôt ne contient volontairement pas de `docker-compose.yml` : le workflow CI exécute `docker compose pull/up` sur le serveur depuis le dossier du repo, un compose local détournerait donc le déploiement de production.

#### Tags Docker disponibles
- `ghcr.io/ketsuna-org/kexamanager:latest` — Dernière version stable
- `ghcr.io/ketsuna-org/kexamanager:<sha-git>` — Image taguée par commit

#### Architectures supportées
- `linux/amd64` (Intel/AMD x64)
- `linux/arm64` (ARM64, incluant Raspberry Pi 4/5)

Accédez à l'application sur `http://localhost:7400` après le démarrage.

### Dépannage
- Vérifiez que toutes les variables d'environnement **obligatoires** sont définies : `PORT` et `PASSWORD`.
- Le driver sqlite nécessite cgo. Si le proxy panique au démarrage avec `go-sqlite3 requires cgo to work. This is a stub`, votre `go env CGO_ENABLED` vaut `0` : recompilez avec `CGO_ENABLED=1`, ou utilisez `make dev-api`.
- Fournissez un token d'authentification dans le localStorage sous la clé `"kexamanager:token"` si nécessaire (cf. `front/src/utils/adminClient.ts`).
- Les opérations S3 (upload, téléchargement, aperçu) passent par le proxy Go aux endpoints `/api/s3/*`.

### Scripts utiles (frontend)
Depuis `front/` :
- `bun dev` — serveur de dev Vite
- `bun run build` — build de production (`tsc -b && vite build`)
- `bun run preview` — prévisualisation du build
- `bun run lint` — lint
- `bun run generate:openapi` — régénère les types de l'API admin Garage

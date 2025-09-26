<div align="right">English • Français</div>

# Kexamanager

React + TypeScript app (Vite) with a Go reverse proxy to route API calls to Garage (Admin API, public S3 API, and S3 operations).

The frontend uses Vite for development. To mimic Vite's `server.proxy` behavior without running Vite (e.g., local production preview or integration), a Go proxy is provided mirroring `front/vite.config.ts` rules.

Repository layout:
- Frontend: `front/`
- Go proxy: `api/cmd/proxy/`

## English

### Prerequisites
- Node.js 18+ (recommended) and `npm` or `bun`
- Go 1.22+ (or compatible with the repo’s `go.mod`)

### Environment variables (Garage)
Used by Vite (dev) and by the Go proxy to reach Garage:

**Required:**
- `PORT` — Port for the application server (default: 7400)
- `VITE_API_ADMIN_URL` — target for `"/api/admin"` (Garage Admin API)
- `GARAGE_S3_URL` — S3-compatible endpoint for file operations

**Optional:**
- `MAX_UPLOAD_MEMORY` — Maximum memory for file uploads in bytes (default: 268435456 = 256MB)

Examples (adjust to your Garage deployment base paths):
```
PORT=7400
VITE_API_ADMIN_URL=https://localhost:9000/admin     # Garage Admin API
GARAGE_S3_URL=https://localhost:9000               # Garage S3 endpoint
MAX_UPLOAD_MEMORY=536870912                         # 512MB upload limit (optional)
```

Note: the Go proxy disables TLS verification (equivalent to Vite `secure: false`). For development only.

### Development (Frontend via Vite)
```bash
cd front
export VITE_API_ADMIN_URL="https://localhost:9000/admin"   # Garage Admin API
npm install
npm run dev
```
This serves the app at `http://localhost:5173` (default Vite port). Requests to `"/api/admin"` and `"/api/s3"` are proxied by Vite.

### Run the Go proxy (alternative or preview)
The proxy mirrors `vite.config.ts` rules and listens on `:8080` by default.
```bash
export VITE_API_ADMIN_URL="https://localhost:9000/admin"   # Garage Admin API
go run ./api/cmd/proxy
```
Options:
- `PORT` or `-port` to change the listening port (e.g. `-port 3000`).

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

### Production build (frontend)
```bash
cd front
npm install
npm run build
```
Artifacts are generated in `front/dist`. Serve this directory with your web server of choice and configure a proxy (Nginx, Caddy, Traefik, or the Go proxy) to route `"/api/*"` to your backends.

### Docker deployment (recommended)

#### Quick start with Docker
```bash
# Pull the latest multi-arch image (supports ARM64/AMD64)
docker pull ghcr.io/ketsuna-org/kexamanager:latest

# Run with your Garage configuration
docker run -d \
  --name kexamanager \
  -p 7400:7400 \
  -e PORT=7400 \
  -e VITE_API_ADMIN_URL="https://your-garage.example.com/admin" \
  -e GARAGE_S3_URL="https://your-garage.example.com" \
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
    environment:
      - PORT=7400
      - VITE_API_ADMIN_URL=https://your-garage.example.com/admin
      - GARAGE_S3_URL=https://your-garage.example.com
    restart: unless-stopped
```

Then run:
```bash
docker-compose up -d
```

#### Available Docker tags
- `ghcr.io/ketsuna-org/kexamanager:latest` — Latest stable release
- `ghcr.io/ketsuna-org/kexamanager:v1.0.1` — Specific version

#### Supported architectures
- `linux/amd64` (Intel/AMD x64)
- `linux/arm64` (ARM64, including Raspberry Pi 4/5)

Access the application at `http://localhost:7400` after startup.

### Troubleshooting
- Ensure all **required** environment variables are set: `PORT`, `VITE_API_ADMIN_URL`, and `GARAGE_S3_URL`.
- Ensure `VITE_API_ADMIN_URL` and `GARAGE_S3_URL` point to valid `http/https` endpoints.
- For self-signed certificates, the Go proxy already skips TLS verification (dev only).
- Provide an auth token in localStorage under the key `"kexamanager:token"` if your API requires it (see `front/src/utils/adminClient.ts`).
- **New:** S3 operations (upload, download, preview) are now handled through the Go proxy at `/api/s3/*` endpoints, providing enhanced security without exposing direct S3 URLs.

### Useful scripts (frontend)
From `front/`:
- `npm run dev` — Vite dev server
- `npm run build` — production build
- `npm run preview` — preview built artifacts
- `npm run lint` — lint

---

## Français

### Présentation
Application React + TypeScript (Vite) avec un proxy Go pour router les appels API vers Garage (Admin API, API S3 publique et opérations S3).

Le frontend utilise Vite en développement. Pour reproduire le comportement de `server.proxy` de Vite sans lancer Vite (ex: prévisualisation locale ou intégration), un proxy Go est fourni et reflète les règles de `front/vite.config.ts`.

### Prérequis
- Node.js 18+ (recommandé) et `npm` ou `bun`
- Go 1.22+ (ou compatible avec le `go.mod` du repo)

### Variables d’environnement (Garage)
Utilisées par Vite (dev) et par le proxy Go pour joindre Garage:

**Obligatoires:**
- `PORT` — Port du serveur d'application (par défaut: 7400)
- `VITE_API_ADMIN_URL` — cible des appels `"/api/admin"` (Garage Admin API)
- `GARAGE_S3_URL` — Endpoint S3-compatible pour les opérations sur fichiers

**Optionnelles:**
- `MAX_UPLOAD_MEMORY` — Mémoire maximale pour les téléchargements en octets (par défaut: 268435456 = 256MB)

Exemples (adaptez selon les chemins de base de votre déploiement Garage):
```
PORT=7400
VITE_API_ADMIN_URL=https://localhost:9000/admin     # Admin API Garage
GARAGE_S3_URL=https://localhost:9000               # Endpoint S3 Garage
MAX_UPLOAD_MEMORY=536870912                         # Limite de 512MB (optionnel)
```

Note : le proxy Go ignore la vérification TLS (équivalent `secure: false` dans Vite). À utiliser uniquement en développement.

### Démarrage (Frontend via Vite)
```bash
cd front
export VITE_API_ADMIN_URL="https://localhost:9000/admin"   # Admin API Garage
npm install
npm run dev
```
L’application est servie sur `http://localhost:5173` (port par défaut de Vite). Les requêtes `"/api/admin"` et `"/api/s3"` sont proxifiées par Vite.

### Lancer le proxy Go (alternative/prévisualisation)
Le proxy reflète les règles de `vite.config.ts` et écoute par défaut sur `:8080`.
```bash
export VITE_API_ADMIN_URL="https://localhost:9000/admin"   # Admin API Garage
go run ./api/cmd/proxy
```
Options :
- `PORT` ou `-port` pour changer le port d’écoute (ex: `-port 3000`).

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

### Build de production (frontend)
```bash
cd front
npm install
npm run build
```
Le build est produit dans `front/dist`. Servez ce répertoire avec votre serveur web et configurez un proxy (Nginx, Caddy, Traefik, ou le proxy Go) pour router `"/api/*"` vers vos backends.

### Déploiement Docker (recommandé)

#### Démarrage rapide avec Docker
```bash
# Télécharger l'image multi-arch (supporte ARM64/AMD64)
docker pull ghcr.io/ketsuna-org/kexamanager:latest

# Lancer avec votre configuration Garage
docker run -d \
  --name kexamanager \
  -p 7400:7400 \
  -e PORT=7400 \
  -e VITE_API_ADMIN_URL="https://votre-garage.exemple.com/admin" \
  -e GARAGE_S3_URL="https://votre-garage.exemple.com" \
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
    environment:
      - PORT=7400
      - VITE_API_ADMIN_URL=https://votre-garage.exemple.com/admin
      - GARAGE_S3_URL=https://votre-garage.exemple.com
    restart: unless-stopped
```

Puis lancez :
```bash
docker-compose up -d
```

#### Tags Docker disponibles
- `ghcr.io/ketsuna-org/kexamanager:latest` — Dernière version stable
- `ghcr.io/ketsuna-org/kexamanager:v1.0.1` — Version spécifique

#### Architectures supportées
- `linux/amd64` (Intel/AMD x64)
- `linux/arm64` (ARM64, incluant Raspberry Pi 4/5)

Accédez à l'application sur `http://localhost:7400` après le démarrage.

### Dépannage
- Vérifiez que toutes les variables d’environnement **obligatoires** sont définies : `PORT`, `VITE_API_ADMIN_URL` et `GARAGE_S3_URL`.
- Vérifiez que `VITE_API_ADMIN_URL` et `GARAGE_S3_URL` pointent vers des endpoints valides (`http/https`).
- En cas de certificats auto-signés, le proxy Go ignore déjà la vérification TLS (dev uniquement).
- Fournissez un token d’authentification dans le localStorage sous la clé `"kexamanager:token"` si nécessaire (cf. `front/src/utils/adminClient.ts`).
- **Nouveau :** Les opérations S3 (upload, téléchargement, aperçu) sont maintenant gérées via le proxy Go aux endpoints `/api/s3/*`, garantissant une sécurité renforcée sans exposition des URLs S3 directes.

### Scripts utiles (frontend)
Depuis `front/` :
- `npm run dev` — serveur de dev Vite
- `npm run build` — build de production
- `npm run preview` — prévisualisation du build
- `npm run lint` — lint


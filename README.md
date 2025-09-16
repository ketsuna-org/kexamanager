<div align="right">English • Français</div>

# Kexamanager

React + TypeScript app (Vite) with a Go reverse proxy to route API calls to Garage (Admin API and public S3 API).

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
- `VITE_API_ADMIN_URL` — target for `"/api/admin"` (Garage Admin API)
- `VITE_API_PUBLIC_URL` — target for `"/api/public"` (Garage public S3 API)

Examples (adjust to your Garage deployment base paths):
```
VITE_API_ADMIN_URL=https://localhost:9000/admin     # Garage Admin API
VITE_API_PUBLIC_URL=https://localhost:9000/public   # Garage S3 API (public)
```

Note: the Go proxy disables TLS verification (equivalent to Vite `secure: false`). For development only.

### Development (Frontend via Vite)
```bash
cd front
export VITE_API_ADMIN_URL="https://localhost:9000/admin"   # Garage Admin API
export VITE_API_PUBLIC_URL="https://localhost:9000/public" # Garage S3 API
npm install
npm run dev
```
This serves the app at `http://localhost:5173` (default Vite port). Requests to `"/api/admin"` and `"/api/public"` are proxied by Vite.

### Run the Go proxy (alternative or preview)
The proxy mirrors `vite.config.ts` rules and listens on `:8080` by default.
```bash
export VITE_API_ADMIN_URL="https://localhost:9000/admin"   # Garage Admin API
export VITE_API_PUBLIC_URL="https://localhost:9000/public" # Garage S3 API
go run ./api/cmd/proxy
```
Options:
- `PORT` or `-port` to change the listening port (e.g. `-port 3000`).

Endpoints:
- `GET /healthz` — health check
- Reverse proxy: `"/api/admin"` and `"/api/public"`

### Production build (frontend)
```bash
cd front
npm install
npm run build
```
Artifacts are generated in `front/dist`. Serve this directory with your web server of choice and configure a proxy (Nginx, Caddy, Traefik, or the Go proxy) to route `"/api/*"` to your backends.

### Troubleshooting
- Ensure `VITE_API_ADMIN_URL` and/or `VITE_API_PUBLIC_URL` point to valid `http/https` endpoints.
- For self-signed certificates, the Go proxy already skips TLS verification (dev only).
- Provide an auth token in localStorage under the key `"kexamanager:token"` if your API requires it (see `front/src/utils/adminClient.ts`).

### Useful scripts (frontend)
From `front/`:
- `npm run dev` — Vite dev server
- `npm run build` — production build
- `npm run preview` — preview built artifacts
- `npm run lint` — lint

---

## Français

### Présentation
Application React + TypeScript (Vite) avec un proxy Go pour router les appels API vers Garage (Admin API et API S3 publique).

Le frontend utilise Vite en développement. Pour reproduire le comportement de `server.proxy` de Vite sans lancer Vite (ex: prévisualisation locale ou intégration), un proxy Go est fourni et reflète les règles de `front/vite.config.ts`.

### Prérequis
- Node.js 18+ (recommandé) et `npm` ou `bun`
- Go 1.22+ (ou compatible avec le `go.mod` du repo)

### Variables d’environnement (Garage)
Utilisées par Vite (dev) et par le proxy Go pour joindre Garage:
- `VITE_API_ADMIN_URL` — cible des appels `"/api/admin"` (Garage Admin API)
- `VITE_API_PUBLIC_URL` — cible des appels `"/api/public"` (Garage API S3 publique)

Exemples (adaptez selon les chemins de base de votre déploiement Garage):
```
VITE_API_ADMIN_URL=https://localhost:9000/admin     # Admin API Garage
VITE_API_PUBLIC_URL=https://localhost:9000/public   # API S3 Garage (publique)
```

Note : le proxy Go ignore la vérification TLS (équivalent `secure: false` dans Vite). À utiliser uniquement en développement.

### Démarrage (Frontend via Vite)
```bash
cd front
export VITE_API_ADMIN_URL="https://localhost:9000/admin"   # Admin API Garage
export VITE_API_PUBLIC_URL="https://localhost:9000/public" # API S3 Garage
npm install
npm run dev
```
L’application est servie sur `http://localhost:5173` (port par défaut de Vite). Les requêtes `"/api/admin"` et `"/api/public"` sont proxifiées par Vite.

### Lancer le proxy Go (alternative/prévisualisation)
Le proxy reflète les règles de `vite.config.ts` et écoute par défaut sur `:8080`.
```bash
export VITE_API_ADMIN_URL="https://localhost:9000/admin"   # Admin API Garage
export VITE_API_PUBLIC_URL="https://localhost:9000/public" # API S3 Garage
go run ./api/cmd/proxy
```
Options :
- `PORT` ou `-port` pour changer le port d’écoute (ex: `-port 3000`).

Points exposés :
- `GET /healthz` — vérification rapide
- Reverse proxy : `"/api/admin"` et `"/api/public"`

### Build de production (frontend)
```bash
cd front
npm install
npm run build
```
Le build est produit dans `front/dist`. Servez ce répertoire avec votre serveur web et configurez un proxy (Nginx, Caddy, Traefik, ou le proxy Go) pour router `"/api/*"` vers vos backends.

### Dépannage
- Vérifiez que `VITE_API_ADMIN_URL` et/ou `VITE_API_PUBLIC_URL` pointent vers des endpoints valides (`http/https`).
- En cas de certificats auto-signés, le proxy Go ignore déjà la vérification TLS (dev uniquement).
- Fournissez un token d’authentification dans le localStorage sous la clé `"kexamanager:token"` si nécessaire (cf. `front/src/utils/adminClient.ts`).

### Scripts utiles (frontend)
Depuis `front/` :
- `npm run dev` — serveur de dev Vite
- `npm run build` — build de production
- `npm run preview` — prévisualisation du build
- `npm run lint` — lint


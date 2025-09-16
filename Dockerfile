# Multi-stage Dockerfile pour KexaManager
# Stage 1: Build frontend avec Bun
FROM oven/bun:1.2-alpine AS frontend-builder
WORKDIR /src/front

# Copier les fichiers de dépendances pour une meilleure mise en cache
COPY front/package.json ./
COPY front/bun.lockb ./

# Installer les dépendances
RUN bun install --frozen-lockfile

# Copier le reste du code frontend et construire
COPY front/ ./
RUN bun run build

# Stage 2: Build Go proxy
FROM golang:1.24.5-alpine AS go-builder
WORKDIR /src

# Installer git pour go mod download
RUN apk add --no-cache git

# Copier les modules Go
COPY api/go.mod ./api/
WORKDIR /src/api
RUN go env -w GOPROXY=https://proxy.golang.org,direct
RUN go mod download

# Copier le code source et construire le binaire
COPY api/ ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags='-s -w' -o /out/proxy ./cmd/proxy

# Stage 3: Image finale
FROM alpine:3.20
RUN apk add --no-cache ca-certificates

WORKDIR /app

# Copier le binaire proxy
COPY --from=go-builder /out/proxy /app/proxy

# Copier les fichiers frontend construits
COPY --from=frontend-builder /src/output/public /app/public

# S'assurer que le proxy est exécutable
RUN chmod +x /app/proxy

# Variables d'environnement (seules les variables techniques sont définies dans l'image)
ENV PORT=7400
ENV STATIC_DIR=/app/public

EXPOSE 7400

ENTRYPOINT ["/app/proxy"]

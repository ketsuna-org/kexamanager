# Makefile for building frontend and Go proxy from repository root
# Usage:
#   make          -> builds frontend then proxy
#   make build-front
#   make build-proxy
#   make dev-api / dev-front -> local development (see help)
#   make clean
#   make run       -> build then run proxy binary

OUTDIR_FRONT=output/public
GO_OUT=bin/proxy
OUTPUT_FOLDER=output
GO_BINARY=$(OUTPUT_FOLDER)/bin/proxy

# Root password for the admin account (falls back to the app default when empty).
PASSWORD ?= admin

# Go toolchain used to build the proxy inside a container (see dev-api).
GO_IMAGE ?= golang:1.27-alpine
DEV_API_NAME ?= kexa-dev-api

# Docker network shared by the dev API container and the local S3 harness
# (dev-s3), so the proxy reaches the harness by name (http://kexa-s3:9000).
DEV_NETWORK ?= kexa-dev
S3_HARNESS_NAME ?= kexa-s3
S3_HARNESS_USER ?= kexa
S3_HARNESS_PASSWORD ?= kexa-secret

# Mock de l'API admin Garage (dev-garage-admin) : le conteneur du harnais,
# son port hote et le token Bearer attendu par le mock.
GARAGE_ADMIN_NAME ?= kexa-garage-admin
GARAGE_ADMIN_PORT ?= 3903
GARAGE_ADMIN_TOKEN ?= dev-admin-token

# --- Pile de developpement NATIVE (sans Docker) ------------------------------
# Meme surface que les cibles conteneur, servie par des binaires de l hote :
# proxy Go compile en CGO (go-sqlite3), rclone en serveur S3, mock Garage en python.
# Utile quand Docker Desktop est indisponible. Les cibles conteneur restent la
# reference (CI, deploiement) : ici on ne remplace rien, on ajoute un chemin.
#
# MinIO n est plus une option : dl.min.io renvoie 410 Gone (serveur, mc et KES
# sont archives). Le serveur S3 natif est donc rclone, qui expose un DOSSIER
# (un sous-dossier = un bucket) - d ou tools/dev/seed-s3-dir.sh.
# $(HOME) arrive en style Windows (C:\Users\...) et les backslashes seraient
# consommes par le shell : on passe par sh pour obtenir un chemin POSIX utilisable
# dans les recettes, puis cygpath -m pour les binaires natifs (rclone, proxy).
NATIVE_HOME ?= $(shell echo "$$HOME")/.kexa-native
NATIVE_MINGW ?= $(NATIVE_HOME)/winlibs/mingw64/bin
NATIVE_CC ?= $(NATIVE_MINGW)/gcc.exe
# go exige un CC ABSOLU du point de vue natif : /c/Users/... est rejete.
NATIVE_CC_WIN := $(shell cygpath -m "$(NATIVE_CC)" 2>/dev/null || echo "$(NATIVE_CC)")
NATIVE_RCLONE ?= $(NATIVE_HOME)/bin/rclone.exe
NATIVE_PYTHON ?= python
NATIVE_S3_DIR ?= $(NATIVE_HOME)/s3-data
NATIVE_API_PORT ?= 8080
NATIVE_S3_PORT ?= 9000
# rclone est un binaire natif : il lui faut un chemin Windows, pas MSYS.
NATIVE_HOME_WIN := $(shell cygpath -m "$(NATIVE_HOME)" 2>/dev/null || echo "$(NATIVE_HOME)")

# Auto-detect container runtime (docker or podman). Resolve to the bare command
# name: absolute paths (e.g. "/c/Program Files/Docker/...") break in recipes.
CONTAINER_RUNTIME := $(shell command -v docker >/dev/null 2>&1 && echo docker || (command -v podman >/dev/null 2>&1 && echo podman))

.PHONY: all build build-front build-proxy dev-api dev-front dev-s3 dev-garage-admin dev-down i18n-check e2e-render clean clean-public run build-container run-container run-container-env help dev-native dev-native-install dev-native-check dev-api-native dev-s3-native dev-garage-admin-native dev-native-down

all: build

help:
	@echo "Makefile targets:"
	@echo "  make              -> build frontend and proxy"
	@echo "  make build-front  -> build frontend (uses bun run build in front/)"
	@echo "  make build-proxy  -> build Go proxy (cd api && go build ./cmd/proxy)"
	@echo "  make dev-api      -> run the Go proxy in a container on http://localhost:8080"
	@echo "  make dev-front    -> run the Vite dev server on http://localhost:5173 (proxies /api -> :8080)"
	@echo "  make dev-s3       -> run a local S3 harness (MinIO) seeded with test buckets"
	@echo "  make dev-garage-admin -> run a mock Garage admin API (dev) on http://localhost:$(GARAGE_ADMIN_PORT)"
	@echo "  make dev-down     -> stop the local dev stack (API container + S3 harness + Garage admin mock)"
	@echo "  --- NATIF (sans Docker, binaires de l hote) ---"
	@echo "  make dev-native-install -> telecharge le toolchain natif (WinLibs gcc + rclone) dans $(NATIVE_HOME)"
	@echo "  make dev-native   -> pile complete native: S3 (rclone) + mock Garage + proxy CGO"
	@echo "  make dev-api-native     -> compile le proxy avec CGO et le lance sur :$(NATIVE_API_PORT)"
	@echo "  make dev-s3-native      -> S3 natif (rclone serve s3) sur :$(NATIVE_S3_PORT)"
	@echo "  make dev-native-down    -> arrete la pile native"
	@echo "  make i18n-check   -> verifie la parite FR/EN et les cles i18n utilisees (tools/i18n)"
	@echo "  make e2e-render   -> preuve navigateur + sweep des routes (tools/e2e, serveurs dev deja lances)"
	@echo "  make clean        -> remove built frontend assets and proxy binary"
	@echo "  make run          -> build then run proxy binary (./$(GO_BINARY))"
	@echo "  make build-container -> build container image using Dockerfile (auto-detects docker/podman)"
	@echo "  make run-container   -> build and run container with required env vars"
	@echo "  make run-container-env -> build and run container with .env file"
	@echo ""
	@echo "Required environment variables for containers:"
	@echo "  PORT, PASSWORD (default: $(PASSWORD))"

build: build-front build-proxy

build-front:
	@echo "Building frontend into $(OUTDIR_FRONT)"
	cd front && bun run build

# The sqlite driver (github.com/mattn/go-sqlite3) requires cgo: built without
# it, the binary still compiles but panics at startup ("This is a stub").
build-proxy:
	@echo "Building Go proxy binary -> $(GO_BINARY)"
	@mkdir -p $(dir $(GO_BINARY))
	cd api && CGO_ENABLED=1 go build -o $(CURDIR)/$(GO_BINARY) ./cmd/proxy

# Local development. Builds and runs the proxy inside a Go container so the host
# does not need gcc/sqlite headers; the front runs natively with Vite (hot reload)
# and proxies /api to this container. The go module cache lives in a named volume
# so restarts do not re-download the world.
dev-api:
	@if [ -z "$(CONTAINER_RUNTIME)" ]; then echo "Error: neither docker nor podman is available"; exit 1; fi
	@$(CONTAINER_RUNTIME) network inspect $(DEV_NETWORK) >/dev/null 2>&1 || $(CONTAINER_RUNTIME) network create $(DEV_NETWORK) >/dev/null
	-$(CONTAINER_RUNTIME) rm -f $(DEV_API_NAME) >/dev/null 2>&1
	$(CONTAINER_RUNTIME) run --rm --name $(DEV_API_NAME) --network $(DEV_NETWORK) -p 8080:7400 \
		-v "$(CURDIR)/api:/src" -w /src \
		-v kexa-go-mod:/go/pkg/mod \
		-e PORT=7400 -e PASSWORD="$(PASSWORD)" \
		$(GO_IMAGE) \
		sh -c "apk add --no-cache git gcc musl-dev sqlite-dev && go build -o /tmp/proxy ./cmd/proxy && exec /tmp/proxy"

# Local S3 harness: a real S3 server (MinIO) seeded with buckets and a two-level
# tree, so the storage UI can be exercised without touching a production cluster.
# It validates OUR contract, not Garage vendor semantics.
dev-s3:
	@if [ -z "$(CONTAINER_RUNTIME)" ]; then echo "Error: neither docker nor podman is available"; exit 1; fi
	@$(CONTAINER_RUNTIME) network inspect $(DEV_NETWORK) >/dev/null 2>&1 || $(CONTAINER_RUNTIME) network create $(DEV_NETWORK) >/dev/null
	-$(CONTAINER_RUNTIME) rm -f $(S3_HARNESS_NAME) >/dev/null 2>&1
	$(CONTAINER_RUNTIME) run -d --name $(S3_HARNESS_NAME) --network $(DEV_NETWORK) \
		-p 9000:9000 -p 9001:9001 \
		-e MINIO_ROOT_USER=$(S3_HARNESS_USER) -e MINIO_ROOT_PASSWORD=$(S3_HARNESS_PASSWORD) \
		-v kexa-s3-data:/data minio/minio:latest server /data --console-address ":9001"
	@echo "Waiting for the harness..."; sleep 6
	$(CONTAINER_RUNTIME) run --rm --network $(DEV_NETWORK) \
		-v "$(CURDIR)/tools/dev:/seed:ro" --entrypoint sh minio/mc /seed/seed-s3.sh
	@echo "S3 harness ready: http://localhost:9000 (console http://localhost:9001)"

# Mock de l'API admin Garage pour le developpement. Ce processus n'est PAS
# Garage : il rejoue des reponses conformes a nos schemas pour valider au reel
# /capabilities et /stats/* (parsing, agregation, cache, degradation gracieuse)
# sans cluster de production. Aucune semantique vendor n'est validee ici.
dev-garage-admin:
	@if [ -z "$(CONTAINER_RUNTIME)" ]; then echo "Error: neither docker nor podman is available"; exit 1; fi
	@$(CONTAINER_RUNTIME) network inspect $(DEV_NETWORK) >/dev/null 2>&1 || $(CONTAINER_RUNTIME) network create $(DEV_NETWORK) >/dev/null
	-$(CONTAINER_RUNTIME) rm -f $(GARAGE_ADMIN_NAME) >/dev/null 2>&1
	$(CONTAINER_RUNTIME) run -d --name $(GARAGE_ADMIN_NAME) --network $(DEV_NETWORK) \
		-p $(GARAGE_ADMIN_PORT):$(GARAGE_ADMIN_PORT) \
		-v "$(CURDIR)/tools/dev:/mock:ro" \
		-e MOCK_PORT=$(GARAGE_ADMIN_PORT) -e MOCK_ADMIN_TOKEN=$(GARAGE_ADMIN_TOKEN) \
		python:3-alpine python3 /mock/garage-admin-mock.py
	@echo "Waiting for the Garage admin mock..."
	@for i in $$(seq 1 20); do \
		curl -sf -H "Authorization: Bearer $(GARAGE_ADMIN_TOKEN)" http://localhost:$(GARAGE_ADMIN_PORT)/v2/GetClusterHealth >/dev/null && break; \
		sleep 1; \
	done
	@curl -sf -H "Authorization: Bearer $(GARAGE_ADMIN_TOKEN)" http://localhost:$(GARAGE_ADMIN_PORT)/v2/GetClusterHealth >/dev/null \
		|| { echo "Error: mock admin Garage injoignable sur :$(GARAGE_ADMIN_PORT)"; exit 1; }
	@echo "Garage admin mock ready: http://localhost:$(GARAGE_ADMIN_PORT)"

# Stop the local dev stack (API container + S3 harness + Garage admin mock).
dev-down:
	-$(CONTAINER_RUNTIME) rm -f $(DEV_API_NAME) $(S3_HARNESS_NAME) $(GARAGE_ADMIN_NAME) >/dev/null 2>&1
	@echo "dev stack stopped"

# --- NATIF : installation du toolchain ---------------------------------------
# WinLibs (UCRT, posix-seh) fournit gcc+ld necessaires au CGO de go-sqlite3 ;
# rclone fournit le serveur S3. Rien n est installe dans le systeme : tout vit
# sous $(NATIVE_HOME), supprimable d un rm -rf.
dev-native-install:
	@mkdir -p "$(NATIVE_HOME)/bin"
	curl -L --retry 3 -o "$(NATIVE_HOME)/winlibs.zip" 		https://github.com/brechtsanders/winlibs_mingw/releases/download/16.2.0posix-14.0.0-ucrt-r1/winlibs-x86_64-posix-seh-gcc-16.2.0-mingw-w64ucrt-14.0.0-r1.zip
	python -c "import zipfile;zipfile.ZipFile(r'$(NATIVE_HOME_WIN)/winlibs.zip').extractall(r'$(NATIVE_HOME_WIN)/winlibs')"
	curl -L --retry 3 -o "$(NATIVE_HOME)/rclone.zip" https://downloads.rclone.org/rclone-current-windows-amd64.zip
	python -c "import zipfile,glob,shutil,os;p=zipfile.ZipFile(r'$(NATIVE_HOME_WIN)/rclone.zip');p.extractall(r'$(NATIVE_HOME_WIN)/rclone');src=glob.glob(r'$(NATIVE_HOME_WIN)/rclone/*/rclone.exe')[0];shutil.copyfile(src,r'$(NATIVE_HOME_WIN)/bin/rclone.exe')"
	@$(MAKE) dev-native-check

# Verifie que le toolchain natif est en place (les cibles natives en dependent).
dev-native-check:
	@ok=1; 	if [ ! -x "$(NATIVE_CC)" ]; then echo "gcc natif absent: $(NATIVE_CC)"; echo "  -> make dev-native-install"; ok=0; fi; 	if [ ! -x "$(NATIVE_RCLONE)" ]; then echo "rclone absent: $(NATIVE_RCLONE)"; echo "  -> make dev-native-install"; ok=0; fi; 	if [ "$$ok" = "0" ]; then exit 1; fi; 	echo "toolchain natif OK: $$($(NATIVE_CC) --version | head -1)"

# S3 natif : rclone sert $(NATIVE_S3_DIR), un sous-dossier = un bucket.
dev-s3-native: dev-native-check
	@mkdir -p "$(NATIVE_S3_DIR)"
	@sh tools/dev/seed-s3-dir.sh "$(NATIVE_S3_DIR)" >/dev/null
	@nohup "$(NATIVE_RCLONE)" serve s3 --auth-key $(S3_HARNESS_USER),$(S3_HARNESS_PASSWORD) 		--addr :$(NATIVE_S3_PORT) --force-path-style --log-level INFO 		:local:$(NATIVE_HOME_WIN)/s3-data > "$(NATIVE_HOME)/s3.log" 2>&1 &
	@echo "S3 natif sur http://localhost:$(NATIVE_S3_PORT) (log $(NATIVE_HOME)/s3.log)"

# Mock de l API admin Garage : script python pur, aucune dependance.
dev-garage-admin-native:
	@mkdir -p "$(NATIVE_HOME)"
	@cd $(CURDIR) && MOCK_PORT=$(GARAGE_ADMIN_PORT) MOCK_ADMIN_TOKEN=$(GARAGE_ADMIN_TOKEN) 		nohup $(NATIVE_PYTHON) tools/dev/garage-admin-mock.py > "$(NATIVE_HOME)/mock.log" 2>&1 &
	@echo "Mock admin Garage sur http://localhost:$(GARAGE_ADMIN_PORT) (log $(NATIVE_HOME)/mock.log)"

# Proxy en natif : CGO obligatoire (go-sqlite3 compile en stub sinon).
dev-api-native: dev-native-check
	@mkdir -p "$(NATIVE_HOME)"
	@echo "Build du proxy avec CGO -> $(NATIVE_HOME)/kexa-proxy.exe"
	cd api && CGO_ENABLED=1 CC="$(NATIVE_CC_WIN)" go build -o "$(NATIVE_HOME_WIN)/kexa-proxy.exe" ./cmd/proxy
	@cd api && PORT=$(NATIVE_API_PORT) PASSWORD="$(PASSWORD)" 		nohup "$(NATIVE_HOME_WIN)/kexa-proxy.exe" > "$(NATIVE_HOME)/api.log" 2>&1 &
	@echo "API native sur http://localhost:$(NATIVE_API_PORT) (log $(NATIVE_HOME)/api.log)"

dev-native: dev-s3-native dev-garage-admin-native dev-api-native
	@echo "Pile native prete. Front : make dev-front (http://localhost:5173)"

dev-native-down:
	@for port in $(NATIVE_API_PORT) $(NATIVE_S3_PORT) $(GARAGE_ADMIN_PORT); do 		pid=$$(netstat -ano | grep -E ":$$port[[:space:]]+.*LISTENING" | awk '{print $$5}' | sort -u | head -1); 		if [ -n "$$pid" ]; then powershell -NoProfile -Command "Stop-Process -Id $$pid -Force -ErrorAction SilentlyContinue"; echo "port $$port arrete (pid $$pid)"; else echo "port $$port deja libre"; fi; 	done

dev-front:
	cd front && bun dev

clean-public:
	@if [ -d "$(OUTDIR_FRONT)" ]; then rm -rf "$(OUTDIR_FRONT)"/*; echo "cleaned $(OUTDIR_FRONT)"; else echo "$(OUTDIR_FRONT) not found"; fi

clean:
	@$(MAKE) clean-public
	@if [ -f "$(GO_BINARY)" ]; then rm -f "$(GO_BINARY)"; echo "removed $(GO_BINARY)"; else echo "$(GO_BINARY) not found"; fi

run: build
	@echo "Running proxy: ./$(GO_BINARY)"
	cd $(OUTPUT_FOLDER) && ./${GO_OUT}

build-container:
	@echo "Building container with Dockerfile..."
	@if [ -z "$(CONTAINER_RUNTIME)" ]; then \
		echo "Error: Neither docker nor podman is available"; \
		exit 1; \
	fi
	@echo "Using container runtime: $(CONTAINER_RUNTIME)"
	$(CONTAINER_RUNTIME) build -t kexamanager:latest .

run-container: build-container
	@echo "Running container with $(CONTAINER_RUNTIME)..."
	$(CONTAINER_RUNTIME) run --rm -p 7400:7400 \
		-e PORT=7400 \
		-e PASSWORD="$(PASSWORD)" \
		kexamanager:latest

run-container-env: build-container
	@echo "Running container with custom environment variables from .env file..."
	@if [ -f .env ]; then \
		$(CONTAINER_RUNTIME) run --rm -p 7400:7400 --env-file .env kexamanager:latest; \
	else \
		echo "Error: .env file not found. Please create one with:"; \
		echo "  PORT=7400"; \
		echo "  PASSWORD=your-admin-password"; \
		exit 1; \
	fi


# Verification i18n : parite stricte FR/EN puis cles utilisees dans front/src.
# Les scripts resolvent eux-memes la racine du repo (aucun chemin absolu code).
i18n-check:
	python tools/i18n/check-parity.py && python tools/i18n/check-keys.py

# Preuve de rendu reelle : login + rendu + capture, puis sweep de toutes les routes.
# Suppose l'API sur :8080 et le front de dev sur :5173, et ne les arrete jamais.
e2e-render:
	node tools/e2e/browser-proof.cjs
	node tools/e2e/route-sweep.cjs

# Makefile for building frontend and Go proxy from repository root
# Usage:
#   make          -> builds frontend then proxy
#   make build-front
#   make build-proxy
#   make clean
#   make run       -> build then run proxy binary

OUTDIR_FRONT=output/public
GO_OUT=bin/proxy
OUTPUT_FOLDER=output
GO_BINARY=$(OUTPUT_FOLDER)/bin/proxy

# Auto-detect container runtime (docker or podman)
CONTAINER_RUNTIME := $(shell command -v docker 2> /dev/null || command -v podman 2> /dev/null)

.PHONY: all build build-front build-proxy clean clean-public run build-container run-container run-container-env help

all: build

help:
	@echo "Makefile targets:"
	@echo "  make              -> build frontend and proxy"
	@echo "  make build-front  -> build frontend (uses bun run build in front/)"
	@echo "  make build-proxy  -> build Go proxy (cd api && go build ./cmd/proxy)"
	@echo "  make clean        -> remove built frontend assets and proxy binary"
	@echo "  make run          -> build then run proxy binary (./$(GO_BINARY))"
	@echo "  make build-container -> build container image using Dockerfile (auto-detects docker/podman)"
	@echo "  make run-container   -> build and run container with required env vars"
	@echo "  make run-container-env -> build and run container with .env file"
	@echo ""
	@echo "Required environment variables for containers:"
	@echo "  VITE_API_ADMIN_URL, VITE_API_PUBLIC_URL, PORT"

build: build-front build-proxy

build-front:
	@echo "Building frontend into $(OUTDIR_FRONT)"
	cd front && bun run build

build-proxy:
	@echo "Building Go proxy binary -> $(GO_BINARY)"
	@mkdir -p $(dir $(GO_BINARY))
	cd api && go build -o $(CURDIR)/$(GO_BINARY) ./cmd/proxy


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
	@echo "Using required environment variables:"
	$(CONTAINER_RUNTIME) run --rm -p 7400:7400 \
		-e VITE_API_ADMIN_URL=https://k1.ketsuna.com \
		-e VITE_API_PUBLIC_URL=https://s3.ketsuna.com \
		-e PORT=7400 \
		kexamanager:latest

run-container-env: build-container
	@echo "Running container with custom environment variables from .env file..."
	@if [ -f .env ]; then \
		$(CONTAINER_RUNTIME) run --rm -p 7400:7400 --env-file .env kexamanager:latest; \
	else \
		echo "Error: .env file not found. Please create one with:"; \
		echo "  VITE_API_ADMIN_URL=https://k1.ketsuna.com"; \
		echo "  VITE_API_PUBLIC_URL=https://s3.ketsuna.com"; \
		echo "  PORT=7400"; \
		exit 1; \
	fi

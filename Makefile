.DEFAULT_GOAL := help

-include .env
export

.env: ## Create .env from the example on first use
	cp .env.example .env

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

dev: ## Run the API and the web dev server together (Ctrl-C stops both)
	@$(MAKE) -j2 dev-api dev-web

dev-api: .env ## Run the Go proxy only
	cd api && go run ./cmd/api

dev-web: ## Run the Expo web dev server (Metro, :8081)
	cd web && pnpm run web

build: ## Build the API binary
	cd api && go build -o ../bin/api ./cmd/api

build-web: ## Export the PWA to web/dist (includes the PWA head injection)
	cd web && pnpm install --frozen-lockfile && pnpm run build:web

test: test-api test-web ## Run every test

test-api: ## Go vet + tests
	cd api && go vet ./... && go test ./...

test-web: ## Vitest, typecheck and lint
	cd web && pnpm test && pnpm run typecheck && pnpm exec biome lint .

up: .env ## Start the API in Docker
	docker compose up --build

down: ## Stop the Docker stack
	docker compose down

prod-up: ## Deploy/refresh the production stack (needs .env.prod)
	docker compose --env-file .env.prod up -d --build

prod-down: ## Stop the production stack
	docker compose --env-file .env.prod down

clean: ## Remove build artifacts
	rm -rf bin web/dist

.PHONY: help dev dev-api dev-web build build-web test test-api test-web up down prod-up prod-down clean

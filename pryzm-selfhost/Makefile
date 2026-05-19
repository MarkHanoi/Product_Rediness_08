# pryzm-selfhost/Makefile — convenience targets for the self-host stack.
# All targets shell out to docker compose; you can run the same commands by hand.
#
# Auto-detects docker compose v2 vs legacy v1 docker-compose.

COMPOSE := $(shell command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1 && echo "docker compose" || echo "docker-compose")

.DEFAULT_GOAL := help

.PHONY: help install build up down logs ps health restart pull nuke

help: ## Show this help.
	@awk 'BEGIN {FS = ":.*##"; printf "Targets:\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  %-12s %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

install: ## Run install.sh (one-shot setup).
	./install.sh

build: ## docker compose build --pull
	$(COMPOSE) build --pull

up: ## docker compose up -d
	$(COMPOSE) up -d

down: ## docker compose down (volumes preserved)
	$(COMPOSE) down

logs: ## Tail all logs (Ctrl-C to stop)
	$(COMPOSE) logs -f

ps: ## Show service status
	$(COMPOSE) ps

health: ## Show healthcheck status only
	@$(COMPOSE) ps --format "{{.Service}}\t{{.Status}}"

restart: ## Restart all services
	$(COMPOSE) restart

pull: ## Pull published images from ghcr.io (skips local builds)
	$(COMPOSE) pull

nuke: ## DESTRUCTIVE: stop + delete volumes + delete .secrets
	$(COMPOSE) down -v
	rm -rf .secrets .env
	@echo "Stack destroyed.  Re-run 'make install' to start fresh."

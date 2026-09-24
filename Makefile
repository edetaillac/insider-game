# Deployment variables: use system environment or command-line arguments
# Standard practice: keep infrastructure config separate from app config
# Usage: SERVER_USER=your_user make deploy

# Variables (can be overridden by environment or command line)
SERVER_USER ?= user
SERVER_HOST ?= your-server.com
APP_INSIDER_PATH ?= /path/to/app
BRANCH ?= master

# Help command
.PHONY: help
help: ## Show this help
	@echo "🚀 Essential commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sed 's/Makefile://' | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

# First time setup
.PHONY: init
init: ## 🎬 Complete initial setup (first time)
	@echo "🎬 Initial setup of Insider..."
	@echo "📦 Installing dependencies..."
	npm install
	@echo "✅ Setup complete! Use 'make dev' to start"

# Quick Start
.PHONY: start
start: ## 🏁 Start the project (after init)
	npm start

# Development
.PHONY: dev
dev: ## 💻 Start development server (2 players minimum, reload on change)
	MIN_PLAYERS=2 npm run dev

# Testing
.PHONY: test
test: ## 🧪 Run all tests
	npm test

.PHONY: check
check: ## ✅ Run tests, lint and typecheck
	npm test
	npm run lint
	npm run typecheck

# Docker
.PHONY: docker
docker: ## 🐳 Run with Docker (local, hot reload)
	docker-compose up --build -d

.PHONY: docker-stop
docker-stop: ## 🛑 Stop Docker containers
	docker-compose down

.PHONY: docker-logs
docker-logs: ## 📋 Show Docker logs
	docker-compose logs -f

# Deploy (docker-compose.prod.yml lives on the server only, unversioned: Traefik, domain, PUBLIC_URL)
.PHONY: deploy
deploy: ## 🚀 Deploy to production server (fast, uses cache)
	ssh $(SERVER_USER)@$(SERVER_HOST) "cd $(APP_INSIDER_PATH) && git fetch origin && git reset --hard origin/$(BRANCH) && docker-compose -f docker-compose.yml -f docker-compose.prod.yml build && docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d"

.PHONY: deploy-clean
deploy-clean: ## 🧹 Deploy with full rebuild (slow, no cache)
	ssh $(SERVER_USER)@$(SERVER_HOST) "cd $(APP_INSIDER_PATH) && git fetch origin && git reset --hard origin/$(BRANCH) && docker-compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache && docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d"

# Cleanup
.PHONY: clean
clean: ## 🧹 Clean temporary files
	docker-compose down --remove-orphans 2>/dev/null || true

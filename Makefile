# Makefile pour WireMock Web UI

WIREMOCK_IMAGE   := wiremock/wiremock:3.10.0
WIREMOCK_PORT    := 8080
ANGULAR_DIR      := src/main/webapp
DIST_DIR         := $(ANGULAR_DIR)/dist/wiremock-ui/browser

.PHONY: help install build dev check-setup wiremock dev-full clean test smoke-test docker-build docker-up docker-down

# Commande par défaut
help:
	@echo "╔════════════════════════════════════════════════════════╗"
	@echo "║         WireMock Web UI - Commandes                   ║"
	@echo "╚════════════════════════════════════════════════════════╝"
	@echo ""
	@echo "📦 Installation :"
	@echo "   make install          Installer les dépendances npm"
	@echo ""
	@echo "✅ Vérification :"
	@echo "   make check-setup      Vérifier les prérequis (Node, npm, Docker)"
	@echo ""
	@echo "🚀 Développement :"
	@echo "   make dev              Démarrer Angular seul (WireMock déjà lancé)"
	@echo "   make wiremock         Démarrer WireMock standalone via Docker"
	@echo "   make dev-full         Démarrer WireMock + Angular ensemble"
	@echo ""
	@echo "📦 Build :"
	@echo "   make build            Build de production"
	@echo ""
	@echo "🧪 Tests :"
	@echo "   make test             Lancer les tests unitaires Angular"
	@echo "   make smoke-test       Lancer les smoke tests (nécessite WireMock actif)"
	@echo ""
	@echo "🧹 Nettoyage :"
	@echo "   make clean            Nettoyer les fichiers générés"
	@echo ""
	@echo "🐳 Docker :"
	@echo "   make docker-build     Build l'image Docker"
	@echo "   make docker-up        Démarrer avec docker-compose"
	@echo "   make docker-down      Arrêter docker-compose"
	@echo ""

# ─── Prérequis ────────────────────────────────────────────────────────────────

check-setup:
	@echo "╔════════════════════════════════════════════════════════╗"
	@echo "║       WireMock Web UI - Vérification des prérequis   ║"
	@echo "╚════════════════════════════════════════════════════════╝"
	@echo ""
	@echo "1️⃣  Node.js :"
	@if command -v node > /dev/null 2>&1; then \
		echo "   ✅ Node.js $$(node --version)"; \
	else \
		echo "   ❌ Node.js non installé — https://nodejs.org/"; exit 1; \
	fi
	@echo ""
	@echo "2️⃣  npm :"
	@if command -v npm > /dev/null 2>&1; then \
		echo "   ✅ npm $$(npm --version)"; \
	else \
		echo "   ❌ npm non installé"; exit 1; \
	fi
	@echo ""
	@echo "3️⃣  Docker :"
	@if command -v docker > /dev/null 2>&1; then \
		echo "   ✅ $$(docker --version)"; \
	else \
		echo "   ⚠️  Docker non installé (optionnel) — https://docs.docker.com/get-docker/"; \
	fi
	@echo ""
	@echo "4️⃣  Structure Angular :"
	@for f in $(ANGULAR_DIR)/package.json $(ANGULAR_DIR)/angular.json $(ANGULAR_DIR)/tsconfig.json $(ANGULAR_DIR)/src/app/app.component.ts; do \
		if [ -f "$$f" ]; then echo "   ✅ $$f"; else echo "   ❌ $$f manquant"; fi; \
	done
	@echo ""
	@echo "5️⃣  Mappings WireMock :"
	@MAPPING_COUNT=$$(find mappings -name "*.json" 2>/dev/null | wc -l); \
	if [ "$$MAPPING_COUNT" -gt 0 ]; then \
		echo "   ✅ $$MAPPING_COUNT mapping(s) trouvé(s)"; \
	else \
		echo "   ⚠️  Aucun mapping (optionnel)"; \
	fi
	@echo ""
	@echo "════════════════════════════════════════════════════════"
	@echo "✅ Vérification terminée."
	@echo ""

# ─── Installation ─────────────────────────────────────────────────────────────

install:
	@echo "📦 Installation des dépendances npm..."
	cd $(ANGULAR_DIR) && npm install
	@echo "✅ Dépendances installées !"

# ─── Développement ────────────────────────────────────────────────────────────

dev:
	@echo "🚀 Démarrage du serveur de développement Angular..."
	@echo "⚠️  Assurez-vous que WireMock tourne sur le port $(WIREMOCK_PORT)"
	@echo ""
	cd $(ANGULAR_DIR) && npm start

wiremock:
	@echo "🚀 Démarrage de WireMock standalone (port $(or $(PORT),$(WIREMOCK_PORT)))..."
	@if ! command -v docker > /dev/null 2>&1; then \
		echo "❌ Docker non trouvé."; \
		echo "   Alternatives :"; \
		echo "   1. Installer Docker : https://docs.docker.com/get-docker/"; \
		echo "   2. java -jar wiremock-standalone-3.10.0.jar --port $(or $(PORT),$(WIREMOCK_PORT))"; \
		exit 1; \
	fi
	docker run -it --rm \
		-p $(or $(PORT),$(WIREMOCK_PORT)):8080 \
		-v "$$(pwd)/mappings:/home/wiremock/mappings" \
		-v "$$(pwd)/files:/home/wiremock/__files" \
		$(WIREMOCK_IMAGE) \
		--global-response-templating \
		--verbose

dev-full:
	@echo "╔════════════════════════════════════════════════════════╗"
	@echo "║         WireMock Web UI - Démarrage complet           ║"
	@echo "╚════════════════════════════════════════════════════════╝"
	@echo ""
	@if ! command -v docker > /dev/null 2>&1; then echo "❌ Docker requis."; exit 1; fi
	@if ! command -v node > /dev/null 2>&1;  then echo "❌ Node.js requis."; exit 1; fi
	@echo "✅ Prérequis vérifiés"
	@echo ""
	@echo "1️⃣  Démarrage de WireMock (Docker)..."
	@docker run -d --name wiremock-backend \
		-p $(WIREMOCK_PORT):8080 \
		-v "$$(pwd)/mappings:/home/wiremock/mappings" \
		-v "$$(pwd)/files:/home/wiremock/__files" \
		$(WIREMOCK_IMAGE) \
		--global-response-templating --verbose > /dev/null 2>&1 || \
		(docker ps | grep -q wiremock-backend && echo "   ℹ️  WireMock déjà en cours" || (echo "   ❌ Erreur WireMock"; exit 1))
	@echo "   ✅ WireMock sur http://localhost:$(WIREMOCK_PORT)"
	@echo "   ⏳ Attente du démarrage..."
	@sleep 3
	@echo ""
	@echo "2️⃣  Démarrage de l'UI Angular..."
	@if [ ! -d "$(ANGULAR_DIR)/node_modules" ]; then \
		echo "   📦 Installation des dépendances (première fois)..."; \
		cd $(ANGULAR_DIR) && npm install; \
	fi
	@echo ""
	@echo "╔════════════════════════════════════════════════════════╗"
	@echo "║  ✅ Services démarrés !                               ║"
	@echo "╚════════════════════════════════════════════════════════╝"
	@echo "   🎨 Interface Web : http://localhost:4200"
	@echo "   📡 API WireMock  : http://localhost:$(WIREMOCK_PORT)/__admin/"
	@echo ""
	@echo "   🛑 Arrêt : Ctrl+C, puis 'make _stop-wiremock'"
	@echo ""
	cd $(ANGULAR_DIR) && npm start; \
	docker stop wiremock-backend > /dev/null 2>&1; \
	docker rm wiremock-backend > /dev/null 2>&1

_stop-wiremock:
	@docker stop wiremock-backend > /dev/null 2>&1 && docker rm wiremock-backend > /dev/null 2>&1 || true
	@echo "✅ WireMock arrêté."

# ─── Build ────────────────────────────────────────────────────────────────────

build:
	@echo "📦 Build de production Angular..."
	cd $(ANGULAR_DIR) && npm run build
	@echo ""
	@echo "✅ Build terminé !"
	@echo "📁 Fichiers dans : $(DIST_DIR)"
	@echo ""

# ─── Tests ────────────────────────────────────────────────────────────────────

test:
	@echo "🧪 Lancement des tests unitaires..."
	cd $(ANGULAR_DIR) && npm test

smoke-test:
	@echo "🧪 Lancement des smoke tests..."
	@echo "⚠️  WireMock doit être accessible sur http://localhost:$(WIREMOCK_PORT)"
	@echo ""
	@echo "--- Dashboard ---"
	@bash scripts/test-dashboard.sh
	@echo ""
	@echo "--- Scénarios ---"
	@bash scripts/test-scenarios.sh

# ─── Nettoyage ────────────────────────────────────────────────────────────────

clean:
	@echo "🧹 Nettoyage des fichiers générés..."
	rm -rf $(ANGULAR_DIR)/dist
	rm -rf $(ANGULAR_DIR)/.angular
	rm -rf $(ANGULAR_DIR)/node_modules
	@echo "✅ Nettoyage terminé !"

# ─── Docker ───────────────────────────────────────────────────────────────────

docker-build:
	@echo "🐳 Build de l'image Docker..."
	docker build -t wiremock-ui:latest -f docker/Dockerfile .
	@echo "✅ Image Docker créée : wiremock-ui:latest"

docker-up:
	@echo "🐳 Démarrage avec Docker Compose..."
	docker-compose -f docker/docker-compose.yml up -d
	@echo "✅ Services démarrés !"
	@echo "   - UI : http://localhost:4200"
	@echo "   - WireMock : http://localhost:8080"

docker-down:
	@echo "🐳 Arrêt des services Docker..."
	docker-compose -f docker/docker-compose.yml down
	@echo "✅ Services arrêtés !"

#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="docker-compose.prod.yml"

echo "=== Déploiement Inventaire Tournant ==="
echo "Répertoire : $DEPLOY_DIR"
echo "Date       : $(date '+%Y-%m-%d %H:%M:%S')"
echo "======================================="

cd "$DEPLOY_DIR"

# ── 1. Récupération des sources ────────────────────────────────────────────────
echo ""
echo "[1/4] git pull origin main..."
git pull origin main

# ── 2. Build et redémarrage des conteneurs ────────────────────────────────────
echo ""
echo "[2/4] Build et démarrage des conteneurs..."
docker compose -f "$COMPOSE_FILE" up -d --build --remove-orphans

# ── 3. Vérification que le backend est sain avant les migrations ──────────────
echo ""
echo "[3/4] Attente du backend (max 60s)..."
for i in $(seq 1 12); do
    if docker compose -f "$COMPOSE_FILE" exec -T backend curl -sf http://localhost:8000/health > /dev/null 2>&1; then
        echo "  Backend prêt."
        break
    fi
    echo "  ... tentative $i/12"
    sleep 5
done

# ── 4. Statut final ────────────────────────────────────────────────────────────
echo ""
echo "[4/4] Statut des conteneurs :"
docker compose -f "$COMPOSE_FILE" ps

echo ""
echo "=== Déploiement terminé ==="

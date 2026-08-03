#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="docker-compose.v2.yml"
PROJECT="inventaires_v2"

# Détection docker compose v2 (plugin) ou docker-compose v1 (binaire séparé)
if docker compose version > /dev/null 2>&1; then
    DC="docker compose"
elif command -v docker-compose > /dev/null 2>&1; then
    DC="docker-compose"
else
    echo "ERREUR : ni 'docker compose' ni 'docker-compose' n'est disponible." >&2
    exit 1
fi
echo "Commande compose : $DC"

echo "=== Déploiement Inventaire Tournant V2 ==="
echo "Répertoire : $DEPLOY_DIR"
echo "Projet     : $PROJECT"
echo "Date       : $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="

cd "$DEPLOY_DIR"

# ── 1. Récupération des sources ────────────────────────────────────────────────
echo ""
echo "[1/5] git pull origin v2..."
git pull origin v2

# ── 2. Build et redémarrage des conteneurs ────────────────────────────────────
echo ""
echo "[2/5] Build et démarrage des conteneurs v2..."
$DC -p "$PROJECT" -f "$COMPOSE_FILE" down --remove-orphans
$DC -p "$PROJECT" -f "$COMPOSE_FILE" up -d --build

# ── 3. Connexion réseau proxy ──────────────────────────────────────────────────
echo ""
echo "[3/5] Connexion du backend v2 au réseau proxy..."
sleep 3

BACKEND_ID=$(docker ps \
    --filter "label=com.docker.compose.project=${PROJECT}" \
    --filter "label=com.docker.compose.service=backend" \
    -q | head -1)

if [ -z "$BACKEND_ID" ]; then
    BACKEND_ID=$(docker ps -q --filter "name=${PROJECT}_backend_1" 2>/dev/null | head -1)
fi
if [ -z "$BACKEND_ID" ]; then
    BACKEND_ID=$(docker ps -q --filter "name=${PROJECT}-backend-1" 2>/dev/null | head -1)
fi

if [ -n "$BACKEND_ID" ]; then
    BACKEND_NAME=$(docker inspect --format '{{.Name}}' "$BACKEND_ID" | sed 's|^/||')
    echo "  Conteneur backend v2 : $BACKEND_NAME ($BACKEND_ID)"
    docker network connect proxy "$BACKEND_ID" 2>/dev/null && \
        echo "  Backend v2 connecté au réseau proxy." || \
        echo "  (déjà connecté)"
else
    echo "  AVERTISSEMENT : conteneur backend v2 introuvable."
fi

# ── 4. Attente du backend ──────────────────────────────────────────────────────
echo ""
echo "[4/5] Attente du backend v2 (max 60s)..."
for i in $(seq 1 12); do
    if $DC -p "$PROJECT" -f "$COMPOSE_FILE" exec -T backend curl -sf http://localhost:3004/health > /dev/null 2>&1; then
        echo "  Backend v2 prêt."
        break
    fi
    echo "  ... tentative $i/12"
    sleep 5
done

if curl -sf http://localhost:3014/health > /dev/null 2>&1; then
    echo "  Backend v2 accessible depuis l'hôte (port 3014)."
else
    echo "  AVERTISSEMENT : backend v2 non accessible sur le port 3014."
fi

# ── 5. Rechargement NPM ────────────────────────────────────────────────────────
echo ""
echo "[5/5] Rechargement NPM..."
if docker exec npm-app nginx -s reload 2>/dev/null; then
    echo "  NPM rechargé."
else
    echo "  (npm-app introuvable, ignoré)"
fi

echo ""
echo "=== Déploiement V2 terminé ==="
echo ""
echo "Ports v2 :"
echo "  Backend       : http://127.0.0.1:3014"
echo "  Frontend admin: http://127.0.0.1:3013"
echo "  Frontend tab  : http://127.0.0.1:3012"
echo ""
$DC -p "$PROJECT" -f "$COMPOSE_FILE" ps

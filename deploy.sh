#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="docker-compose.prod.yml"

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

echo "=== Déploiement Inventaire Tournant ==="
echo "Répertoire : $DEPLOY_DIR"
echo "Date       : $(date '+%Y-%m-%d %H:%M:%S')"
echo "======================================="

cd "$DEPLOY_DIR"

# ── 1. Récupération des sources ────────────────────────────────────────────────
echo ""
echo "[1/5] git pull origin main..."
git pull origin main

# ── 2. Build et redémarrage des conteneurs ────────────────────────────────────
echo ""
echo "[2/5] Build et démarrage des conteneurs..."
# Down nécessaire pour éviter le bug ContainerConfig de docker-compose v1.29.2
$DC -f "$COMPOSE_FILE" down --remove-orphans
$DC -f "$COMPOSE_FILE" up -d --build

# ── 3. Connexion réseau proxy (contournement bug docker-compose v1.29.2)
# On utilise l'ID du conteneur pour éviter les différences de nommage v1/v2
# (v1 : inventaires_tournants_backend_1, v2 : inventaires_tournants-backend-1)
echo ""
echo "[3/5] Connexion du backend au réseau proxy..."
sleep 3  # laisse Docker créer les conteneurs avant d'inspecter

PROJECT_NAME=$(basename "$DEPLOY_DIR" | tr '[:upper:]' '[:lower:]' | tr ' ' '_' | tr '-' '_')
BACKEND_ID=$(docker ps \
    --filter "label=com.docker.compose.project=${PROJECT_NAME}" \
    --filter "label=com.docker.compose.service=backend" \
    -q | head -1)

if [ -z "$BACKEND_ID" ]; then
    # Fallback : essai par noms conventionnels
    BACKEND_ID=$(docker ps -q --filter "name=${PROJECT_NAME}_backend_1" 2>/dev/null | head -1)
fi
if [ -z "$BACKEND_ID" ]; then
    BACKEND_ID=$(docker ps -q --filter "name=${PROJECT_NAME}-backend-1" 2>/dev/null | head -1)
fi

if [ -n "$BACKEND_ID" ]; then
    BACKEND_NAME=$(docker inspect --format '{{.Name}}' "$BACKEND_ID" | sed 's|^/||')
    echo "  Conteneur backend trouvé : $BACKEND_NAME ($BACKEND_ID)"
    docker network connect proxy "$BACKEND_ID" 2>/dev/null && \
        echo "  Backend connecté au réseau proxy." || \
        echo "  (déjà connecté au réseau proxy)"
else
    echo "  AVERTISSEMENT : conteneur backend introuvable, connexion réseau ignorée."
fi

# ── 4. Vérification que le backend est sain ───────────────────────────────────
echo ""
echo "[4/5] Attente du backend (max 60s)..."
for i in $(seq 1 12); do
    if $DC -f "$COMPOSE_FILE" exec -T backend curl -sf http://localhost:3004/health > /dev/null 2>&1; then
        echo "  Backend prêt (health check interne OK)."
        break
    fi
    echo "  ... tentative $i/12"
    sleep 5
done

# Test d'accessibilité externe (port hôte)
if curl -sf http://localhost:3004/health > /dev/null 2>&1; then
    echo "  Backend accessible depuis l'hôte (port 3004)."
else
    echo "  AVERTISSEMENT : le backend n'est pas accessible depuis l'hôte sur le port 3004."
fi

# ── 5. Rechargement NPM pour re-résoudre les IPs Docker ──────────────────────
# Les conteneurs recrées ont de nouvelles IPs. Sans reload, nginx (NPM) garde
# l'ancienne IP en cache et retourne 502 jusqu'au prochain reload automatique.
echo ""
echo "[5/6] Rechargement NPM (re-résolution DNS Docker)..."
if docker exec npm-app nginx -s reload 2>/dev/null; then
    echo "  NPM rechargé."
else
    echo "  (npm-app introuvable ou déjà à jour, ignoré)"
fi

# ── 6. Statut final ────────────────────────────────────────────────────────────
echo ""
echo "[6/6] Statut des conteneurs :"
$DC -f "$COMPOSE_FILE" ps
echo ""
echo "Conteneurs sur le réseau proxy :"
docker network inspect proxy --format '{{range .Containers}}  - {{.Name}}{{"\n"}}{{end}}' 2>/dev/null || echo "  (réseau proxy introuvable)"

echo ""
echo "=== Déploiement terminé ==="

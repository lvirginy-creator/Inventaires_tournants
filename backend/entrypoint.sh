#!/bin/sh
set -e

echo "[entrypoint] Attente de la base de données…"
# Postgres peut mettre quelques secondes à accepter des connexions même après healthcheck
sleep 2

echo "[entrypoint] Application des migrations Alembic…"
alembic upgrade head

echo "[entrypoint] Démarrage du serveur…"
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2

#!/bin/sh
set -e

echo "[entrypoint] Attente de la base de données…"
until python -c "
import socket, sys
try:
    s = socket.create_connection(('db', 5432), timeout=2)
    s.close()
    sys.exit(0)
except Exception:
    sys.exit(1)
" 2>/dev/null; do
    echo "[entrypoint]   ... DB pas encore prête, nouvelle tentative dans 2s"
    sleep 2
done
echo "[entrypoint] DB prête."

echo "[entrypoint] Application des migrations Alembic…"
alembic upgrade head

echo "[entrypoint] Démarrage du serveur…"
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2

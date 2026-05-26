# CLAUDE.md — Inventaires Tournants

## Architecture

- **Backend** : FastAPI + Python 3.12 + SQLAlchemy 2.0 (async) + Alembic + PostgreSQL 16
- **Frontend admin** : React 18 + Vite + TypeScript (port hôte 3003)
- **Frontend tablette** : React 18 + Vite + TypeScript + PWA (port hôte 3002)
- **Reverse proxy** : Nginx Proxy Manager (conteneur `npm-app` sur réseau Docker `proxy`)

## Serveur VPS

- **docker-compose** : v1.29.2 (ancienne version — binaire `docker-compose`, pas le plugin `docker compose`)
- **Déploiement** : `git pull origin main` depuis `/opt/inventaire_tournants/Inventaires_tournants`, puis `./deploy.sh`
- **Répertoire** : `/opt/inventaire_tournants/Inventaires_tournants`

## Ports

| Service            | Port interne | Port hôte        |
|--------------------|-------------|------------------|
| backend (uvicorn)  | 3004        | 127.0.0.1:3004   |
| frontend-admin     | 80          | 127.0.0.1:3003   |
| frontend-tablette  | 80          | 127.0.0.1:3002   |
| PostgreSQL         | 5432        | non exposé       |

> Port 8000 réservé à Portainer. Port 3001 réservé à uptime-kuma.

## Bugs connus docker-compose v1.29.2 et contournements

### 1. `KeyError: 'ContainerConfig'`
Erreur lors de `up --build` si des conteneurs existent déjà.  
**Fix** : toujours faire `down --remove-orphans` avant `up`.  
C'est intégré dans `deploy.sh`.

### 2. Réseau proxy non attaché au backend
docker-compose v1.29.2 n'attache pas toujours correctement le backend au réseau `proxy` externe.  
**Fix** : `docker network connect proxy inventaires_tournants_backend_1` après chaque `up`.  
C'est intégré dans `deploy.sh`.

### 3. Port binding parfois non appliqué
Lié au bug `ContainerConfig` — résolu par le `down` systématique avant `up`.

## Migrations Alembic — pièges SQLAlchemy 2.0

### ENUM PostgreSQL dans `op.create_table`
Ne jamais utiliser `sa.Enum(name="...", create_type=False)` dans `op.create_table` — le paramètre `create_type` est **ignoré** par `sa.Enum`.

Utiliser **toujours** `postgresql.ENUM(create_type=False)` :

```python
from sqlalchemy.dialects import postgresql

sa.Column(
    "statut",
    postgresql.ENUM("val1", "val2", name="montype", create_type=False),
    ...
)
```

Et créer l'ENUM explicitement avant via un bloc DO/EXCEPTION :

```python
op.execute(sa.text("""
    DO $$ BEGIN
        CREATE TYPE montype AS ENUM ('val1', 'val2');
    EXCEPTION
        WHEN duplicate_object THEN null;
    END $$;
"""))
```

## Configuration Nginx Proxy Manager

Les conteneurs sont accessibles depuis NPM via le réseau Docker `proxy` (par nom de conteneur) **ou** via le port hôte `127.0.0.1:3004`.

### Proxy Host — Interface Admin (`admin.domaine.com`)

- Forward Hostname : `inventaires_tournants_frontend-admin_1`
- Forward Port : `80`
- Websockets : activé

Custom Nginx (onglet Advanced) :
```nginx
location /api/ {
    proxy_pass http://inventaires_tournants_backend_1:3004;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
}
location /health {
    proxy_pass http://inventaires_tournants_backend_1:3004/health;
}
```

### Proxy Host — Interface Tablette (`tablette.domaine.com`)

- Forward Hostname : `inventaires_tournants_frontend-tablette_1`
- Forward Port : `80`
- Websockets : activé

Custom Nginx (onglet Advanced) : identique à ci-dessus.

## Procédure de déploiement complet (nouveau serveur ou volume perdu)

```bash
cd /opt/inventaire_tournants/Inventaires_tournants
docker-compose -f docker-compose.prod.yml down
docker volume rm inventaires_tournants_pgdata_prod
docker ps -a --filter "name=inventaires_tournants" -q | xargs -r docker rm -f
git pull origin main
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d
sleep 8
docker network connect proxy inventaires_tournants_backend_1 2>/dev/null || echo "déjà connecté"
docker-compose -f docker-compose.prod.yml logs --tail=30 backend
```

## Procédure de mise à jour normale (code seulement)

```bash
cd /opt/inventaire_tournants/Inventaires_tournants
./deploy.sh
```

## Dépendances notables

- `pydantic[email]` requis (et non `pydantic`) pour `EmailStr`
- `psycopg2-binary` pour les migrations Alembic (synchrone), `asyncpg` pour SQLAlchemy async
- `python-jose[cryptography]` pour les JWT
- `passlib[bcrypt]` pour le hachage des mots de passe

## Variables d'environnement (.env sur le serveur)

Fichier `.env` à la racine, non versionné. Variables requises :

```
POSTGRES_USER=
POSTGRES_PASSWORD=   # éviter les caractères spéciaux URL (<, @, #, ?, &)
POSTGRES_DB=inventaire
JWT_SECRET=
CORS_ORIGINS=
SMTP_HOST=
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_USE_TLS=true
MAIL_FROM_ADDRESS=
MAIL_FROM_NAME=Inventaire G2C
MAIL_REPLY_TO=
```

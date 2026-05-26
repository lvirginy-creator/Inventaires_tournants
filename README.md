# Inventaire Tournant G2C

Application de digitalisation des inventaires tournants hebdomadaires pour le Groupe G2C (Antilles françaises et Guyane).

## Architecture

| Service | Technologie | Description |
|---------|-------------|-------------|
| **backend** | FastAPI · Python 3.12 · PostgreSQL 16 | API REST + JWT auth |
| **frontend-admin** | React 18 · Vite · TypeScript · Tailwind | Interface siège (campagnes, rapports, référentiels) |
| **frontend-tablette** | React 18 · Vite · Dexie.js · PWA | Comptage offline-first sur tablettes en magasin |
| **nginx** | nginx 1.25 | Reverse proxy SSL, routing par sous-domaine |

---

## Démarrage rapide — Développement

```bash
# 1. Copier et adapter les variables d'environnement
cp .env.example .env

# 2. Démarrer la stack (PostgreSQL + backend + mailpit)
docker compose up -d

# 3. Appliquer les migrations
docker compose exec backend alembic upgrade head

# 4. (Optionnel) Données de seed
docker compose exec backend python -m scripts.seed_data
```

| Service | URL locale |
|---------|-----------|
| API | http://localhost:8000 |
| Swagger / ReDoc | http://localhost:8000/docs |
| Mailpit (e-mails dev) | http://localhost:8025 |

```bash
# Frontend admin (hot-reload)
cd frontend-admin && npm install && npm run dev   # → http://localhost:5173

# Frontend tablette (hot-reload)
cd frontend-tablette && npm install && npm run dev # → http://localhost:5174
```

---

## Tests

```bash
# Lancer un PostgreSQL de test isolé
docker run -d --name pg-test \
  -e POSTGRES_PASSWORD=inv_pass \
  -e POSTGRES_USER=inv_user \
  -e POSTGRES_DB=inventaire_test \
  -p 5433:5432 postgres:16-alpine

# Installer les dépendances de dev et lancer la suite
cd backend
pip install -e ".[dev]"
TEST_DATABASE_URL=postgresql+asyncpg://inv_user:inv_pass@localhost:5433/inventaire_test \
  pytest -x -q
```

---

## Déploiement Production

### Prérequis

- Docker ≥ 24 · Docker Compose ≥ 2.20
- Certificats SSL dans `nginx/ssl/cert.pem` et `nginx/ssl/key.pem`
- Fichier `.env` renseigné à partir de `.env.example`
- DNS configurés pour vos deux sous-domaines

### Adapter nginx

Éditer `nginx/nginx.conf` — remplacer les `server_name` par vos domaines réels :

```nginx
server_name tablette.votre-domaine.com;   # frontend-tablette
server_name admin.votre-domaine.com;      # frontend-admin
```

### Lancer la stack

```bash
# Build et démarrage (migrations appliquées automatiquement au démarrage backend)
docker compose -f docker-compose.prod.yml up -d --build

# Vérifier les logs
docker compose -f docker-compose.prod.yml logs -f backend
```

### Mise à jour

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

---

## Intégration continue (GitHub Actions)

Le workflow `.github/workflows/ci.yml` s'exécute à chaque push sur `main` et `feature/**` :

| Job | Contenu |
|-----|---------|
| `backend-lint` | `ruff check app/ tests/` |
| `backend-tests` | `pytest -x -q` avec PostgreSQL 16 en service |
| `frontend-admin` | `tsc --noEmit` |
| `frontend-tablette` | `tsc --noEmit` |

---

## Structure du projet

```
inventaires-tournants/
├── backend/                  # FastAPI + SQLAlchemy 2.0 + Alembic
│   ├── app/
│   │   ├── api/v1/           # Routers (campagnes, comptages, rapport…)
│   │   ├── models/           # Modèles SQLAlchemy
│   │   ├── schemas/          # Schémas Pydantic v2
│   │   ├── services/         # E-mail (aiosmtplib + Jinja2)
│   │   └── core/             # Config, sécurité, DB
│   ├── alembic/              # Migrations
│   ├── tests/                # Tests d'intégration (pytest-asyncio)
│   ├── Dockerfile            # Image prod (entrypoint migrations + uvicorn)
│   └── Dockerfile.dev        # Image dev (hot-reload)
├── frontend-admin/           # Interface siège
│   ├── src/
│   │   ├── pages/            # Campagnes, Articles, Magasins, Tablettes…
│   │   ├── components/       # Layout, ErrorBoundary
│   │   └── api/client.ts     # Axios + auto-refresh JWT
│   ├── Dockerfile            # Multi-stage node:20 → nginx:alpine
│   └── nginx.conf            # SPA config (try_files, cache headers)
├── frontend-tablette/        # PWA offline-first
│   ├── src/
│   │   ├── pages/            # Dashboard, CountPage, Settings
│   │   ├── components/       # OfflineBanner
│   │   ├── db/               # Dexie (IndexedDB)
│   │   └── store/            # Zustand (auth)
│   ├── Dockerfile            # Multi-stage node:20 → nginx:alpine
│   └── nginx.conf            # SPA + SW cache config
├── nginx/nginx.conf          # Reverse proxy prod (SSL, 2 sous-domaines)
├── .github/workflows/ci.yml  # CI GitHub Actions
├── docker-compose.yml        # Dev (avec mailpit)
├── docker-compose.prod.yml   # Production (5 services)
└── .env.example              # Variables d'environnement documentées
```

---

## Jalons de développement

| Jalon | Contenu | Statut |
|-------|---------|--------|
| 1 | Fondations backend (auth JWT, modèles, migrations, CRUD de base) | ✅ |
| 2 | Référentiels admin — utilisateurs, frontend-admin (React + Vite) | ✅ |
| 3 | Articles (CRUD + import CSV/XLSX) | ✅ |
| 4 | Campagnes admin (CRUD, lignes, import articles, transitions statut) | ✅ |
| 5 | Frontend tablette — appairage, login, catalogue, comptage online | ✅ |
| 6 | Validation responsable + envoi e-mail (aiosmtplib + Jinja2) | ✅ |
| 7 | Rapport d'inventaire — admin, export CSV/XLSX (openpyxl) | ✅ |
| 8 | Multi-comptages et réconciliation admin (saisie manuelle, suppression) | ✅ |
| 9 | Polish · Docker Compose prod · CI GitHub Actions | ✅ |

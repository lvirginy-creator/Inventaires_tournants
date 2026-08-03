# Backend — Inventaire Tournant G2C

FastAPI · Python 3.12 · SQLAlchemy 2.0 (async) · PostgreSQL 16 · Alembic

## Architecture

```
backend/
├── app/
│   ├── api/v1/          # Endpoints REST (auth, campagnes, comptages, …)
│   ├── core/            # Config, DB, sécurité, limiter
│   ├── models/          # SQLAlchemy ORM (Campagne, Comptage, Article, …)
│   └── schemas/         # Pydantic v2 (request / response)
├── alembic/versions/    # Migrations SQL
├── tests/               # pytest + pytest-asyncio
└── scripts/             # seed_data.py, utilitaires
```

## Démarrage local

```bash
# Variables d'environnement
cp ../.env.example ../.env   # adapter les valeurs

# Démarrer la stack dev (PostgreSQL + mailpit inclus)
docker compose up -d db mailpit

# Installer les dépendances Python
pip install -e ".[dev]"

# Appliquer les migrations
alembic upgrade head

# Lancer le serveur (port 8000)
uvicorn app.main:app --reload
```

API Swagger disponible sur `http://localhost:8000/docs`.

## Migrations Alembic

```bash
# Créer une nouvelle révision (ne jamais modifier une révision existante)
alembic revision --autogenerate -m "description_courte"

# Appliquer
alembic upgrade head

# Rollback d'une révision
alembic downgrade -1
```

> **Règle absolue** : ne jamais modifier une migration existante. Toujours créer une nouvelle révision.

### ENUM PostgreSQL

Utiliser `postgresql.ENUM(create_type=False)` dans `op.create_table` et créer l'ENUM explicitement avec un bloc `DO $$ ... EXCEPTION WHEN duplicate_object` avant. Voir `CLAUDE.md` pour le détail.

## Tests

```bash
# Lancer une instance PostgreSQL de test
docker run -d --name pg-test \
  -e POSTGRES_USER=inv_user -e POSTGRES_PASSWORD=inv_pass_ci \
  -e POSTGRES_DB=inventaire_test \
  -p 5433:5432 postgres:16-alpine

# Variable d'environnement requise
export TEST_DATABASE_URL=postgresql+asyncpg://inv_user:inv_pass_ci@localhost:5433/inventaire_test
export JWT_SECRET=ci_test_jwt_secret_32_chars_minimum!!

# Tous les tests
pytest -x -q

# Un fichier spécifique
pytest tests/test_comptages.py -v
```

Cible de couverture : **> 80 %** sur les services métier.

## Principaux endpoints

| Méthode | Endpoint | Rôle |
|---------|----------|------|
| POST | `/api/v1/auth/tablette/login` | Login tablette (role selon password) |
| POST | `/api/v1/auth/tablette/renouveler` | Renouvellement token (glissant 7 j) |
| GET | `/api/v1/campagne-active` | Campagne en cours du magasin |
| POST | `/api/v1/campagne-active/cloturer` | Clôturer (rôle responsable_depot) |
| POST | `/api/v1/comptages` | Soumettre un comptage (idempotent) |
| POST | `/api/v1/comptages/batch` | Batch sync offline (200/h par tablette) |
| GET | `/api/v1/catalogue` | Catalogue articles complet |
| GET | `/api/v1/catalogue/sync` | Catalogue incrémental (`?since=<ISO>`) |
| DELETE | `/api/v1/campagne-active/comptages/{uuid}` | Supprimer un comptage |

## Dépendances notables

- `pydantic[email]` (et non `pydantic`) — requis pour `EmailStr`
- `psycopg2-binary` — migrations Alembic synchrones
- `asyncpg` — SQLAlchemy async
- `python-jose[cryptography]` — JWT
- `passlib[bcrypt]` — hachage mots de passe
- `slowapi` — rate limiting (IP + tablette_id)

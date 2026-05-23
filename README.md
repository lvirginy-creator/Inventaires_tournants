# Inventaire Tournant G2C

Application de digitalisation des inventaires tournants hebdomadaires pour le Groupe G2C (Antilles françaises et Guyane).

## Architecture

- **Backend** : FastAPI / Python 3.12 / PostgreSQL 16
- **Frontend admin** : React 18 + Vite + TypeScript (Jalon 2+)
- **Frontend tablette** : PWA offline-first — React 18 + Dexie.js (Jalon 5+)

## Lancement rapide (développement)

```bash
cp .env.example .env
# Éditer .env si nécessaire

docker compose up -d

# Appliquer les migrations
docker compose exec backend alembic upgrade head

# Données de seed
docker compose exec backend python -m scripts.seed_data
```

API disponible sur `http://localhost:8000`  
Documentation Swagger : `http://localhost:8000/docs`  
Interface Mailpit (mails de dev) : `http://localhost:8025`

## Lancer les tests

```bash
# Lancer PostgreSQL de test (port 5433)
docker run -d --name pg-test \
  -e POSTGRES_PASSWORD=inv_pass -e POSTGRES_USER=inv_user -e POSTGRES_DB=inventaire_test \
  -p 5433:5432 postgres:16-alpine

cd backend
pip install -e ".[dev]"
TEST_DATABASE_URL=postgresql+asyncpg://inv_user:inv_pass@localhost:5433/inventaire_test pytest -v
```

## Structure du projet

```
inventaire-tournant/
├── backend/           # FastAPI + SQLAlchemy
├── frontend-admin/    # Interface admin siège (Jalon 2+)
├── frontend-tablette/ # PWA tablette (Jalon 5+)
└── nginx/             # Reverse proxy (prod)
```

## Jalons de développement

| Jalon | Contenu | Statut |
|---|---|---|
| 1 | Fondations backend (auth, modèles, migrations) | ✅ En cours |
| 2 | Référentiels admin (CRUD sociétés/magasins/tablettes) | ⬜ |
| 3 | Articles (import Excel) | ⬜ |
| 4 | Campagnes (administration) | ⬜ |
| 5 | Tablette (login + comptage online) | ⬜ |
| 6 | Tablette offline + synchronisation | ⬜ |
| 7 | Comptages multiples et modifications | ⬜ |
| 8 | Validation, envoi mail, exports Excel | ⬜ |
| 9 | Polissage et déploiement | ⬜ |
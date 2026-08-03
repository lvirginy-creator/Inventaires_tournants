# Frontend Tablette — Inventaire Tournant G2C

React 18 · TypeScript · Vite · Tailwind CSS · Dexie.js (IndexedDB) · PWA offline-first

## Architecture

```
frontend-tablette/src/
├── api/client.ts        # axios instance + intercepteurs JWT / 401
├── components/          # OfflineBanner
├── db/
│   ├── schema.ts        # Dexie DB (articles, campagne, comptages, meta, …)
│   ├── sync.ts          # Logique de synchronisation (upload batch, catalogue, campagne)
│   └── authLocal.ts     # Vérificateur offline PBKDF2 (Web Crypto API)
├── hooks/               # useTokenRenewal
├── pages/               # Dashboard, Login, Pairing, Settings, OfflineUnlock
├── store/               # Zustand : auth (persisté) + sync (volatile)
├── sync/SyncManager.ts  # Singleton auto-sync (3 min interval, backoff 5s→5min)
└── types/index.ts       # Interfaces TypeScript partagées
```

## Démarrage local

```bash
npm install
npm run dev        # port 5174 (proxy /api → http://localhost:8000)
```

## Build production

```bash
npm run build      # tsc + vite build → dist/
```

Le build génère un Service Worker (Workbox) pour le mode offline.

## Tests

```bash
npm test           # vitest run (7 tests unitaires authLocal PBKDF2)
npm run test:watch # mode watch
```

## Schéma Dexie (IndexedDB)

| Store | PK | Description |
|-------|----|-------------|
| `articles` | `id` | Catalogue local (sync depuis `/catalogue`) |
| `campagne` | `++_key` | Campagne active (une seule ligne) |
| `comptages` | `client_uuid` | Comptages locaux (synced / pending) |
| `meta` | `key` | Clés/valeurs (lastSyncAt) |
| `deletionsQueue` | `client_uuid` | File de suppressions différées (offline) |
| `authLocal` | `id` | Verifier PBKDF2 pour déverrouillage offline |

> Ne jamais effacer les comptages `synced=false` dans un flux d'erreur.

## Installation PWA sur tablette Android

1. Ouvrir l'URL de l'application dans Chrome
2. Menu Chrome → **Ajouter à l'écran d'accueil**
3. L'application s'installe comme une appli native (icône, mode plein écran)
4. Après installation, l'appli fonctionne entièrement offline après le premier chargement

## Mode hors-ligne

- Le SyncManager déclenche la sync automatiquement toutes les 3 minutes et au retour réseau
- En cas d'échec, backoff exponentiel : 5 s → 15 s → 45 s → 2 min → 5 min
- Si la connexion est totalement absente, l'opérateur peut se déverrouiller via son mot de passe (vérifié localement avec PBKDF2 sans aller au serveur)
- Les comptages en attente (`synced=false`) ne sont jamais perdus, même sur fermeture brutale

## Variables d'environnement

Aucune variable requise en dev (le proxy Vite route `/api` vers `localhost:8000`).

En production, le build utilise `VITE_API_URL` si défini (sinon `/api` relatif via Nginx).

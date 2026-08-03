# Frontend Admin — Inventaire Tournant G2C

React 18 · TypeScript · Vite · Tailwind CSS

Interface de gestion siège : création et suivi des campagnes, validation, rapports, référentiels.

## Démarrage local

```bash
npm install
npm run dev        # port 5173 (proxy /api → http://localhost:8000)
```

## Build production

```bash
npm run build      # tsc + vite build → dist/
```

## Scripts disponibles

| Commande | Description |
|----------|-------------|
| `npm run dev` | Serveur de développement (HMR) |
| `npm run build` | Build de production |
| `npm run preview` | Prévisualiser le build prod localement |
| `npm run lint` | ESLint (0 warning toléré) |
| `npm run format` | Prettier |

## Authentification

L'admin se connecte avec email + mot de passe. Le JWT d'accès est renouvelé automatiquement via le refresh token (8h). En cas d'expiration, l'utilisateur est redirigé vers la page de connexion.

## Fonctionnalités principales

- **Référentiels** : sociétés, magasins, articles, tablettes
- **Campagnes** : création, import articles (Excel), démarrage, suivi en temps réel
- **Comptages** : vue par article, correction manuelle, suppression
- **Validation** : rapport d'écarts, envoi par mail (responsable dépôt → siège)
- **Rapport** : export Excel des écarts et des codes-barres inconnus

## Variables d'environnement

```env
VITE_API_URL=https://admin.ton-domaine.com/api/v1   # optionnel, défaut = /api/v1
```

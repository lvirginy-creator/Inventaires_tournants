# Projet : Application Inventaire Tournant — G2C

## Contexte

Tu vas développer une application web pour la gestion des inventaires tournants hebdomadaires d'un groupe de distribution (Groupe G2C, ~20 magasins / 7 sociétés dans les Antilles françaises et en Guyane).

Cette application est le **deuxième volet** d'une suite d'applications opérationnelles : la première (application de réception des marchandises) est déjà en production. Tu dois **reprendre fidèlement les mêmes choix techniques et conventions** que cette première application pour assurer la cohérence (notamment le modèle d'authentification tablette : login = nom du magasin, mot de passe = définit le rôle).

## Document de référence

Le fichier `spec_inventaire_tournant_v3.md` (joint à ce projet) contient la spécification fonctionnelle et technique complète. **Tu dois t'y conformer strictement**.

Tout au long du développement :
- Si un point de la spec te semble ambigu ou incomplet, **arrête-toi et pose-moi la question** avant de faire une hypothèse.
- Si tu identifies une incohérence dans la spec, signale-la avant de coder.
- Ne fais pas d'hypothèses silencieuses sur le comportement métier ; demande confirmation.

## Méthode de travail

### Mode incrémental par jalons

Le développement suit les **9 jalons** définis dans la spec § 12. Tu vas les traiter **un par un dans l'ordre**, en respectant cette discipline pour chaque jalon :

1. **Annonce du jalon** : tu rappelles le périmètre du jalon et listes les livrables attendus.
2. **Plan détaillé** : avant de coder, tu présentes un découpage en sous-tâches techniques et tu attends ma validation.
3. **Implémentation** : tu codes le jalon en commits atomiques (un commit = une sous-tâche cohérente, message conventionnel `feat:`, `fix:`, `test:`, etc.).
4. **Tests** : tu écris les tests au fur et à mesure (pas tous à la fin). Pour chaque nouvelle fonctionnalité backend, un test pytest minimum.
5. **Bilan du jalon** : à la fin, tu me listes ce qui a été fait, ce qui n'a pas été fait (avec justification), et tu fais une démo (commandes pour tester localement).
6. **Validation explicite** : je dois valider avant que tu passes au jalon suivant.

### Discipline de code

- **Python 3.12**, formatage `ruff format` + `ruff check` zéro warning à la fin de chaque jalon
- **TypeScript strict** côté frontend, ESLint + Prettier zéro warning
- **Type hints obligatoires** en Python, **interfaces typées** en TypeScript
- **Docstrings** sur toute fonction de service backend (description + paramètres + erreurs levées)
- **Pas de code mort** : ne laisse pas de fichiers stubs, de TODOs vagues, ou de fonctions inutilisées
- **Pas de dépendances superflues** : avant d'ajouter une lib, vérifie qu'elle est vraiment nécessaire
- **Messages d'erreur en français** côté tablette (utilisateurs opérationnels), techniques en anglais côté backend (logs/devs)

### Structure et organisation

Suis la structure de projet définie dans la spec § 11. Si tu juges nécessaire de la modifier, explique pourquoi et attends mon accord.

### Git

- Branche `main` protégée, développe sur `feature/jalon-X-nom-court`
- Commits conventionnels (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`)
- À la fin de chaque jalon, tu prépares un récapitulatif de PR (titre + description + checklist)
- Tags Git à la validation de chaque jalon : `v0.1-jalon1`, `v0.2-jalon2`, etc.

### Tests

- **Backend** : pytest + pytest-asyncio + httpx. Cible **80% de couverture** sur les services métier (pas 100% — pas de tests sans valeur).
- **Frontend** : Vitest pour les utilitaires, React Testing Library pour les composants critiques (login, comptage, validation).
- **Tests d'intégration** sur les workflows critiques : import campagne, cycle de comptage complet, validation + envoi mail (avec MailHog/Mailpit en mode dev).

### Documentation

- README à la racine : installation, commandes principales, troubleshooting
- README dans `backend/` : architecture, comment lancer les migrations, comment tester
- README dans `frontend-admin/` et `frontend-tablette/` : dev local, build prod
- Documentation Swagger auto-générée par FastAPI (`/docs`) accessible

### Environnement et sécurité

- **Aucun secret en dur dans le code** : tout passe par variables d'environnement
- `.env.example` complet et à jour, jamais de vrai `.env` commité
- Pour le SMTP en dev : utilise **Mailpit** (conteneur Docker) — ajoute-le au `docker-compose.yml` de dev
- Postgres en local via Docker
- Données de seed minimales mais représentatives (1 société, 2 magasins, 5 articles, 1 campagne en brouillon)

## Points d'attention spécifiques

### Authentification tablette
Reproduis fidèlement le mécanisme de l'application réception : login = nom du magasin pré-rempli (non modifiable), saisie du seul mot de passe, le mot de passe testé contre `password_operateur_hash` puis `password_responsable_hash` pour déterminer le rôle. Si tu as accès au code de l'app réception, mutualise au maximum. Sinon, demande-moi.

### Mode offline
**Critique pour ce projet**. Le mode offline doit être réellement testé :
- Login offline avec hash locaux
- Comptage offline avec accumulation des actions
- Sync manuelle au retour réseau (bouton)
- Idempotence stricte via `client_uuid` sur comptages, codes-barres inconnus, sessions
- **Aucune perte de données** ne doit être possible même si la tablette est fermée brutalement entre deux syncs

### Envoi de mail
L'envoi du mail à la validation du responsable est **le livrable visible** de l'application. Soigne-le particulièrement :
- Synchrone à la validation (l'utilisateur a un retour immédiat)
- Retry async en cas d'échec (background task)
- Templates Jinja2 propres (HTML + texte)
- Test obligatoire avec Mailpit en dev
- Affichage clair côté tablette du résultat (mail parti ou non)

### Codes-barres inconnus
Quand l'opérateur sélectionne manuellement un article pour un code-barres inconnu, **deux écritures DB** :
1. Ajout du code-barres dans `articles_codes_barres` (pour les prochains scans)
2. Trace dans `codes_barres_inconnus` (pour le rapport mail)

Les deux dans la même transaction. Si l'une échoue, on rollback.

### Performance
- Les magasins peuvent avoir une connexion lente : optimise les payloads de sync (pagination si > 100 articles, compression gzip activée côté Nginx)
- IndexedDB doit rester < 50 Mo même en accumulant l'historique des syncs précédents (purge `comptages_synced` après 90 jours)

## Demande de démarrage

Avant de commencer le **Jalon 1**, fais les actions suivantes :

1. **Lis intégralement** `spec_inventaire_tournant_v3.md` et fais-moi un résumé en 10 lignes maximum de ta compréhension du projet
2. Liste les **3 à 5 questions ouvertes** que tu identifies après lecture (ambiguïtés, choix techniques à trancher, dépendances à l'app réception). Ne propose pas de réponse — j'y répondrai
3. Liste les **outils et versions** que tu prévois d'utiliser (FastAPI version, SQLAlchemy version, React version, Vite version, Dexie version, aiosmtplib, etc.) avec justification rapide
4. Confirme que tu as bien compris le **modèle d'authentification tablette** (login magasin + password rôle)

Une fois ces 4 points traités et validés par moi, on enchaîne sur le plan détaillé du Jalon 1.

## Rappel final

- Pas de bavardage inutile, va à l'essentiel
- Pas d'auto-félicitation à chaque étape
- Pas de "Voici un code complet et robuste" avant tests
- Si tu bloques, dis-le honnêtement et propose 2-3 alternatives
- Si je te demande de modifier quelque chose, ne reprends pas tout — fais juste la modification demandée
- Sois rigoureux sur les détails métier : un écart de comptage non pris en compte ou un mail non envoyé = bug critique

Bon développement.

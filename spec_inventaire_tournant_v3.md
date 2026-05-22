# Application Inventaire Tournant — G2C

## Spécification technique pour développement avec Claude Code — v3

> **Changelog v3** (par rapport à v2)
> - Modèle d'authentification tablette aligné sur l'application réception : login = nom du magasin, mot de passe = définit le rôle (opérateur / responsable dépôt)
> - Ajout du rôle **responsable dépôt** sur la tablette
> - **Validation de l'inventaire** par le responsable dépôt depuis la tablette (suppression du couple admin "clôturer + valider")
> - **Envoi automatique par mail** du rapport Excel des écarts au responsable dépôt après validation
> - Gestion des **codes-barres inconnus** : sélection manuelle de l'article par l'opérateur, ajout du code-barres à la base, et rapport joint au mail
> - Ajout des tables `sessions_tablette`, `codes_barres_inconnus`, `envois_mail`
> - Configuration SMTP (Microsoft 365 ou équivalent) et templates Jinja2
> - Cycle de vie campagne simplifié : `brouillon` → `en_cours` → `terminee` (automatique) → `archivee`

---

## 1. Contexte et objectifs

### 1.1 Présentation

Groupe G2C est un groupe de distribution multi-sites opérant dans les Antilles françaises et en Guyane (Guadeloupe, Martinique, Guyane). Le groupe compte environ 20 sites répartis sur 7 sociétés.

Cette application a pour objectif de **digitaliser le processus d'inventaire tournant** réalisé chaque semaine dans les magasins/dépôts du groupe. Elle complète l'application de réception des marchandises (PWA tablette) déjà développée et **réutilise la même stack technique** pour assurer une homogénéité opérationnelle.

### 1.2 Principes fonctionnels

- Inventaire tournant hebdomadaire portant sur 10 à 100 articles par campagne
- Une tablette par magasin/dépôt, partagée entre les opérateurs ; le mot de passe saisi détermine le rôle (opérateur de comptage ou responsable dépôt)
- Mode offline-first obligatoire (la wifi ne couvre pas tous les magasins)
- Import Excel de la liste des articles à inventorier
- Comptage via lecteur code-barres Netum (Bluetooth) ou saisie manuelle
- Validation de l'inventaire par le responsable dépôt depuis la tablette → envoi automatique par mail des écarts (Excel) et des codes-barres inconnus rencontrés
- Intégration manuelle des résultats dans la gestion (ERP) après réception du mail

### 1.3 Hors périmètre

- Inventaire annuel complet (intentionnellement exclu pour simplicité)
- Valorisation financière des écarts (uniquement écarts en quantité)
- Intégration directe avec l'ERP (export Excel suffisant)
- Authentification utilisateur individuelle nominative (l'authentification se fait au niveau du magasin, avec un mot de passe partagé par rôle)

---

## 2. Stack technique

Identique à l'application de réception des marchandises :

| Couche | Technologie |
|---|---|
| Frontend | React 18 + Vite + TypeScript |
| PWA / Offline | Service Worker + IndexedDB (Dexie.js) |
| UI | Tailwind CSS + composants custom |
| Scan code-barres | Compatible lecteur Netum Bluetooth (saisie clavier émulée) + saisie manuelle |
| Backend | FastAPI (Python 3.12) |
| Base de données | PostgreSQL 16 |
| ORM | SQLAlchemy 2.x + Alembic (migrations) |
| Auth backend | JWT (tokens par tablette/magasin) |
| Envoi de mails | SMTP (Microsoft 365 ou équivalent) via `aiosmtplib` + templates Jinja2 |
| Déploiement | Docker Compose |
| Reverse proxy | Nginx |

### 2.1 Mutualisation avec l'application de réception

L'application réutilise les tables de référence suivantes si elles existent déjà dans la base de l'application de réception :

- `societes` (7 sociétés du groupe)
- `magasins` (≈20 magasins/dépôts)
- `utilisateurs` (comptes admin siège)
- `tablettes` (rattachement tablette ↔ magasin)

Bases partagées avec Application réception : 

- Table articles 
- Table code-barres
- Tablettes
- Table sociétés
- Table magasins
- Table utilisateurs et mots de passes

---

## 3. Architecture générale

### 3.1 Trois interfaces

1. **Interface ADMIN SIÈGE (web desktop)**
   - Gestion des sociétés, magasins, articles de référence
   - Création et import des campagnes d'inventaire
   - Suivi des campagnes en cours
   - Clôture, validation et export des résultats

2. **Interface TABLETTE MAGASIN (PWA, offline-first)**
   - Vue des campagnes actives pour le magasin
   - Scan / saisie d'articles et comptage
   - Synchronisation manuelle via bouton

3. **API BACKEND FastAPI**
   - Endpoints REST pour les deux interfaces
   - Gestion des sessions tablette par magasin

### 3.2 Schéma de communication

```
┌─────────────────┐         ┌─────────────────┐
│ Admin Siège     │         │ Tablette Mag.   │
│ (navigateur     │         │ (PWA installée  │
│  desktop)       │         │  sur tablette)  │
└────────┬────────┘         └────────┬────────┘
         │ HTTPS                     │ HTTPS (online)
         │                           │ + IndexedDB (offline)
         ▼                           ▼
    ┌────────────────────────────────────┐
    │     API FastAPI (Nginx)            │
    └────────────────┬───────────────────┘
                     ▼
              ┌──────────────┐
              │ PostgreSQL   │
              └──────────────┘
```

---

## 4. Modèle de données

### 4.1 Tables de référence

#### `societes`
| Champ | Type | Description |
|---|---|---|
| id | UUID PK | |
| code | VARCHAR(20) UNIQUE | Code société (ex. "G2C01") |
| nom | VARCHAR(200) | Raison sociale |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

#### `magasins`
| Champ | Type | Description |
|---|---|---|
| id | UUID PK | |
| societe_id | UUID FK → societes | |
| code | VARCHAR(20) UNIQUE | Code magasin (ex. "M-ABYMES-01") |
| nom | VARCHAR(200) | Libellé magasin (sert aussi d'identifiant de login sur la tablette) |
| email_responsable | VARCHAR(500) NULLABLE | Email(s) du responsable dépôt, séparés par `;` si plusieurs (destinataires des rapports d'inventaire) |
| password_operateur_hash | VARCHAR(255) | Hash bcrypt du mot de passe rôle "opérateur" (comptage uniquement) |
| password_responsable_hash | VARCHAR(255) | Hash bcrypt du mot de passe rôle "responsable dépôt" (comptage + validation) |
| actif | BOOLEAN | Défaut TRUE |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

> **Note d'architecture** : le modèle d'authentification de la tablette est identique à celui de l'application réception. Le nom du magasin sert de login, et le mot de passe saisi détermine le rôle effectif pour la session :
> - `password_operateur` → rôle `operateur` (peut compter mais pas valider)
> - `password_responsable` → rôle `responsable_depot` (peut compter, modifier et **valider** l'inventaire, ce qui déclenche l'envoi du mail)
>
> Si la table existe déjà dans la base partagée avec l'application réception, on réutilise les colonnes existantes (`password_operateur_hash`, `password_responsable_hash`) et on ajoute simplement `email_responsable` si nécessaire.


#### `tablettes`
La tablette est l'appareil physique installé dans le magasin. L'authentification se fait à chaque session par saisie du **nom du magasin** (login) et d'un **mot de passe** déterminant le rôle.

| Champ | Type | Description |
|---|---|---|
| id | UUID PK | |
| magasin_id | UUID FK → magasins UNIQUE | Une tablette = un magasin |
| nom | VARCHAR(100) | Libellé technique de la tablette |
| device_id | VARCHAR(100) NULLABLE | Identifiant matériel optionnel (pour traçabilité) |
| derniere_sync | TIMESTAMP | Dernière synchronisation |
| created_at | TIMESTAMP | |

#### `sessions_tablette`
Session active d'un utilisateur (opérateur ou responsable) sur une tablette. Permet de tracer qui a fait quoi.

| Champ | Type | Description |
|---|---|---|
| id | UUID PK | |
| tablette_id | UUID FK → tablettes | |
| magasin_id | UUID FK → magasins | |
| role | ENUM | `operateur`, `responsable_depot` |
| jwt_token_hash | VARCHAR(255) | Hash du JWT actif |
| date_debut | TIMESTAMP | |
| date_fin | TIMESTAMP NULLABLE | Renseignée à la déconnexion ou expiration |
| actif | BOOLEAN | |

#### `utilisateurs` (admin siège)
| Champ | Type | Description |
|---|---|---|
| id | UUID PK | |
| email | VARCHAR(200) UNIQUE | |
| password_hash | VARCHAR(255) | bcrypt |
| nom | VARCHAR(200) | |
| role | ENUM | `admin`, `superviseur` |
| actif | BOOLEAN | |
| created_at | TIMESTAMP | |

### 4.2 Tables articles

#### `articles`
Table de référence des articles. Alimentée par import Excel récurrent (mise à jour périodique).

| Champ | Type | Description |
|---|---|---|
| id | UUID PK | |
| code_interne | VARCHAR(50) UNIQUE | Code interne G2C |
| designation | VARCHAR(500) | Libellé article |
| code_fournisseur | VARCHAR(100) NULLABLE | Code chez le fournisseur |
| actif | BOOLEAN | Défaut TRUE |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

Index : `code_interne`, `code_fournisseur`

#### `articles_codes_barres`
Un article peut avoir plusieurs codes-barres (unité, colis, carton). Table mise à jour de temps en temps via import.

| Champ | Type | Description |
|---|---|---|
| id | UUID PK | |
| article_id | UUID FK → articles | CASCADE DELETE |
| code_barres | VARCHAR(50) | |
| created_at | TIMESTAMP | |

Index unique composite : `(article_id, code_barres)`
Index : `code_barres` (recherche rapide par scan)

### 4.3 Tables campagnes d'inventaire

#### `campagnes`
Une campagne = un import Excel = un ensemble d'articles à inventorier, applicable à un ou plusieurs magasins.

| Champ | Type | Description |
|---|---|---|
| id | UUID PK | |
| nom | VARCHAR(200) | Libellé campagne (ex. "Inventaire DPH semaine 21") |
| description | TEXT NULLABLE | |
| date_debut | DATE | Date prévue de début |
| date_fin | DATE | Date prévue de clôture |
| statut | ENUM | `brouillon`, `en_cours`, `terminee`, `archivee`, `annulee` |
| cree_par | UUID FK → utilisateurs | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

> **Statuts d'une campagne globale** :
> - `brouillon` : importée, non encore lancée
> - `en_cours` : lancée, comptages en cours sur les tablettes
> - `terminee` : tous les magasins de la campagne sont en statut `validee` ou `abandonnee` (passage automatique)
> - `archivee` : archivée par un admin
> - `annulee` : annulée par un admin

#### `campagnes_magasins`
Association campagne ↔ magasins. Chaque ligne représente la portée d'une campagne sur un magasin donné.

| Champ | Type | Description |
|---|---|---|
| id | UUID PK | |
| campagne_id | UUID FK → campagnes | CASCADE DELETE |
| magasin_id | UUID FK → magasins | |
| statut | ENUM | `en_cours`, `validee`, `abandonnee` |
| date_validation | TIMESTAMP NULLABLE | Renseignée lors de la validation par le responsable |
| valide_par_session_id | UUID FK → sessions_tablette NULLABLE | Session du responsable ayant validé |
| mail_envoye | BOOLEAN | Défaut FALSE. Passe à TRUE après envoi réussi du mail |
| created_at | TIMESTAMP | |

Contrainte unique : `(campagne_id, magasin_id)`

#### `campagnes_articles`
Détail des articles à inventorier pour un couple (campagne, magasin).

| Champ | Type | Description |
|---|---|---|
| id | UUID PK | |
| campagne_magasin_id | UUID FK → campagnes_magasins | CASCADE DELETE |
| article_id | UUID FK → articles | |
| qte_stock | DECIMAL(12,3) | Quantité stock système |
| qte_reste_a_livrer | DECIMAL(12,3) | Reste à livrer (commandes fournisseurs) |
| qte_theorique | DECIMAL(12,3) | Somme qte_stock + qte_reste_a_livrer (calculée à l'import) |
| qte_comptee | DECIMAL(12,3) NULLABLE | Total cumulé des comptages (NULL = pas encore compté) |
| ecart | DECIMAL(12,3) NULLABLE | qte_comptee - qte_theorique (calculé à la clôture) |
| statut | ENUM | `a_compter`, `compte`, `valide` |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

Contrainte unique : `(campagne_magasin_id, article_id)`

#### `comptages`
Historique détaillé de chaque saisie/scan (pour conserver les comptages multiples avec commentaires, ex. article présent à plusieurs endroits).

| Champ | Type | Description |
|---|---|---|
| id | UUID PK | |
| campagne_article_id | UUID FK → campagnes_articles | CASCADE DELETE |
| tablette_id | UUID FK → tablettes | |
| session_tablette_id | UUID FK → sessions_tablette NULLABLE | Permet de retrouver qui (rôle) a effectué le comptage |
| qte_saisie | DECIMAL(12,3) | Quantité saisie pour ce comptage |
| commentaire | TEXT NULLABLE | Commentaire libre (ex. "rayon 5", "réserve") |
| mode_saisie | ENUM | `scan_code_barres`, `code_interne`, `code_fournisseur`, `selection_manuelle` |
| valeur_saisie | VARCHAR(100) | Valeur exacte saisie/scannée |
| created_at | TIMESTAMP | Horodatage du comptage |
| client_uuid | UUID | UUID généré côté tablette (idempotence sync offline) |

Index : `client_uuid` UNIQUE (évite doublons à la synchronisation)

#### `codes_barres_inconnus`
Lorsqu'un opérateur scanne un code-barres absent de la base, il sélectionne manuellement l'article correspondant. Le code-barres est alors **ajouté immédiatement à la base** (`articles_codes_barres`) et **tracé dans cette table** pour le rapport envoyé au responsable dépôt.

| Champ | Type | Description |
|---|---|---|
| id | UUID PK | |
| campagne_magasin_id | UUID FK → campagnes_magasins | CASCADE DELETE |
| article_id | UUID FK → articles | Article auquel le code-barres a été associé manuellement |
| code_barres | VARCHAR(50) | Code-barres scanné, ajouté à la base |
| session_tablette_id | UUID FK → sessions_tablette NULLABLE | Traçabilité (qui l'a ajouté) |
| client_uuid | UUID UNIQUE | Idempotence sync offline |
| created_at | TIMESTAMP | |

Index : `client_uuid` UNIQUE

### 4.4 Tables techniques

#### `import_logs`
Historique des imports Excel (articles ou campagnes) pour traçabilité.

| Champ | Type | Description |
|---|---|---|
| id | UUID PK | |
| type_import | ENUM | `articles`, `codes_barres`, `campagne` |
| nom_fichier | VARCHAR(500) | |
| nb_lignes_traitees | INTEGER | |
| nb_lignes_ok | INTEGER | |
| nb_lignes_erreur | INTEGER | |
| rapport_erreurs | JSONB | Détail des lignes en erreur |
| importe_par | UUID FK → utilisateurs | |
| created_at | TIMESTAMP | |

#### `envois_mail`
Historique des mails envoyés (validation d'inventaire, alertes, etc.) pour traçabilité et retry en cas d'échec.

| Champ | Type | Description |
|---|---|---|
| id | UUID PK | |
| type_envoi | ENUM | `validation_inventaire`, `codes_barres_inconnus`, `autre` |
| campagne_magasin_id | UUID FK → campagnes_magasins NULLABLE | Si lié à un inventaire |
| destinataires | VARCHAR(1000) | Emails séparés par `;` |
| objet | VARCHAR(500) | |
| corps | TEXT | Corps du mail envoyé |
| pieces_jointes | JSONB | Liste des fichiers joints (nom, taille) |
| statut | ENUM | `en_attente`, `envoye`, `erreur` |
| message_erreur | TEXT NULLABLE | |
| nb_tentatives | INTEGER | Défaut 0, max 3 |
| date_envoi | TIMESTAMP NULLABLE | Date de l'envoi réussi |
| created_at | TIMESTAMP | |

---

## 5. Workflow fonctionnel

### 5.1 Workflow général d'une campagne

```
[ADMIN]              Import Excel campagne
                              ↓
[ADMIN]              Campagne en statut "brouillon" — vérification
                              ↓
[ADMIN]              Lancement → statut "en_cours"
                              ↓
[TABLETTE-OPÉRATEUR] Login (nom magasin + mot de passe opérateur)
                              ↓
[TABLETTE-OPÉRATEUR] Synchronisation (récupération campagnes en cours)
                              ↓
[TABLETTE-OPÉRATEUR] Comptage des articles (scan ou saisie)
                              ↓
[TABLETTE-OPÉRATEUR] Synchronisation (envoi des comptages)
                              ↓
[TABLETTE-RESPONSABLE] Login (nom magasin + mot de passe responsable)
                              ↓
[TABLETTE-RESPONSABLE] Revue des comptages, ajustements éventuels
                              ↓
[TABLETTE-RESPONSABLE] VALIDATION de l'inventaire pour son magasin
                              ↓
[SERVEUR]            campagnes_magasins.statut → "validee"
                              ↓
[SERVEUR]            Génération automatique Excel des écarts
                              ↓
[SERVEUR]            Génération Excel des codes-barres ajoutés (si applicable)
                              ↓
[SERVEUR]            Envoi mail au responsable dépôt (PJ Excel)
                              ↓
[ADMIN]              Suivi global, intégration manuelle dans l'ERP
                              ↓
[ADMIN]              Archivage de la campagne quand tous les magasins ont validé
```

> **Important** : c'est l'action de **validation** du responsable dépôt depuis la tablette qui passe l'association `campagne ↔ magasin` au statut `validee` et déclenche l'envoi automatique du mail. Il n'y a plus de "clôture" puis "validation" en deux temps séparés ; pour un magasin, la validation par le responsable est l'acte de clôture définitif.

### 5.2 Cas particulier : campagne abandonnée par un magasin

Si un magasin n'a pas pu réaliser son inventaire dans les délais :
- L'admin passe le statut `campagnes_magasins.statut` à `abandonnee`
- Aucun export d'écart n'est généré pour ce magasin
- La campagne globale peut être clôturée même si certains magasins sont en `abandonnee`

### 5.3 Cas particulier : code-barres scanné non reconnu

Deux cas distincts :

**Cas A — Code-barres inconnu de la base entière**
La base ne contient pas ce code-barres, mais l'opérateur connaît l'article correspondant :
1. Message : "Code-barres inconnu. Sélectionnez l'article dans la liste."
2. Affichage d'un sélecteur permettant de rechercher l'article par code interne, désignation ou code fournisseur (recherche dans la base locale IndexedDB des articles de la campagne)
3. L'opérateur sélectionne l'article correspondant
4. Le code-barres est :
   - **Ajouté à la base** (table `articles_codes_barres`) pour les prochains scans
   - **Enregistré dans `codes_barres_inconnus`** pour figurer dans le rapport envoyé au responsable
5. Le comptage se poursuit normalement (qté à saisir + commentaire optionnel)
6. Le `mode_saisie` du comptage est positionné à `selection_manuelle`

**Cas B — Article identifié mais non prévu dans la campagne**
Le code-barres / code interne / code fournisseur correspond bien à un article connu, mais cet article ne fait pas partie de la campagne en cours pour ce magasin :
- Message strict : "Article non prévu dans cette campagne"
- Pas d'ajout possible
- L'opérateur doit signaler le cas au responsable

### 5.4 Comptages multiples

Un même article peut être compté plusieurs fois (présent à plusieurs endroits dans le magasin) :
- Chaque comptage est stocké dans `comptages` avec son commentaire
- `campagnes_articles.qte_comptee` = somme des `comptages.qte_saisie`
- L'opérateur peut modifier ou supprimer un comptage individuel s'il s'est trompé
- L'historique des comptages est visible sur la tablette et conservé après synchronisation

### 5.5 Validation de l'inventaire par le responsable dépôt

La validation de l'inventaire **pour un magasin donné** est l'acte qui clôture définitivement la campagne sur ce magasin. Elle est réservée au **rôle responsable dépôt** (déterminé par le mot de passe saisi à la connexion sur la tablette).

#### Pré-requis
- Tous les articles de la campagne doivent avoir été examinés (statut `compte` ou explicitement marqués "pas trouvé" → traités comme qté comptée = 0)
- La tablette doit être en ligne au moment de la validation (l'envoi de mail nécessite une connexion)

#### Étapes côté tablette
1. Le responsable consulte un écran récapitulatif : nb articles, nb écarts, écart total, liste des codes-barres ajoutés
2. Il peut ajouter un commentaire global sur l'inventaire
3. Il clique sur "Valider et envoyer le rapport au responsable"
4. Confirmation explicite (modale) : *"Cette action est définitive et déclenche l'envoi du rapport par mail. Confirmer ?"*

#### Étapes côté serveur
1. Vérification du rôle `responsable_depot` dans le JWT de session
2. Vérification que `magasin.email_responsable` est renseigné — sinon erreur retournée à la tablette
3. Mise à jour : `campagnes_magasins.statut = 'validee'`, `date_validation = NOW()`, `valide_par_session_id`
4. Calcul des écarts (`qte_comptee - qte_theorique` sur chaque ligne)
5. Génération du **fichier Excel des écarts** (cf. section 7.2.8)
6. Génération du **fichier Excel des codes-barres ajoutés** (cf. section 5.6) si applicable
7. Envoi du mail au(x) destinataire(s) de `magasin.email_responsable`
   - Objet : `[Inventaire G2C] Validation inventaire — {nom_campagne} — {nom_magasin}`
   - Corps : récap textuel (nb articles, nb écarts, écart total) + mention des PJ
   - Pièces jointes : Excel écarts + Excel codes-barres ajoutés (si applicable)
8. Trace dans `envois_mail` avec statut et nb_tentatives
9. Si échec d'envoi : mise à jour `campagnes_magasins.mail_envoye = FALSE` et retry automatique en arrière-plan (3 tentatives, délai 5 / 30 / 300 secondes)
10. Réponse à la tablette : `{ok: true, mail_envoye: true/false, message: "..."}`

#### Affichage côté tablette
- Si `mail_envoye = true` : message vert "Inventaire validé. Rapport envoyé à `email@...`"
- Si `mail_envoye = false` mais validation réussie : message orange "Inventaire validé. L'envoi du mail a échoué, l'admin sera notifié. Le rapport peut être téléchargé manuellement depuis l'interface admin."
- Une fois validé, la campagne disparaît de la liste des campagnes actives sur la tablette

#### Renvoi manuel du mail
Depuis l'interface admin (cf. § 7.2.9), un admin peut renvoyer manuellement un mail dont l'envoi a échoué, ou le renvoyer à un autre destinataire en cas de besoin.

### 5.6 Rapport des codes-barres ajoutés

À la validation de l'inventaire, si un ou plusieurs codes-barres ont été ajoutés à la base pendant le comptage (cf. § 5.3 Cas A), un **second fichier Excel** est joint au mail.

Feuille `CodesBarresAjoutes` :

| Colonne | Description |
|---|---|
| code_barres | Code-barres scanné et ajouté à la base |
| code_interne | Code interne de l'article auquel il a été rattaché |
| designation | Libellé de l'article |
| code_fournisseur | Code fournisseur de l'article |
| date_ajout | Date et heure de l'ajout |

Ce fichier permet au responsable de :
- Vérifier que les rattachements code-barres ↔ article sont corrects
- Compléter le cas échéant la base produit officielle (codification définitive)

---

## 6. Format du fichier Excel d'import

### 6.1 Import des articles de référence (administration)

Feuille `Articles` :

| Colonne | Type | Obligatoire | Description |
|---|---|---|---|
| code_interne | TEXT | Oui | Code interne G2C |
| designation | TEXT | Oui | Libellé article |
| code_fournisseur | TEXT | Non | Code fournisseur |

Feuille `CodesBarres` :

| Colonne | Type | Obligatoire | Description |
|---|---|---|---|
| code_interne | TEXT | Oui | Code interne de l'article |
| code_barres | TEXT | Oui | Code-barres (un par ligne, plusieurs lignes possibles par article) |

Comportement : **upsert** (création si nouveau, mise à jour sinon).

### 6.2 Import d'une campagne d'inventaire

Feuille `Campagne` (1 seule ligne d'en-tête) :

| Colonne | Type | Obligatoire | Description |
|---|---|---|---|
| nom_campagne | TEXT | Oui | Libellé de la campagne |
| date_debut | DATE | Oui | Format JJ/MM/AAAA |
| date_fin | DATE | Oui | Format JJ/MM/AAAA |
| description | TEXT | Non | Commentaire libre |

Feuille `Articles` :

| Colonne | Type | Obligatoire | Description |
|---|---|---|---|
| code_societe | TEXT | Oui | Code de la société |
| code_magasin | TEXT | Non | Code magasin. **Vide = tous les magasins de la société** |
| code_interne | TEXT | Oui | Code interne de l'article |
| designation | TEXT | Non | Libellé (informatif, prévalence base) |
| code_fournisseur | TEXT | Non | Informatif |
| code_barres | TEXT | Non | Informatif |
| qte_stock | NOMBRE | Oui | Quantité stock système |
| qte_reste_a_livrer | NOMBRE | Oui | Reste à livrer |
| qte_physique | NOMBRE | Oui | Théorique (somme stock + reste à livrer) — utilisée comme `qte_theorique` |

**Règles d'import :**

- Si `code_magasin` est vide → article créé pour tous les magasins actifs de la société indiquée
- Si l'article n'existe pas dans la table `articles` → erreur, ligne rejetée (l'article doit d'abord exister dans la base)
- Si le couple (campagne, magasin, article) existe déjà → erreur (doublon)
- Un rapport d'erreurs détaillé est fourni en fin d'import (lignes OK, lignes en erreur, motifs)

---

## 7. Spécification de l'interface ADMIN SIÈGE

### 7.1 Authentification

- Page de login email + mot de passe (pour les utilisateurs admin siège uniquement)
- JWT en cookie HttpOnly + refresh token
- Déconnexion automatique après 8h d'inactivité

> **Note importante** : le responsable dépôt n'a **pas** de compte admin siège. Il s'authentifie uniquement sur la tablette de son magasin avec le mot de passe responsable du magasin. Toutes ses actions (consultation des comptages, validation, déclenchement du mail) se font depuis la tablette.

### 7.2 Écrans

#### 7.2.1 Tableau de bord

- Liste des campagnes en cours, regroupées par statut
- Pour chaque campagne : nom, dates, nombre de magasins, % avancement global
- Indicateurs : campagnes à clôturer, campagnes en retard

#### 7.2.2 Gestion des sociétés

- Liste, création, modification, désactivation
- Champs : code, nom

#### 7.2.3 Gestion des magasins

- Liste filtrable par société
- Création, modification, désactivation
- Champs : société, code, nom, **email(s) du responsable dépôt**, actif
- **Définition / régénération des mots de passe par rôle** :
  - Mot de passe "opérateur" (utilisé sur la tablette pour le comptage)
  - Mot de passe "responsable dépôt" (utilisé sur la tablette pour la validation)
  - Affichage du mot de passe en clair une seule fois à la création/régénération, puis stocké hashé
  - Bouton "Régénérer" disponible pour chaque rôle

#### 7.2.4 Gestion des tablettes

- Liste des tablettes rattachées aux magasins
- Création : sélection du magasin → génération d'un **token d'appairage à usage unique** affiché à l'écran (à saisir sur la tablette à la première utilisation)
- Révocation de tablette possible (révoque le JWT)

#### 7.2.5 Gestion des utilisateurs admin

- Liste, création, modification, désactivation
- Rôles : `admin` (tous droits), `superviseur` (lecture seule + export)

#### 7.2.6 Gestion des articles

- Liste paginée filtrable (code interne, désignation, code fournisseur, code-barres)
- Import Excel (articles + codes-barres)
- Visualisation des codes-barres d'un article
- Pas de création/modification manuelle (tout passe par l'import)

#### 7.2.7 Gestion des campagnes

**Liste des campagnes** :
- Filtres : statut, dates, magasin, société
- Colonnes : nom, dates, statut, nb articles, nb magasins, avancement (X magasins validés / Y magasins)

**Création d'une campagne** :
- Upload du fichier Excel
- Aperçu des données avant validation
- Affichage du rapport d'erreurs si problème
- Création en statut `brouillon`

**Détail d'une campagne** :
- En-tête : nom, dates, description, statut global
- Onglet "Magasins" : liste des magasins concernés avec :
  - Statut (`en_cours`, `validee`, `abandonnee`)
  - Avancement (X/Y articles comptés)
  - Date de validation et indicateur d'envoi du mail
  - Boutons : "Forcer abandon", "Renvoyer le mail" (si validé), "Télécharger l'Excel des écarts" (toujours disponible)
- Onglet "Articles" : tableau filtrable par magasin avec qté théorique, qté comptée, écart
- Onglet "Codes-barres ajoutés" : liste des codes-barres ajoutés pendant la campagne (par magasin), avec article rattaché et possibilité de télécharger en Excel
- Onglet "Historique" : log des comptages + log des envois de mail (`envois_mail`)
- Actions selon statut :
  - `brouillon` → "Lancer la campagne" (passe en `en_cours`)
  - `en_cours` → "Marquer abandonnée pour un magasin", "Archiver" (si tous magasins en `validee`/`abandonnee`)
  - `terminee` → "Archiver"

> **Important** : l'admin n'a **plus de bouton "Valider"** : la validation se fait exclusivement par le responsable dépôt sur la tablette. L'admin garde toutefois la possibilité de :
> - Forcer l'abandon d'un magasin (si problème terrain)
> - Re-télécharger l'Excel des écarts à tout moment
> - Renvoyer le mail à un autre destinataire (cf. § 7.2.9)

#### 7.2.8 Format de l'Excel des écarts

Que ce soit dans le mail automatique au responsable ou dans le téléchargement manuel par l'admin, le fichier Excel a la même structure :

Feuille `Ecarts` (tous les articles de la campagne, avec ou sans écart) :

| Colonne | Description |
|---|---|
| code_societe | |
| code_magasin | |
| code_interne | |
| designation | |
| code_fournisseur | |
| qte_stock | |
| qte_reste_a_livrer | |
| qte_theorique | |
| qte_comptee | |
| ecart | qte_comptee - qte_theorique |
| nb_comptages | Nombre de comptages individuels |
| commentaires | Concaténation des commentaires des comptages |

#### 7.2.9 Renvoi de mail

Action accessible depuis le détail d'une campagne pour un magasin validé :
- Modale "Renvoyer le rapport"
- Champ destinataires pré-rempli avec `magasin.email_responsable`, modifiable
- Bouton "Envoyer" → génère à nouveau les Excel à partir des données actuelles et envoie le mail
- Nouvelle ligne dans `envois_mail` avec `type_envoi = 'autre'`

---

## 8. Spécification de l'interface TABLETTE

### 8.1 Authentification

Le modèle est identique à celui de l'application réception : **login = nom du magasin**, **mot de passe = définit le rôle**.

#### Première utilisation (appairage matériel)
À la première installation de la PWA sur une tablette physique :
- L'admin siège génère un **token d'appairage à usage unique** depuis l'interface admin (associé à un magasin)
- Sur la tablette, l'utilisateur saisit ce token une seule fois
- La tablette est désormais rattachée définitivement à ce magasin (enregistrement dans `tablettes`)
- Cette information est mémorisée dans IndexedDB

#### Connexion à chaque session
- Écran de login affichant **le nom du magasin** rattaché (rappel, non modifiable)
- Champ "Mot de passe"
- Le mot de passe saisi est testé contre `password_operateur_hash` puis `password_responsable_hash` :
  - Match `password_operateur` → JWT avec rôle `operateur`
  - Match `password_responsable` → JWT avec rôle `responsable_depot`
  - Aucun match → erreur "Mot de passe incorrect"
- JWT stocké en IndexedDB, durée 12h (re-login chaque journée de travail)
- Création d'une ligne dans `sessions_tablette` (synchronisée au prochain push)
- Déconnexion explicite possible depuis l'écran d'accueil

#### Mode offline pour l'authentification
- Les hash des mots de passe du magasin rattaché sont stockés localement (IndexedDB chiffré) à chaque synchronisation
- Permet de se connecter même hors-ligne
- La création de session est alors mise en queue pour synchronisation ultérieure

### 8.2 Écran d'accueil

- Affichage du magasin rattaché (en haut)
- Indicateur de connexion : online / offline
- Indicateur de rôle de la session en cours : "Opérateur" ou "Responsable dépôt"
- Bouton **"Synchroniser maintenant"** (gros, visible)
- Dernière synchronisation : "Il y a X minutes"
- Bouton "Se déconnecter" (discret, en haut à droite)
- Liste des campagnes actives pour ce magasin :
  - Nom de la campagne
  - Avancement (X/Y articles comptés)
  - Indicateur si déjà validée (rôle responsable seulement)
  - Bouton "Compter" (opérateur et responsable)
  - Bouton "Valider l'inventaire" (rôle responsable uniquement, si tous les articles ont été examinés)

### 8.3 Écran de comptage d'une campagne

#### En-tête
- Nom de la campagne
- Avancement (compteur)
- Bouton retour
- Bouton "Voir tous les articles" (liste)

#### Zone de saisie
- Champ de saisie unique acceptant :
  - Code-barres (scan Netum → saisie clavier émulée + Enter)
  - Code interne
  - Code fournisseur
- Recherche en local dans IndexedDB
- Auto-validation à la saisie d'Enter (scan) ou au bouton "Rechercher"

#### Résultat de la recherche
- **Article trouvé dans la campagne** :
  - Affichage : code interne, désignation, code fournisseur
  - Quantité théorique
  - Total déjà compté (somme des comptages précédents)
  - Liste des comptages précédents (qté + commentaire + heure) avec possibilité de modifier/supprimer chacun
  - Champ "Quantité à ajouter"
  - Champ "Commentaire" (optionnel, ex. "rayon 5", "réserve arrière")
  - Bouton "Valider le comptage"

- **Code-barres inconnu de la base** (cf. § 5.3 Cas A) :
  - Message : "Code-barres inconnu. Sélectionnez l'article correspondant."
  - Sélecteur avec recherche : tape les premiers caractères du code interne ou de la désignation
  - La recherche se fait dans la liste locale des articles de la campagne
  - Si l'article est sélectionné :
    - Le code-barres est marqué pour ajout à la base (queue locale)
    - Affichage du formulaire de comptage normal (qté + commentaire)
  - Si l'opérateur ne trouve pas l'article : bouton "Annuler" → retour à la saisie
  
- **Article identifié mais non prévu** (cf. § 5.3 Cas B) :
  - Message d'erreur strict : "Article non prévu dans cette campagne"
  - Bouton "Réessayer"

#### Validation du comptage
- Création d'un enregistrement local dans IndexedDB (table `comptages_pending`)
- Mise à jour de `qte_comptee` localement (somme cumulative)
- Retour à l'écran de saisie pour l'article suivant
- Feedback visuel (vibration, son court, message "Comptage enregistré")

### 8.4 Liste des articles de la campagne

- Liste filtrable (recherche texte sur code/désignation)
- Filtres : tous / à compter / déjà comptés / avec écart
- Tap sur un article → écran de détail / comptage manuel

### 8.4 bis Écran de validation (rôle responsable dépôt uniquement)

Accessible depuis l'écran d'accueil via le bouton "Valider l'inventaire" sur une campagne.

#### Récapitulatif affiché
- Nom de la campagne, dates
- Magasin
- Nb articles à compter / Nb articles comptés / Nb articles non comptés
- Nb articles avec écart positif / écart négatif / sans écart
- Écart cumulé en valeur absolue
- Liste des codes-barres ajoutés pendant la campagne (si applicable)
- Champ "Commentaire global de validation" (optionnel)

#### Avertissements
- Si des articles n'ont pas été comptés : *"X articles n'ont pas été comptés. Ils seront considérés avec quantité comptée = 0 et un écart correspondant à la qté théorique."*
- Si la tablette est offline : *"Vous devez être en ligne pour valider l'inventaire (envoi du mail au responsable)."*

#### Actions
- Bouton "Annuler" → retour
- Bouton "Modifier les comptages" → retour à l'écran de comptage
- Bouton **"Valider et envoyer le rapport"** (rouge, prominent)
  - Modale de confirmation : *"Cette action est définitive. Le rapport sera envoyé par mail à {email_responsable}. Confirmer ?"*
  - Appel API `POST /api/v1/sync/campagnes/{id}/magasin/valider`
  - Spinner pendant l'envoi du mail
  - Affichage du résultat (succès / échec d'envoi mail)
  - Retour à l'écran d'accueil

### 8.5 Mode offline

#### Stockage IndexedDB (via Dexie.js)

Tables locales :
- `campagnes_locales` : campagnes en cours pour ce magasin
- `campagnes_articles_locales` : articles à compter avec état cumulé
- `comptages_pending` : comptages réalisés non encore synchronisés
- `comptages_synced` : comptages synchronisés (lecture seule, conservés pour historique)
- `articles_codes_barres_locaux` : index pour recherche rapide par code-barres
- `codes_barres_inconnus_pending` : codes-barres ajoutés manuellement, non encore synchronisés
- `sessions_pending` : sessions ouvertes en offline, à pousser au prochain sync
- `auth_local` : hash des mots de passe du magasin (chiffré localement) pour login offline
- `metadata` : token JWT en cours, infos magasin, dernière sync, rôle session courante

#### Synchronisation manuelle (bouton)

**Étape 1 — Push** : envoi groupé au backend
- Endpoint : `POST /api/v1/sync/push`
- Payload : `{comptages: [...], codes_barres_inconnus: [...], sessions: [...], modifications_comptages: [...], suppressions_comptages: [...]}`
- Backend traite chaque catégorie de manière transactionnelle et idempotente (via les `client_uuid`)
- Réponse : bilan détaillé de ce qui a été accepté / rejeté avec motifs

**Étape 2 — Pull** : récupération de l'état serveur
- Endpoint : `GET /api/v1/sync/etat-magasin`
- Récupère : campagnes actives, articles à compter, comptages déjà connus du serveur
- Met à jour les tables locales (merge intelligent)

**Étape 3 — Bilan**
- Affichage : "X comptages synchronisés, Y campagnes mises à jour"
- En cas d'erreur réseau : conservation des données locales, message clair

#### Gestion des conflits

- L'historique des comptages est **append-only** (jamais de conflit sur les ajouts)
- Si l'admin a clôturé une campagne entre-temps : les comptages encore en `pending` sont **rejetés** par le backend avec un message clair sur la tablette
- L'utilisateur est invité à contacter l'admin si des comptages ont été perdus

---

## 9. API Backend (FastAPI)

### 9.1 Authentification

| Endpoint | Méthode | Rôle |
|---|---|---|
| `/api/v1/auth/admin/login` | POST | Login admin siège (email + password) |
| `/api/v1/auth/admin/refresh` | POST | Refresh JWT admin |
| `/api/v1/auth/admin/logout` | POST | Logout admin |
| `/api/v1/auth/tablette/appairer` | POST | Appairage matériel d'une tablette (token unique généré par admin) |
| `/api/v1/auth/tablette/login` | POST | Login session tablette : `{password}` — le magasin est déduit du device appairé. Retourne JWT avec rôle |
| `/api/v1/auth/tablette/logout` | POST | Clôture la session active |

> Le login tablette retourne un JWT contenant : `tablette_id`, `magasin_id`, `session_id`, `role` (`operateur` ou `responsable_depot`), `exp` (12h).

### 9.2 Référentiels (admin)

| Endpoint | Méthode | Description |
|---|---|---|
| `/api/v1/societes` | GET / POST | Liste / création |
| `/api/v1/societes/{id}` | GET / PUT / DELETE | Détail / modification / suppression logique |
| `/api/v1/magasins` | GET / POST | |
| `/api/v1/magasins/{id}` | GET / PUT / DELETE | |
| `/api/v1/tablettes` | GET / POST | POST génère le token d'appairage |
| `/api/v1/tablettes/{id}/revoquer` | POST | Révoque le JWT |
| `/api/v1/utilisateurs` | GET / POST | |
| `/api/v1/utilisateurs/{id}` | GET / PUT / DELETE | |

### 9.3 Articles (admin)

| Endpoint | Méthode | Description |
|---|---|---|
| `/api/v1/articles` | GET | Liste paginée + filtres |
| `/api/v1/articles/{id}` | GET | Détail (avec codes-barres) |
| `/api/v1/articles/import` | POST | Import Excel (multipart) |

### 9.4 Campagnes (admin)

| Endpoint | Méthode | Description |
|---|---|---|
| `/api/v1/campagnes` | GET | Liste paginée + filtres |
| `/api/v1/campagnes/import` | POST | Import Excel (multipart) → création en `brouillon` |
| `/api/v1/campagnes/{id}` | GET | Détail complet |
| `/api/v1/campagnes/{id}/lancer` | POST | `brouillon` → `en_cours` |
| `/api/v1/campagnes/{id}/archiver` | POST | → `archivee` |
| `/api/v1/campagnes/{id}/annuler` | POST | → `annulee` |
| `/api/v1/campagnes/{id}/export-ecarts` | GET | Téléchargement Excel (tous magasins) |
| `/api/v1/campagnes/{id}/magasins/{magasin_id}/export-ecarts` | GET | Téléchargement Excel pour un magasin |
| `/api/v1/campagnes/{id}/magasins/{magasin_id}/export-codes-barres-ajoutes` | GET | Téléchargement Excel des codes-barres ajoutés |
| `/api/v1/campagnes/{id}/magasins/{magasin_id}/abandonner` | POST | Marque le magasin en `abandonnee` |
| `/api/v1/campagnes/{id}/magasins/{magasin_id}/renvoyer-mail` | POST | Renvoi mail. Body : `{destinataires: "..."}` (optionnel) |

> L'endpoint de **validation** est dans la section "tablette" car réservé au rôle responsable dépôt.

### 9.5 Endpoints tablette

| Endpoint | Méthode | Description |
|---|---|---|
| `/api/v1/sync/etat-magasin` | GET | État complet pour le magasin (campagnes actives + articles + comptages serveur + codes-barres connus + hash mdp pour login offline) |
| `/api/v1/sync/push` | POST | Push groupé : comptages, codes-barres inconnus, sessions, modifs, suppressions (avec `client_uuid` pour idempotence) |
| `/api/v1/sync/comptages/{client_uuid}` | DELETE | Suppression d'un comptage |
| `/api/v1/sync/comptages/{client_uuid}` | PATCH | Modification d'un comptage existant |
| `/api/v1/sync/campagnes/{id}/magasin/valider` | POST | **Validation par le responsable dépôt** (rôle `responsable_depot` obligatoire). Body : `{commentaire_global: "..."}`. Déclenche : passage en `validee`, génération Excel, envoi mail. Réponse : `{ok, mail_envoye, message}` |

Tous ces endpoints sont **authentifiés via le JWT tablette** et **scopés au magasin** rattaché. L'endpoint de validation vérifie en plus le rôle `responsable_depot`.

---

## 10. Sécurité

- HTTPS obligatoire (TLS via Nginx)
- JWT admin : durée 1h + refresh token 8h
- JWT tablette : durée 12h (re-login chaque journée)
- Token d'appairage tablette : usage unique, durée 24h
- Mots de passe (admin + magasin) : bcrypt (coût 12)
- Rate limiting sur `/auth/admin/login` et `/auth/tablette/login` (5 essais / 15 min)
- CORS strict (origines autorisées via variable d'environnement)
- Validation Pydantic stricte sur tous les inputs
- Logs d'audit sur actions sensibles (lancement campagne, validation, envois mail, archivage)
- Vérification de rôle sur les endpoints sensibles (validation = `responsable_depot` obligatoire)

---

## 10 bis. Envoi de mails

### Configuration SMTP

Variables d'environnement :
```env
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USERNAME=inventaire@g2c.fr
SMTP_PASSWORD=<secret>
SMTP_USE_TLS=true
MAIL_FROM_ADDRESS=inventaire@g2c.fr
MAIL_FROM_NAME=Inventaire G2C
MAIL_REPLY_TO=informatique@g2c.fr
```

### Templates de mail

Localisés dans `backend/app/templates/emails/` (Jinja2) :
- `validation_inventaire.html` et `.txt` : mail principal de validation
- `codes_barres_inconnus.html` et `.txt` : section additionnelle si applicable (intégrée dans le mail de validation)
- `erreur_envoi.html` et `.txt` : notification interne en cas d'échec récurrent

### Contenu du mail de validation

**Objet** : `[Inventaire G2C] Validation inventaire — {nom_campagne} — {nom_magasin}`

**Corps** :
```
Bonjour,

L'inventaire tournant "{nom_campagne}" a été validé pour le magasin {nom_magasin}
le {date_validation} par {role_validateur}.

Récapitulatif :
- Nombre d'articles inventoriés : {nb_articles}
- Nombre d'articles avec écart : {nb_ecarts}
- Écart positif total : +{ecart_positif}
- Écart négatif total : -{ecart_negatif}

{si codes-barres ajoutés :}
{nb_codes_barres_ajoutes} code(s)-barres ont été ajouté(s) à la base pendant cet inventaire.
Vous trouverez la liste complète dans le fichier joint "codes_barres_ajoutes.xlsx".

Commentaire du validateur : {commentaire_global}

Pièces jointes :
- ecarts_inventaire.xlsx : détail complet des écarts
{- codes_barres_ajoutes.xlsx : liste des codes-barres ajoutés}

Cordialement,
Application Inventaire G2C
```

### File d'attente et retry

- L'envoi est mis en file d'attente dans `envois_mail` immédiatement après la validation
- Tentative d'envoi synchrone à la validation (l'utilisateur a un retour direct)
- Si échec : retry asynchrone (background task FastAPI) avec délais 5s / 30s / 300s
- Au-delà de 3 tentatives : statut `erreur`, notification dans le tableau de bord admin
- L'admin peut **forcer le renvoi** depuis l'interface (cf. § 7.2.9)

---

## 11. Structure de projet

```
inventaire-tournant/
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
├── README.md
├── backend/
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── alembic.ini
│   ├── alembic/
│   │   └── versions/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   ├── societe.py
│   │   │   ├── magasin.py
│   │   │   ├── tablette.py
│   │   │   ├── utilisateur.py
│   │   │   ├── article.py
│   │   │   ├── campagne.py
│   │   │   └── comptage.py
│   │   ├── schemas/
│   │   │   └── ... (Pydantic)
│   │   ├── api/
│   │   │   ├── v1/
│   │   │   │   ├── auth.py
│   │   │   │   ├── societes.py
│   │   │   │   ├── magasins.py
│   │   │   │   ├── tablettes.py
│   │   │   │   ├── utilisateurs.py
│   │   │   │   ├── articles.py
│   │   │   │   ├── campagnes.py
│   │   │   │   └── sync.py
│   │   ├── services/
│   │   │   ├── auth_service.py
│   │   │   ├── import_articles_service.py
│   │   │   ├── import_campagne_service.py
│   │   │   ├── export_service.py
│   │   │   ├── mail_service.py
│   │   │   ├── validation_service.py
│   │   │   └── sync_service.py
│   │   ├── templates/
│   │   │   └── emails/
│   │   │       ├── validation_inventaire.html
│   │   │       ├── validation_inventaire.txt
│   │   │       └── erreur_envoi.html
│   │   ├── core/
│   │   │   ├── security.py
│   │   │   └── exceptions.py
│   │   └── utils/
│   ├── tests/
│   │   ├── conftest.py
│   │   ├── test_auth.py
│   │   ├── test_import_campagne.py
│   │   ├── test_sync.py
│   │   ├── test_validation.py
│   │   ├── test_mail.py
│   │   └── test_export.py
│   └── scripts/
│       ├── init_db.py
│       └── seed_data.py
├── frontend-admin/
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   ├── public/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api/
│   │   │   └── client.ts
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Societes.tsx
│   │   │   ├── Magasins.tsx
│   │   │   ├── Tablettes.tsx
│   │   │   ├── Utilisateurs.tsx
│   │   │   ├── Articles.tsx
│   │   │   ├── Campagnes.tsx
│   │   │   └── CampagneDetail.tsx
│   │   ├── components/
│   │   ├── hooks/
│   │   └── types/
│   └── index.html
├── frontend-tablette/
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   ├── public/
│   │   ├── manifest.json
│   │   └── icons/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── service-worker.ts
│   │   ├── db/
│   │   │   └── dexie.ts
│   │   ├── pages/
│   │   │   ├── Appairage.tsx
│   │   │   ├── Login.tsx
│   │   │   ├── Accueil.tsx
│   │   │   ├── CampagneListe.tsx
│   │   │   ├── Comptage.tsx
│   │   │   ├── SelectionArticleInconnu.tsx
│   │   │   ├── Validation.tsx
│   │   │   └── ArticleListe.tsx
│   │   ├── components/
│   │   ├── hooks/
│   │   │   ├── useSync.ts
│   │   │   ├── useBarcodeScanner.ts
│   │   │   └── useOfflineDb.ts
│   │   └── services/
│   │       ├── api.ts
│   │       └── sync.ts
│   └── index.html
└── nginx/
    ├── nginx.conf
    └── ssl/
```

---

## 12. Plan de développement (jalons pour Claude Code)

### Jalon 1 — Fondations backend
1. Initialisation du projet (Docker Compose, FastAPI, PostgreSQL)
2. Modèles SQLAlchemy + migrations Alembic (sociétés, magasins avec emails/passwords par rôle, tablettes, sessions_tablette, utilisateurs)
3. Système d'authentification : admin (email/password) + tablette (login = nom magasin, password détermine le rôle)
4. Tests unitaires d'auth (vérifier que le bon rôle est attribué selon le mot de passe)

### Jalon 2 — Référentiels admin
1. Endpoints CRUD sociétés, magasins (avec champ email_responsable et 2 mots de passe), tablettes, utilisateurs
2. Génération du token d'appairage tablette
3. Frontend admin : login + écrans référentiels
4. Tests d'intégration

### Jalon 3 — Articles
1. Modèle articles + codes-barres
2. Service d'import Excel articles (upsert, rapport d'erreurs)
3. Endpoints articles
4. Frontend admin : écran articles + import
5. Tests d'import

### Jalon 4 — Campagnes (administration)
1. Modèles campagnes / campagnes_magasins / campagnes_articles / codes_barres_inconnus / envois_mail
2. Service d'import Excel campagne (gestion du "magasin vide = toute la société")
3. Endpoints campagnes (CRUD, lancement, archivage, annulation)
4. Frontend admin : liste campagnes, import, détail (sans bouton de validation, qui est sur tablette)
5. Tests d'import et de cycle de vie

### Jalon 5 — Tablette (login + comptage online)
1. Setup PWA Vite + service worker + Dexie
2. Appairage matériel (saisie du token unique)
3. Écran de login (nom magasin affiché + saisie mot de passe → détermination du rôle)
4. Écran d'accueil avec rôle affiché + liste campagnes
5. Écran de comptage avec saisie code-barres (Netum) ou code interne/fournisseur
6. Gestion du cas "code-barres inconnu" : sélection manuelle de l'article + ajout du code-barres
7. Gestion du cas "article hors campagne" : message strict
8. Validation des comptages (online uniquement à ce stade)

### Jalon 6 — Tablette (offline + sync)
1. Tables IndexedDB (Dexie) y compris auth_local pour login offline
2. Endpoints sync (`GET etat-magasin`, `POST sync/push`)
3. Service de synchronisation côté tablette (comptages + codes-barres inconnus + sessions)
4. Bouton "Synchroniser maintenant" + indicateur de statut
5. Gestion de l'idempotence par `client_uuid`
6. Login offline avec hash locaux
7. Tests bout-en-bout d'un cycle offline → sync

### Jalon 7 — Comptages multiples et modifications
1. Affichage de la liste des comptages précédents sur la tablette
2. Modification / suppression d'un comptage
3. Synchronisation des modifications (PATCH / DELETE)

### Jalon 8 — Validation, envoi mail et exports
1. Endpoint `POST /sync/campagnes/{id}/magasin/valider` (rôle responsable_depot)
2. Service de génération Excel des écarts
3. Service de génération Excel des codes-barres ajoutés
4. Service d'envoi de mail (aiosmtplib + Jinja2)
5. File d'attente `envois_mail` avec retry (background task)
6. Écran de validation côté tablette (rôle responsable uniquement)
7. Écran "renvoi de mail" côté admin
8. Tests d'envoi de mail (avec serveur SMTP de test type MailHog)

### Jalon 9 — Polissage et déploiement
1. Logs d'audit
2. Rate limiting + sécurité
3. Documentation README et déploiement
4. Configuration Docker Compose production
5. Tests de charge légers

---

## 13. Configuration et variables d'environnement

`.env.example` :

```env
# Backend
DATABASE_URL=postgresql+psycopg://inv_user:inv_pass@db:5432/inventaire
JWT_SECRET=change_me_long_random_string
JWT_ALGORITHM=HS256
JWT_ADMIN_ACCESS_MINUTES=60
JWT_ADMIN_REFRESH_HOURS=8
JWT_TABLETTE_HOURS=12
TOKEN_APPAIRAGE_HOURS=24
CORS_ORIGINS=https://admin.inventaire.g2c.local,https://tablette.inventaire.g2c.local
LOG_LEVEL=INFO

# SMTP (Microsoft 365)
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USERNAME=inventaire@g2c.fr
SMTP_PASSWORD=change_me
SMTP_USE_TLS=true
MAIL_FROM_ADDRESS=inventaire@g2c.fr
MAIL_FROM_NAME=Inventaire G2C
MAIL_REPLY_TO=informatique@g2c.fr
MAIL_RETRY_MAX_ATTEMPTS=3
MAIL_RETRY_DELAYS_SECONDS=5,30,300

# Postgres
POSTGRES_USER=inv_user
POSTGRES_PASSWORD=inv_pass
POSTGRES_DB=inventaire

# Frontend admin
VITE_API_URL=https://api.inventaire.g2c.local/api/v1

# Frontend tablette
VITE_API_URL=https://api.inventaire.g2c.local/api/v1
VITE_APP_NAME=Inventaire G2C
```

---

## 14. Conventions et standards

### 14.1 Backend Python

- Python 3.12
- Formatage : `ruff format` + `ruff check`
- Type hints obligatoires
- Docstrings sur les fonctions de service
- Pydantic v2 pour tous les schémas
- Tests : pytest + pytest-asyncio + httpx
- Couverture cible : >80% sur les services

### 14.2 Frontend TypeScript

- TypeScript strict mode
- ESLint + Prettier
- React 18 fonctionnel (hooks)
- Tailwind CSS sans CSS additionnel (sauf cas exceptionnel)
- Composants typés (props interfaces)
- Tests : Vitest pour les utilitaires + React Testing Library pour les composants critiques

### 14.3 Git

- Branches : `main` (production), `develop` (intégration), `feature/xxx`
- Commits conventionnels : `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`
- Pull requests avec description et lien vers le jalon concerné

---

## 15. Livrables attendus

À la fin du développement, le projet doit comporter :

1. **Code source complet** (backend + 2 frontends) versionné Git
2. **Docker Compose** opérationnel en une commande (`docker compose up`)
3. **Migrations Alembic** complètes et rejouables
4. **Jeu de données de seed** pour démarrage rapide
5. **Documentation** :
   - README général (installation, démarrage)
   - README backend (architecture, endpoints documentés via Swagger auto)
   - README frontend admin
   - README frontend tablette (incluant procédure d'installation PWA sur tablette)
6. **Fichiers Excel template** pour les imports (articles, codes-barres, campagne)
7. **Tests** : minimum couverture 70% backend, smoke tests frontend

---

## 16. Notes complémentaires pour le développeur

- Le **lecteur Netum** envoie les codes-barres comme une frappe clavier suivie d'un Enter. Aucune intégration spécifique nécessaire : un simple `<input>` avec gestion de l'événement `onKeyDown` (touche Enter) suffit.
- La **PWA tablette** doit être installable (manifest.json + icônes) et fonctionner intégralement hors-ligne après le premier chargement.
- L'**idempotence** des comptages via `client_uuid` est critique : ne jamais générer de doublon côté serveur même si la tablette resoumet plusieurs fois le même comptage (cas réseau instable). Même logique pour les codes-barres inconnus.
- Les **décimales** sont importantes (DECIMAL 12,3) car certains articles peuvent être au kg ou au litre, même si la majorité sera en unités entières.
- Prévoir un **mode dégradé** côté admin si l'export Excel échoue (afficher le rapport HTML à l'écran).
- Le format **DD/MM/YYYY** est privilégié pour les dates affichées (contexte francophone).
- Les **messages d'erreur** sur la tablette doivent être courts, clairs et en français (utilisateurs opérationnels, pas techniciens).
- **Authentification tablette** : reproduire fidèlement le mécanisme de l'application réception (login = nom magasin pré-rempli, mot de passe seul à saisir). Le code peut être largement mutualisé entre les deux applications.
- **Envoi de mail** : la validation côté tablette doit retourner explicitement à l'utilisateur si le mail a été envoyé ou non. Ne jamais laisser l'utilisateur dans le flou — il doit savoir si le rapport a bien quitté le serveur.
- **Test local de SMTP** : utiliser MailHog ou Mailpit (conteneur Docker) en développement pour intercepter les mails sans les envoyer réellement.
- **Renvoi de mail** : la fonction de renvoi côté admin doit regénérer les Excel à partir des données actuelles de la base, et non pas réutiliser une PJ stockée. Cela permet de tenir compte de corrections éventuelles ou d'évolutions de référentiel.
- **Sécurité des mots de passe magasin** : ne jamais les afficher en clair après création (sauf le retour unique au moment de la régénération). En cas de perte, seul l'admin siège peut régénérer.
- **PWA partagée avec app réception** : si une seule PWA accueille les deux fonctions à terme, prévoir un menu d'accueil après login permettant de choisir "Réception" ou "Inventaire". Pour l'instant, deux PWA distinctes mais avec le même mécanisme d'auth.

---

**Fin de la spécification.**


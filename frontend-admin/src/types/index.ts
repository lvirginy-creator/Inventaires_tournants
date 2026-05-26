export interface Societe {
  id: string;
  code: string;
  nom: string;
  actif: boolean;
  created_at: string;
  updated_at: string;
}

export interface Magasin {
  id: string;
  societe_id: string;
  code: string;
  nom: string;
  email_responsable: string | null;
  actif: boolean;
  created_at: string;
  updated_at: string;
}

export interface Tablette {
  id: string;
  magasin_id: string;
  nom: string;
  device_id: string | null;
  derniere_sync: string | null;
  created_at: string;
}

export interface TokenAppairage {
  id: string;
  magasin_id: string;
  token: string;
  expires_at: string;
  used: boolean;
  created_at: string;
}

export interface Utilisateur {
  id: string;
  email: string;
  nom: string;
  role: "admin" | "superviseur";
  actif: boolean;
  created_at: string;
}

export interface Article {
  id: string;
  societe_id: string;
  code_barre: string;
  code_article: string;
  libelle: string;
  unite: string | null;
  actif: boolean;
  created_at: string;
  updated_at: string;
}

export type StatutCampagne = "brouillon" | "en_cours" | "terminee" | "validee";

export interface ArticleResume {
  id: string;
  code_barre: string;
  code_article: string;
  libelle: string;
  unite: string | null;
}

export interface LigneCampagne {
  id: string;
  campagne_id: string;
  article_id: string;
  quantite_theorique: number | null;
  created_at: string;
  article: ArticleResume;
}

export interface CampagneSummary {
  id: string;
  magasin_id: string;
  nom: string;
  statut: StatutCampagne;
  date_debut: string | null;
  date_fin: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  nb_articles: number;
}

export interface CampagneDetail extends CampagneSummary {
  lignes: LigneCampagne[];
}

// ── Rapport d'inventaire ──────────────────────────────────────────────────────

export interface RapportLigne {
  article_id: string;
  code_barre: string;
  code_article: string;
  libelle: string;
  unite: string | null;
  quantite_theorique: number | null;
  quantite_comptee: number;
  ecart: number | null;
  ecart_pct: number | null;
}

export interface CampagneRapport {
  campagne_id: string;
  campagne_nom: string;
  magasin_id: string;
  statut: StatutCampagne;
  nb_articles: number;
  nb_articles_comptes: number;
  nb_articles_ok: number;
  nb_articles_en_ecart: number;
  lignes: RapportLigne[];
}

export interface LigneImportResponse {
  added: number;
  skipped: number;
  errors: string[];
}

export interface ArticleImportResponse {
  created: number;
  updated: number;
  errors: string[];
}

export interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: {
    id: string;
    email: string;
    nom: string;
    role: string;
  } | null;
}

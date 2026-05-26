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

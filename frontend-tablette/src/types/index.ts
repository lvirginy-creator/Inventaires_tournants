export interface ArticleLocal {
  id: string;
  code_barre: string | null;
  code_article: string;
  libelle: string;
  unite: string | null;
}

export interface LigneCampagneLocal {
  id: string;
  article_id: string;
  quantite_theorique: number | null;
  article: ArticleLocal;
}

export type StatutCampagne = "brouillon" | "en_cours" | "terminee" | "validee";

export interface CampagneLocal {
  id: string;
  nom: string;
  statut: StatutCampagne;
  magasin_id: string;
  lignes: LigneCampagneLocal[];
  fetchedAt: string; // ISO date
}

export interface ComptageLocal {
  client_uuid: string; // PK Dexie
  campagne_id: string;
  article_id: string;
  quantite: number;
  counted_at: string; // ISO date
  synced: boolean;
  commentaire?: string;
}

export interface TabletteAuth {
  tablette_id: string;
  access_token: string;
  magasin_id: string;
  magasin_nom: string;
  session_id: string;
  role: "operateur" | "responsable_depot";
}

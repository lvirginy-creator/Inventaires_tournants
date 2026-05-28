import Dexie, { type Table } from "dexie";
import type { ArticleLocal, CampagneLocal, ComptageLocal } from "@/types";

export class InventaireDB extends Dexie {
  articles!: Table<ArticleLocal, string>;
  campagne!: Table<CampagneLocal & { _key: number }, number>;
  comptages!: Table<ComptageLocal, string>;

  constructor() {
    super("inventaire-g2c");
    this.version(1).stores({
      articles: "id, code_barre, code_article",
      campagne: "++_key",
      comptages: "client_uuid, campagne_id, article_id, synced",
    });
  }
}

export const db = new InventaireDB();

// ── Helpers ────────────────────────────────────────────────────────────────────

export async function getCampagneActive(): Promise<CampagneLocal | undefined> {
  const row = await db.campagne.toCollection().first();
  if (!row) return undefined;
  const { _key: _k, ...campagne } = row;
  void _k;
  return campagne;
}

export async function saveCampagne(campagne: CampagneLocal): Promise<void> {
  await db.campagne.clear();
  await db.campagne.add({ ...campagne, _key: 0 } as CampagneLocal & { _key: number });
}

export async function getArticleByCodeBarre(
  codeBarre: string
): Promise<ArticleLocal | undefined> {
  return db.articles.where("code_barre").equals(codeBarre).first();
}

export async function getArticleByCodeArticle(
  codeArticle: string
): Promise<ArticleLocal | undefined> {
  return db.articles.where("code_article").equals(codeArticle).first();
}

export async function getArticlesByCodeArticle(
  codeArticle: string
): Promise<ArticleLocal[]> {
  return db.articles.where("code_article").equals(codeArticle).toArray();
}

export async function getPendingComptages(): Promise<ComptageLocal[]> {
  return db.comptages.filter((c) => !c.synced).toArray();
}

export async function markComptagesSynced(clientUuids: string[]): Promise<void> {
  await db.comptages.where("client_uuid").anyOf(clientUuids).modify({ synced: true });
}

export async function saveComptage(comptage: ComptageLocal): Promise<void> {
  await db.comptages.put(comptage);
}

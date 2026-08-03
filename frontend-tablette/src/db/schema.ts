import Dexie, { type Table } from "dexie";
import type { ArticleLocal, CampagneLocal, ComptageLocal } from "@/types";

interface MetaRow {
  key: string;
  value: string;
}

interface DeletionQueueRow {
  client_uuid: string;
  queued_at: string;
}

interface AuthLocalRecord {
  id: "main";
  salt: string;
  hash: string;
}

export class InventaireDB extends Dexie {
  articles!: Table<ArticleLocal, string>;
  campagne!: Table<CampagneLocal & { _key: number }, number>;
  comptages!: Table<ComptageLocal, string>;
  meta!: Table<MetaRow, string>;
  deletionsQueue!: Table<DeletionQueueRow, string>;
  authLocal!: Table<AuthLocalRecord, string>;

  constructor() {
    super("inventaire-g2c");
    this.version(1).stores({
      articles: "id, code_barre, code_article",
      campagne: "++_key",
      comptages: "client_uuid, campagne_id, article_id, synced",
    });
    this.version(2).stores({
      articles: "id, code_barre, code_article",
      campagne: "++_key",
      comptages: "client_uuid, campagne_id, article_id, synced",
      meta: "key",
      deletionsQueue: "client_uuid",
    });
    this.version(3).stores({
      articles: "id, code_barre, code_article",
      campagne: "++_key",
      comptages: "client_uuid, campagne_id, article_id, synced",
      meta: "key",
      deletionsQueue: "client_uuid",
      authLocal: "id",
    });
  }
}

export const db = new InventaireDB();

// ── Helpers articles ───────────────────────────────────────────────────────────

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
  const lower = codeBarre.toLowerCase().trim();
  return db.articles.filter((a) => a.code_barre?.toLowerCase() === lower).first();
}

export async function getArticleByCodeArticle(
  codeArticle: string
): Promise<ArticleLocal | undefined> {
  const lower = codeArticle.toLowerCase();
  return db.articles.filter((a) => a.code_article.toLowerCase() === lower).first();
}

export async function getArticlesByCodeArticle(
  codeArticle: string
): Promise<ArticleLocal[]> {
  const lower = codeArticle.toLowerCase();
  return db.articles.filter((a) => a.code_article.toLowerCase() === lower).toArray();
}

// ── Helpers comptages ──────────────────────────────────────────────────────────

export async function getPendingComptages(): Promise<ComptageLocal[]> {
  return db.comptages.filter((c) => !c.synced).toArray();
}

export async function markComptagesSynced(clientUuids: string[]): Promise<void> {
  await db.comptages.where("client_uuid").anyOf(clientUuids).modify({ synced: true, syncError: null });
}

export async function saveComptage(comptage: ComptageLocal): Promise<void> {
  await db.comptages.put(comptage);
}

// ── Helpers meta (clé/valeur) ──────────────────────────────────────────────────

export async function getMetaValue(key: string): Promise<string | undefined> {
  const row = await db.meta.get(key);
  return row?.value;
}

export async function setMetaValue(key: string, value: string): Promise<void> {
  await db.meta.put({ key, value });
}

// ── Helpers deletionsQueue ─────────────────────────────────────────────────────

export async function getPendingDeletions(): Promise<string[]> {
  const rows = await db.deletionsQueue.toArray();
  return rows.map((r) => r.client_uuid);
}

export async function queueDeletion(clientUuid: string): Promise<void> {
  await db.deletionsQueue.put({ client_uuid: clientUuid, queued_at: new Date().toISOString() });
}

export async function clearDeletion(clientUuid: string): Promise<void> {
  await db.deletionsQueue.delete(clientUuid);
}

import { db } from "./schema";

const ITERATIONS = 100_000;
const SALT_BYTES = 16;

function bufToB64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function b64ToBuf(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function deriveKey(password: string, salt: Uint8Array): Promise<ArrayBuffer> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    256
  );
}

export async function storeAuthLocal(password: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await deriveKey(password, salt);
  await db.authLocal.put({ id: "main", salt: bufToB64(salt.buffer as ArrayBuffer), hash: bufToB64(hash) });
}

export async function verifyAuthLocal(password: string): Promise<boolean> {
  const record = await db.authLocal.get("main");
  if (!record) return false;
  const salt = b64ToBuf(record.salt);
  const derived = new Uint8Array(await deriveKey(password, salt));
  const expected = b64ToBuf(record.hash);
  if (derived.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= derived[i] ^ expected[i];
  return diff === 0;
}

export async function hasAuthLocal(): Promise<boolean> {
  return (await db.authLocal.count()) > 0;
}

export async function clearAuthLocal(): Promise<void> {
  await db.authLocal.clear();
}

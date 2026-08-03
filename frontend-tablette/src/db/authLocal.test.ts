import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory Dexie mock
const _store = new Map<string, { id: string; salt: string; hash: string }>();

vi.mock("./schema", () => ({
  db: {
    authLocal: {
      put: vi.fn((record: { id: string; salt: string; hash: string }) => {
        _store.set(record.id, record);
        return Promise.resolve();
      }),
      get: vi.fn((id: string) => Promise.resolve(_store.get(id))),
      count: vi.fn(() => Promise.resolve(_store.size)),
      clear: vi.fn(() => {
        _store.clear();
        return Promise.resolve();
      }),
    },
  },
}));

// Imports must come after vi.mock (hoisted by vitest)
const { storeAuthLocal, verifyAuthLocal, hasAuthLocal, clearAuthLocal } = await import(
  "./authLocal"
);

describe("authLocal — PBKDF2 offline verifier", () => {
  beforeEach(async () => {
    await clearAuthLocal();
  });

  it("storeAuthLocal + verifyAuthLocal → true with correct password", async () => {
    await storeAuthLocal("secretPass123");
    expect(await verifyAuthLocal("secretPass123")).toBe(true);
  });

  it("verifyAuthLocal with wrong password → false", async () => {
    await storeAuthLocal("correct");
    expect(await verifyAuthLocal("wrong")).toBe(false);
  });

  it("verifyAuthLocal returns false when no verifier stored", async () => {
    expect(await verifyAuthLocal("anything")).toBe(false);
  });

  it("hasAuthLocal → false before store, true after", async () => {
    expect(await hasAuthLocal()).toBe(false);
    await storeAuthLocal("pass");
    expect(await hasAuthLocal()).toBe(true);
  });

  it("clearAuthLocal → hasAuthLocal returns false", async () => {
    await storeAuthLocal("pass");
    await clearAuthLocal();
    expect(await hasAuthLocal()).toBe(false);
  });

  it("second storeAuthLocal overwrites the first (upsert)", async () => {
    await storeAuthLocal("first");
    await storeAuthLocal("second");
    expect(await verifyAuthLocal("second")).toBe(true);
    expect(await verifyAuthLocal("first")).toBe(false);
    expect(_store.size).toBe(1);
  });

  it("two stores of the same password produce different salts", async () => {
    await storeAuthLocal("same");
    const record1 = _store.get("main")!;
    await storeAuthLocal("same");
    const record2 = _store.get("main")!;
    expect(record1.salt).not.toBe(record2.salt);
    // But both should verify correctly
    expect(await verifyAuthLocal("same")).toBe(true);
  });
});

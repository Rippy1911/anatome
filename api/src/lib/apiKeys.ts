// First-party API keys. Base44 is the system of record and pushes state here
// via PUT /admin/keys/{key_id}. The Worker verifies Bearer tokens by sha256
// lookup and enforces the plan quota. Plaintext tokens never live in KV.

import type { Env } from "./rateLimit.ts";

export const KEY_PREFIX_LIVE = "ana_live_";
export const KEY_PREFIX_TEST = "ana_test_";
const TOKEN_RE = /^ana_(?:live|test)_[A-Za-z0-9_-]{32}$/;

export type KeyStatus = "active" | "revoked" | "suspended";

export interface KeyRecord {
  key_id: string;
  key_hash: string;
  plan: string;
  status: KeyStatus;
  included_requests: number;
  allow_overage: boolean;
  stripe_customer_id?: string;
  owner_email?: string;
  updated_at: string;
}

export async function sha256Hex(str: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function extractApiToken(req: Request): string | null {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(\S+)$/i);
  if (!m) return null;
  const token = m[1];
  return TOKEN_RE.test(token) ? token : null;
}

function metaKey(keyId: string): string {
  return `keymeta:${keyId}`;
}
function hashKey(hash: string): string {
  return `keyhash:${hash}`;
}

export async function putKey(env: Env, record: KeyRecord): Promise<void> {
  const prev = await env.RATE_LIMIT_KV.get(metaKey(record.key_id));
  if (prev) {
    try {
      const old = JSON.parse(prev) as KeyRecord;
      if (old.key_hash && old.key_hash !== record.key_hash) {
        await env.RATE_LIMIT_KV.delete(hashKey(old.key_hash));
      }
    } catch { /* ignore corrupt */ }
  }
  await env.RATE_LIMIT_KV.put(metaKey(record.key_id), JSON.stringify(record));
  await env.RATE_LIMIT_KV.put(hashKey(record.key_hash), record.key_id);
}

export async function deleteKey(env: Env, keyId: string): Promise<boolean> {
  const raw = await env.RATE_LIMIT_KV.get(metaKey(keyId));
  if (!raw) return false;
  try {
    const rec = JSON.parse(raw) as KeyRecord;
    if (rec.key_hash) await env.RATE_LIMIT_KV.delete(hashKey(rec.key_hash));
  } catch { /* ignore */ }
  await env.RATE_LIMIT_KV.delete(metaKey(keyId));
  return true;
}

export async function getKeyById(env: Env, keyId: string): Promise<KeyRecord | null> {
  const raw = await env.RATE_LIMIT_KV.get(metaKey(keyId));
  if (!raw) return null;
  try { return JSON.parse(raw) as KeyRecord; } catch { return null; }
}

export async function getKeyByHash(env: Env, hash: string): Promise<KeyRecord | null> {
  const keyId = await env.RATE_LIMIT_KV.get(hashKey(hash));
  if (!keyId) return null;
  return getKeyById(env, keyId);
}

export async function resolveBearerKey(req: Request, env: Env): Promise<KeyRecord | null> {
  const token = extractApiToken(req);
  if (!token) return null;
  const hash = await sha256Hex(token);
  return getKeyByHash(env, hash);
}

export function currentMonthUtc(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

export function nextMonthStartUnix(): number {
  const n = new Date();
  return Math.floor(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 1, 0, 0, 0) / 1000);
}

/** Hard ceiling when overage is allowed — billing stops runaway, Soft quota is included_requests. */
export const OVERAGE_HARD_CEILING = 10_000_000;

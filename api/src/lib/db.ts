// D1 access.
//
// The binding is OPTIONAL by design. Anatome's catalog, diagrams, search and MCP tools are all
// bundled with the Worker and need no database, so a deployment with no `DB` binding serves the
// entire public API and simply has no accounts and no logging tools. That keeps the cheapest
// self-host — clone, deploy, done — genuinely free of setup, and it means a D1 outage degrades
// the product rather than taking it down.
//
// Every query here is user-scoped and every one binds its parameters. There is no admin path
// that reads across users, because there is no admin surface for personal data at all.

import type { Env as BaseEnv } from "./rateLimit.ts";

export interface DbEnv extends BaseEnv {
  DB?: D1Database;
}

/** True when this deployment has accounts. Check before advertising a logging tool. */
export function hasDb(env: DbEnv): env is DbEnv & { DB: D1Database } {
  return !!env.DB;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

/** Random opaque id. Used for row ids, client ids and token bodies alike. */
export function newId(prefix = ""): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return prefix ? `${prefix}_${hex}` : hex;
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export interface UserRow {
  id: string;
  email: string;
  email_lower: string;
  password_hash: string;
  password_salt: string;
  iterations: number;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export async function findUserByEmail(db: D1Database, email: string): Promise<UserRow | null> {
  return db.prepare("SELECT * FROM users WHERE email_lower = ?")
    .bind(email.trim().toLowerCase())
    .first<UserRow>();
}

export async function findUserById(db: D1Database, id: string): Promise<UserRow | null> {
  return db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>();
}

export async function insertUser(db: D1Database, row: UserRow): Promise<void> {
  await db.prepare(
    `INSERT INTO users (id, email, email_lower, password_hash, password_salt, iterations, timezone, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    row.id, row.email, row.email_lower, row.password_hash, row.password_salt,
    row.iterations, row.timezone, row.created_at, row.updated_at,
  ).run();
}

export async function setUserTimezone(db: D1Database, userId: string, tz: string): Promise<void> {
  await db.prepare("UPDATE users SET timezone = ?, updated_at = ? WHERE id = ?")
    .bind(tz, nowIso(), userId).run();
}

export async function setUserPassword(
  db: D1Database,
  userId: string,
  hash: string,
  salt: string,
  iterations: number,
): Promise<void> {
  await db.prepare(
    "UPDATE users SET password_hash = ?, password_salt = ?, iterations = ?, updated_at = ? WHERE id = ?",
  ).bind(hash, salt, iterations, nowIso(), userId).run();
}

/**
 * Hard-delete an account and everything it owns.
 *
 * The child tables declare ON DELETE CASCADE, but SQLite only honours that when
 * `PRAGMA foreign_keys` is on, and D1's setting is not something this code controls. Deleting
 * explicitly costs one statement per table and removes the doubt — a deletion that silently
 * leaves rows behind is the one bug you cannot apologise your way out of.
 */
export async function deleteUserCompletely(db: D1Database, userId: string): Promise<void> {
  const statements = [
    "DELETE FROM workout_sets WHERE user_id = ?",
    "DELETE FROM workouts WHERE user_id = ?",
    "DELETE FROM meals WHERE user_id = ?",
    "DELETE FROM water_logs WHERE user_id = ?",
    "DELETE FROM body_metrics WHERE user_id = ?",
    "DELETE FROM goals WHERE user_id = ?",
    "DELETE FROM tokens WHERE user_id = ?",
    "DELETE FROM auth_codes WHERE user_id = ?",
    "DELETE FROM users WHERE id = ?",
  ].map((sql) => db.prepare(sql).bind(userId));
  await db.batch(statements);
}

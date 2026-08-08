// The view page: what a person sees when the assistant hands them a link.
//
// Everything here is server-rendered from D1 and inline SVG. No script, no external asset, no
// third party — a link someone forwards to a coach must render on a locked-down network and
// must not tell anyone's CDN that it was opened.
//
// The link is a bearer URL and is treated like one: hashed at rest, expiring, revocable,
// read-only unless the creator opted into editing, `noindex`, and `Cache-Control: private,
// no-store` so it never lands in a shared cache.

import type { Context } from "hono";
import { hasDb, findUserById, newId, nowUnix, sha256Hex, type DbEnv, type UserRow } from "../lib/db.ts";
import { localDate, recentLocalDates } from "../lib/tz.ts";
import { barChart, lineChart, statTile, type Point } from "../lib/charts.ts";
import { volumeOf } from "../lib/query.helpers.ts";
import { execCtx } from "../lib/meter.ts";

type Ctx = Context<{ Bindings: DbEnv }>;

const DEFAULT_TTL_HOURS = 24;
const MAX_TTL_HOURS = 24 * 30;
const DEFAULT_WINDOW_DAYS = 14;
// 365, not unbounded: the page renders one bar per day, and a chart with a thousand of them is a
// texture rather than a chart.
const MAX_WINDOW_DAYS = 365;

export interface ViewLinkRow {
  token_hash: string;
  user_id: string;
  label: string;
  can_edit: number;
  expires_at: number;
  revoked_at: number | null;
  view_count: number;
  /** How much history this link shows. Links minted before migration 0006 read 14 by default. */
  window_days: number;
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// Minting and resolving
// ---------------------------------------------------------------------------

export async function createViewLink(
  db: D1Database,
  user: UserRow,
  args: Record<string, unknown>,
  baseUrl: string,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; message: string; field?: string }> {
  const hours = Number.isFinite(Number(args.expires_in_hours))
    ? Math.min(Math.max(1, Math.round(Number(args.expires_in_hours))), MAX_TTL_HOURS)
    : DEFAULT_TTL_HOURS;
  const canEdit = args.can_edit === true;
  // "Show my coach my last month" is the use case this whole feature exists for, and it is the
  // example in llms.txt — but the page was fixed at 14 days and `days` was ignored without a word.
  const days = Number.isFinite(Number(args.days))
    ? Math.min(Math.max(1, Math.round(Number(args.days))), MAX_WINDOW_DAYS)
    : DEFAULT_WINDOW_DAYS;

  // 256 bits of entropy in the path. This is the only thing standing between a URL and someone's
  // food log, so it is not a short code.
  const token = `${newId()}${newId()}`;
  const expiresAt = nowUnix() + hours * 3600;

  await db.prepare(
    `INSERT INTO view_links (token_hash, user_id, label, can_edit, expires_at, created_at, window_days)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    await sha256Hex(token), user.id, String(args.label ?? "").slice(0, 80),
    canEdit ? 1 : 0, expiresAt, nowUnix(), days,
  ).run();

  return {
    ok: true,
    data: {
      url: `${baseUrl}/v/${token}`,
      expires_at: new Date(expiresAt * 1000).toISOString(),
      expires_in_hours: hours,
      can_edit: canEdit,
      // Echoed so the assistant can say "here is your last 30 days" and be right, or notice that
      // it asked for 400 and got 365.
      days,
      label: String(args.label ?? ""),
      warning: "Anyone with this URL can see this data until it expires. Share it deliberately; revoke_view_link kills it early.",
    },
  };
}

export async function listViewLinks(db: D1Database, user: UserRow): Promise<Record<string, unknown>> {
  const { results } = await db.prepare(
    `SELECT label, can_edit, expires_at, created_at, revoked_at, view_count, last_seen_at
       FROM view_links WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
  ).bind(user.id).all<Record<string, number | string | null>>();
  const now = nowUnix();
  return {
    // The token itself is never returned — it only exists in the URL handed out once.
    links: results.map((r) => ({
      label: r.label,
      can_edit: r.can_edit === 1,
      active: !r.revoked_at && Number(r.expires_at) > now,
      expires_at: new Date(Number(r.expires_at) * 1000).toISOString(),
      created_at: new Date(Number(r.created_at) * 1000).toISOString(),
      view_count: r.view_count,
      last_seen_at: r.last_seen_at ? new Date(Number(r.last_seen_at) * 1000).toISOString() : null,
    })),
    note: "Tokens are not shown: they are stored hashed and only ever appear in the URL handed out at creation.",
  };
}

export async function revokeViewLinks(
  db: D1Database,
  user: UserRow,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  // Revoking by label or all-at-once, because the person asking has the label, not the token —
  // they gave the token away, which is the whole point of it.
  const label = String(args.label ?? "").trim();
  const stmt = label
    ? db.prepare("UPDATE view_links SET revoked_at = ? WHERE user_id = ? AND label = ? AND revoked_at IS NULL").bind(nowUnix(), user.id, label)
    : db.prepare("UPDATE view_links SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").bind(nowUnix(), user.id);
  const res = await stmt.run();
  return {
    revoked: res.meta.changes ?? 0,
    scope: label ? `links labelled "${label}"` : "every active link",
  };
}

async function resolveLink(db: D1Database, token: string): Promise<ViewLinkRow | null> {
  if (!token || token.length < 32) return null;
  const row = await db.prepare("SELECT * FROM view_links WHERE token_hash = ?")
    .bind(await sha256Hex(token)).first<ViewLinkRow>();
  if (!row || row.revoked_at || row.expires_at <= nowUnix()) return null;
  return row;
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

const STYLE = `
:root {
  color-scheme: light dark;
  --surface-1:#fcfcfb; --surface-2:#ffffff; --line:#e6e5e1;
  --text-primary:#0b0b0b; --text-secondary:#52514e; --text-muted:#78766f;
  --series-1:#2a78d6; --series-2:#eb6834; --series-3:#1baf7a;
  --brand:#dc2626;
}
@media (prefers-color-scheme: dark) {
  :root {
    --surface-1:#1a1a19; --surface-2:#232322; --line:#33322f;
    --text-primary:#ffffff; --text-secondary:#c3c2b7; --text-muted:#9b998f;
    --series-1:#3987e5; --series-2:#d95926; --series-3:#199e70;
  }
}
* { box-sizing:border-box; }
body { margin:0; padding:28px 18px 64px; background:var(--surface-1); color:var(--text-primary);
  font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
main { max-width:780px; margin:0 auto; }
header { margin-bottom:24px; }
h1 { font-size:22px; margin:0 0 4px; letter-spacing:-0.01em; }
.sub { color:var(--text-secondary); font-size:14px; margin:0; }
h2 { font-size:15px; margin:32px 0 10px; letter-spacing:-0.005em; }
section { margin-bottom:8px; }
.tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; }
.tile { background:var(--surface-2); border:1px solid var(--line); border-radius:12px; padding:14px; }
.tile-label { font-size:12px; color:var(--text-secondary); font-weight:600; text-transform:uppercase; letter-spacing:.04em; }
.tile-value { font-size:26px; font-weight:700; margin-top:2px; font-variant-numeric:tabular-nums; }
.tile-unit { font-size:13px; font-weight:500; color:var(--text-muted); margin-left:3px; }
.tile-sub { font-size:12px; color:var(--text-muted); margin-top:6px; }
.meter { height:5px; border-radius:3px; background:var(--line); margin-top:9px; overflow:hidden; }
.meter span { display:block; height:100%; background:var(--series-1); border-radius:3px; }
figure.chart { margin:0 0 14px; background:var(--surface-2); border:1px solid var(--line);
  border-radius:12px; padding:14px 14px 8px; }
figure.chart figcaption { font-size:13px; font-weight:600; color:var(--text-primary); margin-bottom:6px; }
figure.chart svg { width:100%; height:auto; display:block; }
.grid { stroke:var(--line); stroke-width:1; }
.tick { fill:var(--text-muted); font-size:10px; font-family:inherit; }
.point-label { fill:var(--text-primary); font-size:11px; font-weight:600; font-family:inherit; }
.target { stroke:var(--text-muted); stroke-width:1.5; stroke-dasharray:4 3; }
.target-label { fill:var(--text-muted); font-size:10px; font-family:inherit; }
.marker { stroke:var(--surface-2); stroke-width:2; }
.empty { color:var(--text-muted); font-size:13px; padding:28px 0 34px; text-align:center; }
table { width:100%; border-collapse:collapse; font-size:14px; background:var(--surface-2);
  border:1px solid var(--line); border-radius:12px; overflow:hidden; }
th { text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.04em;
  color:var(--text-secondary); padding:9px 12px; border-bottom:1px solid var(--line); font-weight:600; }
td { padding:9px 12px; border-bottom:1px solid var(--line); vertical-align:top; }
tr:last-child td { border-bottom:0; }
.num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
.muted { color:var(--text-muted); }
.wrap { overflow-x:auto; }
.danger { background:none; border:0; color:var(--brand); cursor:pointer; font:inherit; font-size:13px; padding:0; }
form.inline { display:inline; }
footer { margin-top:40px; padding-top:18px; border-top:1px solid var(--line);
  color:var(--text-muted); font-size:12px; }
footer a { color:var(--text-secondary); }
.banner { background:var(--surface-2); border:1px solid var(--line); border-left:3px solid var(--series-2);
  border-radius:8px; padding:10px 12px; font-size:13px; color:var(--text-secondary); margin-bottom:18px; }
`;

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>${esc(title)}</title>
<style>${STYLE}</style>
</head><body><main>${body}</main></body></html>`;
}

function gone(reason: string): Response {
  return new Response(shell("Link unavailable", `
    <header><h1>This link is no longer available</h1>
    <p class="sub">${esc(reason)}</p></header>
    <p class="sub">Ask for a fresh one — your assistant can mint it in a second with
    <code>create_view_link</code>.</p>`), {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" },
  });
}

/** Short "3 Aug" label. Locale-free on purpose: this string is a tick, not prose. */
function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(d)} ${months[Number(m) - 1] ?? ""}`;
}

export async function renderViewPage(c: Ctx): Promise<Response> {
  if (!hasDb(c.env)) return gone("This deployment has no accounts.");
  const token = c.req.param("token") ?? "";
  const link = await resolveLink(c.env.DB, token);
  if (!link) return gone("It has expired, been revoked, or never existed.");

  const user = await findUserById(c.env.DB, link.user_id);
  if (!user) return gone("The account behind it was deleted.");

  // Fire-and-forget: a view counter must never be the reason a page fails to render.
  // `c.executionCtx` is a getter that THROWS when there is no ExecutionContext (which is the
  // case under the test runner), so `?.` does not protect it — meter.ts already learned this
  // and exports the guard.
  const counted = c.env.DB
    .prepare("UPDATE view_links SET view_count = view_count + 1, last_seen_at = ? WHERE token_hash = ?")
    .bind(nowUnix(), link.token_hash).run().then(() => undefined).catch(() => undefined);
  const ctx = execCtx(c);
  if (ctx) ctx.waitUntil(counted); else void counted;

  const today = localDate(user.timezone);
  // The window the owner chose when they minted the link, not one the reader can change.
  const windowDays = Math.min(Math.max(1, Number(link.window_days) || DEFAULT_WINDOW_DAYS), MAX_WINDOW_DAYS);
  const window14 = recentLocalDates(user.timezone, windowDays);
  const from14 = window14[0];
  // Body weight always gets the longer view: a fortnight of it is noise, and the question people
  // ask a weight chart ("is this going anywhere?") needs more than the trend of the window.
  const from90 = recentLocalDates(user.timezone, Math.max(windowDays, 90))[0];
  const windowLabel = windowDays === 1 ? "Today" : `Last ${windowDays} days`;

  const [goalsRow, dailyCals, weights, volumes, meals, workouts, supplements] = await Promise.all([
    c.env.DB.prepare("SELECT calories, protein, carbs, fats, water_ml FROM goals WHERE user_id = ?")
      .bind(user.id).first<Record<string, number | null>>(),
    c.env.DB.prepare(
      `SELECT date, COALESCE(SUM(calories),0) AS calories, COALESCE(SUM(protein),0) AS protein
         FROM meals WHERE user_id = ? AND date BETWEEN ? AND ? GROUP BY date ORDER BY date`,
    ).bind(user.id, from14, today).all<{ date: string; calories: number; protein: number }>(),
    c.env.DB.prepare(
      `SELECT date, value, unit FROM body_metrics
        WHERE user_id = ? AND metric_type = 'weight' AND date BETWEEN ? AND ? ORDER BY date`,
    ).bind(user.id, from90, today).all<{ date: string; value: number; unit: string }>(),
    c.env.DB.prepare(
      `SELECT date, COALESCE(SUM(COALESCE(reps,0) * COALESCE(weight,0)),0) AS volume, COUNT(*) AS sets
         FROM workout_sets WHERE user_id = ? AND date BETWEEN ? AND ? GROUP BY date ORDER BY date`,
    ).bind(user.id, from14, today).all<{ date: string; volume: number; sets: number }>(),
    c.env.DB.prepare(
      "SELECT id, meal_type, name, calories, protein, carbs, fats FROM meals WHERE user_id = ? AND date = ? ORDER BY logged_at",
    ).bind(user.id, today).all<Record<string, string | number | null>>(),
    c.env.DB.prepare(
      "SELECT id, date, title, duration_minutes FROM workouts WHERE user_id = ? ORDER BY date DESC, logged_at DESC LIMIT 8",
    ).bind(user.id).all<{ id: string; date: string; title: string; duration_minutes: number | null }>(),
    c.env.DB.prepare(
      `SELECT name, COUNT(DISTINCT date) AS days FROM supplements
        WHERE user_id = ? AND date BETWEEN ? AND ? GROUP BY name_key ORDER BY days DESC LIMIT 10`,
    ).bind(user.id, from14, today).all<{ name: string; days: number }>(),
  ]);

  // Sets for the listed workouts — one query, same reason as everywhere else.
  const ids = workouts.results.map((w) => w.id);
  const setsByWorkout = new Map<string, { exercise_name: string; reps: number | null; weight: number | null }[]>();
  if (ids.length) {
    const { results } = await c.env.DB.prepare(
      `SELECT workout_id, exercise_name, reps, weight FROM workout_sets
        WHERE user_id = ? AND workout_id IN (${ids.map(() => "?").join(",")}) ORDER BY set_number`,
    ).bind(user.id, ...ids).all<{ workout_id: string; exercise_name: string; reps: number | null; weight: number | null }>();
    for (const r of results) {
      const list = setsByWorkout.get(r.workout_id);
      if (list) list.push(r); else setsByWorkout.set(r.workout_id, [r]);
    }
  }

  const todayTotals = dailyCals.results.find((d) => d.date === today) ?? { calories: 0, protein: 0 };
  const byDate = new Map(dailyCals.results.map((d) => [d.date, d]));
  const volByDate = new Map(volumes.results.map((v) => [v.date, v]));

  const caloriePoints: Point[] = window14.map((d) => ({
    label: shortDate(d),
    value: Math.round(byDate.get(d)?.calories ?? 0),
    title: `${d}: ${Math.round(byDate.get(d)?.calories ?? 0)} kcal`,
  }));
  const volumePoints: Point[] = window14.map((d) => ({
    label: shortDate(d),
    value: Math.round(volByDate.get(d)?.volume ?? 0),
    title: `${d}: ${Math.round(volByDate.get(d)?.volume ?? 0)} kg·reps over ${volByDate.get(d)?.sets ?? 0} sets`,
  }));
  const weightPoints: Point[] = weights.results.map((r) => ({
    label: shortDate(r.date),
    value: Math.round(r.value * 10) / 10,
    title: `${r.date}: ${r.value} ${r.unit}`,
  }));
  const weightUnit = weights.results[weights.results.length - 1]?.unit ?? "";

  const canEdit = link.can_edit === 1;
  const editCell = (kind: string, id: string) => canEdit
    ? `<td class="num"><form method="post" class="inline"><input type="hidden" name="action" value="delete_${esc(kind)}"><input type="hidden" name="id" value="${esc(id)}"><button class="danger" type="submit">Delete</button></form></td>`
    : "";

  const body = `
<header>
  <h1>${esc(user.email.split("@")[0])}'s training log</h1>
  <p class="sub">${esc(today)} · times shown in ${esc(user.timezone)}</p>
</header>

<div class="banner">
  ${canEdit
    ? "This link can edit entries. Anyone holding the URL can delete data until it expires."
    : "Read-only view. Anyone holding this URL can see this data until it expires."}
</div>

<h2>Today</h2>
<section class="tiles">
  ${statTile({ label: "Calories", value: todayTotals.calories, target: goalsRow?.calories ?? null, unit: "kcal" })}
  ${statTile({ label: "Protein", value: todayTotals.protein, target: goalsRow?.protein ?? null, unit: "g" })}
</section>

<h2>${esc(windowLabel)}</h2>
<section>
  ${barChart({ title: "Calories per day", points: caloriePoints, target: goalsRow?.calories ?? null, unit: " kcal", series: 1 })}
  ${barChart({ title: "Training volume per day (kg × reps)", points: volumePoints, series: 3 })}
</section>

<h2>Body weight</h2>
<section>
  ${lineChart({ title: `Body weight, last ${Math.max(windowDays, 90)} days${weightUnit ? ` (${weightUnit})` : ""}`, points: weightPoints, unit: weightUnit, series: 2 })}
</section>

<h2>Today's meals</h2>
<section class="wrap">
  ${meals.results.length ? `<table>
    <thead><tr><th>Meal</th><th>What</th><th class="num">kcal</th><th class="num">P</th><th class="num">C</th><th class="num">F</th>${canEdit ? "<th></th>" : ""}</tr></thead>
    <tbody>${meals.results.map((m) => `<tr>
      <td class="muted">${esc(m.meal_type ?? "—")}</td>
      <td>${esc(m.name)}</td>
      <td class="num">${Math.round(Number(m.calories))}</td>
      <td class="num">${Math.round(Number(m.protein))}</td>
      <td class="num">${Math.round(Number(m.carbs))}</td>
      <td class="num">${Math.round(Number(m.fats))}</td>
      ${editCell("meal", String(m.id))}
    </tr>`).join("")}</tbody></table>` : `<p class="sub">Nothing logged today.</p>`}
</section>

<h2>Recent workouts</h2>
<section class="wrap">
  ${workouts.results.length ? `<table>
    <thead><tr><th>Date</th><th>Session</th><th class="num">Sets</th><th class="num">Volume</th>${canEdit ? "<th></th>" : ""}</tr></thead>
    <tbody>${workouts.results.map((w) => {
      const sets = setsByWorkout.get(w.id) ?? [];
      const names = [...new Set(sets.map((s) => s.exercise_name))];
      return `<tr>
        <td class="muted">${esc(w.date)}</td>
        <td>${esc(w.title || "Workout")}<br><span class="muted">${esc(names.slice(0, 4).join(", "))}${names.length > 4 ? ` +${names.length - 4} more` : ""}</span></td>
        <td class="num">${sets.length}</td>
        <td class="num">${Math.round(volumeOf(sets))}</td>
        ${editCell("workout", w.id)}
      </tr>`;
    }).join("")}</tbody></table>` : `<p class="sub">No workouts logged yet.</p>`}
</section>

${supplements.results.length ? `<h2>Supplements, ${esc(windowLabel.toLowerCase())}</h2>
<section class="wrap">
  <table>
    <thead><tr><th>Supplement</th><th class="num">Days taken</th></tr></thead>
    <tbody>${supplements.results.map((s) => `<tr><td>${esc(s.name)}</td><td class="num">${s.days} / ${windowDays}</td></tr>`).join("")}</tbody>
  </table>
</section>` : ""}

<footer>
  Logged with <a href="https://anatome.dev">Anatome</a> — a free, keyless nutrition and training
  log for AI assistants. This link expires ${esc(new Date(link.expires_at * 1000).toISOString())}
  and can be revoked at any time by its owner.
</footer>`;

  return new Response(shell(`Training log — ${today}`, body), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // A shared cache must never hold someone's food log.
      "Cache-Control": "private, no-store, max-age=0",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    },
  });
}

/** Edit actions from the page. Only ever reachable through a link minted with can_edit. */
export async function handleViewAction(c: Ctx): Promise<Response> {
  if (!hasDb(c.env)) return gone("This deployment has no accounts.");
  const token = c.req.param("token") ?? "";
  const link = await resolveLink(c.env.DB, token);
  if (!link) return gone("It has expired, been revoked, or never existed.");
  if (link.can_edit !== 1) {
    return new Response(shell("Read-only", `<header><h1>This link is read-only</h1>
      <p class="sub">It was created without edit rights, so nothing was changed.</p></header>`), {
      status: 403,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
    });
  }

  const form = await c.req.formData();
  const action = String(form.get("action") || "");
  const id = String(form.get("id") || "");

  // Every statement is scoped to the link's own user, so a token cannot be pointed at someone
  // else's row even if an id from another account were guessed.
  if (action === "delete_meal" && id) {
    await c.env.DB.prepare("DELETE FROM meals WHERE id = ? AND user_id = ?").bind(id, link.user_id).run();
  } else if (action === "delete_workout" && id) {
    await c.env.DB.batch([
      c.env.DB.prepare("DELETE FROM workout_sets WHERE workout_id = ? AND user_id = ?").bind(id, link.user_id),
      c.env.DB.prepare("DELETE FROM workouts WHERE id = ? AND user_id = ?").bind(id, link.user_id),
    ]);
  }

  // POST-redirect-GET: a refresh must not repeat a delete.
  return new Response(null, {
    status: 303,
    headers: { Location: `/v/${token}`, "Cache-Control": "private, no-store" },
  });
}

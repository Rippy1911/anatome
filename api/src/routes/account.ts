// The account page: export your data, change your password, delete everything.
//
// Server-rendered from the Worker, behind the same login as the OAuth flow. It exists because
// "your data is yours" has to be operable by a person, not only by an assistant with a token —
// someone whose connector broke still needs a way to get their history out and to close the
// account.
//
// No framework, no external asset, no JavaScript beyond one confirm dialog. It is three forms.

import type { Context } from "hono";
import { deleteUserCompletely, findUserById, hasDb, type DbEnv, type UserRow } from "../lib/db.ts";
import {
  CLEAR_SESSION_COOKIE, buildSessionCookie, hashPassword, issueToken, newSalt,
  passwordProblem, PBKDF2_ITERATIONS, resolveToken, revokeAllUserTokens, sessionCookie,
  SESSION_TTL, verifyPassword,
} from "../lib/auth.ts";
import { setUserPassword } from "../lib/db.ts";
import { exportEverything, toCsv } from "../lib/logging.ts";
import { isValidTimezone } from "../lib/tz.ts";

type Ctx = Context<{ Bindings: DbEnv }>;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

async function currentUser(c: Ctx): Promise<UserRow | null> {
  if (!hasDb(c.env)) return null;
  const token = sessionCookie(c.req.raw);
  if (!token) return null;
  const row = await resolveToken(c.env.DB, token, "session");
  if (!row) return null;
  return findUserById(c.env.DB, row.user_id);
}

const STYLE = `
  :root { color-scheme: light dark; --bg:#fff; --fg:#0f172a; --muted:#64748b; --line:#e2e8f0; --brand:#dc2626; --card:#fff; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0a0e17; --fg:#e2e8f0; --muted:#94a3b8; --line:#1e293b; --card:#0f1522; } }
  * { box-sizing:border-box; }
  body { margin:0; padding:32px 20px; background:var(--bg); color:var(--fg);
         font:15px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
  main { max-width:600px; margin:0 auto; }
  h1 { font-size:22px; margin:0 0 4px; letter-spacing:-0.01em; }
  h2 { font-size:16px; margin:0 0 8px; }
  p.sub { color:var(--muted); margin:0 0 28px; font-size:14px; }
  section { border:1px solid var(--line); border-radius:14px; padding:20px; margin-bottom:18px; background:var(--card); }
  p { margin:0 0 12px; color:var(--muted); font-size:14px; }
  label { display:block; font-size:13px; font-weight:600; margin:12px 0 5px; color:var(--fg); }
  input { width:100%; padding:9px 11px; border:1px solid var(--line); border-radius:8px;
          background:var(--bg); color:var(--fg); font-size:15px; }
  button { margin-top:14px; padding:9px 14px; border:0; border-radius:8px; background:var(--brand);
           color:#fff; font-weight:600; font-size:14px; cursor:pointer; }
  button.secondary { background:transparent; color:var(--fg); border:1px solid var(--line); }
  a.btn { display:inline-block; margin-right:8px; margin-top:6px; padding:9px 14px; border-radius:8px;
          border:1px solid var(--line); color:var(--fg); text-decoration:none; font-size:14px; font-weight:600; }
  .danger { border-color:var(--brand); }
  .msg { padding:10px 12px; border-radius:8px; font-size:14px; margin-bottom:18px; }
  .ok { background:rgba(16,185,129,.12); color:#059669; }
  .err { background:rgba(220,38,38,.12); color:var(--brand); }
  dl { margin:0; display:grid; grid-template-columns:auto 1fr; gap:6px 16px; font-size:14px; }
  dt { color:var(--muted); }
`;

function shell(bodyHtml: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Your Anatome account</title><style>${STYLE}</style></head>
<body><main>${bodyHtml}</main></body></html>`;
}

function signedOutPage(base: string): string {
  return shell(`
    <h1>Your Anatome account</h1>
    <p class="sub">You are not signed in on this browser.</p>
    <section>
      <p>Anatome has no standalone login page — you sign in while connecting an assistant. Add the
      connector in Claude or ChatGPT and complete the sign-in there; you will land back here
      signed in.</p>
      <a class="btn" href="https://anatome.dev/#onboarding">How to connect</a>
      <a class="btn" href="${esc(base)}/.well-known/oauth-authorization-server">Server metadata</a>
    </section>`);
}

export async function accountPage(c: Ctx): Promise<Response> {
  if (!hasDb(c.env)) {
    return c.html(shell(`<h1>Accounts unavailable</h1>
      <p class="sub">This Anatome deployment has no database bound, so it has no accounts.</p>`), 501);
  }
  const base = c.env.PUBLIC_BASE_URL || new URL(c.req.url).origin;
  const user = await currentUser(c);
  if (!user) return c.html(signedOutPage(base));

  const url = new URL(c.req.url);
  const okMsg = url.searchParams.get("ok");
  const errMsg = url.searchParams.get("err");

  const counts = await c.env.DB.batch([
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM meals WHERE user_id = ?").bind(user.id),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM workouts WHERE user_id = ?").bind(user.id),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM body_metrics WHERE user_id = ?").bind(user.id),
  ]);
  const n = (i: number) => (counts[i]?.results?.[0] as { n?: number } | undefined)?.n ?? 0;

  return c.html(shell(`
    <h1>Your Anatome account</h1>
    <p class="sub">${esc(user.email)}</p>
    ${okMsg ? `<div class="msg ok">${esc(okMsg)}</div>` : ""}
    ${errMsg ? `<div class="msg err">${esc(errMsg)}</div>` : ""}

    <section>
      <h2>What is stored</h2>
      <dl>
        <dt>Meals</dt><dd>${n(0)}</dd>
        <dt>Workouts</dt><dd>${n(1)}</dd>
        <dt>Measurements</dt><dd>${n(2)}</dd>
        <dt>Timezone</dt><dd>${esc(user.timezone)}</dd>
        <dt>Member since</dt><dd>${esc(user.created_at.slice(0, 10))}</dd>
      </dl>
      <p style="margin-top:12px">That is the whole list. Anatome stores no analytics profile, no
      device data and no third-party identifiers, and never sells or shares any of it.</p>
    </section>

    <section>
      <h2>Take your data</h2>
      <p>Everything, in a format you can open elsewhere. No request, no waiting.</p>
      <a class="btn" href="/account/export.json">Download JSON</a>
      <a class="btn" href="/account/export.csv">Download CSV</a>
    </section>

    <section>
      <h2>Timezone</h2>
      <p>Days roll over at midnight in this zone. Entries already logged keep their date.</p>
      <form method="post" action="/account">
        <input type="hidden" name="action" value="timezone">
        <label for="tz">IANA timezone</label>
        <input id="tz" name="timezone" value="${esc(user.timezone)}" placeholder="Europe/Warsaw" required>
        <button type="submit">Save timezone</button>
      </form>
    </section>

    <section>
      <h2>Change password</h2>
      <p>Signs you out of every connected assistant — they will ask you to reconnect.</p>
      <form method="post" action="/account">
        <input type="hidden" name="action" value="password">
        <label for="cur">Current password</label>
        <input id="cur" name="current_password" type="password" autocomplete="current-password" required>
        <label for="new">New password</label>
        <input id="new" name="new_password" type="password" autocomplete="new-password" minlength="10" required>
        <button type="submit">Change password</button>
      </form>
    </section>

    <section class="danger">
      <h2>Delete this account</h2>
      <p>Deletes the account and every meal, workout and measurement it owns, immediately and
      permanently. There is no recovery and no grace period. Export first if you want a copy.</p>
      <form method="post" action="/account"
            onsubmit="return confirm('Permanently delete your Anatome account and all of its data? This cannot be undone.')">
        <input type="hidden" name="action" value="delete">
        <label for="del">Type your email to confirm</label>
        <input id="del" name="confirm_email" placeholder="${esc(user.email)}" required>
        <button type="submit">Delete everything</button>
      </form>
    </section>

    <p style="text-align:center;margin-top:24px">
      <a href="/account?logout=1" style="color:var(--muted);font-size:13px">Sign out of this browser</a>
    </p>`));
}

function back(c: Ctx, params: Record<string, string>, extraHeaders: Record<string, string> = {}): Response {
  const u = new URL("/account", c.env.PUBLIC_BASE_URL || new URL(c.req.url).origin);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return new Response(null, { status: 303, headers: { Location: u.toString(), ...extraHeaders } });
}

export async function accountAction(c: Ctx): Promise<Response> {
  if (!hasDb(c.env)) return c.json({ ok: false, error: "accounts_unavailable" }, 501);
  const user = await currentUser(c);
  if (!user) return back(c, { err: "Your session expired. Reconnect your assistant to sign in again." });

  const form = await c.req.formData();
  const action = String(form.get("action") || "");

  if (action === "timezone") {
    const tz = String(form.get("timezone") || "").trim();
    if (!isValidTimezone(tz)) return back(c, { err: `"${tz}" is not a timezone this server recognises.` });
    await c.env.DB.prepare("UPDATE users SET timezone = ?, updated_at = ? WHERE id = ?")
      .bind(tz, new Date().toISOString(), user.id).run();
    return back(c, { ok: `Timezone set to ${tz}.` });
  }

  if (action === "password") {
    const current = String(form.get("current_password") || "");
    const next = String(form.get("new_password") || "");
    if (!(await verifyPassword(current, user.password_hash, user.password_salt, user.iterations))) {
      return back(c, { err: "Current password is incorrect." });
    }
    const problem = passwordProblem(next);
    if (problem) return back(c, { err: problem });

    const salt = newSalt();
    await setUserPassword(c.env.DB, user.id, await hashPassword(next, salt), salt, PBKDF2_ITERATIONS);
    // Everything that was issued under the old password dies with it — including this browser
    // session, which is then re-minted so the user is not thrown out of the page they are on.
    await revokeAllUserTokens(c.env.DB, user.id);
    const session = await issueToken(c.env.DB, "session", user.id, null, SESSION_TTL);
    return back(c,
      { ok: "Password changed. Connected assistants have been signed out and will ask you to reconnect." },
      { "Set-Cookie": buildSessionCookie(session.token) },
    );
  }

  if (action === "delete") {
    const typed = String(form.get("confirm_email") || "").trim().toLowerCase();
    if (typed !== user.email_lower) {
      return back(c, { err: "Type your email exactly to confirm deletion. Nothing was deleted." });
    }
    await deleteUserCompletely(c.env.DB, user.id);
    return new Response(shell(`
      <h1>Account deleted</h1>
      <p class="sub">Your account and every log it owned have been permanently removed.</p>
      <section><p>Any assistant still holding a token for it will now get a signed-out response.
      Anatome's catalog, diagrams and exercise search keep working without an account.</p>
      <a class="btn" href="https://anatome.dev">Back to anatome.dev</a></section>`), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Set-Cookie": CLEAR_SESSION_COOKIE },
    });
  }

  return back(c, { err: "Unknown action." });
}

/** JSON / CSV download of everything the account owns. */
export async function accountExport(c: Ctx, format: "json" | "csv"): Promise<Response> {
  if (!hasDb(c.env)) return c.json({ ok: false, error: "accounts_unavailable" }, 501);
  const user = await currentUser(c);
  if (!user) return back(c, { err: "Sign in to export your data." });

  const data = await exportEverything(c.env.DB, user);
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "json") {
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="anatome-export-${stamp}.json"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // One file, section-delimited: a spreadsheet opens it and a human can read it, which beats a
  // zip of five files for the number of rows anyone will actually have here.
  const sections: [string, Record<string, unknown>[]][] = [
    ["meals", data.meals as Record<string, unknown>[]],
    ["water_logs", data.water_logs as Record<string, unknown>[]],
    ["workouts", data.workouts as Record<string, unknown>[]],
    ["workout_sets", data.workout_sets as Record<string, unknown>[]],
    ["body_metrics", data.body_metrics as Record<string, unknown>[]],
  ];
  const csv = sections
    .map(([name, rows]) => `# ${name}\n${rows.length ? toCsv(rows) : "(none)"}`)
    .join("\n\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="anatome-export-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Sign out of this browser (the `?logout=1` link). Does not touch assistant tokens. */
export function accountLogout(c: Ctx): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: "/account", "Set-Cookie": CLEAR_SESSION_COOKIE },
  });
}

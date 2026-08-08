// Shareable view links.
//
// This is the one surface where a URL alone grants access to someone's data, so most of these
// tests are about what the link must NOT do: outlive its expiry, survive revocation, be
// guessable, reach another account, edit when it was minted read-only, or leak into a cache or
// a search index.

import { env } from "cloudflare:test";
import { beforeAll, describe, it, expect } from "vitest";
import app from "../src/index.ts";
import { applySchema, callTool, signUp, type Session } from "./helpers.ts";

let owner: Session;
let stranger: Session;

async function mint(session: Session, args: Record<string, unknown> = {}): Promise<string> {
  const out = await callTool(app, session, "create_view_link", args);
  expect(out.isError).toBe(false);
  return (out.data as { url: string }).url;
}

function tokenOf(url: string): string {
  return url.split("/v/")[1];
}

beforeAll(async () => {
  await applySchema();
  owner = await signUp(app, "owner@example.com");
  stranger = await signUp(app, "stranger@example.com");

  await callTool(app, owner, "set_goals", { calories: 2400, protein: 180 });
  await callTool(app, owner, "log_meal", { name: "Oatmeal with berries", calories: 420, protein: 14, meal_type: "breakfast" });
  await callTool(app, owner, "log_workout", {
    title: "Push day",
    sets: [{ exercise_name: "Bench Press", reps: 5, weight: 100 }, { exercise_name: "Bench Press", reps: 5, weight: 100 }],
  });
  await callTool(app, owner, "log_weight", { value: 82.4, unit: "kg" });
  await callTool(app, owner, "log_supplement", { name: "Creatine", dose: 5, unit: "g" });

  await callTool(app, stranger, "log_meal", { name: "Stranger's secret pie", calories: 999 });
});

describe("the page renders the owner's data", () => {
  it("shows meals, workouts and charts", async () => {
    const url = await mint(owner, { label: "for my coach" });
    const res = await app.request(url, {}, env);
    expect(res.status).toBe(200);
    const html = await res.text();

    expect(html).toContain("Oatmeal with berries");
    expect(html).toContain("Push day");
    expect(html).toContain("Bench Press");
    expect(html).toContain("Creatine");
    // Charts are inline SVG, not an image request to somewhere else.
    expect(html).toContain("<svg");
    expect(html).toContain("Calories per day");
    expect(html).toContain("Body weight");
  });

  it("shows today against the goal rather than a bare number", async () => {
    const url = await mint(owner);
    const html = await (await app.request(url, {}, env)).text();
    expect(html).toContain("2400");           // the goal is on the page
    expect(html).toMatch(/left of|over/);     // and what it means for today
  });

  it("never contains another account's data", async () => {
    const url = await mint(owner);
    const html = await (await app.request(url, {}, env)).text();
    expect(html).not.toContain("Stranger's secret pie");
  });

  it("loads nothing from a third party", async () => {
    // A link someone forwards to a coach must not tell a CDN it was opened, and must render on
    // a locked-down network.
    const url = await mint(owner);
    const html = await (await app.request(url, {}, env)).text();
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<link[^>]+stylesheet/i);
    expect(html).not.toMatch(/<img|<iframe/i);
    expect(html).not.toMatch(/https?:\/\/(?!anatome\.dev)/);
  });

  it("is marked private and not indexable", async () => {
    const url = await mint(owner);
    const res = await app.request(url, {}, env);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("cache-control")).toContain("private");
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    expect(await res.text()).toContain('name="robots"');
  });
});

describe("what a link must not do", () => {
  it("cannot be guessed", async () => {
    // Note "../../account" is deliberately absent: the URL parser normalises it away before
    // routing, so it never reaches this handler and asserting 404 on it would be testing the
    // URL spec. The token is only ever hashed, never used as a path, so traversal has no
    // surface here — the encoded form below proves it reaches the route and is simply unknown.
    for (const bad of ["short", "0".repeat(64), "%2e%2e%2f%2e%2e%2faccount", "null", "undefined"]) {
      const res = await app.request(`https://api.anatome.dev/v/${bad}`, {}, env);
      expect(res.status, bad).toBe(404);
    }
  });

  it("stops working once revoked", async () => {
    const url = await mint(owner, { label: "temporary" });
    expect((await app.request(url, {}, env)).status).toBe(200);

    const revoked = await callTool(app, owner, "revoke_view_link", { label: "temporary" });
    expect((revoked.data as { revoked: number }).revoked).toBe(1);

    expect((await app.request(url, {}, env)).status).toBe(404);
  });

  it("stops working once expired", async () => {
    const url = await mint(owner, { label: "expiring" });
    const token = tokenOf(url);
    // Reach past the clock rather than waiting a day: expiry is a stored timestamp, so moving it
    // into the past is exactly what the passage of time would do.
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)))]
      .map((b) => b.toString(16).padStart(2, "0")).join("");
    await env.DB.prepare("UPDATE view_links SET expires_at = ? WHERE token_hash = ?")
      .bind(Math.floor(Date.now() / 1000) - 60, hash).run();

    expect((await app.request(url, {}, env)).status).toBe(404);
  });

  it("stores only the hash, so a database read cannot reopen it", async () => {
    const url = await mint(owner);
    const token = tokenOf(url);
    const hit = await env.DB.prepare("SELECT COUNT(*) AS n FROM view_links WHERE token_hash = ?")
      .bind(token).first<{ n: number }>();
    expect(hit?.n).toBe(0);
  });

  it("refuses to edit when it was minted read-only", async () => {
    const url = await mint(owner, { label: "readonly" });
    const meals = await callTool(app, owner, "list_meals", {});
    const mealId = (meals.data as { meals: { id: string }[] }).meals[0].id;

    const res = await app.request(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ action: "delete_meal", id: mealId }).toString(),
    }, env);
    expect(res.status).toBe(403);

    // And the meal is still there.
    const after = await callTool(app, owner, "list_meals", {});
    expect((after.data as { meals: { id: string }[] }).meals.some((m) => m.id === mealId)).toBe(true);
  });

  it("read-only is the default — edit must be asked for", async () => {
    const out = await callTool(app, owner, "create_view_link", {});
    expect((out.data as { can_edit: boolean }).can_edit).toBe(false);
  });

  it("tells the caller the link is bearer access, so the model can warn the user", async () => {
    const out = await callTool(app, owner, "create_view_link", {});
    expect((out.data as { warning: string }).warning).toMatch(/anyone with this URL/i);
  });
});

describe("an editable link", () => {
  it("deletes a meal and redirects, so a refresh does not repeat it", async () => {
    const editor = await signUp(app, "editor@example.com");
    await callTool(app, editor, "log_meal", { name: "Mistake pie", calories: 900 });
    const meals = await callTool(app, editor, "list_meals", {});
    const mealId = (meals.data as { meals: { id: string }[] }).meals[0].id;

    const url = await mint(editor, { can_edit: true, label: "editable" });
    const res = await app.request(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ action: "delete_meal", id: mealId }).toString(),
    }, env);
    expect(res.status).toBe(303);

    const after = await callTool(app, editor, "list_meals", {});
    expect((after.data as { meals: { id: string }[] }).meals.some((m) => m.id === mealId)).toBe(false);
  });

  it("cannot delete a row belonging to someone else", async () => {
    const editor = await signUp(app, "editor2@example.com");
    const victimMeals = await callTool(app, stranger, "list_meals", {});
    const victimId = (victimMeals.data as { meals: { id: string }[] }).meals[0].id;

    const url = await mint(editor, { can_edit: true });
    await app.request(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ action: "delete_meal", id: victimId }).toString(),
    }, env);

    // Every statement is scoped to the link's own user, so a guessed id from another account
    // matches nothing.
    const after = await callTool(app, stranger, "list_meals", {});
    expect((after.data as { meals: { id: string }[] }).meals.some((m) => m.id === victimId)).toBe(true);
  });
});

describe("managing links", () => {
  it("lists links without ever returning a token", async () => {
    const lister = await signUp(app, "lister@example.com");
    const url = await mint(lister, { label: "coach" });
    const out = await callTool(app, lister, "list_view_links", {});
    const body = JSON.stringify(out.data);
    expect(body).toContain("coach");
    expect(body).not.toContain(tokenOf(url));
  });

  it("revokes everything at once when no label is given", async () => {
    const many = await signUp(app, "many@example.com");
    const a = await mint(many, { label: "one" });
    const b = await mint(many, { label: "two" });

    const out = await callTool(app, many, "revoke_view_link", {});
    expect((out.data as { revoked: number }).revoked).toBe(2);
    expect((await app.request(a, {}, env)).status).toBe(404);
    expect((await app.request(b, {}, env)).status).toBe(404);
  });

  it("dies with the account", async () => {
    const doomed = await signUp(app, "doomed@example.com");
    const url = await mint(doomed);
    expect((await app.request(url, {}, env)).status).toBe(200);

    await callTool(app, doomed, "delete_my_account", { confirm: true });
    expect((await app.request(url, {}, env)).status).toBe(404);
  });
});

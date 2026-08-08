// The signed-in surface: MCP logging tools plus their REST equivalents.
//
// Two rules shape this file.
//
// 1. These tools are only *advertised* when the deployment can honour them. A tool list that
//    promises `log_meal` on a Worker with no database teaches the model to try, fail, and
//    apologise to the user. `hasDb` gates the advertisement, not just the execution.
//
// 2. An unauthenticated call to a logging tool is not an error to hide behind. It returns a
//    result the model can act on — sign in at this URL — because "unauthorized" alone gets
//    relayed to the user as "the connector is broken", which is the same failure the fair-use
//    work in the previous release existed to fix.

import type { Context } from "hono";
import { findUserById, hasDb, type DbEnv, type UserRow } from "../lib/db.ts";
import {
  identifyRequest, issuePersonalToken, listPersonalTokens, revokePersonalTokens,
} from "../lib/auth.ts";
import { gateMetered } from "../lib/meter.ts";
import { isValidTimezone } from "../lib/tz.ts";
import {
  dailySummary, deleteMeal, deleteWorkout, exerciseHistory, exportEverything, getDay,
  listMeals, listSupplements, listWorkouts, logBodyMetric, logMeal, logSupplement, logWater,
  logWorkout, markWorkoutDone, setGoals, weightTrend, type LogResult,
} from "../lib/logging.ts";
import { deleteUserCompletely, setUserTimezone } from "../lib/db.ts";
import { createViewLink, listViewLinks, revokeViewLinks } from "./view.ts";
import {
  MEAL_FIELDS, WATER_FIELDS, WORKOUT_FIELDS, SET_FIELDS, BODY_METRIC_FIELDS, GOAL_FIELDS,
  SUPPLEMENT_FIELDS,
} from "../lib/validate.ts";

type Ctx = Context<{ Bindings: DbEnv }>;

/** Tool names that need a signed-in user. Everything else is anonymous-friendly. */
export const LOGGING_TOOL_NAMES = [
  "get_profile", "set_timezone", "set_goals",
  "log_meal", "list_meals", "delete_meal",
  "log_water",
  "log_workout", "list_workouts", "delete_workout", "mark_workout_done",
  "log_supplement", "list_supplements",
  "log_weight", "get_weight_trend",
  "get_daily_summary", "get_day", "get_exercise_history",
  "create_view_link", "list_view_links", "revoke_view_link",
  "create_api_token", "list_api_tokens", "revoke_api_token",
  "export_my_data", "delete_my_account",
] as const;

const list = (fields: readonly string[]) => fields.join(", ");

/**
 * Every "show me my …" tool takes the same window and page arguments. Declared once so the
 * schemas cannot drift from each other, which is how a model learns that `from` works on one
 * tool and not the next.
 */
const WINDOW_PROPS = {
  date: { type: "string", description: "One specific day, YYYY-MM-DD. Shorthand for from=to=date." },
  from: { type: "string", description: "Start of the range, YYYY-MM-DD (inclusive)." },
  to: { type: "string", description: "End of the range, YYYY-MM-DD (inclusive). Defaults to today." },
  days: { type: "number", description: "Alternative to `from`: how many days back from `to`." },
} as const;

const PAGE_PROPS = {
  limit: { type: "number", description: "Rows to return, 1-200." },
  offset: { type: "number", description: "Rows to skip, for paging. Responses carry total_matched and has_more." },
} as const;

/**
 * Tool schemas. Property names are exactly the accepted field names from validate.ts — a test
 * asserts that in both directions, because a schema is a promise to an agent and a schema the
 * write gate then rejects is a promise broken at runtime.
 */
export const LOGGING_TOOLS = [
  {
    name: "get_profile",
    description: "Get the signed-in user's Anatome profile: email, timezone and current nutrition goals. Call this first if you need to know their timezone or targets.",
    annotations: { readOnlyHint: true },
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "set_timezone",
    description: "Set the user's timezone so days roll over at their local midnight, not UTC. Accepts an IANA name like 'Europe/Warsaw' or 'America/New_York'. Do this once, early — logs made before it are dated in the previous zone.",
    inputSchema: {
      type: "object",
      properties: { timezone: { type: "string", description: "IANA timezone, e.g. 'Europe/Warsaw'" } },
      required: ["timezone"],
    },
  },
  {
    name: "set_goals",
    description: `Set daily nutrition targets. Any subset of: ${list(GOAL_FIELDS)}. Values already set are kept unless you pass them again.`,
    inputSchema: {
      type: "object",
      properties: {
        calories: { type: "number" }, protein: { type: "number", description: "grams" },
        carbs: { type: "number", description: "grams" }, fats: { type: "number", description: "grams" },
        water_ml: { type: "number", description: "millilitres" },
      },
    },
  },
  {
    name: "log_meal",
    description: "Log a meal the user describes. YOU estimate the macros — Anatome does no food lookup and no AI parsing, it only stores what you send. Say what you estimated so the user can correct you. Defaults to today in the user's timezone.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "What they ate, e.g. 'oatmeal with berries'" },
        calories: { type: "number" }, protein: { type: "number", description: "grams" },
        carbs: { type: "number", description: "grams" }, fats: { type: "number", description: "grams" },
        meal_type: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] },
        date: { type: "string", description: "YYYY-MM-DD; omit for today in the user's timezone" },
        notes: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "list_meals",
    description: "Search meals. Defaults to today; pass from/to or days for a range, q to search the name and notes, meal_type to filter. Returns macro totals for whatever matched, so it answers 'how much protein did I average in March' as well as 'what did I eat'.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object",
      properties: {
        ...WINDOW_PROPS,
        ...PAGE_PROPS,
        q: { type: "string", description: "Free text matched against the meal name and notes, e.g. 'oats'." },
        meal_type: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] },
      },
    },
  },
  {
    name: "delete_meal",
    description: "Delete one logged meal by id. Get ids from list_meals.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "log_water",
    description: "Log water intake in millilitres. Returns the running total for the day.",
    inputSchema: {
      type: "object",
      properties: {
        amount_ml: { type: "number", description: "millilitres" },
        date: { type: "string", description: "YYYY-MM-DD; omit for today" },
      },
      required: ["amount_ml"],
    },
  },
  {
    name: "log_workout",
    description: "Log a completed workout with its sets. Weight is in KILOGRAMS and the field is `weight` — sending `weight_kg` also works, but `weight_lb` is rejected rather than silently converted. Use resolve_exercise or search_exercises first if you want the canonical exercise name.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "e.g. 'Push day'" },
        date: { type: "string", description: "YYYY-MM-DD; omit for today" },
        duration_minutes: { type: "number" },
        notes: { type: "string" },
        status: {
          type: "string",
          enum: ["completed", "planned"],
          description: "Omit and it is inferred: a future date is a PLAN, today or earlier is completed. Plans do not count toward volume or exercise history until mark_workout_done.",
        },
        sets: {
          type: "array",
          description: "One entry per set performed.",
          items: {
            type: "object",
            properties: {
              exercise_name: { type: "string" },
              set_number: { type: "number" },
              reps: { type: "number" },
              weight: { type: "number", description: "kilograms" },
              rpe: { type: "number", description: "rate of perceived exertion, 1-10" },
              notes: { type: "string" },
            },
            required: ["exercise_name"],
          },
        },
      },
      required: ["sets"],
    },
  },
  {
    name: "list_workouts",
    description: "Search workouts with their sets and volume. Defaults to the last 90 days. Pass upcoming:true for planned sessions from today forward — that is the tool for 'what am I training this week'. Otherwise date/from/to/days for a window, exercise to keep only sessions containing a movement, q to search title and notes, status to pick planned/completed/any.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object",
      properties: {
        ...WINDOW_PROPS,
        ...PAGE_PROPS,
        exercise: { type: "string", description: "Only workouts containing this exercise, matched loosely: 'bench' finds 'Barbell Bench Press'." },
        q: { type: "string", description: "Free text matched against the workout title and notes, e.g. 'push day'." },
        upcoming: { type: "boolean", description: "Planned sessions from today forward (next 30 days), soonest first. Ignores the window args." },
        status: { type: "string", enum: ["planned", "completed", "any"], description: "Default: both. Completed history is returned newest-first, plans soonest-first." },
      },
    },
  },
  {
    name: "mark_workout_done",
    description: "Turn a planned session into a completed one, so it starts counting toward training volume and exercise history. Use it when someone says they did the session they had planned.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Workout id from list_workouts." } },
      required: ["id"],
    },
  },
  {
    name: "get_exercise_history",
    description: "One exercise over time: every set grouped by session, with per-session volume, the best set and an estimated 1RM. This is the tool for 'is my bench going anywhere' and for showing a coach someone's progression. Matched loosely, so 'squat' finds 'Barbell Back Squat'.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object",
      properties: {
        exercise: { type: "string", description: "Exercise name or part of one, e.g. 'bench press'." },
        ...WINDOW_PROPS,
        ...PAGE_PROPS,
      },
      required: ["exercise"],
    },
  },
  {
    name: "log_supplement",
    description: "Log a supplement taken. Dose is optional — 'took my magnesium' is a complete entry. Defaults to today in the user's timezone.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "e.g. 'creatine', 'vitamin D3'" },
        dose: { type: ["number", "string"], description: "Optional amount. The number alone (5) with the unit in `unit`, or the whole thing as one string (\"5 g\", \"4000 IU\") — both are stored the same way." },
        unit: { type: "string", description: "g | mg | mcg | iu | ml | capsule | scoop" },
        date: { type: "string", description: "YYYY-MM-DD; omit for today" },
        notes: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "list_supplements",
    description: "Supplements over a window, plus a per-supplement count of how many days each was actually taken — which is the number people want when they ask whether they are being consistent.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object",
      properties: { ...WINDOW_PROPS, ...PAGE_PROPS, name: { type: "string", description: "Filter to one supplement, matched loosely." } },
    },
  },
  {
    name: "get_day",
    description: "Everything logged on one day in a single call: meals, water, workouts with sets, supplements and measurements. Use this instead of calling list_meals and list_workouts separately — it costs the user one request instead of three. Pass `include` to narrow it.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD; omit for today" },
        include: {
          type: "array",
          items: { type: "string", enum: ["nutrition", "training", "supplements", "body"] },
          description: "Sections to return. Omit for all of them.",
        },
      },
    },
  },
  {
    name: "delete_workout",
    description: "Delete one logged workout and its sets by id.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "log_weight",
    description: "Log body weight. unit must be 'kg' or 'lb' — it is stored as given and never converted.",
    inputSchema: {
      type: "object",
      properties: {
        value: { type: "number" },
        unit: { type: "string", enum: ["kg", "lb"], default: "kg" },
        date: { type: "string", description: "YYYY-MM-DD; omit for today" },
        notes: { type: "string" },
        metric_type: { type: "string", default: "weight", description: "weight | body_fat | waist | ..." },
      },
      required: ["value"],
    },
  },
  {
    name: "get_weight_trend",
    description: "Body-weight entries over a window, with the change between the first and last. Reports no change when the units differ rather than inventing a conversion.",
    annotations: { readOnlyHint: true },
    inputSchema: { type: "object", properties: { days: { type: "number", default: 30, description: "1-365" } } },
  },
  {
    name: "get_daily_summary",
    description: "One day at a glance: calories and macros against goals, water, workouts, sets and training volume. The tool to reach for when asked 'how am I doing today?'.",
    annotations: { readOnlyHint: true },
    inputSchema: { type: "object", properties: { date: { type: "string", description: "YYYY-MM-DD; omit for today" } } },
  },
  {
    name: "create_view_link",
    description: "Mint a URL that opens a rendered dashboard of this user's log — today against goals, calories and training volume over 14 days, body-weight trend, recent sessions and supplement adherence. Use it whenever someone asks to SEE their data, to show a coach, or to check something visually. The link expires (24h by default) and is read-only unless you pass can_edit. Always tell the user that anyone holding the URL can see the data.",
    inputSchema: {
      type: "object",
      properties: {
        label: { type: "string", description: "What it is for, e.g. 'for my coach'. Shown in list_view_links and used to revoke it later." },
        expires_in_hours: { type: "number", description: "1 to 720. Default 24." },
        can_edit: { type: "boolean", description: "Allow deleting entries from the page. Default false — ask the user before setting it." },
      },
    },
  },
  {
    name: "list_view_links",
    description: "List the view links this user has minted, with expiry and view counts. Tokens are never returned — they exist only in the URL handed out at creation.",
    annotations: { readOnlyHint: true },
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "revoke_view_link",
    description: "Kill view links immediately. Pass a label to revoke just those, or nothing to revoke every active link. Use this the moment someone says they shared a link by mistake.",
    annotations: { destructiveHint: true },
    inputSchema: {
      type: "object",
      properties: { label: { type: "string", description: "Only revoke links with this label. Omit to revoke all of them." } },
    },
  },
  {
    name: "create_api_token",
    description: "Mint a long-lived personal API token the user can paste into a script, a shortcut, a cron job, or another MCP client that cannot do the OAuth browser flow. Shown once and never again. Tell the user to store it somewhere safe and that it is equivalent to their password for this data.",
    inputSchema: {
      type: "object",
      properties: {
        label: { type: "string", description: "What it is for, e.g. 'my sync script'. Needed to revoke it later." },
        expires_in_days: { type: "number", description: "1 to 365. Default 365." },
      },
      required: ["label"],
    },
  },
  {
    name: "list_api_tokens",
    description: "List personal API tokens by label, with expiry and whether they are still active. Token values are never shown again after minting.",
    annotations: { readOnlyHint: true },
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "revoke_api_token",
    description: "Revoke personal API tokens by label, or all of them if no label is given. Does not affect this connector's own sign-in.",
    annotations: { destructiveHint: true },
    inputSchema: { type: "object", properties: { label: { type: "string" } } },
  },
  {
    name: "export_my_data",
    description: "Return everything Anatome stores for this user, as JSON. The user owns their data and can take it at any time.",
    annotations: { readOnlyHint: true },
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "delete_my_account",
    description: "Permanently delete the account and every log it owns. Irreversible. Requires confirm:true — ALWAYS ask the user in plain words first, and offer export_my_data before doing it.",
    annotations: { destructiveHint: true },
    inputSchema: {
      type: "object",
      properties: { confirm: { type: "boolean", description: "Must be true. Ask the user first." } },
      required: ["confirm"],
    },
  },
];

/** Fields the write gate accepts, keyed by tool — used by the schema/gate parity test. */
export const TOOL_FIELD_CONTRACT: Record<string, readonly string[]> = {
  log_meal: MEAL_FIELDS,
  log_water: WATER_FIELDS,
  log_workout: WORKOUT_FIELDS,
  log_weight: BODY_METRIC_FIELDS,
  set_goals: GOAL_FIELDS,
  log_supplement: SUPPLEMENT_FIELDS,
};
export const SET_FIELD_CONTRACT = SET_FIELDS;

export function isLoggingTool(name: unknown): boolean {
  return typeof name === "string" && (LOGGING_TOOL_NAMES as readonly string[]).includes(name);
}

/** Tools this deployment can actually honour. */
export function availableLoggingTools(env: DbEnv) {
  return hasDb(env) ? LOGGING_TOOLS : [];
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

export interface ToolOutcome {
  ok: boolean;
  payload: Record<string, unknown>;
  /** Human text put in front of the model. Present on every failure. */
  text?: string;
}

function signInPrompt(base: string): ToolOutcome {
  return {
    ok: false,
    text: [
      "This tool needs an Anatome account, and this connection is not signed in yet.",
      "The connector itself is fine — nothing is broken.",
      `Tell the user to reconnect and sign in at ${base}/oauth/authorize, or to re-add the connector so their client can run the sign-in flow.`,
      "Everything else (exercise search, muscle diagrams, session heatmaps) keeps working without an account.",
    ].join(" "),
    payload: { error: "not_signed_in", retryable: false, sign_in_url: `${base}/oauth/authorize` },
  };
}

function noAccounts(): ToolOutcome {
  return {
    ok: false,
    text: "This Anatome deployment has no database configured, so it has no accounts and cannot store logs. Tell the user their catalog and diagram tools still work. This is a deployment choice, not a fault.",
    payload: { error: "accounts_unavailable", retryable: false },
  };
}

function fromResult(r: LogResult): ToolOutcome {
  if (r.ok) return { ok: true, payload: r.data || {} };
  return {
    ok: false,
    // The write gate's message already names the bad field and the accepted list, which is the
    // whole point — an agent can fix its own call from it.
    text: r.message || r.error || "The request was rejected.",
    payload: { error: r.error, message: r.message, field: r.field, retryable: false },
  };
}

/** Run a logging tool. `base` is the public API origin, used in sign-in guidance. */
export async function callLoggingTool(
  env: DbEnv,
  req: Request,
  name: string,
  args: Record<string, unknown>,
  base: string,
): Promise<ToolOutcome> {
  if (!hasDb(env)) return noAccounts();
  const identity = await identifyRequest(req, env);
  if (!identity) return signInPrompt(base);
  const user = await findUserById(env.DB, identity.userId);
  if (!user) return signInPrompt(base);
  const db = env.DB;

  switch (name) {
    case "get_profile": {
      const goals = await db.prepare("SELECT calories, protein, carbs, fats, water_ml FROM goals WHERE user_id = ?")
        .bind(user.id).first();
      return {
        ok: true,
        payload: {
          email: user.email,
          timezone: user.timezone,
          timezone_is_default: user.timezone === "UTC",
          goals: goals ?? null,
          member_since: user.created_at,
        },
      };
    }

    case "set_timezone": {
      const tz = String(args.timezone ?? "");
      if (!isValidTimezone(tz)) {
        return {
          ok: false,
          text: `"${tz}" is not a timezone this server recognises. Use an IANA name such as Europe/Warsaw, America/New_York or Asia/Tokyo.`,
          payload: { error: "invalid_timezone", field: "timezone", retryable: false },
        };
      }
      await setUserTimezone(db, user.id, tz);
      return { ok: true, payload: { timezone: tz, note: "Days now roll over at midnight in this zone. Entries logged earlier keep the date they were given." } };
    }

    case "set_goals": return fromResult(await setGoals(db, user, args));
    case "log_meal": return fromResult(await logMeal(db, user, args));
    case "list_meals": return fromResult(await listMeals(db, user, args));
    case "delete_meal": return fromResult(await deleteMeal(db, user, args.id));
    case "log_water": return fromResult(await logWater(db, user, args));
    case "log_workout": return fromResult(await logWorkout(db, user, args));
    case "list_workouts": return fromResult(await listWorkouts(db, user, args));
    case "delete_workout": return fromResult(await deleteWorkout(db, user, args.id));
    case "mark_workout_done": return fromResult(await markWorkoutDone(db, user, args));
    case "log_weight": return fromResult(await logBodyMetric(db, user, args));
    case "get_weight_trend": return fromResult(await weightTrend(db, user, args));
    case "get_daily_summary": return fromResult(await dailySummary(db, user, args));
    case "get_day": return fromResult(await getDay(db, user, args));
    case "get_exercise_history": return fromResult(await exerciseHistory(db, user, args));
    case "log_supplement": return fromResult(await logSupplement(db, user, args));
    case "list_supplements": return fromResult(await listSupplements(db, user, args));

    case "create_view_link": {
      const made = await createViewLink(db, user, args, base);
      if (!made.ok) return { ok: false, text: made.message, payload: { error: "invalid_value", field: made.field, retryable: false } };
      return { ok: true, payload: made.data };
    }
    case "list_view_links": return { ok: true, payload: await listViewLinks(db, user) };

    case "create_api_token": {
      const label = String(args.label ?? "").trim();
      if (!label) return { ok: false, text: "Give the token a label so it can be found and revoked later, e.g. 'my sync script'.", payload: { error: "missing_field", field: "label", retryable: false } };
      const days = Number.isFinite(Number(args.expires_in_days))
        ? Math.min(Math.max(1, Math.round(Number(args.expires_in_days))), 365) : 365;
      const minted = await issuePersonalToken(db, user.id, label, days * 86400);
      return {
        ok: true,
        payload: {
          token: minted.token,
          label,
          expires_at: new Date(minted.expiresAt * 1000).toISOString(),
          usage: `curl -H "Authorization: Bearer ${minted.token}" ${base}/v1/summary`,
          warning: "Shown once. It grants full access to this account's log — treat it like a password, and revoke_api_token kills it.",
        },
      };
    }
    case "list_api_tokens": return { ok: true, payload: { tokens: await listPersonalTokens(db, user.id) } };
    case "revoke_api_token": {
      const revoked = await revokePersonalTokens(db, user.id, String(args.label ?? "").trim());
      return { ok: true, payload: { revoked, scope: args.label ? `tokens labelled "${String(args.label)}"` : "every personal token" } };
    }
    case "revoke_view_link": return { ok: true, payload: await revokeViewLinks(db, user, args) };

    case "export_my_data":
      return { ok: true, payload: await exportEverything(db, user) };

    case "delete_my_account": {
      if (args.confirm !== true) {
        return {
          ok: false,
          text: "Account deletion needs confirm:true, and you should ask the user in plain words before setting it. Offer export_my_data first — this cannot be undone.",
          payload: { error: "confirmation_required", retryable: false },
        };
      }
      await deleteUserCompletely(db, user.id);
      return { ok: true, payload: { deleted: true, note: "The account and every log it owned are gone. This connection's tokens no longer work." } };
    }

    default:
      return { ok: false, text: `Unknown tool: ${name}`, payload: { error: "unknown_tool" } };
  }
}

// ---------------------------------------------------------------------------
// REST mirror, /v1/*
// ---------------------------------------------------------------------------

async function requireUser(c: Ctx): Promise<UserRow | Response> {
  if (!hasDb(c.env)) {
    return c.json({ ok: false, error: "accounts_unavailable", message: "This deployment has no database bound." }, 501);
  }
  const identity = await identifyRequest(c.req.raw, c.env);
  if (!identity) {
    const base = c.env.PUBLIC_BASE_URL || new URL(c.req.url).origin;
    return new Response(JSON.stringify({
      ok: false, error: "not_signed_in",
      message: "Sign in first. This endpoint needs an Anatome account.",
      sign_in_url: `${base}/oauth/authorize`,
    }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": `Bearer realm="anatome", resource_metadata="${base}/.well-known/oauth-protected-resource"`,
      },
    });
  }
  const user = await findUserById(c.env.DB, identity.userId);
  if (!user) return c.json({ ok: false, error: "not_signed_in" }, 401);

  // The REST mirror spends the same budget as the tools do. Leaving it unmetered would make the
  // published fair-use number a statement about one transport rather than about the API.
  const gate = await gateMetered(c, new URL(c.req.url).pathname, { userId: user.id });
  if (!gate.ok) return gate.response;

  return user;
}

function send(c: Ctx, r: LogResult): Response {
  if (r.ok) return c.json({ ok: true, ...r.data }, r.status as 200);
  return c.json({ ok: false, error: r.error, message: r.message, field: r.field }, r.status as 400);
}

export function registerPersonalRoutes(app: {
  get: (p: string, h: (c: Ctx) => Promise<Response>) => unknown;
  post: (p: string, h: (c: Ctx) => Promise<Response>) => unknown;
  delete: (p: string, h: (c: Ctx) => Promise<Response>) => unknown;
}): void {
  const body = async (c: Ctx): Promise<Record<string, unknown>> => {
    try { return await c.req.json(); } catch { return {}; }
  };

  app.get("/v1/profile", async (c) => {
    const u = await requireUser(c);
    if (u instanceof Response) return u;
    const out = await callLoggingTool(c.env, c.req.raw, "get_profile", {}, c.env.PUBLIC_BASE_URL || "");
    return c.json({ ok: out.ok, ...out.payload });
  });

  app.post("/v1/meals", async (c) => {
    const u = await requireUser(c);
    if (u instanceof Response) return u;
    return send(c, await logMeal(c.env.DB!, u, await body(c)));
  });

  app.get("/v1/meals", async (c) => {
    const u = await requireUser(c);
    if (u instanceof Response) return u;
    return send(c, await listMeals(c.env.DB!, u, c.req.query()));
  });

  app.delete("/v1/meals/:id", async (c) => {
    const u = await requireUser(c);
    if (u instanceof Response) return u;
    return send(c, await deleteMeal(c.env.DB!, u, (c.req as unknown as { param: (k: string) => string }).param("id")));
  });

  app.post("/v1/water", async (c) => {
    const u = await requireUser(c);
    if (u instanceof Response) return u;
    return send(c, await logWater(c.env.DB!, u, await body(c)));
  });

  app.post("/v1/workouts", async (c) => {
    const u = await requireUser(c);
    if (u instanceof Response) return u;
    return send(c, await logWorkout(c.env.DB!, u, await body(c)));
  });

  app.get("/v1/workouts", async (c) => {
    const u = await requireUser(c);
    if (u instanceof Response) return u;
    return send(c, await listWorkouts(c.env.DB!, u, c.req.query()));
  });

  app.delete("/v1/workouts/:id", async (c) => {
    const u = await requireUser(c);
    if (u instanceof Response) return u;
    return send(c, await deleteWorkout(c.env.DB!, u, (c.req as unknown as { param: (k: string) => string }).param("id")));
  });

  app.post("/v1/body-metrics", async (c) => {
    const u = await requireUser(c);
    if (u instanceof Response) return u;
    return send(c, await logBodyMetric(c.env.DB!, u, await body(c)));
  });

  app.get("/v1/weight-trend", async (c) => {
    const u = await requireUser(c);
    if (u instanceof Response) return u;
    return send(c, await weightTrend(c.env.DB!, u, c.req.query()));
  });

  app.post("/v1/goals", async (c) => {
    const u = await requireUser(c);
    if (u instanceof Response) return u;
    return send(c, await setGoals(c.env.DB!, u, await body(c)));
  });

  app.post("/v1/supplements", async (c) => {
    const u = await requireUser(c);
    if (u instanceof Response) return u;
    return send(c, await logSupplement(c.env.DB!, u, await body(c)));
  });

  app.get("/v1/supplements", async (c) => {
    const u = await requireUser(c);
    if (u instanceof Response) return u;
    return send(c, await listSupplements(c.env.DB!, u, c.req.query()));
  });

  app.post("/v1/workouts/:id/done", async (c) => {
    const u = await requireUser(c);
    if (u instanceof Response) return u;
    return send(c, await markWorkoutDone(c.env.DB!, u, { id: (c.req as unknown as { param: (k: string) => string }).param("id") }));
  });

  app.get("/v1/day", async (c) => {
    const u = await requireUser(c);
    if (u instanceof Response) return u;
    return send(c, await getDay(c.env.DB!, u, c.req.query()));
  });

  app.get("/v1/exercise-history", async (c) => {
    const u = await requireUser(c);
    if (u instanceof Response) return u;
    return send(c, await exerciseHistory(c.env.DB!, u, c.req.query()));
  });

  app.get("/v1/summary", async (c) => {
    const u = await requireUser(c);
    if (u instanceof Response) return u;
    return send(c, await dailySummary(c.env.DB!, u, c.req.query()));
  });

  app.get("/v1/export", async (c) => {
    const u = await requireUser(c);
    if (u instanceof Response) return u;
    return c.json({ ok: true, ...(await exportEverything(c.env.DB!, u)) });
  });
}

// /ciStatus — public CI health for the anatome GitHub repo.
//
// The anatome repo is PRIVATE, so a browser-side fetch to the GitHub Actions
// API always 404s (unauthenticated clients cannot read private-repo runs).
// This endpoint runs server-side with a stored GITHUB_TOKEN (fine-grained PAT,
// `actions:read` + `metadata:read` on NextSolutionsStudio/anatome) and returns a tiny
// status object the public UI can render as a "GitHub tile".
//
// Graceful degradation: with no GITHUB_TOKEN secret set, it returns a static
// "CI on GitHub" pointer (state="unknown") instead of failing — so the UI never
// shows "undefined/undefined" again. Responses are edge-cached ~60s to stay
// well under GitHub's rate limits.

const REPO = "NextSolutionsStudio/anatome";
const ACTIONS_TAB = `https://github.com/${REPO}/actions`;
const RUNS_URL = `https://api.github.com/repos/${REPO}/actions/runs?branch=main&per_page=1`;

export interface CiStatus {
  ok: boolean;
  state: "green" | "red" | "running" | "neutral" | "unknown";
  label: string;
  url: string;
  run_number: number | null;
  updated_at: string | null;
  cached: boolean;
}

function unknownStatus(): CiStatus {
  return { ok: false, state: "unknown", label: "CI on GitHub", url: ACTIONS_TAB, run_number: null, updated_at: null, cached: false };
}

function summarize(run: Record<string, unknown> | null): CiStatus {
  if (!run) return unknownStatus();
  const status = typeof run.status === "string" ? run.status : "";
  const conclusion = typeof run.conclusion === "string" ? run.conclusion : null;
  const run_number = typeof run.run_number === "number" ? run.run_number : null;
  const updated_at = typeof run.updated_at === "string" ? run.updated_at : null;
  const url = typeof run.html_url === "string" ? run.html_url : ACTIONS_TAB;
  if (status !== "completed") {
    return { ok: true, state: "running", label: "CI: running on main", url, run_number, updated_at, cached: false };
  }
  if (conclusion === "success") {
    return { ok: true, state: "green", label: "CI: passing on main", url, run_number, updated_at, cached: false };
  }
  if (conclusion === "failure") {
    return { ok: true, state: "red", label: "CI: failing on main", url, run_number, updated_at, cached: false };
  }
  return { ok: true, state: "neutral", label: `CI: ${conclusion || "unknown"}`, url, run_number, updated_at, cached: false };
}

export async function fetchCiStatus(env: { GITHUB_TOKEN?: string }): Promise<CiStatus> {
  const token = env.GITHUB_TOKEN;
  if (!token) return unknownStatus();
  try {
    const res = await fetch(RUNS_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "anatome-api",
      },
    });
    if (!res.ok) return unknownStatus();
    const data = await res.json() as { workflow_runs?: Array<Record<string, unknown>> };
    const runs = Array.isArray(data.workflow_runs) ? data.workflow_runs : [];
    return summarize(runs[0] ?? null);
  } catch {
    return unknownStatus();
  }
}

/** Test-only seam: summarize a raw run object directly. */
export function _summarizeForTest(run: Record<string, unknown> | null): CiStatus {
  return summarize(run);
}

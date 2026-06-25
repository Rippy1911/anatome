// Marketing-site benchmark: proxy searchExercises through RapidAPI (true subscriber path).
// Requires wrangler secret RAPIDAPI_KEY — never expose in the browser.

import { absoluteImageSrc } from "../lib/exercises.ts";

export const RAPIDAPI_HOST = "anatome.p.rapidapi.com";

export interface RapidapiBenchmarkEnv {
  RAPIDAPI_KEY?: string;
}

/** Forward search to RapidAPI; return upstream timing for latency comparison UI. */
export async function rapidapiSearchBenchmark(
  query: Record<string, string | undefined>,
  env: RapidapiBenchmarkEnv,
): Promise<Response> {
  const key = env.RAPIDAPI_KEY;
  if (!key) {
    return Response.json(
      {
        ok: false,
        error: "rapidapi_benchmark_unconfigured",
        message: "Set RAPIDAPI_KEY via wrangler secret put RAPIDAPI_KEY",
      },
      { status: 503 },
    );
  }

  const params = new URLSearchParams();
  const q = String(query.q ?? "").trim();
  if (q) params.set("q", q);
  const limit = Math.min(Math.max(Number(query.limit || 6), 1), 20);
  params.set("limit", String(limit));
  if (query.fields) params.set("fields", query.fields);

  const url = `https://${RAPIDAPI_HOST}/searchExercises?${params}`;
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "X-RapidAPI-Key": key,
        "X-RapidAPI-Host": RAPIDAPI_HOST,
      },
    });
  } catch (e) {
    return Response.json(
      {
        ok: false,
        error: "rapidapi_fetch_failed",
        message: (e as Error).message,
      },
      { status: 502 },
    );
  }

  const upstreamMs = Date.now() - t0;
  let body: Record<string, unknown>;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    return Response.json(
      {
        ok: false,
        error: "rapidapi_invalid_json",
        rapidapi_status: res.status,
        upstream_ms: upstreamMs,
      },
      { status: 502 },
    );
  }

  const rapidapiMessage =
    typeof body.message === "string" ? body.message : undefined;

  const base = "https://api.anatome.dev";
  if (Array.isArray(body.results)) {
    body.results = body.results.map((row) => {
      if (!row || typeof row !== "object") return row;
      const r = { ...(row as Record<string, unknown>) };
      for (const k of ["anatome_imageSrc", "gif_url", "image_url"]) {
        if (typeof r[k] === "string") {
          r[k] = absoluteImageSrc(r[k] as string, base) ?? r[k];
        }
      }
      return r;
    });
  }

  return Response.json(
    {
      ...body,
      ok: res.ok && body.ok !== false,
      error: res.ok ? body.error : (body.error || "rapidapi_error"),
      message: rapidapiMessage || (res.status === 403
        ? "Subscribe to Anatome on RapidAPI, then set RAPIDAPI_KEY to your Application Key."
        : undefined),
      _benchmark: {
        via: "rapidapi",
        host: RAPIDAPI_HOST,
        upstream_ms: upstreamMs,
        rapidapi_status: res.status,
      },
    },
    { status: res.ok ? 200 : (res.status === 403 ? 403 : 502) },
  );
}

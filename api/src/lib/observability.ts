// Structured observability for Cloudflare Workers Observability.
// console.* in Workers is captured as structured logs; emitting a single JSON
// line per event makes them queryable in the Workers dashboard / `wrangler tail`
// / the Cloudflare Observability MCP. Keep events small and one-per-request.

export interface RequestLogFields {
  method: string;
  path: string;
  status: number;
  duration_ms: number;
  cache?: "HIT" | "MISS";
  rate_source?: string;
  rate_bypass?: boolean;
  rate_scope?: string;
  error?: string;
}

/** Emit a structured request log line. Safe to call on every request. */
export function logRequest(fields: RequestLogFields): void {
  const line = JSON.stringify({
    kind: "request",
    ts: new Date().toISOString(),
    ...fields,
  });
  // eslint-disable-next-line no-console
  console.log(line);
}

/** Emit a structured event line (e.g. KV write, cache store, DO call). */
export function logEvent(kind: string, data: Record<string, unknown>): void {
  const line = JSON.stringify({
    kind,
    ts: new Date().toISOString(),
    ...data,
  });
  // eslint-disable-next-line no-console
  console.log(line);
}

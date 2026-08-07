// One version string, imported by everything that reports one.
//
// It lives here rather than in index.ts because the Worker entrypoint may only export `default`
// and Durable Object classes: workerd inspects every named export and rejects anything that is
// not a handler with
//
//   Incorrect type for map entry 'API_VERSION': the provided value is not of type
//   'function or ExportedHandler'
//
// — at startup, so the Worker never boots. `wrangler deploy --dry-run` does not catch it (it only
// bundles), and neither do the unit tests (which import the Hono app directly). Only actually
// running the runtime does. See test/publicSurface.test.ts for the guard.
//
// 3.x is the keyless line: API keys, the Stripe overage meter and the paid tier are gone.
export const API_VERSION = "3.0.0";

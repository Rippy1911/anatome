/// <reference types="@cloudflare/vitest-pool-workers" />

// Vite inlines `?raw` imports as strings. Declared here so tsc understands the migration import
// in helpers.ts, which is how the tests stay pinned to the real schema file.
declare module "*.sql?raw" {
  const content: string;
  export default content;
}

declare module "cloudflare:test" {
  interface ProvidedEnv {
    DB: D1Database;
    RATE_LIMIT_KV: KVNamespace;
    RATE_LIMIT_DO: DurableObjectNamespace;
    PUBLIC_BASE_URL?: string;
    FAIR_USE_DAILY_LIMIT?: string;
    ANON_NETWORK_DAILY_LIMIT?: string;
    UPGRADE_URL?: string;
  }
}

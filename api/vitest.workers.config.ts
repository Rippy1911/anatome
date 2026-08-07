import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

// Integration tests that run inside workerd with a real (local) D1.
//
// The plain-node suite in vitest.config.ts covers pure logic and route shape; it cannot cover
// accounts, because a hand-written D1 stub would be testing my idea of SQLite rather than
// SQLite. Anything touching the database — OAuth, logging, isolation between users — belongs
// here, against the same runtime production uses.
const here = dirname(fileURLToPath(import.meta.url));

export default defineWorkersConfig({
  css: { postcss: { plugins: [] } },
  test: {
    root: here,
    include: ["test-workers/**/*.test.ts"],
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          // Applied per test file, so one file's rows can never leak into another's assertions.
          d1Databases: { DB: "anatome-test" },
        },
      },
    },
  },
});

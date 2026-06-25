import { defineConfig } from "vitest/config";

// Scoped vitest config for the api/ package.
//
// Without this, vitest walks up from api/ and loads the repo-root
// vite.config.js, which imports @base44/vite-plugin (a frontend-only
// dependency not installed in the api/ CI context). That breaks `pnpm test`
// in CI with ERR_MODULE_NOT_FOUND. This file stops the upward search so
// vitest never touches the root frontend config.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});

import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

// Scoped vitest config for the api/ package.
//
// The repo root holds the frontend (Vite + React + Tailwind) configs:
// vite.config.js (imports @base44/vite-plugin) and postcss.config.js
// (imports tailwindcss / autoprefixer). None of those dependencies are
// installed in the api/ CI context (the api job only installs api/).
//
// Vite/vitest walk upward from the cwd to find config, so by default they
// load the root frontend configs and crash in CI with
// ERR_MODULE_NOT_FOUND for @base44/vite-plugin / tailwindcss. This file
// pins the Vite root to the api/ directory and clears the PostCSS plugin
// list (api tests are pure TypeScript with no CSS), so neither root
// frontend config is ever loaded.
const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  css: {
    postcss: { plugins: [] },
  },
  test: {
    root: here,
    include: ["test/**/*.test.ts"],
  },
});


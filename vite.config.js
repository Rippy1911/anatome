import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'

// Plain Vite. The Base44 plugin used to live here and supplied the `@/` alias, the legacy SDK
// shims and a set of editor hooks; none of that is needed now that the site is a static SPA
// served from Cloudflare, and dropping it is what makes `git clone && npm install && npm run
// build` work for anyone.
export default defineConfig({
  logLevel: 'error',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), './src'),
    },
  },
});

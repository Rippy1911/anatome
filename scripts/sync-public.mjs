// Copies root-level files that must also be served by the site into public/.
//
// `llms.txt` is the agent-facing description of the API and lives at the repo root, where
// contributors and GitHub see it. It also has to be reachable at https://anatome.dev/llms.txt,
// which means it has to be in public/. Copying at build time keeps one source of truth; a
// committed second copy would silently drift, and the whole point of that file is being right.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = [["llms.txt", "public/llms.txt"]];

mkdirSync(resolve(root, "public"), { recursive: true });
for (const [from, to] of files) {
  copyFileSync(resolve(root, from), resolve(root, to));
  console.log(`synced ${from} -> ${to}`);
}

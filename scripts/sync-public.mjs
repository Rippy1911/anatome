// Copies root-level files that must also be served, into the two directories that serve them.
//
// `llms.txt` is the agent-facing description of the API and lives at the repo root, where
// contributors and GitHub see it. It also has to be reachable over HTTP, which means it has to sit
// in a served directory. Copying at build time keeps one source of truth; a committed second copy
// would silently drift, and the whole point of that file is being right.
//
// It goes to BOTH hostnames, because they are reached by different readers. The site serves
// anatome.dev/llms.txt for anyone who found the project. The API serves api.anatome.dev/llms.txt
// for anyone who found the *endpoint* — which is the string in every listing, every config
// snippet and every "paste this URL" instruction, and therefore where an agent actually lands.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  ["llms.txt", "public/llms.txt"],
  ["llms.txt", "api/public/llms.txt"],
];

for (const [from, to] of files) {
  mkdirSync(dirname(resolve(root, to)), { recursive: true });
  copyFileSync(resolve(root, from), resolve(root, to));
  console.log(`synced ${from} -> ${to}`);
}

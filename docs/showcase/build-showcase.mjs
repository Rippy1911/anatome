// Builds a self-contained HTML showcase page that stacks the candidate
// contour/palette options (A–E) with chest=red + abs=light-orange highlights,
// on both light and dark backgrounds. Pure Node built-ins (no deps), per the
// portfolio "no npm deps for scripts" rule. Run: node build-showcase.mjs
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = __dirname;

const META = {
  A: { name: "A — current (buggy)", muscle: "#282828", contourFill: "#282828 (== body_color)", contourStroke: "#dfdfdf w1.5", note: "Body fill == muscle fill → no definition (the reported bug)" },
  B: { name: "B — upstream outline", muscle: "#3f3f3f", contourFill: "none", contourStroke: "#dfdfdf w2", note: "Original react-native-body-highlighter look: dark muscles, light outline, bg shows through gaps" },
  C: { name: "C — dark muscles, light body", muscle: "#3f3f3f", contourFill: "#e5e7eb", contourStroke: "#dfdfdf w2", note: "Dark muscles on a light body silhouette — strong definition on both bgs" },
  D: { name: "D — soft", muscle: "#3f3f3f", contourFill: "#f4f4f5", contourStroke: "#d4d4d8 w1", note: "Like C but softer / near-white contour, thinner stroke" },
  E: { name: "E — max contrast", muscle: "#282828", contourFill: "#fafafa", contourStroke: "#dfdfdf w2", note: "Darkest muscles on brightest silhouette — boldest contrast" },
};
const ORDER = ["A", "B", "C", "D", "E"];

function svg(key, bg) {
  const file = `${key}-${bg}.svg`;
  try {
    return readFileSync(join(dir, file), "utf8");
  } catch {
    return `<div style="padding:2rem;color:#888">missing ${file}</div>`;
  }
}

function card(key, bg) {
  const m = META[key];
  const cardBg = bg === "dark" ? "#1a1a1a" : "#ffffff";
  const fg = bg === "dark" ? "#e5e5e5" : "#111";
  const sub = bg === "dark" ? "dark background #1a1a1a" : "light background #ffffff";
  return `
  <section class="card" style="background:${cardBg};color:${fg}">
    <div class="card-head">
      <h2>${m.name}</h2>
      <span class="sub">${sub}</span>
    </div>
    <div class="svg-wrap">${svg(key, bg)}</div>
    <table class="meta">
      <tr><th>muscle fill</th><td><code>${m.muscle}</code></td></tr>
      <tr><th>contour fill</th><td><code>${m.contourFill}</code></td></tr>
      <tr><th>contour stroke</th><td><code>${m.contourStroke}</code></td></tr>
      <tr><th>highlights</th><td>chest <span class="sw" style="background:#DC2626"></span> red · abs <span class="sw" style="background:#FB923C"></span> light-orange</td></tr>
      <tr><th>note</th><td>${m.note}</td></tr>
    </table>
  </section>`;
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Anatome — contour/palette showcase</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background:#f4f4f5; }
  header { padding: 2rem 1.5rem 1rem; max-width: 980px; margin: 0 auto; }
  header h1 { margin:0 0 .25rem; font-size: 1.5rem; }
  header p { margin:0; color:#555; font-size: .9rem; max-width: 60ch; }
  main { max-width: 980px; margin: 0 auto; padding: 0 1.5rem 3rem; display:flex; flex-direction:column; gap:1.25rem; }
  .card { border-radius: 16px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.12), 0 4px 16px rgba(0,0,0,.08); }
  .card-head { display:flex; align-items:baseline; justify-content:space-between; padding: 1rem 1.25rem; border-bottom: 1px solid rgba(128,128,128,.2); }
  .card-head h2 { margin:0; font-size: 1.05rem; font-weight:600; }
  .card-head .sub { font-size: .8rem; opacity:.7; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .svg-wrap { display:flex; justify-content:center; padding: 1rem; }
  .svg-wrap svg { width: 320px; height: auto; max-height: 460px; }
  .meta { width:100%; border-collapse: collapse; font-size: .8rem; }
  .meta th { text-align:left; padding:.4rem 1.25rem; width: 9rem; opacity:.7; font-weight:500; border-top: 1px solid rgba(128,128,128,.2); }
  .meta td { padding:.4rem 1.25rem; border-top: 1px solid rgba(128,128,128,.2); }
  .meta code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size:.78rem; }
  .sw { display:inline-block; width:10px; height:10px; border-radius:2px; vertical-align:middle; border:1px solid rgba(0,0,0,.15); }
  footer { max-width:980px; margin:0 auto; padding: 0 1.5rem 3rem; color:#666; font-size:.78rem; }
  .group-label { max-width:980px; margin: 1.5rem auto 0; padding: 0 1.5rem; font-size:.78rem; letter-spacing:.08em; text-transform:uppercase; color:#888; }
</style>
</head>
<body>
<header>
  <h1>Anatome — body contour / palette showcase</h1>
  <p>Five candidate default palettes, front view, with <strong>chest</strong> highlighted red and <strong>abs</strong> highlighted light-orange. Each option shown on a light and a dark background. Pick the most eye-catching one and tell me which to keep / remove / tweak.</p>
</header>
${ORDER.map((k) => `
<div class="group-label">${META[k].name}</div>
<main>
  ${card(k, "light")}
  ${card(k, "dark")}
</main>`).join("")}
<footer>
  Generated from the local anatome worker (POST /generateImage, output=raw). Self-contained; safe to keep for future revisions. Highlights: chest #DC2626 (opacity 1), abs #FB923C (opacity 0.85).
</footer>
</body>
</html>`;

const out = join(dir, "showcase.html");
writeFileSync(out, html);
console.log("wrote", out, `(${(html.length / 1024).toFixed(1)} KB)`);

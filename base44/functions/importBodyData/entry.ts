import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// One-time importer: fetches anatomical SVG path data from HichamELBSI/react-native-body-highlighter
// (MIT, © Hicham El Boussarghini), converts the TS data files to plain JS objects, and stores them
// in the BodyData entity. Frontend + engine read from the entity afterwards.
//
// SECURITY: admin/import endpoint — must NOT be public. Gated behind a Bearer ADMIN_TOKEN env var
// (constant-time-ish compare via SHA-256 digests; Deno has no crypto.timingSafeEqual). Returns 503
// if ADMIN_TOKEN is unset (before touching any data) and 401 on a missing/wrong token.

// Constant-time-ish token compare for Deno (no crypto.timingSafeEqual available).
// Hash both sides to SHA-256 and compare the hex digests; the digest comparison
// itself reveals no timing information about the secret token.
async function tokenEquals(supplied: string, stored: string): Promise<boolean> {
  if (!stored) return false;                       // unset config → never accept
  if (typeof supplied !== 'string' || supplied.length === 0) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(supplied)),
    crypto.subtle.digest('SHA-256', enc.encode(stored)),
  ]);
  const hex = (buf: ArrayBuffer): string => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
  return hex(a) === hex(b);
}

// Returns a Response ONLY if the request is unauthorized; null if it passed.
// ADMIN_TOKEN unset → 503. Missing/wrong Bearer → 401. Correct Bearer → null (proceed).
async function enforceAdminAuth(req: Request): Promise<Response | null> {
  const stored = Deno.env.get('ADMIN_TOKEN');
  if (!stored) {
    return Response.json({ ok: false, error: 'Admin token not configured' }, { status: 503 });
  }
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!m) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const ok = await tokenEquals(m[1], stored);
  if (!ok) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

const SOURCES = [
  { key: 'bodyFrontMale', gender: 'male', side: 'front', export: 'bodyFront', url: 'https://raw.githubusercontent.com/HichamELBSI/react-native-body-highlighter/main/assets/bodyFront.ts' },
  { key: 'bodyBackMale', gender: 'male', side: 'back', export: 'bodyBack', url: 'https://raw.githubusercontent.com/HichamELBSI/react-native-body-highlighter/main/assets/bodyBack.ts' },
  { key: 'bodyFrontFemale', gender: 'female', side: 'front', export: 'bodyFemaleFront', url: 'https://raw.githubusercontent.com/HichamELBSI/react-native-body-highlighter/main/assets/bodyFemaleFront.ts' },
  { key: 'bodyBackFemale', gender: 'female', side: 'back', export: 'bodyFemaleBack', url: 'https://raw.githubusercontent.com/HichamELBSI/react-native-body-highlighter/main/assets/bodyFemaleBack.ts' },
];

// Parse a TS body data file into an array of { slug, path: { common?, left?, right? } }.
// The files are pure data: `export const X: BodyPart[] = [ {...}, ... ];`
function parseBodyFile(src) {
  // Strip the TS import line and the `export const ... =` prefix, leaving the array literal.
  let txt = src;
  // Remove import lines
  txt = txt.replace(/^\s*import[^\n]*\n/gm, '');
  // Find the array literal start
  const eq = txt.indexOf('=');
  const arrStart = txt.indexOf('[', eq);
  if (arrStart === -1) throw new Error('No array literal found');
  // Find matching closing bracket
  let depth = 0;
  let end = -1;
  let inStr = false;
  let strCh = '';
  for (let i = arrStart; i < txt.length; i++) {
    const c = txt[i];
    if (inStr) {
      if (c === strCh && txt[i - 1] !== '\\') inStr = false;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = true; strCh = c; continue; }
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) throw new Error('Unbalanced array');
  let literal = txt.slice(arrStart, end + 1);
  // Remove TS type annotations like `: BodyPart[]` (already excluded) — none inside literal.
  // The literal is valid JS/JSON-ish (uses unquoted keys + trailing commas). Use Function eval safely.
  // Strip line comments
  literal = literal.replace(/\/\/[^\n]*/g, '');
  // eslint-disable-next-line no-new-func
  const arr = (new Function('return (' + literal + ');'))();
  // Normalize: keep only slug + path (drop color)
  return arr.map((p) => ({ slug: p.slug, path: p.path || {} }));
}

Deno.serve(async (req) => {
  try {
    // Auth gate — MUST run before any fetch or entity read/write.
    const authFail = await enforceAdminAuth(req);
    if (authFail) return authFail;

    const base44 = createClientFromRequest(req);

    const results = [];
    for (const s of SOURCES) {
      const resp = await fetch(s.url);
      if (!resp.ok) { results.push({ key: s.key, ok: false, error: `fetch ${resp.status}` }); continue; }
      const txt = await resp.text();
      let parts;
      try {
        parts = parseBodyFile(txt);
      } catch (e) {
        results.push({ key: s.key, ok: false, error: 'parse: ' + e.message });
        continue;
      }

      // Upsert into BodyData (service role so it works without auth)
      const existing = await base44.asServiceRole.entities.BodyData.filter({ key: s.key });
      const record = { key: s.key, gender: s.gender, side: s.side, parts };
      if (existing && existing.length > 0) {
        await base44.asServiceRole.entities.BodyData.update(existing[0].id, record);
      } else {
        await base44.asServiceRole.entities.BodyData.create(record);
      }
      results.push({ key: s.key, ok: true, count: parts.length, slugs: parts.map((p) => p.slug) });
    }

    return Response.json({ ok: true, results });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});
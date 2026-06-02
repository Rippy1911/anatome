# `api/data/` — bundled static data

The Cloudflare Worker does **not** fetch third-party data at runtime. It bundles
two static JSON files exported once from the live Base44 instance. Drop these files
here (they are intentionally git-tracked so the Worker build is reproducible):

- `bodyPaths.json` — anatomical SVG path data (4 rows: front/back × male/female)
- `exercises.json` — the full Exercise dataset (873 rows)

## How to export (run against the live Base44 app)

> Base URL today: `https://anatome-form-flow.base44.app`

### 1. `bodyPaths.json`

`getBodyData` already returns the exact nested shape the render engine expects:

```bash
curl -s "https://anatome-form-flow.base44.app/functions/getBodyData" \
  | jq '.data' > api/data/bodyPaths.json
```

Expected shape (`{ gender: { side: parts[] } }`):

```json
{
  "male":   { "front": [ /* parts */ ], "back": [ /* parts */ ] },
  "female": { "front": [ /* parts */ ], "back": [ /* parts */ ] }
}
```

Each `parts` entry is `{ slug, path: { common?, left?, right? } }`.

### 2. `exercises.json`

`searchExercises` returns a trimmed projection, **not** the full entity. For the
bundle we want the raw rows including the `anatome_*` mapping fields. Two options:

- **Preferred:** export the full `Exercise` entity rows from the Base44 dashboard
  (Entities → Exercise → Export), saving the raw array to `api/data/exercises.json`.
- **Fallback (trimmed):** if only the HTTP API is available, page through
  `searchExercises` with an empty query. Note this yields the projected fields only;
  confirm with a maintainer whether the trimmed shape is sufficient before porting.

```bash
# Fallback (projected fields) — empty query returns all, paginated by limit
curl -s "https://anatome-form-flow.base44.app/functions/searchExercises?q=&limit=1000" \
  | jq '.results' > api/data/exercises.json
```

Each full row should contain (see `base44/entities/Exercise.jsonc`):

```jsonc
{
  "ext_id": "Bench_Press",
  "name": "Bench Press",
  "name_lower": "bench press",
  "force": "push", "level": "beginner", "mechanic": "compound",
  "equipment": "barbell", "category": "strength",
  "primaryMuscles": ["chest"], "secondaryMuscles": ["triceps", "shoulders"],
  "instructions": ["..."],
  "images": ["Bench_Press/0.jpg", "Bench_Press/1.jpg"],
  "anatome_primary_slugs": ["chest"],
  "anatome_secondary_slugs": ["triceps", "deltoids"],
  "anatome_layers_payload": [ /* generateImage layer JSON */ ],
  "anatome_imageSrc": "/functions/generateImage?...&output=raw",
  "unmapped_source_muscle": []
}
```

## Notes

- `anatome_imageSrc` values are stored as **relative** paths (`/functions/...`).
  When the API moves to `api.anatome.dev`, the Worker rewrites these to absolute
  URLs at response time (preserving backwards compatibility). Do not hardcode a
  host into the bundled data.
- After dropping the files in, verify counts: `jq 'length' api/data/exercises.json`
  should be **873**; `bodyPaths.json` should have 4 populated `gender.side` arrays.

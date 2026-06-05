// OpenAPI 3.1 spec — ported from the Base44 openapi function. aiDemo is intentionally
// absent (AI is internal-only; see ../../AGENTS.md §9). Server points at the new domain
// with the Base44 host kept as an alternate for backwards compatibility.

const layerSchema = {
  type: "object",
  properties: {
    color: { type: "string", example: "#DC2626", description: "Hex, rgb(), or url(#gradientId)" },
    muscles: { type: "array", items: { type: "string" }, example: ["chest", "abs"] },
    opacity: { type: "number", minimum: 0, maximum: 1, example: 1 },
    stroke: { type: "string" },
    strokeWidth: { type: "number" },
  },
  required: ["color", "muscles"],
};

const generateRequest = {
  type: "object",
  properties: {
    gender: { type: "string", enum: ["male", "female"], default: "male" },
    view: { type: "string", enum: ["front", "back", "dual"], default: "dual" },
    layers: { type: "array", items: layerSchema },
    defs: { type: "array", description: "SVG gradient/pattern definitions", items: { type: "object" } },
    width: { type: "integer", default: 768 },
    height: { type: "integer", default: 1024 },
    background: { type: "string", default: "transparent" },
    body_color: { type: "string", default: "#282828" },
    border_color: { type: "string", default: "#dfdfdf" },
    border_width: { type: "number", default: 1.5 },
    per_muscle: { type: "object", description: "Per-muscle style override (highest priority)" },
    side_filter: { type: "object", description: "Highlight only one side: { biceps: 'left' }" },
    format: { type: "string", enum: ["svg", "png"], default: "svg" },
    output: { type: "string", enum: ["json", "raw"], default: "json" },
  },
};

const exerciseResultSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    primaryMuscles: { type: "array", items: { type: "string" } },
    secondaryMuscles: { type: "array", items: { type: "string" } },
    equipment: { type: "string" },
    level: { type: "string" },
    category: { type: "string" },
    image_url: { type: "string", description: "Anatome-hosted exercise demo GIF (alias of gif_url)" },
    gif_url: { type: "string", description: "Anatome-hosted 2-frame exercise demo GIF at /exerciseGif" },
    anatome_imageSrc: { type: "string", description: "Ready-to-embed absolute <img src> URL" },
    anatome_layers_payload: { type: "array", items: { type: "object" } },
    instructions: { type: "array", items: { type: "string" } },
    movementType: { type: "string", nullable: true, description: "Alias of mechanic (compound / isolation)" },
    keywords: { type: "array", items: { type: "string" } },
    variations: {
      type: "array",
      items: {
        type: "object",
        properties: { ext_id: { type: "string" }, name: { type: "string" }, anatome_imageSrc: { type: "string", nullable: true } },
      },
    },
    relatedExerciseIds: { type: "array", items: { type: "string" } },
  },
};

export function buildOpenApiSpec(publicBaseUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Anatome — Muscle Group Image Generator API",
      version: "2.0.0",
      description: "Anatome — Apache-2.0 licensed muscle group image generator + ExerciseDB API. SVG rendering of 23 muscle groups (male + female, front + back, dual view), backed by 873 exercises from free-exercise-db (CC0). Anatomical SVG paths from react-native-body-highlighter (MIT, © Hicham El Boussarghini). MCP-compatible. Built by NextSolutions — nextsolutions.studio",
      termsOfService: "https://anatome.dev/tos",
      contact: { name: "NextSolutions", url: "https://nextsolutions.studio", email: "contact@nextsolutions.studio" },
      license: { name: "Apache-2.0", url: "https://www.apache.org/licenses/LICENSE-2.0" },
    },
    servers: [
      { url: publicBaseUrl, description: "Cloudflare Workers (production)" },
      { url: "https://anatome.dev/functions", description: "Base44 marketing site (legacy /functions paths)" },
    ],
    tags: [
      { name: "Image Generation", description: "Render anatomical SVG diagrams" },
      { name: "Exercise Database", description: "873 exercises with muscle mappings" },
      { name: "MCP", description: "Model Context Protocol JSON-RPC" },
      { name: "Discovery", description: "Catalog and capability endpoints" },
    ],
    paths: {
      "/generateImage": {
        post: {
          tags: ["Image Generation"],
          summary: "Generate a muscle diagram (full schema)",
          requestBody: { required: true, content: { "application/json": { schema: generateRequest,
            examples: {
              simple: { summary: "Single layer", value: { gender: "male", view: "front", layers: [{ color: "#DC2626", muscles: ["chest", "abs"] }] } },
              multicolor: { summary: "Primary + secondary", value: { view: "dual", layers: [{ color: "red", muscles: ["chest"] }, { color: "blue", muscles: ["triceps"] }] } },
            } } } },
          responses: {
            "200": { description: "Rendered SVG", content: { "application/json": { schema: { type: "object", properties: {
              ok: { type: "boolean" }, svg: { type: "string" }, format: { type: "string" }, gender: { type: "string" },
              view: { type: "string" }, muscles_rendered: { type: "array", items: { type: "string" } },
              available_muscles_count: { type: "integer" }, attribution: { type: "string" }, license: { type: "string" }, duration_ms: { type: "integer" },
            } } }, "image/svg+xml": { schema: { type: "string" } } } },
            "500": { description: "Server error" },
          },
        },
        get: {
          tags: ["Image Generation"],
          summary: "Generate a muscle diagram (query syntax)",
          parameters: [
            { name: "muscles", in: "query", schema: { type: "string" }, example: "chest,abs", description: "Comma-separated slugs (single layer)" },
            { name: "color", in: "query", schema: { type: "string" }, example: "#FF0000" },
            { name: "layers", in: "query", schema: { type: "string" }, example: "DC2626:chest,abs|0000FF:triceps", description: "Pipe-separated COLOR:muscles groups" },
            { name: "gender", in: "query", schema: { type: "string", enum: ["male", "female"] } },
            { name: "view", in: "query", schema: { type: "string", enum: ["front", "back", "dual"] } },
            { name: "output", in: "query", schema: { type: "string", enum: ["json", "raw"] } },
          ],
          responses: { "200": { description: "Rendered SVG" } },
        },
      },
      "/listMuscles": {
        get: { tags: ["Discovery"], summary: "List all supported muscles", responses: { "200": { description: "Muscle catalog",
          content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, count: { type: "integer" }, muscles: { type: "array", items: { type: "object", properties: { slug: { type: "string" }, name: { type: "string" }, views: { type: "array", items: { type: "string" } }, body_region: { type: "string", nullable: true }, antagonists: { type: "array", items: { type: "string" } } } } } } } } } } } },
      },
      "/muscleInfo": {
        get: {
          tags: ["Discovery"],
          summary: "Per-muscle reference with exercise counts",
          parameters: [{ name: "slug", in: "query", required: true, schema: { type: "string" }, example: "chest" }],
          responses: {
            "200": { description: "Muscle detail" },
            "404": { description: "Unknown slug" },
          },
        },
      },
      "/listEquipment": {
        get: {
          tags: ["Discovery"],
          summary: "List distinct equipment values from the exercise bundle",
          responses: { "200": { description: "Equipment list" } },
        },
      },
      "/workoutImage": {
        post: {
          tags: ["Image Generation"],
          summary: "Session heatmap — stack muscle activation across multiple exercises",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    exercises: { type: "array", items: { type: "string" }, example: ["bench press", "squat", "overhead press"] },
                    gender: { type: "string", enum: ["male", "female"], default: "male" },
                    view: { type: "string", enum: ["front", "back", "dual"], default: "dual" },
                    output: { type: "string", enum: ["json", "raw"], default: "json" },
                  },
                  required: ["exercises"],
                },
              },
            },
          },
          responses: {
            "200": { description: "Combined workout SVG + muscle hit counts" },
            "400": { description: "Missing exercises array" },
          },
        },
      },
      "/searchExercises": {
        get: {
          tags: ["Exercise Database"],
          summary: "Search the exercise database",
          description: "Fuzzy name search across 873 exercises with optional muscle/equipment/level filters. Default response includes free-exercise-db fields (instructions, images, force, category, etc.) plus Anatome mappings. Use fields= to trim or fields=all for variations and relatedExerciseIds.",
          parameters: [
            { name: "q", in: "query", required: true, schema: { type: "string" }, example: "bench", description: "Name search query" },
            { name: "muscle", in: "query", schema: { type: "string" }, example: "chest", description: "Filter by Anatome muscle slug" },
            { name: "equipment", in: "query", schema: { type: "string" }, example: "barbell" },
            { name: "level", in: "query", schema: { type: "string", enum: ["beginner", "intermediate", "expert"] } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20, maximum: 50 }, example: 5 },
            { name: "offset", in: "query", schema: { type: "integer", default: 0, minimum: 0 }, example: 0 },
            { name: "cursor", in: "query", schema: { type: "string" }, description: "Opaque pagination cursor from prior response next_cursor" },
            { name: "fields", in: "query", schema: { type: "string" }, description: "Comma-separated field list, or all/* for full records" },
          ],
          responses: {
            "200": { description: "Search results", content: { "application/json": { schema: { type: "object", properties: {
              ok: { type: "boolean" }, total_matched: { type: "integer" }, offset: { type: "integer" }, limit: { type: "integer" }, next_cursor: { type: "string", nullable: true }, results: { type: "array", items: exerciseResultSchema },
              attribution: { type: "string" }, license: { type: "string" }, built_by: { type: "string" }, try_also: { type: "string" },
            } } } } },
          },
        },
      },
      "/getExercise": {
        get: {
          tags: ["Exercise Database"],
          summary: "Fetch exercise(s) — 4 modes",
          description: "Provide exactly one of: name (fuzzy), id, muscle (+limit), or random=1.",
          parameters: [
            { name: "name", in: "query", schema: { type: "string" }, example: "bench press" },
            { name: "id", in: "query", schema: { type: "string" }, example: "Bench_Press" },
            { name: "muscle", in: "query", schema: { type: "string" }, example: "chest" },
            { name: "limit", in: "query", schema: { type: "integer", default: 10 } },
            { name: "random", in: "query", schema: { type: "integer", enum: [1] }, example: 1 },
            { name: "fields", in: "query", schema: { type: "string" }, description: "Comma-separated field list, or all/* (default: full record incl. instructions)" },
          ],
          responses: {
            "200": { description: "Exercise found" },
            "404": { description: "No match" },
          },
        },
      },
      "/exerciseGif": {
        get: {
          tags: ["Exercise Database"],
          summary: "Exercise demonstration GIF (2-frame, CC0 source)",
          parameters: [{ name: "id", in: "query", required: true, schema: { type: "string" }, example: "Barbell_Bench_Press_-_Medium_Grip", description: "Exercise ext_id" }],
          responses: {
            "200": { description: "Animated GIF", content: { "image/gif": { schema: { type: "string", format: "binary" } } } },
            "404": { description: "GIF not generated yet" },
          },
        },
      },
      "/resolveExercise": {
        get: { tags: ["Exercise Database"], summary: "Resolve an exercise to muscle layers", parameters: [{ name: "exercise", in: "query", required: true, schema: { type: "string" }, example: "bench press" }],
          responses: { "200": { description: "Resolved layers" } } },
        post: { tags: ["Exercise Database"], summary: "Resolve an exercise (JSON body)", requestBody: { content: { "application/json": { schema: { type: "object", properties: { exercise: { type: "string" } }, required: ["exercise"] } } } }, responses: { "200": { description: "Resolved layers" } } },
      },
      "/mcp": {
        post: { tags: ["MCP"], summary: "MCP JSON-RPC 2.0 endpoint", description: "MCP JSON-RPC 2.0 endpoint. Tools: generate_muscle_image, list_muscles, resolve_exercise, search_exercises, get_exercise.",
          requestBody: { content: { "application/json": { schema: { type: "object", properties: { jsonrpc: { type: "string", example: "2.0" }, id: { type: "integer" }, method: { type: "string" }, params: { type: "object" } } } } } },
          responses: { "200": { description: "JSON-RPC response" } } },
        get: { tags: ["MCP"], summary: "MCP capability descriptor", responses: { "200": { description: "Server info + tool names" } } },
      },
      "/openapi": { get: { tags: ["Discovery"], summary: "This OpenAPI 3.1 spec", responses: { "200": { description: "OpenAPI document" } } } },
      "/selfTest": { get: { tags: ["Discovery"], summary: "Run the self-test suite", responses: { "200": { description: "Test summary" } } } },
    },
  };
}

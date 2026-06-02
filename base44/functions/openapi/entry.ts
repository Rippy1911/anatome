import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  createClientFromRequest(req);
  const base = new URL(req.url).origin + "/functions";

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
      body_color: { type: "string", default: "#3f3f3f" },
      border_color: { type: "string", default: "#dfdfdf" },
      border_width: { type: "number", default: 1 },
      per_muscle: { type: "object", description: "Per-muscle style override (highest priority)" },
      side_filter: { type: "object", description: "Highlight only one side: { biceps: 'left' }" },
      format: { type: "string", enum: ["svg", "png"], default: "svg" },
      output: { type: "string", enum: ["json", "raw"], default: "json" },
    },
  };

  const spec = {
    openapi: "3.1.0",
    info: {
      title: "Anatome — Muscle Group Image Generator API",
      version: "1.0.0",
      description: "Self-hosted muscle group image generator. Returns SVG diagrams of the human body with arbitrary muscles highlighted in arbitrary colors. The MIT-licensed, flexible alternative to mertronlp's muscle-group-image-generator. Anatomy paths © Hicham El Boussarghini (MIT), ported from react-native-body-highlighter.",
      contact: { name: "Anatome by NextSolutions", url: "https://github.com/HichamELBSI/react-native-body-highlighter" },
      license: { name: "MIT", url: "https://opensource.org/licenses/MIT" },
    },
    servers: [{ url: base }],
    paths: {
      "/generateImage": {
        post: {
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
          summary: "Generate a muscle diagram (query syntax)",
          parameters: [
            { name: "muscles", in: "query", schema: { type: "string" }, example: "chest,abs", description: "Comma-separated slugs (single layer)" },
            { name: "color", in: "query", schema: { type: "string" }, example: "#FF0000" },
            { name: "layers", in: "query", schema: { type: "string" }, example: "chest,abs:#FF0000|triceps:#0000FF", description: "Pipe-separated muscles:color groups" },
            { name: "gender", in: "query", schema: { type: "string", enum: ["male", "female"] } },
            { name: "view", in: "query", schema: { type: "string", enum: ["front", "back", "dual"] } },
            { name: "output", in: "query", schema: { type: "string", enum: ["json", "raw"] } },
          ],
          responses: { "200": { description: "Rendered SVG" } },
        },
      },
      "/listMuscles": {
        get: { summary: "List all supported muscles", responses: { "200": { description: "Muscle catalog",
          content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, count: { type: "integer" }, muscles: { type: "array", items: { type: "object", properties: { slug: { type: "string" }, name: { type: "string" }, views: { type: "array", items: { type: "string" } } } } } } } } } } } },
      },
      "/resolveExercise": {
        get: { summary: "Resolve an exercise to muscle layers", parameters: [{ name: "exercise", in: "query", required: true, schema: { type: "string" }, example: "bench press" }],
          responses: { "200": { description: "Resolved layers", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, exercise: { type: "string" }, matched: { type: "boolean" }, source: { type: "string", enum: ["exact", "prefix", "keyword_fallback", "unmatched"] }, layers: { type: "array", items: layerSchema }, explanation: { type: "string" } } } } } } } },
        post: { summary: "Resolve an exercise (JSON body)", requestBody: { content: { "application/json": { schema: { type: "object", properties: { exercise: { type: "string" } }, required: ["exercise"] } } } }, responses: { "200": { description: "Resolved layers" } } },
      },
      "/mcp": {
        post: { summary: "MCP JSON-RPC 2.0 endpoint", description: "Supports initialize, tools/list, tools/call (generate_muscle_image, list_muscles, resolve_exercise).",
          requestBody: { content: { "application/json": { schema: { type: "object", properties: { jsonrpc: { type: "string", example: "2.0" }, id: { type: "integer" }, method: { type: "string" }, params: { type: "object" } } } } } },
          responses: { "200": { description: "JSON-RPC response" } } },
        get: { summary: "MCP capability descriptor", responses: { "200": { description: "Server info + tool names" } } },
      },
      "/openapi": { get: { summary: "This OpenAPI 3.1 spec", responses: { "200": { description: "OpenAPI document" } } } },
      "/selfTest": { get: { summary: "Run the self-test suite", responses: { "200": { description: "Test summary" } } } },
    },
  };

  return Response.json(spec, { headers: { "Access-Control-Allow-Origin": "*" } });
});
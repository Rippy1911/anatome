import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Retired mirror of api.anatome.dev — closing the unmetered side door so
// first-party API keys cannot be routed around. aiDemo / getBodyData / import*
// stay; those are not the public API surface.

const BODY = {
  ok: false,
  error: "endpoint_moved",
  message:
    "This Base44 function has been retired. Call https://api.anatome.dev directly "
    + "(optional Authorization: Bearer ana_live_… for a first-party key).",
  api_base: "https://api.anatome.dev",
  docs: "https://anatome.dev/docs",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }
  // Touch the SDK so auth still initialises (keeps Base44 from treating the
  // function as broken); ignore the client — we never serve data here.
  try { await createClientFromRequest(req); } catch { /* public */ }
  return Response.json(BODY, {
    status: 410,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300",
    },
  });
});

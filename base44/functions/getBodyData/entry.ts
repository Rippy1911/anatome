import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Public read of body path data (via service role, so it works for anonymous playground users).
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const records = await base44.asServiceRole.entities.BodyData.list();
    const map = {};
    for (const r of records) map[r.key] = r.parts || [];
    const data = {
      male: { front: map.bodyFrontMale || [], back: map.bodyBackMale || [] },
      female: { front: map.bodyFrontFemale || [], back: map.bodyBackFemale || [] },
    };
    return Response.json({ ok: true, data }, { headers: { "Access-Control-Allow-Origin": "*" } });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';

const WORKER_BASE = 'https://api.anatome.dev';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const keyId = body.key_id;
    if (!keyId) return Response.json({ ok: false, error: 'key_id_required' }, { status: 400 });

    const keys = await base44.entities.ApiKey.filter({ key_id: keyId });
    const key = keys && keys[0];
    if (!key) return Response.json({ ok: false, error: 'key_not_found' }, { status: 404 });

    await base44.entities.ApiKey.update(key.id, {
      status: 'revoked',
      revoked_at: new Date().toISOString(),
    });

    const adminToken = secrets.get('WORKER_ADMIN_TOKEN');
    if (adminToken) {
      try {
        await fetch(WORKER_BASE + '/admin/keys/' + keyId, {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + adminToken },
        });
      } catch (e) {
        // local revoke still succeeded
      }
    }

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
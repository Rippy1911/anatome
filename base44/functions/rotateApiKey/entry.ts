import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';

const WORKER_BASE = 'https://api.anatome.dev';

function urlSafeRandom(len) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[bytes[i] % chars.length];
  return s;
}

async function sha256hex(str) {
  const data = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const oldKeyId = body.key_id;
    if (!oldKeyId) return Response.json({ ok: false, error: 'key_id_required' }, { status: 400 });

    const keys = await base44.entities.ApiKey.filter({ key_id: oldKeyId });
    const oldKey = keys && keys[0];
    if (!oldKey) return Response.json({ ok: false, error: 'key_not_found' }, { status: 404 });

    const plans = await base44.asServiceRole.entities.Plan.filter({ slug: oldKey.plan_slug });
    const plan = plans && plans[0];

    const token = 'ana_live_' + urlSafeRandom(32);
    const keyHash = await sha256hex(token);
    const prefix = token.slice(0, 12);
    const newKeyId = 'key_' + urlSafeRandom(12);

    await base44.entities.ApiKey.create({
      key_id: newKeyId,
      key_hash: keyHash,
      prefix,
      name: String(oldKey.name || 'rotated'),
      plan_slug: oldKey.plan_slug,
      status: 'active',
    });

    await base44.entities.ApiKey.update(oldKey.id, {
      status: 'revoked',
      revoked_at: new Date().toISOString(),
    });

    const adminToken = secrets.get('WORKER_ADMIN_TOKEN');
    if (adminToken) {
      try {
        await fetch(WORKER_BASE + '/admin/keys/' + newKeyId, {
          method: 'PUT',
          headers: { 'Authorization': 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key_hash: keyHash,
            plan: oldKey.plan_slug,
            status: 'active',
            included_requests: plan ? plan.included_requests : 0,
            allow_overage: plan ? !!plan.allow_overage : false,
            stripe_customer_id: user.stripe_customer_id || (user.data && user.data.stripe_customer_id) || '',
            owner_email: user.email || '',
          }),
        });
        await fetch(WORKER_BASE + '/admin/keys/' + oldKeyId, {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + adminToken },
        });
      } catch (e) {
        // rotation succeeded locally; Worker sync is best-effort
      }
    }

    return Response.json({ ok: true, plaintext_key: token, key_id: newKeyId, prefix });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
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
    const name = String(body.name || 'default').slice(0, 60);
    const planSlug = String(body.plan_slug || user.plan_slug || (user.data && user.data.plan_slug) || 'free');

    const plans = await base44.asServiceRole.entities.Plan.filter({ slug: planSlug });
    const plan = plans && plans[0];
    if (!plan) return Response.json({ ok: false, error: 'plan_not_found' }, { status: 400 });

    const token = 'ana_live_' + urlSafeRandom(32);
    const keyHash = await sha256hex(token);
    const prefix = token.slice(0, 12);
    const keyId = 'key_' + urlSafeRandom(12);

    const record = await base44.entities.ApiKey.create({
      key_id: keyId,
      key_hash: keyHash,
      prefix,
      name,
      plan_slug: planSlug,
      status: 'active',
    });

    const adminToken = secrets.get('WORKER_ADMIN_TOKEN');
    if (adminToken) {
      try {
        const r = await fetch(WORKER_BASE + '/admin/keys/' + keyId, {
          method: 'PUT',
          headers: { 'Authorization': 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key_hash: keyHash,
            plan: planSlug,
            status: 'active',
            included_requests: plan.included_requests,
            allow_overage: !!plan.allow_overage,
            stripe_customer_id: user.stripe_customer_id || (user.data && user.data.stripe_customer_id) || '',
            owner_email: user.email || '',
          }),
        });
        if (!r.ok) throw new Error('worker ' + r.status);
      } catch (e) {
        await base44.entities.ApiKey.update(record.id, { status: 'pending_sync' });
        return Response.json({
          ok: true,
          plaintext_key: token,
          key_id: keyId,
          prefix,
          warning: 'Key created locally but not yet synced to the API gateway. It may take a moment to activate.',
        });
      }
    }

    return Response.json({ ok: true, plaintext_key: token, key_id: keyId, prefix });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
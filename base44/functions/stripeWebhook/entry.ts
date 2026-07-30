import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';

const WORKER_BASE = 'https://api.anatome.dev';

async function verifyStripeWebhook(rawBody, signatureHeader, secret) {
  const parts = {};
  for (const p of signatureHeader.split(',')) {
    const idx = p.indexOf('=');
    if (idx > 0) parts[p.slice(0, idx).trim()] = p.slice(idx + 1).trim();
  }
  const timestamp = parts.t;
  if (!timestamp) return null;
  const ageSec = Math.abs(Date.now() / 1000 - parseInt(timestamp));
  if (ageSec > 300) return null;

  const signedPayload = timestamp + '.' + rawBody;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const expectedSig = btoa(String.fromCharCode.apply(null, new Uint8Array(sigBuf)));

  const sigs = signatureHeader.split(',').filter(p => p.startsWith('v1=')).map(p => p.slice(3).trim());
  let valid = false;
  for (const s of sigs) {
    if (s.length === expectedSig.length && s === expectedSig) { valid = true; break; }
  }
  return valid ? JSON.parse(rawBody) : null;
}

async function pushKeyStatus(keyId, status) {
  const adminToken = secrets.get('WORKER_ADMIN_TOKEN');
  if (!adminToken) return;
  try {
    await fetch(WORKER_BASE + '/admin/keys/' + keyId, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
  } catch (e) { /* best-effort */ }
}

async function setKeyStatusForUser(base44, userId, newStatus) {
  const keys = await base44.asServiceRole.entities.ApiKey.filter({ created_by_id: userId, status: newStatus === 'active' ? 'suspended' : 'active' });
  if (!keys) return;
  for (const key of keys) {
    await base44.asServiceRole.entities.ApiKey.update(key.id, { status: newStatus });
    await pushKeyStatus(key.key_id, newStatus);
  }
}

function mapSubStatus(s) {
  const m = { active: 'active', past_due: 'past_due', canceled: 'canceled', incomplete: 'incomplete', unpaid: 'past_due', trialing: 'active' };
  return m[s] || 'incomplete';
}

async function processStripeEvent(base44, event) {
  const obj = event.data && event.data.object;
  const stripeKey = secrets.get('STRIPE_SECRET_KEY');

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = obj;
      const userId = session.client_reference_id || (session.metadata && session.metadata.user_id);
      const planSlug = session.metadata && session.metadata.plan_slug;
      const customerId = typeof session.customer === 'string' ? session.customer : (session.customer && session.customer.id);
      const subscriptionId = typeof session.subscription === 'string' ? session.subscription : (session.subscription && session.subscription.id);
      if (!userId || !planSlug) return;

      await base44.asServiceRole.entities.User.update(userId, {
        stripe_customer_id: customerId,
        plan_slug: planSlug,
      });

      let periodEnd = null;
      let cancelAtEnd = false;
      if (stripeKey && subscriptionId) {
        try {
          const subResp = await fetch('https://api.stripe.com/v1/subscriptions/' + subscriptionId, {
            headers: { 'Authorization': 'Bearer ' + stripeKey },
          });
          if (subResp.ok) {
            const sub = await subResp.json();
            periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
            cancelAtEnd = !!sub.cancel_at_period_end;
          }
        } catch (e) {}
      }

      const subs = await base44.asServiceRole.entities.Subscription.filter({ stripe_subscription_id: subscriptionId });
      if (subs && subs.length > 0) {
        await base44.asServiceRole.entities.Subscription.update(subs[0].id, {
          plan_slug: planSlug, status: 'active', current_period_end: periodEnd, cancel_at_period_end: cancelAtEnd,
        });
      } else {
        await base44.asServiceRole.entities.Subscription.create({
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          plan_slug: planSlug,
          status: 'active',
          current_period_end: periodEnd,
          cancel_at_period_end: cancelAtEnd,
          created_by_id: userId,
        });
      }
      break;
    }

    case 'customer.subscription.updated': {
      const sub = obj;
      const subs = await base44.asServiceRole.entities.Subscription.filter({ stripe_subscription_id: sub.id });
      if (subs && subs.length > 0) {
        const s0 = subs[0];
        const mapped = mapSubStatus(sub.status);
        await base44.asServiceRole.entities.Subscription.update(s0.id, {
          status: mapped,
          current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
          cancel_at_period_end: !!sub.cancel_at_period_end,
        });
        if (mapped === 'past_due' || mapped === 'canceled') {
          await setKeyStatusForUser(base44, s0.created_by_id, 'suspended');
        } else if (mapped === 'active') {
          await setKeyStatusForUser(base44, s0.created_by_id, 'active');
        }
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = obj;
      const subs = await base44.asServiceRole.entities.Subscription.filter({ stripe_subscription_id: sub.id });
      if (subs && subs.length > 0) {
        const s0 = subs[0];
        await base44.asServiceRole.entities.Subscription.update(s0.id, { status: 'canceled', cancel_at_period_end: true });
        await setKeyStatusForUser(base44, s0.created_by_id, 'suspended');
      }
      break;
    }

    case 'invoice.paid': {
      const inv = obj;
      if (!inv.subscription) return;
      const subs = await base44.asServiceRole.entities.Subscription.filter({ stripe_subscription_id: inv.subscription });
      if (subs && subs.length > 0) {
        await base44.asServiceRole.entities.Subscription.update(subs[0].id, { status: 'active' });
        await setKeyStatusForUser(base44, subs[0].created_by_id, 'active');
      }
      break;
    }

    case 'invoice.payment_failed': {
      const inv = obj;
      if (!inv.subscription) return;
      const subs = await base44.asServiceRole.entities.Subscription.filter({ stripe_subscription_id: inv.subscription });
      if (subs && subs.length > 0) {
        await base44.asServiceRole.entities.Subscription.update(subs[0].id, { status: 'past_due' });
        await setKeyStatusForUser(base44, subs[0].created_by_id, 'suspended');
      }
      break;
    }

    case 'invoice.payment_action_required': {
      const inv = obj;
      if (!inv.subscription) return;
      const subs = await base44.asServiceRole.entities.Subscription.filter({ stripe_subscription_id: inv.subscription });
      if (subs && subs.length > 0) {
        await base44.asServiceRole.entities.Subscription.update(subs[0].id, { status: 'incomplete' });
      }
      break;
    }

    default:
      break;
  }
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const rawBody = await req.text();
    const signature = req.headers.get('Stripe-Signature');
    const webhookSecret = secrets.get('STRIPE_WEBHOOK_SECRET');

    if (!signature || !webhookSecret) {
      return Response.json({ ok: false, error: 'missing_signature_or_secret' }, { status: 400 });
    }

    const event = await verifyStripeWebhook(rawBody, signature, webhookSecret);
    if (!event) {
      return Response.json({ ok: false, error: 'invalid_signature' }, { status: 400 });
    }

    const existing = await base44.asServiceRole.entities.WebhookLog.filter({ stripe_event_id: event.id });
    if (existing && existing.length > 0) {
      return Response.json({ ok: true, message: 'duplicate', result: existing[0].result });
    }

    let result = 'processed';
    let error = null;
    try {
      await processStripeEvent(base44, event);
    } catch (e) {
      result = 'error';
      error = e.message;
    }

    await base44.asServiceRole.entities.WebhookLog.create({
      stripe_event_id: event.id,
      type: event.type,
      payload_summary: JSON.stringify(event.data && event.data.object || {}).slice(0, 500),
      processed_at: new Date().toISOString(),
      result,
      error,
    });

    return Response.json({ ok: true, result });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
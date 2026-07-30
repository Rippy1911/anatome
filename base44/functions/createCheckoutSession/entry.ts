import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const planSlug = body.plan_slug;
    if (!planSlug) return Response.json({ ok: false, error: 'plan_slug_required' }, { status: 400 });

    const plans = await base44.asServiceRole.entities.Plan.filter({ slug: planSlug, is_public: true });
    const plan = plans && plans[0];
    if (!plan) return Response.json({ ok: false, error: 'plan_not_found' }, { status: 400 });
    if (!plan.stripe_price_id_base) {
      return Response.json({ ok: false, error: 'stripe_not_configured', message: 'This plan is not yet available for checkout.' }, { status: 400 });
    }

    const stripeKey = secrets.get('STRIPE_SECRET_KEY');
    if (!stripeKey) return Response.json({ ok: false, error: 'stripe_not_configured', message: 'Stripe is not yet configured.' }, { status: 500 });

    const origin = req.headers.get('origin') || 'https://anatome.dev';

    const params = new URLSearchParams();
    params.append('mode', 'subscription');
    params.append('line_items[0][price]', plan.stripe_price_id_base);
    params.append('line_items[0][quantity]', '1');
    if (plan.allow_overage && plan.stripe_price_id_metered) {
      params.append('line_items[1][price]', plan.stripe_price_id_metered);
      params.append('line_items[1][quantity]', '1');
    }
    params.append('client_reference_id', user.id);
    params.append('metadata[user_id]', user.id);
    params.append('metadata[plan_slug]', planSlug);
    params.append('success_url', origin + '/dashboard?checkout=success');
    params.append('cancel_url', origin + '/pricing?checkout=cancelled');

    const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + stripeKey, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const session = await resp.json();
    if (!resp.ok) {
      return Response.json({ ok: false, error: 'stripe_error', message: (session.error && session.error.message) || 'Stripe error' }, { status: 400 });
    }

    return Response.json({ ok: true, url: session.url });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
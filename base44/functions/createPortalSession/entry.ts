import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });

    const stripeCustomerId = user.stripe_customer_id || (user.data && user.data.stripe_customer_id);
    if (!stripeCustomerId) {
      return Response.json({ ok: false, error: 'no_stripe_customer', message: 'You don\'t have a billing account yet. Subscribe to a plan first.' }, { status: 400 });
    }

    const stripeKey = secrets.get('STRIPE_SECRET_KEY');
    if (!stripeKey) return Response.json({ ok: false, error: 'stripe_not_configured' }, { status: 500 });

    const origin = req.headers.get('origin') || 'https://anatome.dev';

    const params = new URLSearchParams();
    params.append('customer', stripeCustomerId);
    params.append('return_url', origin + '/account');

    const resp = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
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
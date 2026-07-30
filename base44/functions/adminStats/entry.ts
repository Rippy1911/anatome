import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';

const WORKER_BASE = 'https://api.anatome.dev';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    if (user.role !== 'admin') {
      return Response.json({ ok: false, error: 'forbidden', message: 'Admin access required.' }, { status: 200 });
    }

    const adminToken = secrets.get('WORKER_ADMIN_TOKEN');
    if (!adminToken) {
      return Response.json({ ok: false, error: 'worker_not_configured', message: 'Worker admin token not configured.' }, { status: 200 });
    }

    const body = await req.json().catch(() => ({}));
    const from = body.from || '';
    const to = body.to || '';

    const params = new URLSearchParams();
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    let workerUrl = WORKER_BASE + '/admin/stats';
    if (params.toString()) workerUrl += '?' + params.toString();

    const resp = await fetch(workerUrl, { headers: { 'Authorization': 'Bearer ' + adminToken } });

    if (!resp.ok) {
      return Response.json({ ok: false, error: 'worker_error', message: 'Worker returned ' + resp.status }, { status: 200 });
    }

    const data = await resp.json();
    return Response.json({ ok: true, data: data.data || data });
  } catch (error) {
    return Response.json({ ok: false, error: error.message, message: 'Failed to fetch admin stats.' }, { status: 200 });
  }
}
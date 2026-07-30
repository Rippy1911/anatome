import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets, waitUntil } from 'base44:runtime';

const WORKER_BASE = 'https://api.anatome.dev';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });

    const keys = await base44.entities.ApiKey.list('-created_date', 100);
    if (!keys || keys.length === 0) {
      return Response.json({ ok: true, keys: [], usage: {}, totals: { requests: 0, errors: 0 } });
    }

    const adminToken = secrets.get('WORKER_ADMIN_TOKEN');
    if (!adminToken) {
      return Response.json({ ok: false, error: 'worker_not_configured', message: 'Usage analytics are not yet available.', keys }, { status: 200 });
    }

    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const to = now.toISOString();

    const activeKeys = keys.filter(k => k.status !== 'revoked');
    const results = await Promise.all(activeKeys.map(async (key) => {
      try {
        const u = WORKER_BASE + '/admin/usage?key_id=' + encodeURIComponent(key.key_id) +
          '&from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to) + '&granularity=day';
        const resp = await fetch(u, { headers: { 'Authorization': 'Bearer ' + adminToken } });
        if (resp.ok) {
          const data = await resp.json();
          const totals = (data.data && data.data.totals) || {};
          waitUntil(base44.entities.UsageSnapshot.create({
            key_id: key.key_id,
            period_start: from,
            period_end: to,
            requests: totals.requests || 0,
            errors: totals.errors || 0,
            fetched_at: now.toISOString(),
          }));
          return { key_id: key.key_id, data: data.data || { series: [], totals: {} }, ok: true };
        }
        return { key_id: key.key_id, ok: false };
      } catch (e) {
        return { key_id: key.key_id, ok: false };
      }
    }));

    let workerReachable = false;
    const usageBy = {};
    let totalRequests = 0;
    let totalErrors = 0;

    for (const r of results) {
      if (r.ok) {
        workerReachable = true;
        usageBy[r.key_id] = r.data;
        totalRequests += (r.data.totals && r.data.totals.requests) || 0;
        totalErrors += (r.data.totals && r.data.totals.errors) || 0;
      }
    }

    if (!workerReachable) {
      const snapshots = await base44.entities.UsageSnapshot.list('-fetched_at', 50);
      for (const snap of snapshots) {
        if (!usageBy[snap.key_id]) {
          usageBy[snap.key_id] = { cached: true, totals: { requests: snap.requests, errors: snap.errors }, fetched_at: snap.fetched_at };
          totalRequests += snap.requests || 0;
          totalErrors += snap.errors || 0;
        }
      }
      return Response.json({
        ok: true, keys, usage: usageBy, totals: { requests: totalRequests, errors: totalErrors },
        stale: true, message: 'Showing cached usage data — live analytics temporarily unavailable.',
      });
    }

    return Response.json({ ok: true, keys, usage: usageBy, totals: { requests: totalRequests, errors: totalErrors } });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
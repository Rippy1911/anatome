import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents } from "@/lib/format";

export default function AdminRevenue({ subscriptions, plans, loading }) {
  if (loading) return <div className="flex justify-center py-8"><div className="w-8 h-8 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" /></div>;

  const planMap = {};
  (plans || []).forEach((p) => { planMap[p.slug] = p; });

  const activeSubs = (subscriptions || []).filter((s) => s.status === "active");
  const totalMrr = activeSubs.reduce((sum, s) => sum + ((planMap[s.plan_slug] && planMap[s.plan_slug].monthly_price_cents) || 0), 0);

  const byPlan = {};
  activeSubs.forEach((s) => {
    const plan = planMap[s.plan_slug];
    if (!plan) return;
    if (!byPlan[s.plan_slug]) byPlan[s.plan_slug] = { name: plan.name, count: 0, mrr: 0 };
    byPlan[s.plan_slug].count++;
    byPlan[s.plan_slug].mrr += plan.monthly_price_cents;
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="py-4">
          <div className="text-xs text-muted-foreground mb-1">Total MRR</div>
          <div className="text-3xl font-bold">{formatCents(totalMrr)}</div>
          <div className="text-xs text-muted-foreground mt-1">{activeSubs.length} active subscriptions</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Revenue by plan</CardTitle></CardHeader>
        <CardContent className="p-0">
          {Object.keys(byPlan).length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No revenue data yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border"><th className="text-left py-2 px-4 font-medium">Plan</th><th className="text-right py-2 px-4 font-medium">Subscribers</th><th className="text-right py-2 px-4 font-medium">MRR</th></tr></thead>
              <tbody>
                {Object.entries(byPlan).map(([slug, d]) => (
                  <tr key={slug} className="border-b border-border/50">
                    <td className="py-2 px-4">{d.name}</td>
                    <td className="text-right py-2 px-4">{d.count}</td>
                    <td className="text-right py-2 px-4">{formatCents(d.mrr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
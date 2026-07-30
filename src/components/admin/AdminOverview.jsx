import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { formatNum, formatCents } from "@/lib/format";

export default function AdminOverview({ stats, loading, error, keys, subscriptions, plans }) {
  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error} />;

  const totals = (stats && stats.totals) || {};
  const activeKeys = (keys || []).filter((k) => k.status === "active");
  const payingSubs = (subscriptions || []).filter((s) => s.status === "active");
  const mrr = payingSubs.reduce((sum, s) => {
    const plan = (plans || []).find((p) => p.slug === s.plan_slug);
    return sum + ((plan && plan.monthly_price_cents) || 0);
  }, 0);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard label="Total requests (30d)" value={formatNum(totals.requests_30d || totals.requests || 0)} sub="approximate" />
      <StatCard label="Active keys" value={activeKeys.length} />
      <StatCard label="Paying customers" value={payingSubs.length} />
      <StatCard label="MRR" value={formatCents(mrr)} />
      <StatCard label="Error rate" value={(((stats && stats.error_rate) || 0) * 100).toFixed(1) + "%"} sub="approximate" />
      <StatCard label="Cache hit rate" value={(((stats && stats.cache_hit_rate) || 0) * 100).toFixed(1) + "%"} sub="approximate" />
    </div>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-xs text-muted-foreground mb-1">{label}</div>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">≈ {sub}</div>}
      </CardContent>
    </Card>
  );
}

function Spinner() {
  return <div className="flex justify-center py-8"><div className="w-8 h-8 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" /></div>;
}

function ErrorBox({ message }) {
  return <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{message || "Failed to load data."}</div>;
}
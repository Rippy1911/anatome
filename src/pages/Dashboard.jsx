import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyRound, Settings, BookOpen, TrendingUp, ArrowUpRight } from "lucide-react";
import { formatNum } from "@/lib/format";

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [usageResp, planData] = await Promise.all([
          base44.functions.invoke("getMyUsage", {}),
          base44.entities.Plan.list("sort_order", 100),
        ]);
        setData(usageResp.data);
        setPlans(planData || []);
        if (usageResp.data && usageResp.data.ok === false) setError(usageResp.data.message);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const planSlug = (user && (user.plan_slug || (user.data && user.data.plan_slug))) || "free";
  const currentPlan = plans.find((p) => p.slug === planSlug) || plans[0];
  const totals = (data && data.totals) || { requests: 0, errors: 0 };
  const keys = (data && data.keys) || [];
  const activeKeys = keys.filter((k) => k.status === "active");
  const includedRequests = (currentPlan && currentPlan.included_requests) || 1000;
  const usagePct = Math.min(100, (totals.requests / includedRequests) * 100);

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="font-display text-2xl font-bold tracking-tight mb-1">Dashboard</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Welcome back{user && user.full_name ? `, ${user.full_name}` : ""}.
      </p>

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">This month</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatNum(totals.requests)}</div>
            <div className="text-xs text-muted-foreground mt-1">of {formatNum(includedRequests)} included</div>
            <div className="mt-2 h-2 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: usagePct + "%" }} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active keys</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{activeKeys.length}</div>
            <div className="text-xs text-muted-foreground mt-1">{keys.length} total</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Current plan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{(currentPlan && currentPlan.name) || "Free"}</div>
            <Link to="/pricing" className="text-xs text-primary hover:underline mt-1 inline-block">Upgrade →</Link>
          </CardContent>
        </Card>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {data && data.stale && (
        <div className="mb-6 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-xs text-yellow-600 dark:text-yellow-400">
          {data.message}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link to="/keys" className="group">
          <Card className="hover:border-primary transition-colors">
            <CardContent className="flex items-center gap-3 py-4">
              <KeyRound className="w-5 h-5 text-primary" />
              <div>
                <div className="text-sm font-semibold">API Keys</div>
                <div className="text-xs text-muted-foreground">Create & manage</div>
              </div>
              <ArrowUpRight className="w-4 h-4 text-muted-foreground ml-auto group-hover:text-primary transition-colors" />
            </CardContent>
          </Card>
        </Link>
        <Link to="/account" className="group">
          <Card className="hover:border-primary transition-colors">
            <CardContent className="flex items-center gap-3 py-4">
              <Settings className="w-5 h-5 text-primary" />
              <div>
                <div className="text-sm font-semibold">Account</div>
                <div className="text-xs text-muted-foreground">Billing & profile</div>
              </div>
              <ArrowUpRight className="w-4 h-4 text-muted-foreground ml-auto group-hover:text-primary transition-colors" />
            </CardContent>
          </Card>
        </Link>
        <Link to="/pricing" className="group">
          <Card className="hover:border-primary transition-colors">
            <CardContent className="flex items-center gap-3 py-4">
              <TrendingUp className="w-5 h-5 text-primary" />
              <div>
                <div className="text-sm font-semibold">Pricing</div>
                <div className="text-xs text-muted-foreground">View plans</div>
              </div>
              <ArrowUpRight className="w-4 h-4 text-muted-foreground ml-auto group-hover:text-primary transition-colors" />
            </CardContent>
          </Card>
        </Link>
        <Link to="/docs" className="group">
          <Card className="hover:border-primary transition-colors">
            <CardContent className="flex items-center gap-3 py-4">
              <BookOpen className="w-5 h-5 text-primary" />
              <div>
                <div className="text-sm font-semibold">Docs</div>
                <div className="text-xs text-muted-foreground">API reference</div>
              </div>
              <ArrowUpRight className="w-4 h-4 text-muted-foreground ml-auto group-hover:text-primary transition-colors" />
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
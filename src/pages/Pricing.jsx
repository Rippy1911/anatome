import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Zap, Star, ExternalLink } from "lucide-react";
import { formatCents, formatNum, formatOverage } from "@/lib/format";

export default function Pricing() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(null);
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      try {
        const data = await base44.entities.Plan.list("sort_order", 100);
        setPlans((data || []).filter((p) => p.is_public !== false));
      } catch (e) {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSubscribe(slug) {
    if (!isAuthenticated) {
      base44.auth.redirectToLogin(window.location.href);
      return;
    }
    if (slug === "free") {
      window.location.href = "/dashboard";
      return;
    }
    try {
      setCheckoutLoading(slug);
      const resp = await base44.functions.invoke("createCheckoutSession", { plan_slug: slug });
      if (resp.data && resp.data.ok && resp.data.url) {
        window.location.href = resp.data.url;
      } else {
        toast({ title: "Checkout failed", description: (resp.data && resp.data.message) || "Please try again.", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setCheckoutLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const currentPlan = (user && (user.plan_slug || (user.data && user.data.plan_slug))) || null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="text-center mb-10">
        <h1 className="font-display text-3xl font-bold tracking-tight mb-3">Simple, transparent pricing</h1>
        <p className="text-sm text-muted-foreground max-w-xl mx-auto">
          Pick a plan that fits your usage. All plans include the full muscle visualizer API and exercise database.
          RapidAPI remains available as an alternative billing channel.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-3 mb-10">
        {plans.map((plan) => {
          const isCurrent = currentPlan === plan.slug;
          const isPopular = plan.slug === "starter";
          return (
            <Card key={plan.slug} className={isPopular ? "border-primary relative" : "relative"}>
              {isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full">Popular</span>
                </div>
              )}
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {plan.slug === "free" ? <Star className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                  {plan.name}
                </CardTitle>
                <CardDescription>
                  <span className="text-3xl font-bold text-foreground">{formatCents(plan.monthly_price_cents)}</span>
                  <span className="text-sm text-muted-foreground">/month</span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 mb-6 text-sm">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-primary shrink-0" />
                    {formatNum(plan.included_requests)} requests/month included
                  </li>
                  {plan.allow_overage ? (
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-primary shrink-0" />
                      {formatOverage(plan.overage_price_per_request_cents)} overage
                    </li>
                  ) : (
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-primary shrink-0" />
                      Hard stop at limit
                    </li>
                  )}
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-primary shrink-0" />
                    All API endpoints
                  </li>
                  {plan.slug !== "free" && (
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-primary shrink-0" />
                      Commercial use
                    </li>
                  )}
                </ul>
                <Button
                  className="w-full"
                  variant={plan.slug === "free" ? "outline" : "default"}
                  disabled={!!checkoutLoading || isCurrent}
                  onClick={() => handleSubscribe(plan.slug)}
                >
                  {isCurrent ? "Current plan" : checkoutLoading === plan.slug ? "Redirecting…" : plan.monthly_price_cents === 0 ? "Get started" : "Subscribe"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="rounded-lg border border-border bg-card p-6 mb-10">
        <h2 className="font-display text-lg font-bold tracking-tight mb-4">Feature comparison</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 font-medium">Feature</th>
                {plans.map((p) => (
                  <th key={p.slug} className="text-center py-2 font-medium">{p.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border">
                <td className="py-2 text-muted-foreground">Included requests/month</td>
                {plans.map((p) => <td key={p.slug} className="text-center py-2">{formatNum(p.included_requests)}</td>)}
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 text-muted-foreground">Overage</td>
                {plans.map((p) => <td key={p.slug} className="text-center py-2">{p.allow_overage ? formatOverage(p.overage_price_per_request_cents) : "—"}</td>)}
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 text-muted-foreground">Monthly price</td>
                {plans.map((p) => <td key={p.slug} className="text-center py-2">{formatCents(p.monthly_price_cents)}</td>)}
              </tr>
              <tr>
                <td className="py-2 text-muted-foreground">Commercial use</td>
                {plans.map((p) => <td key={p.slug} className="text-center py-2">{p.slug === "free" ? "—" : <Check className="w-4 h-4 text-primary mx-auto" />}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-6">
        <div className="flex items-start gap-3">
          <ExternalLink className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-sm mb-1">Prefer RapidAPI?</h3>
            <p className="text-sm text-muted-foreground">
              Anatome is also available on RapidAPI with the same API surface and pay-as-you-go billing.
              Use whichever channel works best for your workflow.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
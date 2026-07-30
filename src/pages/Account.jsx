import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, CreditCard, TrendingUp } from "lucide-react";
import { formatCents, formatNum, formatDate } from "@/lib/format";

export default function Account() {
  const { user } = useAuth();
  const [plans, setPlans] = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      try {
        const [planData, subs] = await Promise.all([
          base44.entities.Plan.list("sort_order", 100),
          base44.entities.Subscription.list("-created_date", 10),
        ]);
        setPlans(planData || []);
        setSubscription((subs || [])[0] || null);
      } catch (e) {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handlePortal() {
    try {
      setPortalLoading(true);
      const resp = await base44.functions.invoke("createPortalSession", {});
      if (resp.data && resp.data.ok && resp.data.url) {
        window.location.href = resp.data.url;
      } else {
        toast({ title: "Error", description: (resp.data && resp.data.message) || "Unable to open billing portal.", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setPortalLoading(false);
    }
  }

  if (loading) return <div className="max-w-3xl mx-auto px-4 py-16 flex justify-center"><div className="w-8 h-8 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" /></div>;

  const planSlug = (user && (user.plan_slug || (user.data && user.data.plan_slug))) || "free";
  const currentPlan = plans.find((p) => p.slug === planSlug);
  const stripeCustomerId = user && (user.stripe_customer_id || (user.data && user.data.stripe_customer_id));

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="font-display text-2xl font-bold tracking-tight mb-6">Account</h1>

      <Card className="mb-4">
        <CardHeader><CardTitle className="text-base">Profile</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span className="font-medium">{user && user.email}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span className="font-medium">{(user && user.full_name) || "—"}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Role</span><span className="font-medium">{user && user.role}</span></div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader><CardTitle className="text-base">Current plan</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold">{(currentPlan && currentPlan.name) || "Free"}</div>
              <div className="text-xs text-muted-foreground">{formatNum((currentPlan && currentPlan.included_requests) || 1000)} requests/month · {formatCents((currentPlan && currentPlan.monthly_price_cents) || 0)}/month</div>
            </div>
            <Link to="/pricing"><Button variant="outline" size="sm"><TrendingUp className="w-3.5 h-3.5 mr-1" /> Upgrade</Button></Link>
          </div>
          {subscription && (
            <div className="pt-3 border-t border-border text-sm space-y-1">
              <div className="flex justify-between items-center"><span className="text-muted-foreground">Status</span><Badge>{subscription.status}</Badge></div>
              {subscription.current_period_end && <div className="flex justify-between"><span className="text-muted-foreground">Renews</span><span>{formatDate(subscription.current_period_end)}</span></div>}
              {subscription.cancel_at_period_end && <div className="text-xs text-yellow-500">Cancels at period end</div>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Billing</CardTitle></CardHeader>
        <CardContent>
          {stripeCustomerId ? (
            <Button onClick={handlePortal} disabled={portalLoading} className="w-full">
              <CreditCard className="w-4 h-4 mr-2" />
              {portalLoading ? "Opening…" : "Manage billing in Stripe Portal"}
              <ExternalLink className="w-3.5 h-3.5 ml-2" />
            </Button>
          ) : (
            <div className="text-sm text-muted-foreground">
              You don't have a billing account yet. <Link to="/pricing" className="text-primary hover:underline">Subscribe to a plan →</Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
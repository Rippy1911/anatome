import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, RefreshCw, Trash2 } from "lucide-react";
import { formatDate } from "@/lib/format";

export default function KeyDetail() {
  const { keyId } = useParams();
  const [key, setKey] = useState(null);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      try {
        const keys = await base44.entities.ApiKey.filter({ key_id: keyId });
        if (!keys || keys.length === 0) {
          setError("Key not found");
          setLoading(false);
          return;
        }
        setKey(keys[0]);
        const usageResp = await base44.functions.invoke("getMyUsage", {});
        if (usageResp.data && usageResp.data.ok) {
          setUsage(usageResp.data.usage && usageResp.data.usage[keyId]);
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [keyId]);

  async function handleRevoke() {
    try {
      setActionLoading(true);
      const resp = await base44.functions.invoke("revokeApiKey", { key_id: keyId });
      if (resp.data && resp.data.ok) {
        toast({ title: "Key revoked" });
        const keys = await base44.entities.ApiKey.filter({ key_id: keyId });
        if (keys[0]) setKey(keys[0]);
      } else {
        toast({ title: "Error", description: resp.data && resp.data.message, variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRotate() {
    try {
      setActionLoading(true);
      const resp = await base44.functions.invoke("rotateApiKey", { key_id: keyId });
      if (resp.data && resp.data.ok) {
        toast({ title: "Key rotated", description: "Update your services with the new key." });
        const keys = await base44.entities.ApiKey.filter({ key_id: resp.data.key_id });
        if (keys[0]) setKey(keys[0]);
      } else {
        toast({ title: "Error", description: resp.data && resp.data.message, variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) return <div className="max-w-4xl mx-auto px-4 py-16 flex justify-center"><div className="w-8 h-8 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" /></div>;
  if (error) return <div className="max-w-4xl mx-auto px-4 py-16 text-center text-muted-foreground">{error}</div>;
  if (!key) return null;

  const series = (usage && usage.series) || [];
  const totals = (usage && usage.totals) || {};
  const maxReq = Math.max.apply(null, series.length ? series.map(s => s.requests || 0) : [1]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <Link to="/keys" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to keys
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight font-mono">{key.prefix}…</h1>
          <p className="text-sm text-muted-foreground mt-1">{key.name} · {key.plan_slug}</p>
        </div>
        <Badge>{key.status}</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <Card><CardContent className="py-4"><div className="text-xs text-muted-foreground mb-1">Requests (this period) {usage && usage.cached ? "≈" : ""}</div><div className="text-2xl font-bold">{totals.requests || 0}</div></CardContent></Card>
        <Card><CardContent className="py-4"><div className="text-xs text-muted-foreground mb-1">Errors</div><div className="text-2xl font-bold">{totals.errors || 0}</div></CardContent></Card>
        <Card><CardContent className="py-4"><div className="text-xs text-muted-foreground mb-1">Created</div><div className="text-sm font-medium pt-1">{formatDate(key.created_date)}</div></CardContent></Card>
      </div>

      {usage && usage.cached && <div className="mb-4 text-xs text-muted-foreground">⚠ Cached data — last fetched {formatDate(usage.fetched_at)}</div>}

      {key.status !== "revoked" && (
        <div className="flex gap-2 mb-6">
          <Button variant="outline" onClick={handleRotate} disabled={actionLoading}><RefreshCw className="w-4 h-4 mr-1" /> Rotate</Button>
          <Button variant="destructive" onClick={handleRevoke} disabled={actionLoading}><Trash2 className="w-4 h-4 mr-1" /> Revoke</Button>
        </div>
      )}

      {series.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Daily usage {usage && usage.cached ? "≈" : ""}</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1">
              {series.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="w-20 text-muted-foreground shrink-0">{formatDate(s.ts)}</span>
                  <div className="flex-1 h-4 bg-secondary rounded overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: Math.min(100, ((s.requests || 0) / maxReq) * 100) + "%" }} />
                  </div>
                  <span className="w-16 text-right">{s.requests || 0}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
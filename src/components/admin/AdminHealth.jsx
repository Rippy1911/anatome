import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNum } from "@/lib/format";

export default function AdminHealth({ stats, loading, error }) {
  if (loading) return <div className="flex justify-center py-8"><div className="w-8 h-8 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" /></div>;
  if (error) return <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>;
  if (!stats) return <div className="rounded-lg border border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">Health data will appear here once the API gateway is operational.</div>;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-4">
        <Card><CardContent className="py-4"><div className="text-xs text-muted-foreground mb-1">p50 latency</div><div className="text-2xl font-bold">{Math.round(stats.p50_ms || 0)}ms</div></CardContent></Card>
        <Card><CardContent className="py-4"><div className="text-xs text-muted-foreground mb-1">p95 latency</div><div className="text-2xl font-bold">{Math.round(stats.p95_ms || 0)}ms</div></CardContent></Card>
        <Card><CardContent className="py-4"><div className="text-xs text-muted-foreground mb-1">Rate-limit rejections</div><div className="text-2xl font-bold">{formatNum(stats.rate_limit_rejections || 0)}</div></CardContent></Card>
        <Card><CardContent className="py-4"><div className="text-xs text-muted-foreground mb-1">Error rate</div><div className="text-2xl font-bold">{((stats.error_rate || 0) * 100).toFixed(1)}%</div></CardContent></Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quota exhaustions <span className="text-xs text-muted-foreground font-normal ml-2">≈</span></CardTitle>
        </CardHeader>
        <CardContent>
          {(stats.quota_exhaustions || []).length === 0 ? (
            <div className="text-sm text-muted-foreground py-4">No quota exhaustion events.</div>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border"><th className="text-left py-2 font-medium">Key</th><th className="text-right py-2 font-medium">Count</th></tr></thead>
              <tbody>
                {(stats.quota_exhaustions || []).map((q, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-2 font-mono text-xs">{q.key_id || q.key || "—"}</td>
                    <td className="text-right py-2">{q.count || q.requests || 0}</td>
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
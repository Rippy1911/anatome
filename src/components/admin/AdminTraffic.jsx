import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNum } from "@/lib/format";

export default function AdminTraffic({ stats, loading, error, timeRange, onTimeRangeChange }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {["7d", "30d", "all"].map((r) => (
          <button
            key={r}
            onClick={() => onTimeRangeChange(r)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${timeRange === r ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {r === "7d" ? "Last 7 days" : r === "30d" ? "Last 30 days" : "All time"}
          </button>
        ))}
      </div>
      {loading ? (
        <Spinner />
      ) : error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      ) : !stats ? (
        <EmptyState />
      ) : (
        <div className="space-y-6">
          <TableCard title="By endpoint" approx rows={stats.by_endpoint || []} labelKey="endpoint" valueKey="requests" />
          <TableCard title="By referrer" approx rows={stats.by_referrer || []} labelKey="referrer" valueKey="requests" />
          <TableCard title="By country" approx rows={stats.by_country || []} labelKey="country" valueKey="requests" />
        </div>
      )}
    </div>
  );
}

function TableCard({ title, approx, rows, labelKey, valueKey }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {title}
          {approx && <span className="text-xs text-muted-foreground font-normal ml-2">≈ approximate</span>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4">No data yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 font-medium">{title.replace("By ", "")}</th>
                <th className="text-right py-2 font-medium">Requests</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-border/50">
                  <td className="py-2 font-mono text-xs">{r[labelKey] || r.host || r.path || r.code || "—"}</td>
                  <td className="text-right py-2">{formatNum(r[valueKey] || r.count || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function Spinner() {
  return <div className="flex justify-center py-8"><div className="w-8 h-8 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" /></div>;
}

function EmptyState() {
  return <div className="rounded-lg border border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">Analytics data will appear here once the API gateway is operational.</div>;
}
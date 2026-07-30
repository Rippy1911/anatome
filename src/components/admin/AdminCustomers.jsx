import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { formatDate } from "@/lib/format";

export default function AdminCustomers({ stats, keys, plans, loading }) {
  if (loading) return <div className="flex justify-center py-8"><div className="w-8 h-8 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" /></div>;

  return (
    <Card>
      <CardContent className="p-0">
        {(!keys || keys.length === 0) ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No customers yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 font-medium">Key</th>
                  <th className="text-left py-3 px-4 font-medium">Plan</th>
                  <th className="text-left py-3 px-4 font-medium">Status</th>
                  <th className="text-left py-3 px-4 font-medium">Created</th>
                  <th className="text-right py-3 px-4 font-medium">Requests (30d) ≈</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => {
                  const keyStat = ((stats && stats.by_key) || []).find((s) => s.key_id === k.key_id);
                  return (
                    <tr key={k.id} className="border-b border-border/50">
                      <td className="py-3 px-4">
                        <Link to={`/keys/${k.key_id}`} className="font-mono text-xs hover:text-primary">{k.prefix}…</Link>
                        <div className="text-xs text-muted-foreground">{k.name}</div>
                      </td>
                      <td className="py-3 px-4">{k.plan_slug}</td>
                      <td className="py-3 px-4"><Badge>{k.status}</Badge></td>
                      <td className="py-3 px-4 text-xs text-muted-foreground">{formatDate(k.created_date)}</td>
                      <td className="py-3 px-4 text-right">{(keyStat && keyStat.requests) || 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, RefreshCw, Trash2, Copy, AlertTriangle, KeyRound } from "lucide-react";
import { formatDate } from "@/lib/format";

export default function Keys() {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [plaintextKey, setPlaintextKey] = useState(null);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [revoking, setRevoking] = useState(false);
  const [rotatingTarget, setRotatingTarget] = useState(null);
  const [rotating, setRotating] = useState(false);
  const { toast } = useToast();

  const loadKeys = useCallback(async () => {
    try {
      const data = await base44.entities.ApiKey.list("-created_date", 100);
      setKeys(data || []);
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  async function handleCreate() {
    try {
      setCreating(true);
      const resp = await base44.functions.invoke("issueApiKey", { name: newKeyName || "default" });
      if (resp.data && resp.data.ok && resp.data.plaintext_key) {
        setPlaintextKey({ key: resp.data.plaintext_key, key_id: resp.data.key_id, prefix: resp.data.prefix, warning: resp.data.warning });
        setCreateOpen(false);
        setNewKeyName("");
        await loadKeys();
      } else {
        toast({ title: "Error", description: (resp.data && resp.data.message) || "Failed to create key", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  async function handleRotate() {
    if (!rotatingTarget) return;
    try {
      setRotating(true);
      const resp = await base44.functions.invoke("rotateApiKey", { key_id: rotatingTarget.key_id });
      if (resp.data && resp.data.ok && resp.data.plaintext_key) {
        setPlaintextKey({ key: resp.data.plaintext_key, key_id: resp.data.key_id, prefix: resp.data.prefix });
        setRotatingTarget(null);
        await loadKeys();
        toast({ title: "Key rotated", description: "The old key has been revoked." });
      } else {
        toast({ title: "Error", description: (resp.data && resp.data.message) || "Failed to rotate key", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setRotating(false);
    }
  }

  async function handleRevoke() {
    if (!revokeTarget) return;
    try {
      setRevoking(true);
      const resp = await base44.functions.invoke("revokeApiKey", { key_id: revokeTarget.key_id });
      if (resp.data && resp.data.ok) {
        setRevokeTarget(null);
        await loadKeys();
        toast({ title: "Key revoked", description: "The key can no longer be used." });
      } else {
        toast({ title: "Error", description: (resp.data && resp.data.message) || "Failed to revoke key", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setRevoking(false);
    }
  }

  function copyKey(key) {
    navigator.clipboard.writeText(key);
    toast({ title: "Copied", description: "API key copied to clipboard." });
  }

  const statusVariant = { active: "default", revoked: "secondary", suspended: "outline", pending_sync: "outline" };

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">API Keys</h1>
          <p className="text-sm text-muted-foreground mt-1">Create and manage your API keys.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> Create key
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : keys.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <KeyRound className="w-10 h-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground mb-4">No API keys yet. Create your first key to start using the API.</p>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> Create key
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {keys.map((key) => (
            <Card key={key.id} className={key.status === "revoked" ? "opacity-60" : ""}>
              <CardContent className="flex items-center gap-4 py-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm font-medium">{key.prefix}…</span>
                    <Badge variant={statusVariant[key.status] || "secondary"}>{key.status}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {key.name} · {key.plan_slug} · created {formatDate(key.created_date)}
                    {key.last_used_at ? ` · last used ${formatDate(key.last_used_at)}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link to={`/keys/${key.key_id}`}>
                    <Button variant="ghost" size="sm">Details</Button>
                  </Link>
                  {key.status !== "revoked" && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => setRotatingTarget(key)}>
                        <RefreshCw className="w-3.5 h-3.5 mr-1" /> Rotate
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setRevokeTarget(key)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create new API key</DialogTitle>
            <DialogDescription>Give your key a name to identify it later.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="key-name" className="mb-2 block">Key name</Label>
            <Input id="key-name" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder="e.g. production" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating}>{creating ? "Creating…" : "Create key"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!plaintextKey} onOpenChange={(open) => { if (!open) setPlaintextKey(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              Save your API key
            </DialogTitle>
            <DialogDescription>
              This is the only time you'll see the full key. Copy it now — you won't be able to retrieve it later.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3">
              <code className="flex-1 text-sm font-mono break-all">{plaintextKey && plaintextKey.key}</code>
              <Button size="sm" variant="outline" onClick={() => copyKey(plaintextKey && plaintextKey.key)}>
                <Copy className="w-3.5 h-3.5 mr-1" /> Copy
              </Button>
            </div>
            {plaintextKey && plaintextKey.warning && (
              <p className="text-xs text-yellow-500 mt-3">{plaintextKey.warning}</p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setPlaintextKey(null)}>I've saved it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rotatingTarget} onOpenChange={(open) => { if (!open) setRotatingTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rotate key {rotatingTarget && rotatingTarget.prefix}…?</DialogTitle>
            <DialogDescription>
              A new key will be issued and the old one will be immediately revoked.
              You'll need to update any services using the old key.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRotatingTarget(null)}>Cancel</Button>
            <Button onClick={handleRotate} disabled={rotating}>{rotating ? "Rotating…" : "Rotate key"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!revokeTarget} onOpenChange={(open) => { if (!open) setRevokeTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke key {revokeTarget && revokeTarget.prefix}…?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. Any service using this key will stop working immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRevoke} disabled={revoking}>{revoking ? "Revoking…" : "Revoke key"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
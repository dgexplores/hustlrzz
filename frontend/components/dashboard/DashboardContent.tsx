"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export function DashboardContent() {
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<{ data: any[] }>("/workflows").catch((e) => ({ data: [], error: e.message })),
      api<{ data: any[] }>("/interviews").catch(() => ({ data: [] })),
    ]).then(([w, s]: any[]) => {
      setWorkflows(w.data || []);
      setSessions(s.data || []);
      setError(w.error || null);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="p-16 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {error && <p className="text-sm text-amber-600">{error}</p>}
      <section>
        <h2 className="text-xl font-semibold mb-4">Prepared packs</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {workflows.length === 0 && <p className="text-sm text-muted-foreground">No prepared packs yet — go to Prepare.</p>}
          {workflows.map((w) => (
            <Card key={w.workflow_id}>
              <CardHeader>
                <CardTitle className="text-sm capitalize">{w.title || "Role"}</CardTitle>
                <p className="text-xs text-muted-foreground">{w.workflow_id}</p>
                <p className="text-sm">{w.match?.overall_match_percent != null ? `${w.match.overall_match_percent}% match` : ""}</p>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{w.questions?.length ?? 0} questions · {w.answers?.length ?? 0} answers</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">Interview history</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sessions.length === 0 && <p className="text-sm text-muted-foreground">No sessions yet.</p>}
          {sessions.map((s) => (
            <Card key={s.session_id}>
              <CardHeader>
                <CardTitle className="text-sm">Session {s.session_id.slice(0, 8)}</CardTitle>
                <p className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString()}</p>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">{s.is_audio ? "audio" : "text"} · {s.transcript?.length ?? 0} transcript lines</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpenCheck, Clock3, FileText, Loader2, Target } from "lucide-react";

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
      <section className="max-w-2xl"><p className="text-sm font-semibold text-primary">Practice history</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">See the evidence behind your progress.</h1><p className="mt-2 text-muted-foreground">Prepared packs and interview reports stay together so you can pick a specific focus for the next session.</p></section>
      {error && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}
      <section>
        <div className="mb-4 flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /><h2 className="text-xl font-semibold">Prepared packs</h2></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {workflows.length === 0 && <p className="text-sm text-muted-foreground">No prepared packs yet — go to Prepare.</p>}
          {workflows.map((w) => (
            <Card key={w.workflow_id} className="surface-transition hover:border-primary/30">
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
        <div className="mb-4 flex items-center gap-2"><BookOpenCheck className="h-5 w-5 text-primary" /><h2 className="text-xl font-semibold">Interview history</h2></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sessions.length === 0 && <p className="text-sm text-muted-foreground">No sessions yet.</p>}
          {sessions.map((s) => (
            <Card key={s.session_id} className="surface-transition hover:border-primary/30">
              <CardHeader>
                <CardTitle className="text-sm">Session {s.session_id.slice(0, 8)}</CardTitle>
                <p className="flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />{new Date(s.created_at).toLocaleString()}</p>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">{s.is_audio ? "audio" : "text"} · {s.transcript?.length ?? 0} transcript lines</p>
                {s.report?.scores && <div className="mt-3 flex flex-wrap gap-2">{Object.entries(s.report.scores).slice(0, 3).map(([label, score]) => <span key={label} className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs"><Target className="h-3 w-3 text-primary" />{label.replace(/_/g, " ")}: {String(score)}</span>)}</div>}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

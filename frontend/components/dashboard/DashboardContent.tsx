"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, BookOpenCheck, Clock3, FileText, Loader2, Target } from "lucide-react";

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

  if (loading) return <div className="p-16 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-10">
      <section className="motion-enter grid gap-4 border-b border-foreground/20 pb-7 md:grid-cols-[90px_1fr_auto] md:items-end"><p className="font-mono text-sm font-semibold text-primary">04 / REVIEW</p><div className="max-w-2xl"><h1 className="font-display text-4xl font-semibold leading-tight tracking-tight md:text-5xl">See the evidence behind your progress.</h1><p className="mt-3 text-muted-foreground">Prepared packs and interview reports stay together so the next session starts with a specific focus.</p></div><Link href="/interview" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline">Start next rehearsal <ArrowRight className="h-4 w-4" /></Link></section>
      {error && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-foreground">{error}</p>}
      <section>
        <div className="mb-4 flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /><h2 className="text-xl font-semibold">Prepared packs</h2></div>
        <div className="divide-y divide-foreground/15 border-y border-foreground/20">
          {workflows.length === 0 && <p className="text-sm text-muted-foreground">No prepared packs yet — go to Prepare.</p>}
          {workflows.map((w) => (
            <Card key={w.workflow_id} className="grid rounded-none border-0 bg-transparent shadow-none surface-transition hover:bg-accent/45 md:grid-cols-[1fr_auto]">
              <CardHeader className="py-5">
                <CardTitle className="text-sm capitalize">{w.title || "Role"}</CardTitle>
                <p className="text-xs text-muted-foreground">{w.workflow_id}</p>
                <p className="text-sm">{w.match?.overall_match_percent != null ? `${w.match.overall_match_percent}% match` : ""}</p>
              </CardHeader>
              <CardContent className="flex items-center pb-5 md:p-5">
                <p className="text-sm">{w.questions?.length ?? 0} questions · {w.answers?.length ?? 0} answers</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center gap-2"><BookOpenCheck className="h-5 w-5 text-primary" /><h2 className="text-xl font-semibold">Interview history</h2></div>
        <div className="divide-y divide-foreground/15 border-y border-foreground/20">
          {sessions.length === 0 && <p className="text-sm text-muted-foreground">No sessions yet.</p>}
          {sessions.map((s) => (
            <Card key={s.session_id} className="grid rounded-none border-0 bg-transparent shadow-none surface-transition hover:bg-accent/45 md:grid-cols-[1fr_auto]">
              <CardHeader className="py-5">
                <CardTitle className="text-sm">Session {s.session_id.slice(0, 8)}</CardTitle>
                <p className="flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />{new Date(s.created_at).toLocaleString()}</p>
              </CardHeader>
              <CardContent className="pb-5 md:p-5">
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

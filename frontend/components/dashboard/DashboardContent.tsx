"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { downloadJson } from "@/lib/download";
import { Button } from "@/components/ui/button";
import {
  ArrowRight, BookOpenCheck, ChevronDown, ClipboardList, Download, FileText,
  Loader2, Target, MessageSquareText, Sparkles,
} from "lucide-react";

export function DashboardContent() {
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [memory, setMemory] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openWorkflow, setOpenWorkflow] = useState<string | null>(null);
  const [openSession, setOpenSession] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<{ data: any[] }>("/workflows").catch((e) => ({ data: [], error: e.message })),
      api<{ data: any[] }>("/interviews").catch(() => ({ data: [] })),
      api<{ data: any[] }>("/assessment/attempts").catch(() => ({ data: [] })),
      api<{ data: any }>("/memory/profile").catch(() => ({ data: null })),
    ]).then(([w, s, a, m]: any[]) => {
      setWorkflows(w.data || []);
      setSessions(s.data || []);
      setAttempts(a.data || []);
      setMemory(m.data || null);
      setError(w.error || null);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="p-16 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-10">
      <section className="motion-enter flex flex-col gap-5 pb-2 md:flex-row md:items-end md:justify-between"><div className="max-w-2xl"><h1 className="text-4xl font-semibold leading-[1.08] tracking-[-0.04em] md:text-5xl">Track what is improving.</h1><p className="mt-4 text-muted-foreground">Your packs and interviews in one place — clear next step, no clutter.</p></div><Link href="/interview" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">Start an interview <ArrowRight className="h-4 w-4" /></Link></section>
      {!loading && (
        <div className="rounded-2xl border bg-primary/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              {workflows.length === 0 ? "Next: Prepare your first pack" : sessions.length === 0 ? "Next: Practice your pack" : "Next: Keep practicing to grow your trajectory"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {workflows.length === 0 ? "It takes 1 minute — paste resume + JD." : sessions.length === 0 ? `You have ${workflows.length} pack${workflows.length>1?"s": ""} ready.` : `You’ve done ${sessions.length} session${sessions.length>1?"s": ""} — check your trajectory above.`}
            </p>
          </div>
          <Link href={workflows.length === 0 ? "/prepare" : "/interview"}><Button size="sm">{workflows.length === 0 ? "Go to Prepare" : "Go to Practice"} <ArrowRight className="h-4 w-4" /></Button></Link>
        </div>
      )}
      {error && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-foreground">{error}</p>}

      {(memory?.digest?.summary || memory?.trends?.length > 0) && (
        <section className="rounded-2xl border bg-card p-6">
          <div className="flex items-center gap-2 mb-4"><Target className="h-5 w-5 text-primary" /><h2 className="text-xl font-semibold">Your trajectory</h2></div>
          {memory.digest?.weak?.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Focus next</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {memory.digest.weak.map((w: string) => <span key={w} className="rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 px-3 py-1 text-xs font-semibold">{w}</span>)}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Recent sessions weigh more (decay 0.85). Next practice will bias 40% to these.</p>
            </div>
          )}
          {memory.schedule?.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Spaced repetition — due soon</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {memory.schedule.map((s: any) => <div key={s.skill} className="rounded-lg border bg-secondary/30 p-3"><p className="text-sm font-medium">{s.skill}</p><p className="text-xs text-muted-foreground">due in {s.due_in_days}d</p></div>)}
              </div>
            </div>
          )}
          {memory.trends?.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Score over time</p>
              <div className="mt-3 flex items-end gap-1.5 h-24">
                {memory.trends.map((t: any, i: number) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full rounded-t bg-primary" style={{ height: `${Math.max(8, Math.min(96, t.score))}%`, opacity: 0.6 + (i / memory.trends.length) * 0.4 }} title={`${t.date} ${t.score}% ${t.label}`} />
                    <span className="text-[10px] text-muted-foreground">{t.date.slice(5)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-2 text-xs text-muted-foreground">
                {memory.trends.slice(-3).map((t: any) => <span key={t.date + t.score}>{t.date}: {t.score}% ({t.type})</span>)}
              </div>
            </div>
          )}
          {!memory.digest?.weak?.length && !memory.trends?.length && <p className="text-sm text-muted-foreground">Do a Prepare + Practice to see your trajectory. Memory builds after 2 sessions.</p>}
        </section>
      )}

      <section>
        <div className="mb-4 flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /><h2 className="text-xl font-semibold">Prepared packs</h2></div>
        <div className="divide-y divide-foreground/15 border-y border-foreground/20">
          {workflows.length === 0 && <p className="py-3 text-sm text-muted-foreground">No prepared packs yet. Start in Prepare.</p>}
          {workflows.map((w) => {
            const open = openWorkflow === w.workflow_id;
            return (
              <div key={w.workflow_id}>
                <button
                  type="button"
                  onClick={() => setOpenWorkflow(open ? null : w.workflow_id)}
                  aria-expanded={open}
                  className="grid w-full grid-cols-[1fr_auto] gap-2 px-1 py-4 text-left surface-transition hover:bg-accent/45"
                >
                  <span>
                    <span className="block text-sm font-semibold">{w.company ? `${w.company}: ` : ""}{w.title || "Prepared interview"}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{new Date(w.created_at).toLocaleString()} · {w.questions?.length ?? 0} questions</span>
                    <span className="mt-1 block text-sm">{w.match?.overall_match_percent != null ? `${w.match.overall_match_percent}% match` : ""}</span>
                  </span>
                  <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
                </button>
                {open && (
                  <div className="mb-4 space-y-3 rounded-xl border bg-card p-4">
                    {(w.match?.summary || w.match?.matched_skills?.length > 0 || w.match?.gap_skills?.length > 0) && (
                      <div>
                        {w.match?.summary && <p className="text-sm leading-6 text-muted-foreground">{w.match.summary}</p>}
                        {w.match?.matched_skills?.length > 0 && <p className="mt-2 text-sm"><span className="font-semibold">Strengths:</span> <span className="text-emerald-600 dark:text-emerald-400">{w.match.matched_skills.join(", ")}</span></p>}
                        {w.match?.gap_skills?.length > 0 && <p className="mt-1 text-sm"><span className="font-semibold">Gaps:</span> <span className="text-amber-600 dark:text-amber-400">{w.match.gap_skills.join(", ")}</span></p>}
                      </div>
                    )}
                    <details>
                      <summary className="cursor-pointer text-sm font-semibold">Question pack ({w.questions?.length ?? 0})</summary>
                      <ol className="mt-3 max-h-64 space-y-2 overflow-auto pr-1">
                        {(w.questions || []).slice(0, 20).map((q: any, index: number) => (
                          <li key={index} className="rounded-lg border p-2.5 text-sm">
                            <span className="mr-1 font-semibold text-muted-foreground">{index + 1}.</span>{q.question}
                          </li>
                        ))}
                      </ol>
                    </details>
                    <Link href="/interview" className="inline-block text-sm font-semibold text-primary hover:underline">Practice this pack →</Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center gap-2"><BookOpenCheck className="h-5 w-5 text-primary" /><h2 className="text-xl font-semibold">Interview history</h2></div>
        <div className="divide-y divide-foreground/15 border-y border-foreground/20">
          {sessions.length === 0 && <p className="py-3 text-sm text-muted-foreground">No sessions yet.</p>}
          {sessions.map((s) => {
            const open = openSession === s.session_id;
            return (
              <div key={s.session_id}>
                <button
                  type="button"
                  onClick={() => setOpenSession(open ? null : s.session_id)}
                  aria-expanded={open}
                  className="grid w-full grid-cols-[1fr_auto] gap-2 px-1 py-4 text-left surface-transition hover:bg-accent/45"
                >
                  <span>
                    <span className="block text-sm font-semibold">Session · {new Date(s.created_at).toLocaleString()}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{s.is_audio ? "voice" : "typed"} · {s.transcript?.length ?? 0} transcript lines{s.duration_seconds ? ` · ${Math.round(s.duration_seconds / 60)} min` : ""}</span>
                    {s.report?.scores && (
                      <span className="mt-2 flex flex-wrap gap-2">
                        {Object.entries(s.report.scores).slice(0, 4).map(([label, score]) => (
                          <span key={label} className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs"><Target className="h-3 w-3 text-primary" />{label.replace(/_/g, " ")}: {String(score)}</span>
                        ))}
                      </span>
                    )}
                  </span>
                  <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
                </button>
                {open && s.report && (
                  <div className="mb-4 space-y-3 rounded-xl border bg-card p-4">
                    {s.report.verdict && <p className="rounded-lg border bg-secondary/30 p-3 text-sm"><span className="font-semibold">Verdict:</span> {s.report.verdict}</p>}
                    {s.report.summary && <p className="flex gap-2 text-sm leading-6 text-muted-foreground"><MessageSquareText className="mt-1 h-4 w-4 shrink-0 text-primary" />{s.report.summary}</p>}
                    <div className="grid gap-3 sm:grid-cols-2">
                      {(s.report.strengths?.length ?? 0) > 0 && (
                        <div><p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400"><Sparkles className="h-3.5 w-3.5" />What worked</p><ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-muted-foreground">{s.report.strengths.slice(0, 4).map((item: string, index: number) => <li key={index}>{item}</li>)}</ul></div>
                      )}
                      {(s.report.improvements?.length ?? 0) > 0 && (
                        <div><p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400"><Target className="h-3.5 w-3.5" />Improve next</p><ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-muted-foreground">{s.report.improvements.slice(0, 4).map((item: string, index: number) => <li key={index}>{item}</li>)}</ul></div>
                      )}
                    </div>
                    <Button size="sm" variant="outline" onClick={() => downloadJson(`hustlrzz-session-${s.session_id.slice(0, 8)}.json`, s)}>
                      <Download className="h-3.5 w-3.5" />Export session
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
      {attempts.length > 0 && (
        <section>
          <div className="mb-4 flex items-center gap-2"><ClipboardList className="h-5 w-5 text-primary" /><h2 className="text-xl font-semibold">Assessment attempts</h2></div>
          <div className="grid gap-2 sm:grid-cols-2">
            {attempts.slice(0, 6).map((row) => (
              <div key={row.attempt_id} className="rounded-xl border p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-semibold">{row.role}{row.company ? ` · ${row.company}` : ""}</p>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${Number(row.total_percent) >= 70 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : Number(row.total_percent) >= 50 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-red-500/10 text-red-600 dark:text-red-400"}`}>{Number(row.total_percent)}%</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{row.band || "in progress"} · {row.level}{row.created_at ? ` · ${new Date(row.created_at).toLocaleDateString()}` : ""}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

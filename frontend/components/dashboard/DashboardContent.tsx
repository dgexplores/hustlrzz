"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { downloadJson } from "@/lib/download";
import { Button } from "@/components/ui/button";
import {
  ArrowRight, BookOpenCheck, Check, ChevronDown, ClipboardList, Download, FileText,
  Loader2, RotateCcw, Target, MessageSquareText, Sparkles, Trash2,
} from "lucide-react";

/** Server due_at is schedule truth (T9); label due-now vs overdue. */
function dueLabel(item: { due_at?: string; due_in_days?: number }): string {
  const ts = item?.due_at ? Date.parse(item.due_at) : NaN;
  if (Number.isNaN(ts)) {
    return typeof item?.due_in_days === "number" ? `due in ${item.due_in_days}d` : "due now";
  }
  const overdueDays = Math.floor((Date.now() - ts) / 86_400_000);
  return overdueDays >= 1 ? `overdue by ${overdueDays}d` : "due now";
}

export function DashboardContent() {
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [memory, setMemory] = useState<any>(null);
  const [drills, setDrills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedErrors, setFeedErrors] = useState<string[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [openWorkflow, setOpenWorkflow] = useState<string | null>(null);
  const [openSession, setOpenSession] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);

  const reviewDrill = async (skill: string, result: "good" | "again") => {
    if (reviewing) return;
    setReviewing(skill);
    try {
      await api(`/memory/drills/${encodeURIComponent(skill)}/review`, {
        method: "POST",
        body: JSON.stringify({ result }),
      });
      const refreshed = await api<{ data: any[] }>("/memory/drills").catch(() => ({ data: [] as any[] }));
      setDrills(refreshed.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that review");
    } finally {
      setReviewing(null);
    }
  };

  const formatDateTime = (value?: string) => {
    if (!value) return "Unknown date";
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? "Unknown date" : new Date(value).toLocaleString();
  };

  const deleteWorkflow = async (w: any) => {
    if (deletingId) return;
    const label = w.company ? `${w.company}: ${w.title || "pack"}` : w.title || "this pack";
    if (!window.confirm(`Delete “${label}”? This cannot be undone.`)) return;
    setDeletingId(w.workflow_id);
    setError(null);
    try {
      await api<void>(`/workflows/${encodeURIComponent(w.workflow_id)}`, { method: "DELETE" });
      setWorkflows((prev) => prev.filter((x) => x.workflow_id !== w.workflow_id));
      if (openWorkflow === w.workflow_id) setOpenWorkflow(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  const deleteSession = async (s: any) => {
    if (deletingId) return;
    if (!window.confirm(`Delete this interview session from ${formatDateTime(s.created_at)}? This cannot be undone.`)) return;
    setDeletingId(s.session_id);
    setError(null);
    try {
      await api<void>(`/interviews/${encodeURIComponent(s.session_id)}`, { method: "DELETE" });
      setSessions((prev) => prev.filter((x) => x.session_id !== s.session_id));
      if (openSession === s.session_id) setOpenSession(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    setLoading(true);
    setFeedErrors([]);
    Promise.all([
      api<{ data: any[] }>("/workflows").catch((e) => ({ data: [], error: e.message })),
      api<{ data: any[] }>("/interviews").catch(() => ({ data: [], error: "Interview history" })),
      api<{ data: any[] }>("/assessment/attempts").catch(() => ({ data: [], error: "Assessment history" })),
      api<{ data: any }>("/memory/profile").catch(() => ({ data: null, error: "Memory trajectory" })),
      api<{ data: any[] }>("/memory/drills").catch(() => ({ data: [], error: "Practice drills" })),
    ]).then(([w, s, a, m, d]: any[]) => {
      setWorkflows(w.data || []);
      setSessions(s.data || []);
      setAttempts(a.data || []);
      setMemory(m.data || null);
      setDrills(d.data || []);
      setError(w.error && typeof w.error === "string" ? w.error : null);
      setFeedErrors([s, a, m, d].map((f) => f.error).filter((e) => typeof e === "string"));
      setLoading(false);
    });
  }, [reloadKey]);

  if (loading) return <div className="p-16 flex justify-center" role="status" aria-label="Loading dashboard"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /><span className="sr-only">Loading dashboard…</span></div>;

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
      {feedErrors.length > 0 && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-foreground">
          Some sections could not load ({feedErrors.join(", ")}).{" "}
          <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="font-semibold underline underline-offset-2">Retry</button>
        </p>
      )}

      {(memory?.digest?.summary || memory?.trends?.length > 0 || drills.length > 0) && (
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
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Spaced repetition — due now</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {memory.schedule.map((s: any, i: number) => <div key={`${s.skill}-${s.due_at ?? s.due_in_days}-${i}`} className="rounded-lg border bg-secondary/30 p-3"><p className="text-sm font-medium">{s.skill}</p><p className="text-xs text-muted-foreground">{dueLabel(s)}</p></div>)}
              </div>
            </div>
          )}
          {drills.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Due practice — one tap to start</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {drills.map((d: any, i: number) => (
                  <div key={`${d.skill}-${d.due_at ?? d.due_in_days}-${i}`} className="rounded-lg border border-primary/25 bg-primary/5 p-3">
                    <p className="text-sm font-medium">{d.skill} <span className="font-normal text-muted-foreground">· {dueLabel(d)}</span></p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{d.drill?.tip}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        className="h-10 px-3 text-xs"
                        disabled={reviewing != null}
                        onClick={() => reviewDrill(d.skill, "good")}
                        aria-label={`Mark ${d.skill} complete`}
                      >
                        {reviewing === d.skill ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        Complete
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-10 px-3 text-xs"
                        disabled={reviewing != null}
                        onClick={() => reviewDrill(d.skill, "again")}
                        aria-label={`Mark ${d.skill} again`}
                      >
                        {reviewing === d.skill ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                        Again
                      </Button>
                      <Link
                        href="/coaching"
                        onClick={() => {
                          try {
                            localStorage.setItem("hustlrzz-drill-v1", JSON.stringify({
                              scenario: d.drill?.scenario || "behavioral",
                              prompt: d.drill?.prompt || "",
                            }));
                          } catch { /* private mode */ }
                        }}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                      >
                        Practice this <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {memory.trends?.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Score over time</p>
              <div className="mt-3 flex items-end gap-1.5 h-24">
                {memory.trends.map((t: any, i: number) => (
                  <div key={`${t.date}-${t.score}-${i}`} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full rounded-t bg-primary" style={{ height: `${Math.max(8, Math.min(96, Number(t.score) || 0))}%`, opacity: 0.6 + (i / memory.trends.length) * 0.4 }} title={`${t.date ?? "Unknown date"} ${t.score ?? "—"}% ${t.label ?? ""}`} />
                    <span className="text-[10px] text-muted-foreground">{typeof t.date === "string" ? t.date.slice(5) : "—"}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-2 text-xs text-muted-foreground">
                {memory.trends.slice(-3).map((t: any, i: number) => <span key={`${t.date}-${t.score}-${i}`}>{t.date}: {t.score}% ({t.type})</span>)}
              </div>
            </div>
          )}
          {!memory.digest?.weak?.length && !memory.trends?.length && <p className="text-sm text-muted-foreground">Do a Prepare + Practice to see your trajectory. Memory builds after 2 sessions.</p>}
        </section>
      )}

      <section>
        <div className="mb-4 flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /><h2 className="text-xl font-semibold">Prepared packs</h2></div>
        <div className="divide-y divide-foreground/15 border-y border-foreground/20">
          {workflows.length === 0 && (
            <div className="rounded-2xl border bg-card/60 px-4 py-8 text-center">
              <p className="text-sm font-medium">No prepared packs yet.</p>
              <p className="mt-1 text-sm text-muted-foreground">Start in Prepare — paste a resume and job description.</p>
            </div>
          )}
          {workflows.map((w) => {
            const open = openWorkflow === w.workflow_id;
            return (
              <div key={w.workflow_id}>
                <div className="flex items-start gap-1">
                  <button
                    type="button"
                    onClick={() => setOpenWorkflow(open ? null : w.workflow_id)}
                    aria-expanded={open}
                    className="grid flex-1 grid-cols-[1fr_auto] gap-2 px-1 py-4 text-left surface-transition hover:bg-accent/45"
                  >
                    <span>
                      <span className="block text-sm font-semibold">{w.company ? `${w.company}: ` : ""}{w.title || "Prepared interview"}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{formatDateTime(w.created_at)} · {w.questions?.length ?? 0} questions</span>
                      <span className="mt-1 block text-sm">{w.match?.overall_match_percent != null ? `${w.match.overall_match_percent}% match` : ""}</span>
                    </span>
                    <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${w.company ? `${w.company}: ` : ""}${w.title || "prepared pack"}`}
                    disabled={deletingId === w.workflow_id}
                    onClick={() => deleteWorkflow(w)}
                    className="mt-4 shrink-0 rounded-lg p-3 text-muted-foreground surface-transition hover:bg-accent/45 hover:text-destructive"
                  >
                    {deletingId === w.workflow_id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {open && (
                  <div className="mb-4 space-y-3 rounded-xl border bg-card p-4">
                    {(w.match?.summary || w.match?.matched_skills?.length > 0 || w.match?.gap_skills?.length > 0) && (
                      <div>
                        {w.match?.summary && <p className="text-sm leading-6 text-muted-foreground">{w.match.summary}</p>}
                        {w.match?.matched_skills?.length > 0 && <p className="mt-2 text-sm"><span className="font-semibold">Strengths:</span> <span className="text-emerald-700 dark:text-emerald-400">{w.match.matched_skills.join(", ")}</span></p>}
                        {w.match?.gap_skills?.length > 0 && <p className="mt-1 text-sm"><span className="font-semibold">Gaps:</span> <span className="text-amber-700 dark:text-amber-400">{w.match.gap_skills.join(", ")}</span></p>}
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
          {sessions.length === 0 && (
            <div className="rounded-2xl border bg-card/60 px-4 py-8 text-center">
              <p className="text-sm font-medium">{feedErrors.includes("Interview history") ? "Interview history could not be loaded." : "No sessions yet."}</p>
              <p className="mt-1 text-sm text-muted-foreground">{feedErrors.includes("Interview history") ? "Retry from the banner above." : "Start an interview — your report lands here."}</p>
            </div>
          )}
          {sessions.map((s) => {
            const open = openSession === s.session_id;
            return (
              <div key={s.session_id}>
                <div className="flex items-start gap-1">
                  <button
                    type="button"
                    onClick={() => setOpenSession(open ? null : s.session_id)}
                    aria-expanded={open}
                    className="grid flex-1 grid-cols-[1fr_auto] gap-2 px-1 py-4 text-left surface-transition hover:bg-accent/45"
                  >
                    <span>
                      <span className="block text-sm font-semibold">Session · {formatDateTime(s.created_at)}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{s.is_audio ? "voice" : "typed"} · {s.transcript?.length ?? 0} transcript lines{s.duration_seconds ? ` · ${Math.round(s.duration_seconds / 60)} min` : ""}</span>
                      {s.report?.scores && (
                        <span className="mt-2 flex flex-wrap gap-2">
                          {Object.entries(s.report.scores).slice(0, 4).map(([label, score]) => (
                            <span key={label} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-xs"><Target className="h-3 w-3 text-primary" />{label.replace(/_/g, " ")}: {String(score)}</span>
                          ))}
                        </span>
                      )}
                    </span>
                    <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
                  </button>
                  <Link
                    href={`/dashboard/session/${s.session_id}`}
                    aria-label={`Open full session from ${formatDateTime(s.created_at)}`}
                    className="mt-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground surface-transition hover:bg-accent/45 hover:text-primary"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <button
                    type="button"
                    aria-label={`Delete session from ${formatDateTime(s.created_at)}`}
                    disabled={deletingId === s.session_id}
                    onClick={() => deleteSession(s)}
                    className="mt-4 shrink-0 rounded-lg p-3 text-muted-foreground surface-transition hover:bg-accent/45 hover:text-destructive"
                  >
                    {deletingId === s.session_id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {open && s.report && (
                  <div className="mb-4 space-y-3 rounded-xl border bg-card p-4">
                    {s.report.verdict && <p className="rounded-lg border bg-secondary/30 p-3 text-sm"><span className="font-semibold">Verdict:</span> {s.report.verdict}</p>}
                    {s.report.summary && <p className="flex gap-2 text-sm leading-6 text-muted-foreground"><MessageSquareText className="mt-1 h-4 w-4 shrink-0 text-primary" />{s.report.summary}</p>}
                    <div className="grid gap-3 sm:grid-cols-2">
                      {(s.report.strengths?.length ?? 0) > 0 && (
                        <div><p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400"><Sparkles className="h-3.5 w-3.5" />What worked</p><ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-muted-foreground">{s.report.strengths.slice(0, 4).map((item: string, index: number) => <li key={index}>{item}</li>)}</ul></div>
                      )}
                      {(s.report.improvements?.length ?? 0) > 0 && (
                        <div><p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400"><Target className="h-3.5 w-3.5" />Improve next</p><ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-muted-foreground">{s.report.improvements.slice(0, 4).map((item: string, index: number) => <li key={index}>{item}</li>)}</ul></div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button size="sm" variant="outline" onClick={() => downloadJson(`hustlrzz-session-${s.session_id.slice(0, 8)}.json`, s)}>
                        <Download className="h-3.5 w-3.5" />Export session
                      </Button>
                      <Link href={`/dashboard/session/${s.session_id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                        Open full session <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
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
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${Number(row.total_percent) >= 70 ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : Number(row.total_percent) >= 50 ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : "bg-red-500/10 text-red-600 dark:text-red-400"}`}>{Number(row.total_percent)}%</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{row.band || "in progress"} · {row.level}{row.created_at && !Number.isNaN(new Date(row.created_at).getTime()) ? ` · ${new Date(row.created_at).toLocaleDateString()}` : ""}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

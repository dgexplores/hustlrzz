"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label, Textarea } from "@/components/ui/input";
import { BarChart3, CheckCircle2, FileText, Loader2, Sparkles, Upload } from "lucide-react";

type Usage = { free_limit: number; free_used: number; paid_remaining: number; total_analyses: number };
type Analysis = {
  analysis_id: string; resume_score: number; extracted_skills: string[]; missing_skills: string[];
  suggestions: string[]; analysis: Record<string, string>; jd_match: { score?: number; matched?: string[]; missing?: string[]; summary?: string };
  created_at?: string;
};

export function ResumeAnalyzerPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [jobDescription, setJobDescription] = useState("");
  const [usage, setUsage] = useState<Usage | null>(null);
  const [history, setHistory] = useState<Array<Pick<Analysis, "analysis_id" | "resume_score" | "extracted_skills" | "created_at">>>([]);
  const [result, setResult] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usageError, setUsageError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = () => {
    api<{ data: Usage }>("/resume-analyzer/usage")
      .then((r) => { setUsage(r.data); setUsageError(false); })
      .catch(() => setUsageError(true));
    api<{ data: typeof history }>("/resume-analyzer/analyses").then((r) => setHistory(r.data)).catch(() => undefined);
  };
  useEffect(refresh, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const body = new FormData(); body.set("file", file); body.set("job_description", jobDescription);
      const response = await api<{ data: Analysis }>("/resume-analyzer/analyze", { method: "POST", body });
      setResult(response.data); refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Analysis could not be completed.");
    } finally { setBusy(false); }
  };

  const openHistory = async (id: string) => {
    try { setResult((await api<{ data: Analysis }>(`/resume-analyzer/analyses/${id}`)).data); }
    catch { setError("That saved analysis is unavailable."); }
  };
  const remaining = usage ? Math.max(0, usage.free_limit - usage.free_used) : null;

  return <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 md:px-6">
    <section className="motion-enter flex flex-col gap-5 border-b border-border pb-8 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-3xl"><p className="text-sm font-semibold text-primary">Resume Analyzer</p><h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em] md:text-5xl">Make your resume easier to shortlist.</h1><p className="mt-4 leading-7 text-muted-foreground">Upload a PDF or DOCX for a structured, ATS-aware review. Your original file is parsed in memory and is not saved by the analyzer.</p></div>
      <div className="rounded-2xl border bg-card px-5 py-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Today’s allowance</p>{usageError ? <p className="mt-1 flex items-center gap-2 text-sm text-destructive">Could not load your usage.<button type="button" onClick={refresh} className="font-semibold underline underline-offset-2">Retry</button></p> : <><p className="mt-1 text-2xl font-semibold">{remaining ?? "—"}<span className="text-base font-normal text-muted-foreground"> / {usage?.free_limit ?? "—"} free reviews</span></p><p className="mt-1 text-xs text-muted-foreground">{usage?.paid_remaining ?? 0} paid credits · resets in IST</p></>}</div>
    </section>

    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <Card className="h-fit"><CardHeader><CardTitle>Analyze a resume</CardTitle><p className="text-sm leading-6 text-muted-foreground">Add a job description for a more focused skills comparison.</p></CardHeader><CardContent><form onSubmit={submit} className="space-y-5">
        <div className="space-y-2"><Label>Resume file</Label><input ref={inputRef} className="sr-only" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => { const selected = event.target.files?.[0] || null; if (selected && selected.size > 5 * 1024 * 1024) { setError("Resume files must be 5 MB or smaller."); return; } setFile(selected); }} />
          <button type="button" onClick={() => inputRef.current?.click()} className="flex min-h-32 w-full flex-col items-center justify-center rounded-xl border border-dashed border-input bg-secondary/20 px-4 text-center surface-transition hover:border-primary/50 hover:bg-primary/5"><Upload className="h-5 w-5 text-primary" /><span className="mt-3 text-sm font-semibold">{file ? file.name : "Choose a PDF or DOCX"}</span><span className="mt-1 text-xs text-muted-foreground">Maximum 5 MB</span></button>
        </div>
        <div className="space-y-2"><Label htmlFor="analyzer-jd">Job description <span className="font-normal text-muted-foreground">(optional)</span></Label><Textarea id="analyzer-jd" rows={7} maxLength={60000} value={jobDescription} onChange={(event) => setJobDescription(event.target.value)} placeholder="Paste the role requirements to identify matched and missing skills…" /></div>
        {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" size="lg" disabled={!file || busy || remaining === 0 || usageError}>{busy ? <><Loader2 className="h-4 w-4 animate-spin" />Analyzing securely…</> : <><Sparkles className="h-4 w-4" />Analyze resume</>}</Button>
        {usageError && <p className="text-center text-xs text-muted-foreground">Retry loading your usage above before analyzing.</p>}
      </form></CardContent></Card>

      <ResultPanel result={result} />
    </div>
    <section className="pb-8"><div className="mb-4 flex items-center gap-2"><BarChart3 className="h-5 w-5 text-primary" /><h2 className="text-xl font-semibold">Recent analyses</h2></div><div className="divide-y rounded-xl border bg-card">{history.length ? history.map((item) => <button key={item.analysis_id} onClick={() => openHistory(item.analysis_id)} className="grid w-full gap-2 px-4 py-4 text-left surface-transition hover:bg-accent sm:grid-cols-[auto_1fr_auto] sm:items-center"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">{item.resume_score}</span><span><span className="block text-sm font-semibold">ATS readiness review</span><span className="mt-1 block text-xs text-muted-foreground">{item.extracted_skills?.slice(0, 4).join(" · ") || "No skills listed"}</span></span><span className="text-xs text-muted-foreground">{item.created_at ? new Date(item.created_at).toLocaleDateString() : "View"}</span></button>) : <p className="p-6 text-sm text-muted-foreground">Your completed reviews will appear here.</p>}</div></section>
  </main>;
}

function ResultPanel({ result }: { result: Analysis | null }) {
  if (!result) return <Card className="min-h-[530px]"><CardContent className="flex min-h-[530px] flex-col items-center justify-center p-8 text-center"><span className="rounded-2xl bg-secondary p-4 text-muted-foreground"><FileText className="h-7 w-7" /></span><h2 className="mt-5 text-lg font-semibold">Your review will appear here</h2><p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">See a directional ATS score, the skills your resume makes visible, and concrete changes for the next draft.</p></CardContent></Card>;
  const score = Math.max(0, Math.min(result.resume_score, 100));
  return <Card><CardHeader><div className="flex items-center justify-between gap-4"><div><CardTitle>Resume review</CardTitle><p className="mt-1 text-sm text-muted-foreground">Directional coaching—not a hiring decision.</p></div><span className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-primary/20 text-xl font-semibold text-primary">{score}</span></div></CardHeader><CardContent className="space-y-6"><div className="h-2.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${score}%` }} /></div><Insight title="Skills made visible" items={result.extracted_skills} positive /><Insight title="Skills to strengthen" items={result.missing_skills} /><Insight title="Highest-impact improvements" items={result.suggestions} /><div className="grid gap-3 sm:grid-cols-2">{Object.entries(result.analysis || {}).map(([label, value]) => <div key={label} className="rounded-xl border bg-secondary/20 p-3"><p className="text-xs font-semibold capitalize text-muted-foreground">{label}</p><p className="mt-1 text-sm leading-6">{value}</p></div>)}</div>{result.jd_match?.summary && <div className="rounded-xl border border-primary/25 bg-primary/5 p-4"><p className="text-sm font-semibold">Job-description fit{result.jd_match.score != null ? ` · ${result.jd_match.score}%` : ""}</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{result.jd_match.summary}</p></div>}</CardContent></Card>;
}

function Insight({ title, items, positive = false }: { title: string; items?: string[]; positive?: boolean }) { return <section><h3 className="flex items-center gap-2 text-sm font-semibold">{positive && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}{title}</h3>{items?.length ? <div className="mt-3 flex flex-wrap gap-2">{items.map((item) => <span key={item} className="rounded-lg border bg-card px-2.5 py-1.5 text-sm">{item}</span>)}</div> : <p className="mt-2 text-sm text-muted-foreground">No items returned.</p>}</section>; }

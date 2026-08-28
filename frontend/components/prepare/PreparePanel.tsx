"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { downloadJson } from "@/lib/download";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Building2, Clock3, ExternalLink, Loader2, Brain, Database, Download, FileText, Radio, ShieldCheck, Upload } from "lucide-react";
import type { Question } from "@/lib/types";

interface FlowResult {
  workflow_id: string;
  questions: Question[];
  answers: { question?: string; answer?: string; tags?: string[] }[];
  company_match: {
    matched_skills: string[];
    gap_skills: string[];
    resume_weaknesses: string[];
    overall_match_percent: number;
    summary: string;
  };
  knowledge?: { available: boolean; indexed: boolean; warning?: string; chunk_count?: number };
  company_intelligence?: {
    status: "live" | "cached" | "fallback" | "not_requested";
    company: string;
    fetched_at?: string;
    confidence?: string;
    data?: {
      summary?: string;
      rounds?: Array<{ name: string; count?: number; focus?: string; source_ids?: string[] }>;
      question_patterns?: Array<{ category?: string; example: string; why_asked?: string; source_ids?: string[] }>;
      approach_style?: string;
      difficulty_signal?: string;
      evaluation_focus?: string[];
      preparation_tips?: string[];
    };
  };
  company_research?: {
    status: "live" | "fallback" | "not_requested";
    company: string;
    retrieved_at: string;
    confidence: "high" | "medium" | "low" | "none";
    summary: string;
    hiring_priorities: string[];
    interview_intelligence: string[];
    role_demands: Array<{ demand: string; evidence?: string; source_ids: string[] }>;
    interview_structure: Array<{ stage: string; what_to_expect?: string; source_ids: string[] }>;
    question_patterns: Array<{ category?: string; example: string; why_asked?: string; source_ids: string[] }>;
    evaluation_criteria: Array<{ criterion: string; how_to_demonstrate?: string; source_ids: string[] }>;
    recent_signals: Array<{ signal: string; why_it_matters?: string; source_ids: string[] }>;
    preparation_actions: string[];
    sources: Array<{ id: string; title: string; url: string; domain: string; published_at?: string }>;
  };
}

export function PreparePanel({ onDone }: { onDone?: (r: FlowResult) => void }) {
  const [resumeText, setResumeText] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [jobDescription, setJobDescription] = useState("");
  const [company, setCompany] = useState("");
  const [portfolioText, setPortfolioText] = useState("");
  const [notesText, setNotesText] = useState("");
  const [numQuestions, setNumQuestions] = useState(12);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FlowResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData();
    fd.set("job_description", jobDescription);
    fd.set("company_name", company);
    fd.set("num_questions", String(numQuestions));
    try {
      let endpoint = "/workflows/start";
      if (resumeFile) {
        fd.set("file", resumeFile);
        endpoint = "/workflows/upload";
      } else {
        fd.set("resume_text", resumeText);
      }
      const res = await api<{ success: boolean } & FlowResult>(endpoint, {
        method: "POST",
        body: fd,
      });
      const r = res as unknown as FlowResult;
      setResult(r);
      const extraSources = [
        { title: "Portfolio context", source_type: "portfolio", content: portfolioText },
        { title: "Candidate notes", source_type: "notes", content: notesText },
      ].filter((source) => source.content.trim().length >= 120);
      if (extraSources.length) {
        await Promise.allSettled(extraSources.map((source) => api("/knowledge/documents", {
          method: "POST", body: JSON.stringify(source),
        })));
      }
      onDone?.(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Workflow failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <section className="motion-enter max-w-3xl pb-2">
        <h1 className="text-4xl font-semibold leading-[1.08] tracking-[-0.04em] md:text-5xl">Prepare for the role you want.</h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">Add your experience and target role. Hustlrzz will create a focused question pack and research the company when requested.</p>
      </section>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-6 items-start">
      <Card className="motion-enter motion-enter-delay-1 overflow-hidden border-foreground/25">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" /> Prepare your interview
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Upload a PDF/DOCX resume or paste its text. The coach generates personalized
            questions, model answers, and a JD-vs-resume match report.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-lg bg-secondary/70 p-3 flex gap-3 text-sm text-secondary-foreground">
            <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
            <p>Your preparation material is used to personalise this workspace. Camera analysis remains in your browser.</p>
          </div>
          <form onSubmit={run} className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="resume">1. Your resume</Label>
                <Button type="button" size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4" /> {resumeFile ? "Replace file" : "Upload PDF or DOCX"}
                </Button>
              </div>
              <input
                ref={fileInputRef}
                id="resume-file"
                className="sr-only"
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  if (!file) return;
                  if (!/\.(pdf|docx)$/i.test(file.name)) {
                    setError("Upload a PDF or DOCX resume.");
                    e.currentTarget.value = "";
                    return;
                  }
                  if (file.size > 5 * 1024 * 1024) {
                    setError("Resume files must be 5 MB or smaller.");
                    e.currentTarget.value = "";
                    return;
                  }
                  setError(null);
                  setResumeFile(file);
                }}
              />
              {resumeFile ? (
                <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2"><FileText className="h-4 w-4 shrink-0 text-primary" /><span className="truncate">{resumeFile.name}</span></span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setResumeFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}>Use pasted text</Button>
                </div>
              ) : <Textarea id="resume" rows={8} placeholder="Paste your resume text…" value={resumeText} onChange={(e) => setResumeText(e.target.value)} required={!resumeFile} />}
              <p className="text-xs text-muted-foreground">PDF and DOCX text is extracted securely for this preparation. Maximum file size: 5 MB.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="jd">2. Job description</Label>
              <Textarea id="jd" rows={6} placeholder="Paste the job description…  The more specific it is, the better your questions." value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company">3. Target company <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input id="company" placeholder="e.g. Google, Amazon — we’ll add company-specific context" value={company} onChange={(e) => setCompany(e.target.value)} />
              <p className="text-xs text-muted-foreground">Leave blank for a faster 50s pack. Add a name for a 75s pack with company research.</p>
            </div>
            <details className="rounded-lg border bg-secondary/20 p-3">
              <summary className="cursor-pointer text-sm font-medium">Options</summary>
              <div className="mt-3 space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="nq">Questions</Label>
                  <select id="nq" value={numQuestions} onChange={(e) => setNumQuestions(Number(e.target.value))} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value={5}>Quick — 5 questions</option>
                    <option value={12}>Standard — 12 questions</option>
                    <option value={20}>Deep — 20 questions</option>
                  </select>
                </div>
                <div className="space-y-2"><Label htmlFor="portfolio">Portfolio context</Label><Textarea id="portfolio" rows={3} value={portfolioText} onChange={(e) => setPortfolioText(e.target.value)} placeholder="Optional: key projects, outcomes…" /></div>
                <div className="space-y-2"><Label htmlFor="notes">Notes</Label><Textarea id="notes" rows={2} value={notesText} onChange={(e) => setNotesText(e.target.value)} placeholder="Optional: areas to improve…" /></div>
              </div>
            </details>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading || (!resumeFile && !resumeText.trim())}>
              {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Generating — {company ? "~75s with research" : "~50s"} </> : "Generate interview pack → Step 2"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">Next: Practice this pack as a live interview.</p>
          </form>
        </CardContent>
      </Card>

      <Card className="min-h-[620px]">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Generated pack</CardTitle>
          <div className="flex gap-2">
            {result && <Button size="sm" variant="outline" onClick={() => downloadJson("hustlrzz-interview-pack.json", result)}><Download className="h-4 w-4" /> Export</Button>}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {result && (
            <div className="rounded-xl bg-primary p-4 text-primary-foreground">
              <p className="text-sm font-semibold">Pack ready — {result.questions.length} questions • {result.company_match.overall_match_percent}% match</p>
              <p className="mt-1 text-xs opacity-80">Your next step is Practice. The interviewer will use these questions.</p>
              <Link href="/interview" className="mt-3 inline-flex"><Button size="sm" variant="secondary" className="bg-white text-primary hover:bg-white/90">Start Practice Interview <ArrowRight className="h-4 w-4" /></Button></Link>
            </div>
          )}
          {!result && (
            <div className="py-20 text-center"><Database className="mx-auto h-7 w-7 text-muted-foreground" /><p className="mt-3 text-sm font-medium">Your practice pack will appear here.</p><p className="mt-1 text-sm text-muted-foreground">Step 1: Add resume + JD. Step 2: Practice. Step 3: Review progress.</p></div>
          )}
          {result?.knowledge && (
            <div className={`rounded-lg border p-3 text-sm ${result.knowledge.indexed ? "border-primary/30 bg-accent/50" : "border-amber-500/40 bg-amber-500/10 text-foreground"}`}>
              <div className="flex items-center gap-2 font-semibold"><FileText className="h-4 w-4" /> {result.knowledge.indexed ? "Knowledge context is ready" : "Knowledge context is unavailable"}</div>
              <p className="mt-1 text-xs leading-5">{result.knowledge.indexed ? `${result.knowledge.chunk_count ?? 0} searchable resume sections are available for future interview follow-ups.` : result.knowledge.warning ?? "The interview pack still works without semantic retrieval."}</p>
            </div>
          )}
          {result?.company_match?.summary && (
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex justify-between">
                <span className="font-medium">JD match</span>
                <span className="font-semibold text-primary">{result.company_match.overall_match_percent}%</span>
              </div>
              <p className="text-sm">{result.company_match.summary}</p>
              <p className="text-sm"><span className="font-medium">Match:</span> {result.company_match.matched_skills.join(", ") || "None found"}</p>
              <p className="text-sm"><span className="font-medium">Gaps:</span> {result.company_match.gap_skills.join(", ") || "None found"}</p>
              <p className="text-sm"><span className="font-medium">Weaknesses:</span> {result.company_match.resume_weaknesses.join(", ") || "None found"}</p>
            </div>
          )}
          {result?.company_intelligence && result.company_intelligence.status !== "not_requested" && (
            <div className="rounded-xl border bg-card p-4 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex gap-3">
                  <div className="rounded-lg bg-violet-500/10 p-2 text-violet-600 dark:text-violet-400"><Radio className="h-5 w-5" /></div>
                  <div>
                    <h3 className="font-semibold">Company intelligence · auto-updating</h3>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock3 className="h-3.5 w-3.5" />
                      {result.company_intelligence.fetched_at ? `Fetched ${new Date(result.company_intelligence.fetched_at).toLocaleString()}` : "Built-in profile"}
                    </p>
                  </div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${result.company_intelligence.status === "fallback" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-violet-500/10 text-violet-600 dark:text-violet-400"}`}>
                  {result.company_intelligence.status === "cached" ? `cached · refreshed every 7 days` : result.company_intelligence.status === "live" ? `${result.company_intelligence.confidence ?? ""} confidence · live sources`.trim() : "Fallback profile"}
                </span>
              </div>
              {result.company_intelligence.data?.summary && (
                <p className="text-sm leading-6 text-muted-foreground">{result.company_intelligence.data.summary}</p>
              )}
              {(result.company_intelligence.data?.rounds?.length ?? 0) > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reported hiring rounds</p>
                  <div className="flex flex-wrap gap-2">
                    {result.company_intelligence.data!.rounds!.map((roundItem, index) => (
                      <span key={`${roundItem.name}-${index}`} title={roundItem.focus} className="rounded-full border bg-secondary/40 px-3 py-1.5 text-xs font-semibold">
                        {roundItem.name}{roundItem.count && roundItem.count > 1 ? ` ×${roundItem.count}` : ""}
                        {roundItem.source_ids?.length ? <span className="ml-1 font-normal text-primary">{roundItem.source_ids.join("/")}</span> : null}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {(result.company_intelligence.data?.question_patterns?.length ?? 0) > 0 && (
                <details className="rounded-lg border p-3">
                  <summary className="cursor-pointer text-sm font-semibold">Known question patterns ({result.company_intelligence.data!.question_patterns!.length})</summary>
                  <div className="mt-3 space-y-2">
                    {result.company_intelligence.data!.question_patterns!.map((pattern, index) => (
                      <div key={`${pattern.example}-${index}`} className="rounded-md bg-secondary/30 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium">{pattern.example}</p>
                          {pattern.category && <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">{pattern.category}</span>}
                        </div>
                        {pattern.why_asked && <p className="mt-1 text-xs leading-5 text-muted-foreground">Why they ask: {pattern.why_asked}</p>}
                        {pattern.source_ids?.length ? <p className="mt-1 text-[11px] font-semibold text-primary">{pattern.source_ids.join(" · ")}</p> : null}
                      </div>
                    ))}
                  </div>
                </details>
              )}
              {(result.company_intelligence.data?.approach_style || result.company_intelligence.data?.difficulty_signal) && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {result.company_intelligence.data?.approach_style && (
                    <div className="rounded-lg border bg-secondary/25 p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Interview style</p><p className="mt-1 text-sm leading-5">{result.company_intelligence.data.approach_style}</p></div>
                  )}
                  {result.company_intelligence.data?.difficulty_signal && (
                    <div className="rounded-lg border bg-secondary/25 p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Difficulty signal</p><p className="mt-1 text-sm capitalize leading-5">{result.company_intelligence.data.difficulty_signal}</p></div>
                  )}
                </div>
              )}
              {(result.company_intelligence.data?.preparation_tips?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preparation tips</p>
                  <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                    {result.company_intelligence.data!.preparation_tips!.slice(0, 6).map((tip, index) => <li key={`${tip}-${index}`} className="flex gap-2"><span className="text-primary">•</span><span>{tip}</span></li>)}
                  </ul>
                </div>
              )}
              <p className="rounded-lg bg-secondary/50 p-3 text-xs leading-5 text-muted-foreground">This brief is cached and refreshed automatically from public sources each time it ages out, and is also fed into your knowledge base so live interviews stay grounded.</p>
            </div>
          )}
          {result?.company_research && result.company_research.status !== "not_requested" && (
            <div className="rounded-xl border bg-card p-4 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex gap-3">
                  <div className="rounded-lg bg-primary/10 p-2 text-primary"><Building2 className="h-5 w-5" /></div>
                  <div>
                    <h3 className="font-semibold">Current company brief</h3>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock3 className="h-3.5 w-3.5" />
                      {result.company_research.retrieved_at ? `Researched ${new Date(result.company_research.retrieved_at).toLocaleString()}` : "Built-in profile"}
                    </p>
                  </div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${result.company_research.status === "live" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>
                  {result.company_research.status === "live" ? `${result.company_research.confidence} confidence · live sources` : "Fallback profile"}
                </span>
              </div>
              <p className="text-sm leading-6 text-muted-foreground">{result.company_research.summary}</p>
              {(result.company_research.role_demands?.length ?? 0) > 0 && (
                <div className="space-y-2"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What this role demands</p><div className="grid gap-2 sm:grid-cols-2">{result.company_research.role_demands.slice(0, 6).map((item, index) => <div key={`${item.demand}-${index}`} className="rounded-lg border bg-secondary/25 p-3"><p className="text-sm font-medium">{item.demand}</p>{item.evidence && <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.evidence}</p>}<p className="mt-1 text-[11px] font-semibold text-primary">{item.source_ids.join(" · ")}</p></div>)}</div></div>
              )}
              {(result.company_research.interview_structure?.length ?? 0) > 0 && (
                <div className="space-y-2"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Likely interview loop</p><div className="space-y-2">{result.company_research.interview_structure.slice(0, 6).map((item, index) => <div key={`${item.stage}-${index}`} className="flex gap-3 rounded-lg bg-secondary/35 p-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{index + 1}</span><div><p className="text-sm font-medium">{item.stage}</p>{item.what_to_expect && <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{item.what_to_expect}</p>}<p className="mt-1 text-[11px] font-semibold text-primary">{item.source_ids.join(" · ")}</p></div></div>)}</div></div>
              )}
              {(result.company_research.question_patterns?.length ?? 0) > 0 && (
                <details className="rounded-lg border p-3" open><summary className="cursor-pointer text-sm font-semibold">Question patterns ({result.company_research.question_patterns.length})</summary><div className="mt-3 space-y-2">{result.company_research.question_patterns.slice(0, 8).map((item, index) => <div key={`${item.example}-${index}`} className="rounded-md bg-secondary/30 p-3"><div className="flex items-start justify-between gap-2"><p className="text-sm font-medium">{item.example}</p>{item.category && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">{item.category}</span>}</div>{item.why_asked && <p className="mt-1 text-xs leading-5 text-muted-foreground">Why they ask: {item.why_asked}</p>}<p className="mt-1 text-[11px] font-semibold text-primary">{item.source_ids.join(" · ")}</p></div>)}</div></details>
              )}
              {(result.company_research.evaluation_criteria?.length ?? 0) > 0 && (
                <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">How you may be evaluated</p><div className="mt-2 flex flex-wrap gap-2">{result.company_research.evaluation_criteria.slice(0, 6).map((item, index) => <span key={`${item.criterion}-${index}`} title={item.how_to_demonstrate} className="rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">{item.criterion} <span className="font-semibold text-primary">{item.source_ids.join("/")}</span></span>)}</div></div>
              )}
              {result.company_research.recent_signals.length > 0 && (
                <div className="space-y-2"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent signals</p>{result.company_research.recent_signals.slice(0, 4).map((item, index) => <div key={`${item.signal}-${index}`} className="rounded-lg border bg-secondary/30 p-3"><p className="text-sm font-medium">{item.signal}</p>{item.why_it_matters && <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.why_it_matters}</p>}<p className="mt-1 text-[11px] font-medium text-primary">{item.source_ids.join(" · ")}</p></div>)}</div>
              )}
              {result.company_research.preparation_actions.length > 0 && (
                <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">How to prepare</p><ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">{result.company_research.preparation_actions.slice(0, 5).map((item) => <li key={item} className="flex gap-2"><span className="text-primary">•</span><span>{item}</span></li>)}</ul></div>
              )}
              {result.company_research.sources.length > 0 && (
                <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-semibold">View research sources ({result.company_research.sources.length})</summary><div className="mt-3 space-y-2">{result.company_research.sources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="flex items-start justify-between gap-3 rounded-md p-2 text-sm hover:bg-accent"><span><span className="font-semibold text-primary">{source.id}</span> · {source.title}<span className="mt-0.5 block text-xs text-muted-foreground">{source.domain}{source.published_at ? ` · ${source.published_at}` : ""}</span></span><ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" /></a>)}</div></details>
              )}
            </div>
          )}
          {result && (
            <div className="space-y-2 max-h-[420px] overflow-auto">
              {result.questions.map((q, i) => (
                <div key={i} className="rounded-lg border p-3">
                  <p className="text-sm font-medium">
                    <span className="text-muted-foreground">{i + 1}.</span> {q.question}
                  </p>
                  <p className="text-xs mt-1 text-muted-foreground">
                    {q.tests} · difficulty {q.difficulty ?? "-"}/5
                  </p>
                  {q.answer_hint && <p className="text-xs mt-1">{q.answer_hint}</p>}
                  {q.follow_up && <p className="text-xs mt-1 text-amber-600">Follow-up: {q.follow_up}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

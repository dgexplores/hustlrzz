"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Brain, Database, FileText, ShieldCheck } from "lucide-react";
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
}

export function PreparePanel({ onDone }: { onDone?: (r: FlowResult) => void }) {
  const [resumeText, setResumeText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [company, setCompany] = useState("");
  const [portfolioText, setPortfolioText] = useState("");
  const [notesText, setNotesText] = useState("");
  const [numQuestions, setNumQuestions] = useState(12);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FlowResult | null>(null);

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData();
    fd.set("resume_text", resumeText);
    fd.set("job_description", jobDescription);
    fd.set("company_name", company);
    fd.set("num_questions", String(numQuestions));
    try {
      const res = await api<{ success: boolean } & FlowResult>("/workflows/start", {
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
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <section className="max-w-3xl">
        <p className="text-sm font-semibold text-primary">Preparation workspace</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Build an interview plan from your real experience.</h1>
        <p className="mt-2 text-base leading-7 text-muted-foreground">Your materials create a tailored practice pack. When knowledge search is configured, they also ground future interviewer follow-ups.</p>
      </section>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-6 items-start">
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" /> Prepare your interview
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Paste your resume and a job description. The coach generates personalized
            questions, model answers, and a JD-vs-resume match report.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-lg bg-secondary/70 p-3 flex gap-3 text-sm text-secondary-foreground">
            <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
            <p>Your preparation material is used to personalise this workspace. Camera analysis remains in your browser.</p>
          </div>
          <form onSubmit={run} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="company">Company (for interview style)</Label>
              <Input id="company" placeholder="e.g. Google, Amazon, Meta" value={company} onChange={(e) => setCompany(e.target.value)} />
            </div>
            <details className="rounded-lg border border-input bg-secondary/25 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">Add optional knowledge sources</summary>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Paste portfolio details or career notes. They are indexed only when semantic knowledge search is configured.</p>
              <div className="mt-3 space-y-3">
                <div className="space-y-2"><Label htmlFor="portfolio">Portfolio or project context</Label><Textarea id="portfolio" rows={4} value={portfolioText} onChange={(e) => setPortfolioText(e.target.value)} placeholder="Key projects, architecture choices, measurable outcomes…" /></div>
                <div className="space-y-2"><Label htmlFor="notes">Practice notes</Label><Textarea id="notes" rows={3} value={notesText} onChange={(e) => setNotesText(e.target.value)} placeholder="Areas to improve, previous feedback, target stories…" /></div>
              </div>
            </details>
            <div className="space-y-2">
              <Label htmlFor="resume">Resume</Label>
              <Textarea id="resume" rows={8} placeholder="Paste your resume text…" value={resumeText} onChange={(e) => setResumeText(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="jd">Job description</Label>
              <Textarea id="jd" rows={6} placeholder="Paste the job description…" value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nq">Number of questions</Label>
              <Input id="nq" type="number" min={1} max={50} value={numQuestions} onChange={(e) => setNumQuestions(Number(e.target.value))} />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generate interview pack"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="min-h-[620px]">
        <CardHeader>
          <CardTitle>Generated pack</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!result && (
            <div className="py-20 text-center"><Database className="mx-auto h-7 w-7 text-muted-foreground" /><p className="mt-3 text-sm font-medium">Your practice pack will appear here.</p><p className="mt-1 text-sm text-muted-foreground">Include a role, resume, and job description to begin.</p></div>
          )}
          {result?.knowledge && (
            <div className={`rounded-lg border p-3 text-sm ${result.knowledge.indexed ? "border-primary/30 bg-accent/50" : "border-amber-300 bg-amber-50 text-amber-950"}`}>
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
              <p className="text-sm"><span className="font-medium">Match:</span> {result.company_match.matched_skills.join(", ") || "—"}</p>
              <p className="text-sm"><span className="font-medium">Gaps:</span> {result.company_match.gap_skills.join(", ") || "—"}</p>
              <p className="text-sm"><span className="font-medium">Weaknesses:</span> {result.company_match.resume_weaknesses.join(", ") || "—"}</p>
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

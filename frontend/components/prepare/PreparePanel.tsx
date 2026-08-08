"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, FileUp, Brain } from "lucide-react";
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
}

export function PreparePanel({ onDone }: { onDone?: (r: FlowResult) => void }) {
  const [resumeText, setResumeText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [company, setCompany] = useState("");
  const [numQuestions, setNumQuestions] = useState(50);
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
      onDone?.(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Workflow failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" /> Prepare your interview
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Paste your resume and a job description. The coach generates personalized
            questions, model answers, and a JD-vs-resume match report.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={run} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="company">Company (for interview style)</Label>
              <Input id="company" placeholder="e.g. Google, Amazon, Meta" value={company} onChange={(e) => setCompany(e.target.value)} />
            </div>
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
              <Input id="nq" type="number" min={1} max={200} value={numQuestions} onChange={(e) => setNumQuestions(Number(e.target.value))} />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generate interview pack"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Generated pack</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!result && (
            <p className="text-sm text-muted-foreground">
              Run the workflow to see your questions, match analysis, and answers here.
            </p>
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
  );
}
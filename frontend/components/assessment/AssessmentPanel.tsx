"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import {
  ArrowRight, CheckCircle2, ClipboardList, Loader2, RotateCcw,
  Target, Timer, TrendingUp, XCircle,
} from "lucide-react";

interface SanitizedQuestion { id: string; prompt: string; options: string[] }
interface SanitizedRound { key: string; name: string; questions: SanitizedQuestion[] }
interface AttemptStart { attempt_id: string; round_index: number; round: SanitizedRound; round_count: number }
interface ReviewItem {
  qid: string; prompt: string; chosen_index: number; chosen_text: string;
  correct_index: number; correct_text: string; correct: boolean; explanation: string; skill: string;
}
interface RoundScore { key: string; name: string; score: number; correct: number; total: number }
interface AssessmentReport {
  round_scores: RoundScore[];
  total_percent: number;
  band: string;
  recommendation: string;
  strength_skills: string[];
  gap_skills: string[];
}
type SubmitResult =
  | { completed: false; next_round_index: number; next_round: SanitizedRound; score: number; correct: number; total: number }
  | { completed: true; report: AssessmentReport; score: number; correct: number; total: number };

interface AttemptRow {
  attempt_id: string; role: string; company?: string; level?: string;
  status: string; total_percent?: number | null; band?: string | null; created_at?: string;
}

const LEVELS = [
  { value: "fresher", label: "Fresher / campus" },
  { value: "mid", label: "Mid level" },
  { value: "senior", label: "Senior" },
] as const;

export function AssessmentPanel() {
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");
  const [level, setLevel] = useState<(typeof LEVELS)[number]["value"]>("mid");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [roundIndex, setRoundIndex] = useState(0);
  const [roundCount, setRoundCount] = useState(0);
  const [round, setRound] = useState<SanitizedRound | null>(null);
  const [responses, setResponses] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<{ score: number; correct: number; total: number } | null>(null);
  const [report, setReport] = useState<AssessmentReport | null>(null);
  const [history, setHistory] = useState<AttemptRow[]>([]);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);

  const loadHistory = useCallback(() => {
    api<{ data: AttemptRow[] }>("/assessment/attempts")
      .then((res) => setHistory(res.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Round timer: informational countdown that auto-submits what is answered.
  useEffect(() => {
    if (!round || report || secondsLeft === null) return;
    if (secondsLeft <= 0) {
      handleSubmit(true);
      return;
    }
    const timer = window.setTimeout(() => setSecondsLeft((value) => (value ?? 1) - 1), 1000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, secondsLeft, report]);

  const start = async () => {
    setError(null);
    setStarting(true);
    setReport(null);
    setBanner(null);
    setReviews([]);
    try {
      const res = await api<{ data: AttemptStart }>("/assessment/start", {
        method: "POST",
        body: JSON.stringify({ role, company, level }),
      });
      setAttemptId(res.data.attempt_id);
      setRoundIndex(res.data.round_index);
      setRoundCount(res.data.round_count);
      setRound(res.data.round);
      setResponses({});
      setSecondsLeft(res.data.round.questions.length * 60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the assessment.");
    } finally {
      setStarting(false);
    }
  };

  const handleSubmit = async (auto = false) => {
    if (!attemptId || !round || submitting) return;
    const unanswered = round.questions.length - Object.keys(responses).length;
    if (unanswered > 0 && !auto) {
      setError(`Answer every question first (${unanswered} left).`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, number> = {};
      round.questions.forEach((question) => {
        payload[question.id] = responses[question.id] ?? -1;
      });
      const res = await api<{ data: SubmitResult }>(`/assessment/attempts/${attemptId}/submit`, {
        method: "POST",
        body: JSON.stringify({ round_index: roundIndex, responses: payload }),
      });
      const data = res.data as SubmitResult & { review?: ReviewItem[] };
      if (Array.isArray(data.review)) {
        setReviews((current) => [...current, ...data.review!]);
      }
      setBanner({ score: data.score, correct: data.correct, total: data.total });
      if (data.completed) {
        setReport(data.report);
        setRound(null);
        loadHistory();
      } else {
        window.setTimeout(() => {
          setRoundIndex(data.next_round_index);
          setRound(data.next_round);
          setResponses({});
          setSecondsLeft(data.next_round.questions.length * 60);
          setBanner(null);
        }, 1400);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scoring failed. Your answers were saved.");
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setAttemptId(null);
    setRound(null);
    setReport(null);
    setBanner(null);
    setResponses({});
    setSecondsLeft(null);
    setReviews([]);
    loadHistory();
  };

  const progressLabel = useMemo(() => `Round ${roundIndex + 1} of ${roundCount || "-"}`, [roundIndex, roundCount]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <section className="motion-enter max-w-3xl pb-2">
        <h1 className="text-4xl font-semibold leading-[1.08] tracking-[-0.04em] md:text-5xl">Pass the screening rounds.</h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">
          Big companies test aptitude and judgment before anyone meets you. Practice a realistic multi-round online assessment built for your target role.
        </p>
      </section>

      {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>}

      {!attemptId && (
        <Card className="motion-enter">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-primary" />Configure your battery</CardTitle>
            <p className="text-sm text-muted-foreground">Three timed rounds: Aptitude &amp; Reasoning → Role Technical → Situational Judgment.</p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="assess-role">Target role *</Label>
                <Input id="assess-role" placeholder="e.g. Frontend Engineer, Data Analyst" value={role} onChange={(event) => setRole(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="assess-company">Company (optional)</Label>
                <Input id="assess-company" placeholder="e.g. Amazon" value={company} onChange={(event) => setCompany(event.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Seniority</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                {LEVELS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setLevel(item.value)}
                    className={`min-h-11 rounded-lg border px-3 text-sm font-semibold surface-transition ${level === item.value ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <Button size="lg" disabled={role.trim().length < 2 || starting} onClick={start} className="w-full">
              {starting ? <><Loader2 className="h-4 w-4 animate-spin" />Generating your rounds…</> : <>Start assessment <ArrowRight className="h-4 w-4" /></>}
            </Button>
          </CardContent>
        </Card>
      )}

      {attemptId && round && !report && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <p className="text-sm font-medium text-primary">{progressLabel}</p>
              <CardTitle className="text-xl">{round.name}</CardTitle>
            </div>
            <span className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-sm font-semibold ${secondsLeft !== null && secondsLeft < 60 ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-secondary text-secondary-foreground"}`}>
              <Timer className="h-4 w-4" />{formatClock(secondsLeft ?? 0)}
            </span>
          </CardHeader>
          <CardContent className="space-y-4">
            {banner && (
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                Round scored: {banner.score}% ({banner.correct}/{banner.total}) · loading next round…
              </div>
            )}
            {round.questions.map((question, index) => (
              <fieldset key={question.id} className="rounded-xl border p-4">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Q{index + 1}</legend>
                <p className="text-sm font-medium leading-6">{question.prompt}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {question.options.map((option, optionIndex) => {
                    const selected = responses[question.id] === optionIndex;
                    return (
                      <button
                        key={`${question.id}-${optionIndex}`}
                        type="button"
                        onClick={() => setResponses((current) => ({ ...current, [question.id]: optionIndex }))}
                        aria-pressed={selected}
                        className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm surface-transition ${selected ? "border-primary bg-primary/10 font-semibold" : "bg-background hover:bg-accent"}`}
                      >
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${selected ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
                          {"ABCD"[optionIndex]}
                        </span>
                        {option}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ))}
            <Button size="lg" className="w-full" disabled={submitting} onClick={() => handleSubmit()}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Submit round <CheckCircle2 className="h-4 w-4" /></>}
            </Button>
          </CardContent>
        </Card>
      )}

      {report && (
        <div className="space-y-6 motion-enter">
          <Card className="overflow-hidden">
            <CardContent className="grid gap-6 p-6 md:grid-cols-[auto_1fr] md:items-center">
              <ScoreRing percent={report.total_percent} />
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"><TrendingUp className="h-3.5 w-3.5" />{report.band}</span>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight">{Math.round(report.total_percent)}% overall</h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{report.recommendation}</p>
                <Button variant="outline" className="mt-4" onClick={reset}><RotateCcw className="h-4 w-4" />Retake assessment</Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Target className="h-5 w-5 text-primary" />Round breakdown</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {report.round_scores.map((row) => (
                  <div key={row.key}>
                    <div className="mb-1.5 flex justify-between text-sm">
                      <span className="font-medium">{row.name}</span>
                      <span className="font-semibold">{row.score}% · {row.correct}/{row.total}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-secondary">
                      <div className={`h-full rounded-full ${row.score >= 70 ? "bg-emerald-500" : row.score >= 50 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${row.score}%` }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Skill signals</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Strengths</p>
                  <div className="mt-2 flex flex-wrap gap-2">{report.strength_skills.length ? report.strength_skills.map((skill) => <span key={skill} className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">{skill}</span>) : <span className="text-sm text-muted-foreground">None detected this run.</span>}</div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Drill these</p>
                  <div className="mt-2 flex flex-wrap gap-2">{report.gap_skills.length ? report.gap_skills.map((skill) => <span key={skill} className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400">{skill}</span>) : <span className="text-sm text-muted-foreground">No weak areas found.</span>}</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {reviews.length > 0 && (
            <details className="rounded-xl border bg-card p-4">
              <summary className="cursor-pointer text-sm font-semibold">Answer review with explanations</summary>
              <div className="mt-4 space-y-3">
                {reviews.map((item) => (
                  <div key={item.qid} className="rounded-lg border p-3">
                    <p className="flex items-start gap-2 text-sm font-medium"><span>{item.correct ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" /> : <XCircle className="mt-0.5 h-4 w-4 text-red-500" />}</span>{item.prompt}</p>
                    <p className="mt-1.5 text-xs text-muted-foreground">Your answer: {item.chosen_text || "skipped"} · Correct: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{item.correct_text}</span></p>
                    {item.explanation && <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.explanation}</p>}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {history.length > 0 && !attemptId && (
        <Card>
          <CardHeader><CardTitle>Past attempts</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {history.slice(0, 6).map((row) => (
              <div key={row.attempt_id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                <div><span className="font-semibold">{row.role}</span>{row.company ? ` · ${row.company}` : ""}<span className="ml-2 text-xs text-muted-foreground">{row.level}{row.created_at ? ` · ${new Date(row.created_at).toLocaleDateString()}` : ""}</span></div>
                <div className="text-right">
                  {row.status === "completed"
                    ? <span className="font-semibold text-primary">{row.total_percent}% · {row.band}</span>
                    : <span className="text-xs text-muted-foreground">in progress</span>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ScoreRing({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className="relative h-32 w-32">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r="52" fill="none" strokeWidth="12" className="stroke-secondary" />
        <circle
          cx="60" cy="60" r="52" fill="none" strokeWidth="12" strokeLinecap="round"
          className={clamped >= 70 ? "stroke-emerald-500" : clamped >= 50 ? "stroke-amber-500" : "stroke-red-500"}
          strokeDasharray={`${(clamped / 100) * 326.7} 326.7`}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-2xl font-bold">{clamped}%</span>
    </div>
  );
}

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(Math.max(0, totalSeconds) / 60);
  const seconds = Math.max(0, totalSeconds) % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

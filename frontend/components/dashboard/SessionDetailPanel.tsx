"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { downloadJson, downloadMarkdown } from "@/lib/download";
import { buildInterviewReportMarkdown } from "@/lib/reportMarkdown";
import { isCompleteReport, sessionDetailMeta, sessionExportBase } from "@/lib/sessionDetail";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FeedbackStars } from "@/components/interview/FeedbackStars";
import {
  AlertCircle, ArrowRight, Download, FileText, Loader2, MessageSquareText,
  Printer, Sparkles, Target,
} from "lucide-react";

interface SessionTurn {
  from?: string;
  text?: string;
}

interface SessionRow {
  session_id: string;
  created_at?: string;
  is_audio?: boolean;
  duration_seconds?: number;
  intensity?: string;
  transcript?: SessionTurn[];
  report?: unknown;
}

function formatDateTime(value?: string) {
  if (!value) return "Unknown date";
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? "Unknown date" : new Date(value).toLocaleString();
}

/**
 * Full session view (T7). Owner-only: unknown or foreign ids return 404 from
 * GET /interviews/{session_id} and redirect to /dashboard (architecture decision).
 */
export function SessionDetailPanel() {
  const params = useParams<{ id?: string }>();
  const router = useRouter();
  const id = typeof params?.id === "string" ? params.id : "";
  const [session, setSession] = useState<SessionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      router.replace("/dashboard");
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    api<{ data: SessionRow }>(`/interviews/${encodeURIComponent(id)}`)
      .then((response) => {
        if (!active) return;
        setSession(response.data);
        setLoading(false);
      })
      .catch((requestError) => {
        if (!active) return;
        if (requestError instanceof ApiError && requestError.status === 404) {
          router.replace("/dashboard");
          return;
        }
        setError(requestError instanceof Error ? requestError.message : "Session could not be loaded.");
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, router]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="Loading session">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
          <h1 className="mt-3 text-xl font-semibold">Session unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{error}</p>
          <Link href="/dashboard" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
            Back to dashboard <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  if (!session) return null;

  const report = session.report;
  const complete = isCompleteReport(report);
  const reportData = (report ?? {}) as Record<string, any>;
  const scores = Object.entries(reportData.scores || {}) as [string, number][];
  const strengths: string[] = Array.isArray(reportData.strengths) ? reportData.strengths : [];
  const improvements: string[] = Array.isArray(reportData.improvements) ? reportData.improvements : [];
  const deliveryNotes: string[] = Array.isArray(reportData.delivery_notes) ? reportData.delivery_notes : [];
  const transcript = Array.isArray(session.transcript) ? session.transcript : [];
  const base = sessionExportBase(session.session_id || id);
  const meta = sessionDetailMeta(session);

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 md:px-6 print-report">
      <section className="motion-enter print-hide flex flex-col gap-4 pb-2 md:flex-row md:items-end md:justify-between">
        <div>
          <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
            <ArrowRight className="h-3.5 w-3.5 rotate-180" /> Back to dashboard
          </Link>
          <h1 className="mt-3 text-3xl font-semibold leading-[1.08] tracking-[-0.04em] md:text-4xl">Session detail</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {formatDateTime(session.created_at)} · {session.is_audio ? "voice" : "typed"} · {transcript.length} transcript lines
            {session.duration_seconds ? ` · ${Math.round(session.duration_seconds / 60)} min` : ""}
            {session.intensity ? ` · ${session.intensity} intensity` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => downloadJson(`${base}.json`, session)}>
            <Download className="h-4 w-4" /> Export JSON
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => downloadMarkdown(`${base}.md`, buildInterviewReportMarkdown(report, meta))}
          >
            <FileText className="h-4 w-4" /> Export MD
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print
          </Button>
        </div>
      </section>

      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-secondary/25">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-medium text-primary">Coaching debrief</p>
              <CardTitle className="mt-1 text-xl">Report</CardTitle>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {complete
                  ? reportData.summary || "Your report has been saved to session history."
                  : "No report was saved for this session — the transcript below is still complete."}
              </p>
              {complete && reportData.verdict && (
                <p className="mt-3 rounded-xl border bg-secondary/30 p-3 text-sm">
                  <span className="font-semibold">Coach verdict:</span> {reportData.verdict}
                </p>
              )}
            </div>
            {complete && <FeedbackStars sessionId={session.session_id} />}
          </div>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          {complete && (
            <>
              <section>
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Target className="h-4 w-4 text-primary" /> Scores
                </h2>
                <div className="mt-3 space-y-4">
                  {scores.length ? (
                    scores.map(([label, rawScore]) => {
                      const score = Number(rawScore) || 0;
                      return (
                        <div key={label}>
                          <div className="mb-1.5 flex justify-between text-sm">
                            <span className="font-medium capitalize">{label.replace(/_/g, " ")}</span>
                            <span className="font-semibold">{score}/100</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-secondary">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(score, 100))}%` }} />
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-sm text-muted-foreground">No numerical scores were returned.</p>
                  )}
                </div>
              </section>

              <div className="grid gap-6 lg:grid-cols-2">
                <section>
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                    <Sparkles className="h-4 w-4" /> What worked
                  </h2>
                  {strengths.length ? (
                    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
                      {strengths.map((item, index) => <li key={index}>{item}</li>)}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">No strengths were returned.</p>
                  )}
                </section>
                <section>
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400">
                    <Target className="h-4 w-4" /> Next practice focus
                  </h2>
                  {improvements.length ? (
                    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
                      {improvements.map((item, index) => <li key={index}>{item}</li>)}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">No improvements were returned.</p>
                  )}
                </section>
              </div>

              {reportData.hiring_manager && (
                <section className="rounded-xl border border-primary/20 bg-primary/[0.03] p-4">
                  <h2 className="text-sm font-semibold">Hiring-manager view</h2>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    {reportData.hiring_manager.decision && (
                      <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold">{reportData.hiring_manager.decision}</span>
                    )}
                    {reportData.hiring_manager.confidence && (
                      <span className="rounded-full bg-secondary px-2.5 py-1 text-xs">confidence {reportData.hiring_manager.confidence}</span>
                    )}
                  </div>
                  {reportData.hiring_manager.risk && (
                    <p className="mt-2 text-sm"><span className="font-semibold">Risk if hired:</span> {reportData.hiring_manager.risk}</p>
                  )}
                  {reportData.hiring_manager.bar_raiser_notes && (
                    <p className="mt-1 text-sm leading-6 text-muted-foreground"><span className="font-semibold text-foreground">Bar-raiser:</span> {reportData.hiring_manager.bar_raiser_notes}</p>
                  )}
                </section>
              )}

              {(deliveryNotes.length > 0 || reportData.star_example || reportData.next_drill) && (
                <div className="grid gap-4 lg:grid-cols-3">
                  {reportData.star_example && (
                    <section className="rounded-xl border p-4">
                      <h2 className="text-sm font-semibold">Strongest STAR moment</h2>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{reportData.star_example}</p>
                    </section>
                  )}
                  {deliveryNotes.length > 0 && (
                    <section className="rounded-xl border p-4">
                      <h2 className="text-sm font-semibold">Delivery notes</h2>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">
                        {deliveryNotes.map((note, index) => <li key={index}>{note}</li>)}
                      </ul>
                    </section>
                  )}
                  {reportData.next_drill && (
                    <section className="rounded-xl border p-4">
                      <h2 className="text-sm font-semibold">Next drill</h2>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{reportData.next_drill}</p>
                    </section>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquareText className="h-5 w-5 text-primary" /> Transcript
          </CardTitle>
        </CardHeader>
        <CardContent>
          {transcript.length ? (
            <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
              {transcript.map((turn, index) => (
                <div key={`${turn.from}-${index}`} className={`flex flex-col ${turn.from === "candidate" ? "items-end" : "items-start"}`}>
                  <span className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    {turn.from === "candidate" ? "You" : "Interviewer"}
                  </span>
                  <div
                    className={`max-w-[90%] rounded-2xl px-3 py-2 text-left text-sm leading-6 ${
                      turn.from === "candidate" ? "bg-primary/10" : "bg-secondary/60"
                    }`}
                  >
                    {turn.text}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No transcript was saved for this session.</p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

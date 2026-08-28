"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, wsUrl } from "@/lib/api";
import { downloadJson } from "@/lib/download";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useAudio } from "@/hooks/useAudio";
import { CameraPanel } from "@/components/interview/CameraPanel";
import { PresenceCoach } from "@/components/interview/PresenceCoach";
import { useMetrics } from "@/context/MetricsContext";
import { formatClock } from "@/lib/analytics";
import {
  AlertCircle, ArrowRight, Bot, Building2, CheckCircle2, Download, FileText,
  Loader2, MessageSquareText, Mic, MicOff, RefreshCw, Send, Sparkles,
  Square, Target, Volume2, VideoOff, WifiOff, Star, Dumbbell, X,
} from "lucide-react";

const teardownWs = (ws: WebSocket | null) => {
  if (!ws) return;
  ws.onclose = null;
  ws.onerror = null;
  ws.onmessage = null;
  try { ws.close(); } catch {}
};

interface Turn { role: "candidate" | "interviewer"; text: string }
interface WorkflowOption {
  workflow_id: string;
  title?: string;
  company?: string;
  questions?: unknown[];
  match?: { overall_match_percent?: number };
  created_at?: string;
}
type SessionPhase = "setup" | "connecting" | "live" | "ending" | "complete" | "interrupted";

const DRAFT_KEY = "hustlrzz-interview-draft";

export function InterviewPanel() {
  const [workflows, setWorkflows] = useState<WorkflowOption[]>([]);
  const [workflowId, setWorkflowId] = useState("");
  const [duration, setDuration] = useState(15);
  const [persona, setPersona] = useState("maya");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<SessionPhase>("setup");
  const [loadingWorkflows, setLoadingWorkflows] = useState(true);
  const [awaitingReply, setAwaitingReply] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [report, setReport] = useState<any>(null);
  const [audioMode, setAudioMode] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  // Generation counter: callbacks from stale sockets are ignored so a slow
  // onclose can never clobber a fresh session (state race fix).
  const generationRef = useRef(0);
  const startedAtRef = useRef(0);
  const draftTimerRef = useRef<number | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const metrics = useMetrics((state) => state.metrics);
  const resetMetrics = useMetrics((state) => state.reset);

  const connected = phase === "live" || phase === "ending";
  const selectedWorkflow = useMemo(
    () => workflows.find((workflow) => workflow.workflow_id === workflowId),
    [workflowId, workflows],
  );

  const { supported: audioSupported, listening, speaking, interim, start: startMic, stop: stopMic, speak, stopSpeaking } =
    useAudio(send);

  function send(override?: string) {
    const text = (override ?? input).trim();
    if (!text || awaitingReply || wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "message", text }));
    stopSpeaking(); // barge-in
    setSessionError(null);
    setAwaitingReply(true);
    setTurns((current) => [...current, { role: "candidate", text }]);
    setInput("");
  }

  useEffect(() => {
    api<{ data: WorkflowOption[] }>("/workflows")
      .then((response) => {
        const ordered = [...(response.data || [])].reverse();
        setWorkflows(ordered);
        if (ordered[0]) setWorkflowId(ordered[0].workflow_id);
      })
      .catch((error) => setSessionError(error instanceof Error ? error.message : "Prepared packs could not be loaded."))
      .finally(() => setLoadingWorkflows(false));
    return () => {
      teardownWs(wsRef.current)
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns, awaitingReply]);

  useEffect(() => {
    if (phase !== "live" && phase !== "ending") return;
    const timer = window.setInterval(() => setElapsedSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  // Persist a lightweight draft (debounced) so an accidental refresh can be recovered
  // without serializing the full transcript on every keystroke.
  useEffect(() => {
    if (phase !== "live" && phase !== "interrupted") return;
    if (draftTimerRef.current) window.clearTimeout(draftTimerRef.current);
    draftTimerRef.current = window.setTimeout(() => {
      try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ workflowId, turns: turns.slice(-40), at: Date.now() })); } catch {}
    }, 1500);
    return () => { if (draftTimerRef.current) window.clearTimeout(draftTimerRef.current); };
  }, [turns, phase, workflowId]);

  const begin = useCallback(async () => {
    if (!workflowId) {
      setSessionError("Create or select a prepared interview pack first.");
      return;
    }
    generationRef.current += 1;
    setPhase("connecting");
    setSessionError(null);
    setReport(null);
    setTurns([]);
    setElapsedSeconds(0);
    resetMetrics();
    try {
      const response = await api<{ data: { session_id: string; websocket_parameter: string } }>("/interviews/start", {
        method: "POST",
        body: JSON.stringify({ workflow_id: workflowId, duration, is_audio: audioMode && audioSupported, persona }),
      });
      connectWs(response.data.session_id, response.data.websocket_parameter);
    } catch (error) {
      setPhase("setup");
      setSessionError(error instanceof Error ? error.message : "Unable to start the interview.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId, duration, audioMode, audioSupported, persona, resetMetrics]);

  const connectWs = (sessionId: string, query: string) => {
    const generation = ++generationRef.current;
    const previous = wsRef.current;
    if (previous) {
      previous.onclose = null;
      previous.onerror = null;
      previous.onmessage = null;
      try { previous.close(); } catch {}
    }
    const socket = new WebSocket(wsUrl(`/ws/${sessionId}${query}`, {}));
    wsRef.current = socket;
    startedAtRef.current = Date.now();

    socket.onopen = () => {
      if (generation !== generationRef.current) return;
      setPhase("live");
    };
    socket.onmessage = (event) => {
      if (generation !== generationRef.current) return;
      let message: any;
      try {
        message = JSON.parse(event.data);
      } catch {
        setAwaitingReply(false);
        setSessionError("The interviewer sent an unreadable response. Restart this session.");
        return;
      }
      if (message.type === "question" || message.type === "message") {
        const data = message.data || {};
        const text = data.message || data.question || "";
        setAwaitingReply(false);
        if (text) {
          setTurns((current) => [...current, { role: "interviewer", text }]);
          if (audioMode && audioSupported) speak(text);
        }
      } else if (message.type === "report") {
        setAwaitingReply(false);
        stopSpeaking();
        setReport(message.data);
        setPhase("complete");
      } else if (message.type === "error") {
        setAwaitingReply(false);
        setSessionError(message.data?.message || "The interviewer could not process that answer. Try again.");
      }
    };
    socket.onerror = () => {
      if (generation !== generationRef.current) return;
      setAwaitingReply(false);
    };
    socket.onclose = () => {
      if (generation !== generationRef.current) return;
      setAwaitingReply(false);
      stopSpeaking();
      setPhase((current) =>
        current === "complete" ? current : current === "ending" ? "complete" : "interrupted",
      );
    };
  };

  const end = () => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    stopMic();
    stopSpeaking();
    setPhase("ending");
    setAwaitingReply(true);
    wsRef.current.send(JSON.stringify({
      type: "end",
      presence: {
        handDetectionCounter: metrics.handDetectionCounter,
        handDetectionDuration: Number(metrics.handDetectionDuration.toFixed(1)),
        notFacingCounter: metrics.notFacingCounter,
        notFacingDuration: Number(metrics.notFacingDuration.toFixed(1)),
        badPostureDetectionCounter: metrics.badPostureDetectionCounter,
        badPostureDuration: Number(metrics.badPostureDuration.toFixed(1)),
        sessionDurationSeconds: elapsedSeconds,
        postureScore: metrics.postureScore,
        gazeStabilityScore: metrics.gazeStabilityScore,
        headTiltDeg: metrics.headTiltDeg,
        shoulderTiltDeg: metrics.shoulderTiltDeg,
      },
    }));
  };

  const restart = () => {
      teardownWs(wsRef.current)
    try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
    setPhase("setup");
    setTurns([]);
    setReport(null);
    setSessionError(null);
    setAwaitingReply(false);
  };

  const elapsed = formatClock(elapsedSeconds);
  const lastInterviewerLine = useMemo(() => turns.findLast((t) => t.role === "interviewer")?.text || "", [turns]);

  return (
    <main className="mx-auto max-w-[1440px] space-y-6 px-4 py-8 md:px-6">
      <section className="motion-enter flex flex-col gap-4 pb-2 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <h1 className="text-4xl font-semibold leading-[1.08] tracking-[-0.04em] md:text-5xl">Run a realistic interview.</h1>
          <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">A live human-sounding interviewer, your camera presence, and a scored debrief - all in one studio.</p>
        </div>
        {phase !== "live" && phase !== "ending" && (
          <div className="flex items-center gap-2 rounded-full border bg-card px-3 py-2 text-sm shadow-sm">
            <span className={`h-2 w-2 rounded-full ${phase === "connecting" ? "bg-amber-500 animate-pulse" : phase === "complete" ? "bg-emerald-500" : phase === "interrupted" ? "bg-red-500" : "bg-muted-foreground/40"}`} />
            <span className="font-medium capitalize">{phase === "setup" ? "Ready to configure" : phase === "interrupted" ? "Connection lost" : phase}</span>
          </div>
        )}
      </section>

      {(sessionError && phase !== "live" && phase !== "ending") && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{sessionError}</span></div>
      )}

      {phase === "setup" || phase === "connecting" ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
          <Card className="overflow-hidden">
            <CardHeader className="border-b bg-secondary/25">
              <p className="text-sm font-medium text-primary">Interview brief</p>
              <CardTitle className="text-xl">Choose your interview brief</CardTitle>
              <p className="text-sm text-muted-foreground">The interviewer uses its questions, company context, and your candidate-owned knowledge.</p>
            </CardHeader>
            <CardContent className="space-y-5 pt-6">
              {loadingWorkflows ? <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading prepared packs…</div> : workflows.length ? (
                <div className="space-y-2">
                  <Label htmlFor="workflow">Prepared pack</Label>
                  <select id="workflow" value={workflowId} onChange={(event) => setWorkflowId(event.target.value)} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring">
                    {workflows.map((workflow) => <option key={workflow.workflow_id} value={workflow.workflow_id}>{workflow.company ? `${workflow.company}: ` : ""}{workflow.title || "Prepared interview"}</option>)}
                  </select>
                </div>
              ) : <div className="rounded-xl border border-dashed p-6 text-center"><FileText className="mx-auto h-6 w-6 text-muted-foreground" /><p className="mt-2 font-medium">No prepared pack yet</p><p className="mt-1 text-sm text-muted-foreground">Use Prepare first to create a grounded interview.</p><Link href="/prepare" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">Open Prepare <ArrowRight className="h-4 w-4" /></Link></div>}

              {selectedWorkflow && <div className="grid gap-3 rounded-xl border bg-secondary/20 p-4 sm:grid-cols-3"><BriefStat label="Company" value={selectedWorkflow.company || "Target role"} /><BriefStat label="Questions" value={String(selectedWorkflow.questions?.length ?? 0)} /><BriefStat label="Role match" value={selectedWorkflow.match?.overall_match_percent != null ? `${selectedWorkflow.match.overall_match_percent}%` : "Prepared"} /></div>}

              <div className="space-y-2"><Label>Session length</Label><div className="grid grid-cols-4 gap-2">{[10, 15, 30, 45].map((minutes) => <button key={minutes} type="button" onClick={() => setDuration(minutes)} className={`min-h-11 rounded-lg border px-2 text-sm font-semibold surface-transition ${duration === minutes ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}>{minutes} min</button>)}</div></div>

              <div className="space-y-2">
                <Label>Interviewer persona</Label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "maya", name: "Maya", desc: "Balanced" },
                    { id: "alex", name: "Alex", desc: "Amazon LP" },
                    { id: "priya", name: "Priya", desc: "Meta collab" },
                  ].map((p) => (
                    <button key={p.id} type="button" onClick={() => setPersona(p.id)} className={`rounded-xl border p-3 text-left surface-transition ${persona === p.id ? "border-primary bg-primary/10" : "bg-background hover:bg-accent"}`}>
                      <span className="block text-sm font-semibold">{p.name}</span>
                      <span className="block text-xs text-muted-foreground">{p.desc}</span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Maya is balanced, Alex pushes Amazon LPs, Priya explores collaboration at scale.</p>
              </div>

              <label className={`flex min-h-16 cursor-pointer items-center justify-between gap-4 rounded-xl border p-4 surface-transition ${audioMode ? "border-primary/40 bg-primary/5" : "bg-background"}`}>
                <span className="flex items-center gap-3"><span className="rounded-lg bg-primary/10 p-2 text-primary"><Volume2 className="h-5 w-5" /></span><span><span className="block text-sm font-semibold">Voice interview</span><span className="block text-xs text-muted-foreground">Hear a natural voice and answer through your microphone.</span></span></span>
                <input type="checkbox" checked={audioMode && audioSupported} disabled={!audioSupported} onChange={(event) => setAudioMode(event.target.checked)} className="h-5 w-5 accent-primary" aria-label="Enable voice interview" />
              </label>
              {!audioSupported && <p className="text-xs text-muted-foreground">Voice input is unavailable in this browser; typed interviews still work fully.</p>}

              <Button size="lg" onClick={begin} disabled={phase === "connecting" || !workflowId} className="w-full">
                {phase === "connecting" ? <><Loader2 className="h-4 w-4 animate-spin" />Connecting securely…</> : <>Enter interview studio <ArrowRight className="h-4 w-4" /></>}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><p className="text-sm font-medium text-primary">Before you begin</p><CardTitle className="text-xl">Session readiness</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Readiness icon={<Target className="h-4 w-4" />} title="Grounded questions" copy="Questions come from your selected role, resume, and current company brief." />
              <Readiness icon={<Mic className="h-4 w-4" />} title="Natural responses" copy="Speak or type in your own words; the coach can probe shallow answers." />
              <Readiness icon={<Sparkles className="h-4 w-4" />} title="Private presence feedback" copy="Posture, gaze, and gesture signals run locally in your browser." />
              <div className="rounded-xl bg-secondary/50 p-4 text-xs leading-5 text-muted-foreground">Tip: answer behavioral questions with Situation → Task → Action → Result, then add what you learned.</div>
            </CardContent>
          </Card>
        </div>
      ) : phase === "complete" && report ? (
        <ReportPanel report={report} metrics={metrics} onRestart={restart} />
      ) : phase === "interrupted" ? (
        <Card className="mx-auto max-w-xl text-center">
          <CardContent className="space-y-4 py-10">
            <WifiOff className="mx-auto h-8 w-8 text-destructive" />
            <h2 className="text-xl font-semibold">The live connection dropped.</h2>
            <p className="text-sm leading-6 text-muted-foreground">Your transcript below is safe in this tab, but this session ended server-side. Start a fresh session to continue practicing - your prepared pack stays selected.</p>
            <div className="flex justify-center gap-2 pt-2">
              <Button onClick={begin}><RefreshCw className="h-4 w-4" />Start new session</Button>
              <Button variant="outline" onClick={() => { setPhase("setup"); }}>Back to setup</Button>
            </div>
            {turns.length > 0 && (
              <details className="mt-4 rounded-xl border p-4 text-left">
                <summary className="cursor-pointer text-sm font-semibold">Recovered transcript ({turns.length} turns)</summary>
                <div className="mt-3 max-h-64 space-y-2 overflow-auto text-sm">
                  {turns.map((turn, index) => <p key={index}><span className="font-semibold">{turn.role === "candidate" ? "You" : "Interviewer"}:</span> {turn.text}</p>)}
                </div>
              </details>
            )}
          </CardContent>
        </Card>
      ) : (
        /* ------------------------------ STUDIO ------------------------------ */
        <div className="studio-bg relative overflow-hidden rounded-3xl border shadow-2xl">
          {/* Top bar */}
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 md:px-6">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 font-mono text-sm text-white backdrop-blur">
                <span className={`rec-dot h-2 w-2 rounded-full ${phase === "ending" ? "bg-amber-400" : "bg-red-500"}`} />
                {elapsed}
              </span>
              <span className="hidden text-sm font-medium text-white/85 sm:block">{selectedWorkflow?.company || "Role-specific"} · live interview</span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setShowTranscript((value) => !value)} aria-label="Toggle live transcript" aria-expanded={showTranscript} className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/75 surface-transition hover:bg-white/20 hover:text-white">
                <MessageSquareText className="h-3.5 w-3.5" /> Transcript
              </button>
              <span className="hidden rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300 sm:inline">Connected</span>
              <span className="hidden rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white/70 md:block">{metrics.postureScore} presence</span>
            </div>
          </div>

          <PresenceCoach active={connected} cameraActive={connected} sessionKey={workflowId} />

          {showTranscript && (
            <div className="absolute inset-y-0 right-0 z-40 flex w-full max-w-sm flex-col border-l border-white/10 bg-black/70 backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <span className="text-sm font-semibold text-white/90">Live transcript</span>
                <button type="button" onClick={() => setShowTranscript(false)} aria-label="Close transcript" className="rounded-md p-1.5 text-white/60 surface-transition hover:bg-white/10 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div aria-live="polite" className="flex-1 space-y-3 overflow-y-auto p-4">
                {turns.length === 0 && <p className="text-sm text-white/50">The conversation will appear here as you go.</p>}
                {turns.map((turn, index) => (
                  <div key={`${turn.role}-${index}`} className={`flex flex-col ${turn.role === "candidate" ? "items-end" : "items-start"}`}>
                    <span className="mb-1 text-[10px] font-bold uppercase tracking-wide text-white/45">{turn.role === "candidate" ? "You" : "Interviewer"}</span>
                    <div className={`max-w-[90%] rounded-2xl px-3 py-2 text-left text-xs leading-5 ${turn.role === "candidate" ? "bg-primary/80 text-white" : "bg-white/10 text-white/85"}`}>{turn.text}</div>
                  </div>
                ))}
                {awaitingReply && <p className="text-center text-[11px] text-white/45">…</p>}
              </div>
            </div>
          )}

          {/* Stage */}
          <div className="relative grid min-h-[520px] place-items-center px-4 pb-40 pt-14 md:pb-44">
            <InterviewerStage speaking={speaking} awaitingReply={awaitingReply} lastLine={lastInterviewerLine} />

            {/* Candidate PiP camera */}
            <div className="absolute bottom-28 right-4 z-30 hidden aspect-video w-48 sm:block md:w-56 lg:w-64">
              <CameraPanel compact />
            </div>
          </div>

          {/* Control dock */}
          <div className="absolute inset-x-0 bottom-0 z-30 border-t border-white/10 bg-black/35 px-4 py-3 backdrop-blur-xl">
            <div className="mx-auto flex max-w-4xl items-center gap-2 md:gap-3">
              {audioMode && audioSupported ? (
                <>
                  <button
                    type="button"
                    onClick={listening ? stopMic : startMic}
                    disabled={!connected || awaitingReply}
                    aria-label={listening ? "Mute microphone" : "Unmute microphone"}
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full surface-transition ${listening ? "bg-emerald-500 text-white orb-listening" : "bg-red-500/90 text-white hover:bg-red-500"}`}
                  >
                    {listening ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
                  </button>
                  <Input
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }}
                    disabled={!connected || awaitingReply}
                    placeholder={awaitingReply ? "Interviewer is responding…" : listening ? "Listening… speak or type" : "Answer with a concrete example…"}
                    aria-label="Interview answer"
                    className="h-12 flex-1 border-white/15 bg-white/10 text-white placeholder:text-white/50 focus-visible:ring-white/40"
                  />
                </>
              ) : (
                <Input
                  value={input}
                  maxLength={12000}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }}
                  disabled={!connected || awaitingReply}
                  placeholder={awaitingReply ? "Waiting for interviewer…" : "Answer with a concrete example…"}
                  aria-label="Interview answer"
                  className="h-12 flex-1 border-white/15 bg-white/10 text-white placeholder:text-white/50 focus-visible:ring-white/40"
                />
              )}
              <Button type="button" size="icon" onClick={() => send()} disabled={!connected || awaitingReply || !input.trim()} aria-label="Send answer" className="h-12 w-12 shrink-0 rounded-full"><Send className="h-5 w-5" /></Button>
              <Button type="button" onClick={end} disabled={phase === "ending"} variant="destructive" className="ml-1 h-12 shrink-0 rounded-full px-4 md:px-6">
                {phase === "ending" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
                <span className="hidden sm:inline">{phase === "ending" ? "Scoring…" : "End & score"}</span>
              </Button>
            </div>
            <p className="mx-auto mt-1.5 max-w-4xl truncate text-center text-[11px] text-white/45">
              {listening && interim ? `“${interim}”` : audioMode && audioSupported ? (listening ? "Microphone live · Enter to send typed text" : "Tap the mic to speak, or type your answer") : "Type your answers · voice unavailable in this browser"}
            </p>
          </div>
        </div>
      )}
    </main>
  );
}

function InterviewerStage({ speaking, awaitingReply, lastLine }: { speaking: boolean; awaitingReply: boolean; lastLine: string }) {
  return (
    <div className="flex w-full max-w-2xl flex-col items-center text-center">
      <div className="relative mb-8">
        <div className={`relative flex h-32 w-32 items-center justify-center rounded-full ${speaking ? "orb-speaking text-primary" : "orb-idle"}`}>
          {speaking && (<><span /><span /><span /></>)}
          <div className={`relative z-10 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-violet-600/80 shadow-xl transition-transform ${speaking ? "scale-105" : "scale-100"}`}>
            <Bot className="h-10 w-10 text-white" />
          </div>
        </div>
        {awaitingReply && (
          <span className="absolute -bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-card/90 px-3 py-1 text-xs text-muted-foreground shadow backdrop-blur">
            <Loader2 className="h-3 w-3 animate-spin" /> considering…
          </span>
        )}
        {!awaitingReply && speaking && (
          <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow">speaking</span>
        )}
      </div>
      <div className="min-h-[96px] w-full rounded-2xl border border-white/10 bg-white/5 p-5 text-base leading-7 text-white/90 backdrop-blur-md md:text-lg">
        {lastLine || "Your interviewer will open the session in a moment."}
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-2 text-[11px] text-white/50">
        <span className="rounded-full bg-white/10 px-2.5 py-1">Natural voice</span>
        <span className="rounded-full bg-white/10 px-2.5 py-1">Follow-up probing</span>
        <span className="rounded-full bg-white/10 px-2.5 py-1">Time-aware pacing</span>
      </div>
    </div>
  );
}

function BriefStat({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 truncate text-sm font-semibold">{value}</p></div>;
}

function Readiness({ icon, title, copy }: { icon: React.ReactNode; title: string; copy: string }) {
  return <div className="flex gap-3"><span className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">{icon}</span><div><p className="text-sm font-semibold">{title}</p><p className="mt-0.5 text-sm leading-6 text-muted-foreground">{copy}</p></div></div>;
}

function ReportPanel({ report, metrics, onRestart }: { report: any; metrics: ReturnType<typeof useMetrics.getState>["metrics"]; onRestart: () => void }) {
  const scores = Object.entries(report?.scores || {}) as [string, number][];
  const presence = [
    ["Gestures", metrics.handDetectionCounter, `${metrics.handDetectionDuration.toFixed(0)}s active`],
    ["Gaze resets", metrics.notFacingCounter, `${metrics.notFacingDuration.toFixed(0)}s away`],
    ["Posture resets", metrics.badPostureDetectionCounter, `${metrics.badPostureDuration.toFixed(0)}s adjusting`],
    ["Presence score", metrics.postureScore, `gaze stability ${metrics.gazeStabilityScore}`],
  ] as const;
  const exportData = { ...report, local_presence_metrics: metrics };
  return <div className="space-y-6">
    <Card className="overflow-hidden"><CardContent className="grid gap-6 p-6 lg:grid-cols-[1.2fr_0.8fr]"><div><span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" />Session complete</span><h2 className="mt-4 text-3xl font-semibold tracking-tight">Your coaching debrief</h2><p className="mt-3 max-w-2xl leading-7 text-muted-foreground">{report?.summary || "Your report has been saved to practice history."}</p>{report?.verdict && <p className="mt-4 rounded-xl border bg-secondary/30 p-4 text-sm"><span className="font-semibold">Coach verdict:</span> {report.verdict}</p>}</div><div className="flex flex-col justify-end gap-2"><Button onClick={() => downloadJson("hustlrzz-coaching-report.json", exportData)}><Download className="h-4 w-4" />Export full report</Button><Button variant="outline" onClick={onRestart}><RefreshCw className="h-4 w-4" />Practice another session</Button></div></CardContent></Card>
    {report?.hiring_manager && (
      <Card className="border-primary/20 bg-primary/[0.03]">
        <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" />Hiring-manager view</CardTitle><p className="text-xs text-muted-foreground">How a hiring manager would read this interview.</p></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${String(report.hiring_manager.decision).includes("hire") && !String(report.hiring_manager.decision).includes("no-hire") ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : String(report.hiring_manager.decision).includes("no-hire") ? "bg-red-500/10 text-red-700 dark:text-red-300" : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>{report.hiring_manager.decision || "lean-no-hire"}</span>
            <span className="rounded-full bg-secondary px-2.5 py-1 text-xs">confidence {report.hiring_manager.confidence || "medium"}</span>
          </div>
          {report.hiring_manager.risk && <p className="text-sm"><span className="font-semibold">Risk if hired:</span> {report.hiring_manager.risk}</p>}
          {report.hiring_manager.bar_raiser_notes && <p className="text-sm leading-6 text-muted-foreground"><span className="font-semibold text-foreground">Bar-raiser:</span> {report.hiring_manager.bar_raiser_notes}</p>}
        </CardContent>
      </Card>
    )}
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Target className="h-5 w-5 text-primary" />Answer quality</CardTitle></CardHeader><CardContent className="space-y-4">{scores.length ? scores.map(([label, rawScore]) => { const score = Number(rawScore) || 0; return <div key={label}><div className="mb-1.5 flex justify-between text-sm"><span className="font-medium capitalize">{label.replace(/_/g, " ")}</span><span className="font-semibold">{score}/100</span></div><div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(score, 100))}%` }} /></div></div>; }) : <p className="text-sm text-muted-foreground">No numerical scores were returned.</p>}</CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><MessageSquareText className="h-5 w-5 text-primary" />Local presence signals</CardTitle><p className="text-xs text-muted-foreground">These measurements stayed in your browser.</p></CardHeader><CardContent className="grid grid-cols-2 gap-3">{presence.map(([label, value, detail]) => <div key={label} className="rounded-xl bg-secondary/50 p-3"><p className="text-2xl font-semibold">{value}</p><p className="mt-1 text-xs font-medium">{label}</p><p className="mt-1 text-[11px] text-muted-foreground">{detail}</p></div>)}</CardContent></Card>
    </div>
    <div className="grid gap-6 lg:grid-cols-2">
      <FeedbackList title="What worked" items={report?.strengths || []} positive />
      <FeedbackList title="Next practice focus" items={report?.improvements || []} />
    </div>
    {(report?.star_example || report?.next_drill || (report?.delivery_notes?.length ?? 0) > 0) && (
      <div className="grid gap-6 lg:grid-cols-3">
        {report?.star_example && <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Star className="h-4 w-4 text-primary" />Strongest STAR moment</CardTitle></CardHeader><CardContent className="text-sm leading-6 text-muted-foreground">{report.star_example}</CardContent></Card>}
        {(report?.delivery_notes?.length ?? 0) > 0 && <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><VideoOff className="h-4 w-4 text-primary" />Delivery notes</CardTitle></CardHeader><CardContent><ul className="space-y-2 text-sm leading-6 text-muted-foreground">{report.delivery_notes.slice(0, 4).map((note: string, index: number) => <li key={index}>• {note}</li>)}</ul></CardContent></Card>}
        {report?.next_drill && <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Dumbbell className="h-4 w-4 text-primary" />Next drill</CardTitle></CardHeader><CardContent className="text-sm leading-6 text-muted-foreground">{report.next_drill}</CardContent></Card>}
      </div>
    )}
  </div>;
}

function FeedbackList({ title, items, positive = false }: { title: string; items: string[]; positive?: boolean }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent>{items.length ? <ul className="space-y-3">{items.slice(0, 5).map((item, index) => <li key={`${item}-${index}`} className="flex gap-3 text-sm leading-6"><span className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${positive ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-primary/10 text-primary"}`}>{index + 1}</span><span>{item}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">No additional notes were returned.</p>}</CardContent></Card>;
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { downloadJson } from "@/lib/download";
import { useAudio } from "@/hooks/useAudio";
import { useMetrics } from "@/context/MetricsContext";
import { CameraPanel } from "@/components/interview/CameraPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label, Textarea } from "@/components/ui/input";
import {
  AlertCircle, ArrowRight, Bot, Camera, CheckCircle2, Clock3,
  Download, History, Keyboard, Loader2, MessageSquareText, Mic, MicOff,
  RotateCcw, Send, ShieldCheck, Square, Target, UserRound, Volume2,
} from "lucide-react";

type Phase = "setup" | "live" | "scoring" | "complete";
type Turn = { role: "candidate" | "coach"; text: string; intent?: string };
type Attempt = { id: string; scenario: string; score: number; contentScore: number; deliveryScore: number; createdAt: string };

const PROMPTS: Record<string, string> = {
  "behavioral interview": "Tell me about a difficult project, the action you personally took, and the measurable result.",
  "salary negotiation": "The offer is fixed at the current amount. Why should we reconsider the compensation range?",
  "leadership conversation": "Describe a time you influenced a decision without having formal authority.",
  "career introduction": "Walk me through your background and why it makes you a strong fit for this opportunity.",
};

const HISTORY_KEY = "hustlrzz-coaching-attempts-v1";

export function PracticeRoom() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [scenario, setScenario] = useState("behavioral interview");
  const [difficulty, setDifficulty] = useState("realistic");
  const [coachStyle, setCoachStyle] = useState("recruiter");
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [turnBusy, setTurnBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const metrics = useMetrics((state) => state.metrics);
  const resetMetrics = useMetrics((state) => state.reset);
  const openingPrompt = PROMPTS[scenario];

  const { supported, listening, interim, error: voiceError, start, stop, speak } = useAudio((text) => {
    setInput((current) => `${current}${current ? " " : ""}${text}`);
  });

  useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      if (Array.isArray(parsed)) setAttempts(parsed.slice(0, 8));
    } catch {
      localStorage.removeItem(HISTORY_KEY);
    }
  }, []);

  useEffect(() => {
    if (phase !== "live") return;
    const timer = window.setInterval(() => setElapsedSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns, turnBusy]);

  const candidateAnswers = turns.filter((turn) => turn.role === "candidate").length;
  const previousComparable = useMemo(() => attempts.find((attempt) => attempt.scenario === scenario), [attempts, scenario]);

  const begin = () => {
    stop();
    window.speechSynthesis?.cancel();
    resetMetrics();
    setResult(null);
    setInput("");
    setError(null);
    setElapsedSeconds(0);
    setTurns([{ role: "coach", text: openingPrompt }]);
    setPhase("live");
    if (voiceEnabled && autoSpeak && supported) speak(openingPrompt);
  };

  const sendAnswer = async () => {
    const answer = input.trim();
    if (answer.length < 10 || turnBusy) return;
    stop();
    setError(null);
    setTurnBusy(true);
    const nextTurns: Turn[] = [...turns, { role: "candidate", text: answer }];
    setTurns(nextTurns);
    setInput("");
    try {
      const response = await api<{ data: { message: string; intent: string; done: boolean } }>("/coaching/practice/turn", {
        method: "POST",
        body: JSON.stringify({
          scenario, difficulty, coach_style: coachStyle, opening_prompt: openingPrompt,
          history: turns.slice(-10), candidate_answer: answer,
        }),
      });
      const coachTurn: Turn = { role: "coach", text: response.data.message, intent: response.data.intent };
      setTurns((current) => [...current, coachTurn]);
      if (voiceEnabled && autoSpeak && supported) speak(response.data.message);
      if (response.data.done) setError("The coach has reached a natural stopping point. Finish the session for your report, or answer once more.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The coach could not respond. Your transcript is still safe in this browser.");
      setInput(answer);
    } finally {
      setTurnBusy(false);
    }
  };

  const normalizedPresence = () => {
    const duration = Math.max(elapsedSeconds, 1);
    const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
    return {
      ...metrics,
      sessionDurationSeconds: duration,
      eyeContactConsistency: cameraEnabled ? clamp(100 - (metrics.notFacingDuration / duration) * 100) : 0,
      postureStability: cameraEnabled ? clamp(100 - (metrics.badPostureDuration / duration) * 100) : 0,
      gestureRatePerMinute: cameraEnabled ? Number((metrics.handDetectionCounter / (duration / 60)).toFixed(1)) : 0,
      cameraEnabled,
    };
  };

  const finish = async () => {
    if (!candidateAnswers || turnBusy) return;
    stop();
    setPhase("scoring");
    setError(null);
    const transcript = turns.map((turn) => `${turn.role === "coach" ? "Coach" : "Candidate"}: ${turn.text}`).join("\n\n");
    try {
      const response = await api<{ data: any }>("/coaching/practice", {
        method: "POST",
        body: JSON.stringify({ scenario, prompt: openingPrompt, answer: transcript, presence_metrics: normalizedPresence() }),
      });
      setResult({ ...response.data, presence: normalizedPresence(), transcript: turns, scenario, difficulty, coachStyle, previousScore: previousComparable?.score ?? null });
      const attempt: Attempt = {
        id: crypto.randomUUID?.() || String(Date.now()), scenario,
        score: Number(response.data.overall_score) || 0,
        contentScore: Number(response.data.content?.score) || 0,
        deliveryScore: Number(response.data.delivery?.score) || 0,
        createdAt: new Date().toISOString(),
      };
      const nextAttempts = [attempt, ...attempts].slice(0, 8);
      setAttempts(nextAttempts);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(nextAttempts));
      setPhase("complete");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The report could not be generated. Your transcript remains on screen.");
      setPhase("live");
    }
  };

  const reset = () => {
    stop();
    window.speechSynthesis?.cancel();
    resetMetrics();
    setPhase("setup");
    setTurns([]);
    setInput("");
    setResult(null);
    setError(null);
    setElapsedSeconds(0);
  };

  if (phase === "setup") {
    return <Setup
      scenario={scenario} setScenario={setScenario} difficulty={difficulty} setDifficulty={setDifficulty}
      coachStyle={coachStyle} setCoachStyle={setCoachStyle} cameraEnabled={cameraEnabled}
      setCameraEnabled={setCameraEnabled} voiceEnabled={voiceEnabled && supported}
      setVoiceEnabled={setVoiceEnabled} autoSpeak={autoSpeak} setAutoSpeak={setAutoSpeak}
      voiceSupported={supported} prompt={openingPrompt} attempts={attempts} onBegin={begin}
    />;
  }

  if (phase === "complete" && result) {
    return <Result result={result} attempts={attempts} onRetry={begin} onReset={reset} onSpeak={() => speak(result.better_answer || result.summary || "")} />;
  }

  return <div className="space-y-4">
    <header className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-sm font-medium text-primary">Live coaching</p><h2 className="mt-1 text-xl font-semibold capitalize">{scenario}</h2></div>
      <div className="flex flex-wrap items-center gap-2 text-xs"><span className="rounded-full bg-secondary px-3 py-1.5 font-mono"><Clock3 className="mr-1 inline h-3.5 w-3.5" />{formatTime(elapsedSeconds)}</span><span className="rounded-full bg-secondary px-3 py-1.5">{candidateAnswers} answers</span><Button variant="outline" size="sm" onClick={finish} disabled={!candidateAnswers || phase === "scoring"}>{phase === "scoring" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-3.5 w-3.5" />}Finish &amp; review</Button></div>
    </header>
    {error && <div role="status" className="flex gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
    <div className={`grid gap-6 ${cameraEnabled ? "xl:grid-cols-[minmax(340px,0.75fr)_minmax(0,1.25fr)]" : ""}`}>
      {cameraEnabled && <Card><CardHeader className="flex-row items-start justify-between space-y-0"><div><CardTitle className="text-lg">Presence coach</CardTitle><p className="mt-1 text-xs text-muted-foreground">Private, on-device signals</p></div><span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">Local only</span></CardHeader><CardContent><CameraPanel /></CardContent></Card>}
      <Card className="flex min-h-[680px] flex-col overflow-hidden"><CardHeader className="border-b bg-secondary/20"><CardTitle className="flex items-center gap-2 text-lg"><MessageSquareText className="h-5 w-5 text-primary" />Conversation</CardTitle><p className="text-xs text-muted-foreground">{coachStyle.replace("-", " ")} · {difficulty} pressure</p></CardHeader><CardContent className="flex flex-1 flex-col p-0">
        <div aria-live="polite" className="flex-1 space-y-5 overflow-y-auto p-4 md:p-6">{turns.map((turn, index) => <ConversationTurn key={`${turn.role}-${index}`} turn={turn} />)}{turnBusy && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Coach is considering your answer…</div>}<div ref={transcriptEndRef} /></div>
        <div className="border-t bg-background p-4"><Textarea value={input} onChange={(event) => setInput(event.target.value)} rows={4} maxLength={4000} disabled={turnBusy || phase === "scoring"} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); sendAnswer(); } }} placeholder="Type your answer, or use the microphone…" aria-label="Coaching answer" />{listening && <div aria-live="polite" className="mt-2 flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-xs text-primary"><span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />{interim || "Listening. Start speaking when ready…"}</div>}{voiceError && <p role="alert" className="mt-2 text-xs leading-5 text-destructive">{voiceError}</p>}<div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center"><Button type="button" variant={listening ? "destructive" : "secondary"} onClick={listening ? stop : start} disabled={!voiceEnabled || !supported || turnBusy}>{listening ? <><MicOff className="h-4 w-4" />Stop listening</> : <><Mic className="h-4 w-4" />Speak answer</>}</Button><Button className="sm:flex-1" onClick={sendAnswer} disabled={input.trim().length < 10 || turnBusy}><Send className="h-4 w-4" />Send response</Button><span className="text-right text-[11px] text-muted-foreground">{input.length}/4,000</span></div></div>
      </CardContent></Card>
    </div>
  </div>;
}

function Setup(props: any) {
  return <div className="grid gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(340px,0.92fr)]"><Card><CardHeader><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Session setup</p><CardTitle className="text-2xl">Build the pressure you want to practise</CardTitle><p className="text-sm leading-6 text-muted-foreground">Choose the conversation, response mode, and feedback level before any device permission is requested.</p></CardHeader><CardContent className="space-y-6"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="scenario">Scenario</Label><select id="scenario" value={props.scenario} onChange={(event) => props.setScenario(event.target.value)} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm">{Object.keys(PROMPTS).map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></div><div className="space-y-2"><Label htmlFor="coach-style">Conversation partner</Label><select id="coach-style" value={props.coachStyle} onChange={(event) => props.setCoachStyle(event.target.value)} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"><option value="recruiter">Recruiter</option><option value="hiring-manager">Hiring manager</option><option value="negotiator">Offer negotiator</option></select></div></div><div className="space-y-2"><Label>Pressure level</Label><div className="grid grid-cols-3 gap-2">{["supportive", "realistic", "challenging"].map((item) => <button key={item} type="button" onClick={() => props.setDifficulty(item)} className={`min-h-11 rounded-lg border px-2 text-sm font-semibold capitalize ${props.difficulty === item ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"}`}>{item}</button>)}</div></div><div className="rounded-xl border bg-secondary/25 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Opening prompt</p><p className="mt-2 text-base font-medium leading-7">{props.prompt}</p></div><div className="grid gap-3 sm:grid-cols-3"><Capability icon={<Keyboard className="h-5 w-5" />} title="Typing" description="Always available" active /><Capability icon={<Mic className="h-5 w-5" />} title="Voice" description={props.voiceSupported ? "Browser supported" : "Unavailable here"} active={props.voiceEnabled} onClick={() => props.voiceSupported && props.setVoiceEnabled(!props.voiceEnabled)} /><Capability icon={<Camera className="h-5 w-5" />} title="Camera" description="Local processing" active={props.cameraEnabled} onClick={() => props.setCameraEnabled(!props.cameraEnabled)} /></div><label className="flex items-center justify-between gap-3 rounded-xl border p-4"><span><span className="block text-sm font-semibold">Read coach responses aloud</span><span className="block text-xs text-muted-foreground">You can still read every response on screen.</span></span><input type="checkbox" checked={props.autoSpeak && props.voiceSupported} disabled={!props.voiceSupported} onChange={(event) => props.setAutoSpeak(event.target.checked)} className="h-5 w-5 accent-primary" /></label><div className="rounded-xl border border-primary/25 bg-primary/5 p-4 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mb-2 h-5 w-5 text-primary" />Your video never leaves this device. The service receives only the transcript you approve and numerical posture, gaze, and gesture summaries. Camera and microphone remain optional.</div><Button size="lg" className="w-full" onClick={props.onBegin}>Enter coaching studio <ArrowRight className="h-4 w-4" /></Button></CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2 text-xl"><History className="h-5 w-5" />Recent attempts</CardTitle><p className="text-sm text-muted-foreground">Stored only in this browser for quick comparison.</p></CardHeader><CardContent>{props.attempts.length ? <div className="space-y-2">{props.attempts.slice(0, 6).map((attempt: Attempt) => <div key={attempt.id} className="flex items-center justify-between rounded-xl border p-3"><div><p className="text-sm font-medium capitalize">{attempt.scenario}</p><p className="mt-0.5 text-xs text-muted-foreground">{new Date(attempt.createdAt).toLocaleString()}</p></div><span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">{attempt.score}</span></div>)}</div> : <div className="flex min-h-[340px] flex-col items-center justify-center text-center"><Target className="h-7 w-7 text-muted-foreground" /><p className="mt-3 font-semibold">Your progress starts here</p><p className="mt-1 max-w-xs text-sm leading-6 text-muted-foreground">Complete a session to unlock attempt comparisons and a focused next drill.</p></div>}</CardContent></Card></div>;
}

function Result({ result, attempts, onRetry, onReset, onSpeak }: any) {
  const score = Math.max(0, Math.min(Number(result.overall_score) || 0, 100));
  const delta = result.previousScore != null ? score - Number(result.previousScore) : null;
  return <div className="space-y-6"><Card className="overflow-hidden"><CardHeader className="bg-primary text-primary-foreground"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-foreground/70">Session complete</p><CardTitle className="mt-2 text-3xl">Your coaching review</CardTitle><p className="mt-2 max-w-2xl text-sm leading-6 text-primary-foreground/80">{result.summary}</p></div><div className="rounded-2xl bg-white/10 px-6 py-4 text-center"><p className="text-4xl font-semibold">{score}</p><p className="text-xs uppercase tracking-wide text-primary-foreground/70">overall score</p>{delta != null && <p className="mt-1 text-xs">{delta >= 0 ? "+" : ""}{delta} vs previous</p>}</div></div></CardHeader><CardContent className="space-y-6 pt-6"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><ScoreCard title="Content" value={Number(result.content?.score) || 0} suffix="/10" /><ScoreCard title="Delivery" value={Number(result.delivery?.score) || 0} suffix="/10" /><ScoreCard title="Eye contact" value={Number(result.presence?.eyeContactConsistency) || 0} suffix="%" muted={!result.presence?.cameraEnabled} /><ScoreCard title="Posture" value={Number(result.presence?.postureStability) || 0} suffix="%" muted={!result.presence?.cameraEnabled} /></div><div className="grid gap-4 lg:grid-cols-2"><FeedbackDimension title="Content feedback" data={result.content} /><FeedbackDimension title="Delivery feedback" data={result.delivery} /></div>{result.transcript_evidence?.length ? <section><h3 className="text-sm font-semibold">Feedback grounded in your words</h3><div className="mt-3 space-y-2">{result.transcript_evidence.map((item: any, index: number) => <div key={`${item.quote}-${index}`} className="rounded-xl border p-4"><blockquote className="text-sm font-medium">“{item.quote}”</blockquote><p className="mt-2 text-xs leading-5 text-muted-foreground">{item.insight}</p></div>)}</div></section> : null}{result.better_answer && <section className="rounded-xl border border-primary/30 bg-primary/5 p-5"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">A stronger version</h3><Button size="icon" variant="ghost" onClick={onSpeak} aria-label="Read stronger answer aloud"><Volume2 className="h-4 w-4" /></Button></div><p className="mt-3 text-sm leading-7">{result.better_answer}</p></section>}{result.next_drill && <section className="rounded-xl bg-secondary/50 p-5"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your next drill</p><p className="mt-2 text-sm leading-6">{result.next_drill}</p></section>}<div className="flex flex-wrap gap-2"><Button onClick={onRetry}><RotateCcw className="h-4 w-4" />Retry same scenario</Button><Button variant="outline" onClick={onReset}>Change setup</Button><Button variant="outline" onClick={() => downloadJson("hustlrzz-coaching-session.json", result)}><Download className="h-4 w-4" />Export report</Button></div></CardContent></Card>{attempts.length > 1 && <Card><CardHeader><CardTitle className="text-lg">Progress history</CardTitle></CardHeader><CardContent><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{attempts.slice(0, 4).map((attempt: Attempt) => <div key={attempt.id} className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">{new Date(attempt.createdAt).toLocaleDateString()}</p><p className="mt-1 text-2xl font-semibold">{attempt.score}</p><p className="text-xs capitalize text-muted-foreground">{attempt.scenario}</p></div>)}</div></CardContent></Card>}</div>;
}

function Capability({ icon, title, description, active, onClick }: { icon: React.ReactNode; title: string; description: string; active: boolean; onClick?: () => void }) {
  const content = <><span className={`rounded-lg p-2 ${active ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}>{icon}</span><span><span className="block text-sm font-semibold">{title}</span><span className="block text-xs text-muted-foreground">{description}</span></span><span className={`ml-auto h-2.5 w-2.5 rounded-full ${active ? "bg-emerald-500" : "bg-muted-foreground/30"}`} /></>;
  return onClick ? <button type="button" onClick={onClick} aria-pressed={active} className={`flex items-center gap-3 rounded-xl border p-3 text-left ${active ? "border-primary/30 bg-primary/5" : "hover:bg-accent"}`}>{content}</button> : <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">{content}</div>;
}

function ConversationTurn({ turn }: { turn: Turn }) {
  const coach = turn.role === "coach";
  return <div className={`flex gap-3 ${coach ? "" : "justify-end"}`}>{coach && <span className="mt-1 rounded-full bg-primary/10 p-2 text-primary"><Bot className="h-4 w-4" /></span>}<div className={`max-w-[84%] rounded-2xl px-4 py-3 text-sm leading-6 ${coach ? "rounded-tl-sm bg-secondary" : "rounded-tr-sm bg-primary text-primary-foreground"}`}><p>{turn.text}</p>{turn.intent && <p className="mt-1 text-[11px] opacity-60">{turn.intent.replace("-", " ")}</p>}</div>{!coach && <span className="mt-1 rounded-full bg-secondary p-2"><UserRound className="h-4 w-4" /></span>}</div>;
}

function FeedbackDimension({ title, data }: { title: string; data: any }) {
  return <div className="rounded-xl border p-4"><div className="flex items-center justify-between"><h3 className="font-semibold">{title}</h3><span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold">{Number(data?.score) || 0}/10</span></div>{data?.strengths?.length ? <ul className="mt-3 space-y-1.5 text-sm leading-5 text-emerald-700 dark:text-emerald-300">{data.strengths.map((item: string) => <li key={item} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{item}</li>)}</ul> : null}{data?.improvements?.length ? <ul className="mt-3 space-y-1.5 text-sm leading-5 text-amber-700 dark:text-amber-300">{data.improvements.map((item: string) => <li key={item} className="flex gap-2"><ArrowRight className="mt-0.5 h-4 w-4 shrink-0" />{item}</li>)}</ul> : null}</div>;
}

function ScoreCard({ title, value, suffix, muted }: { title: string; value: number; suffix: string; muted?: boolean }) {
  return <div className={`rounded-xl border p-4 ${muted ? "opacity-50" : ""}`}><p className="text-xs font-medium text-muted-foreground">{title}</p><p className="mt-1 text-2xl font-semibold">{muted ? "Off" : <>{value}<span className="text-sm text-muted-foreground">{suffix}</span></>}</p></div>;
}

function formatTime(total: number) { return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`; }
function titleCase(value: string) { return value.replace(/\b\w/g, (letter) => letter.toUpperCase()); }

"use client";

import { useEffect, useRef, useState } from "react";
import { api, wsUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useCamera } from "@/hooks/useCamera";
import { useMediapipe } from "@/hooks/useMediaPipe";
import { useAudio } from "@/hooks/useAudio";
import { CameraPanel } from "@/components/interview/CameraPanel";
import { AlertCircle, Loader2, Mic, MicOff, Send } from "lucide-react";

interface Turn { role: string; text: string }

export function InterviewPanel() {
  const [workflowId, setWorkflowId] = useState("");
  const [duration, setDuration] = useState(15);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [starting, setStarting] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [audioMode, setAudioMode] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const { supported: audioSupported, listening, start: startMic, stop: stopMic, speak } =
    useAudio((text) => send(text));

  useEffect(() => {
    api<{ data: any[] }>("/workflows").then(() => {}).catch(() => {});
  }, []);

  const begin = async () => {
    if (!workflowId) {
      setSessionError("Enter the workflow ID from your prepared pack to begin.");
      return;
    }
    setStarting(true);
    setSessionError(null);
    setReport(null);
    setTurns([]);
    try {
      const r = await api<{ data: { session_id: string; websocket_parameter: string } }>("/interviews/start", {
        method: "POST",
        body: JSON.stringify({ workflow_id: workflowId, duration, is_audio: audioMode }),
      });
      connectWs(r.data.session_id, r.data.websocket_parameter);
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : "Unable to start the interview.");
    } finally {
      setStarting(false);
    }
  };

  const connectWs = async (sid: string, qs: string) => {
    const ws = new WebSocket(wsUrl(`/ws/${sid}${qs}`, {}));
    ws.onopen = () => { setConnected(true); };
    ws.onmessage = (ev) => {
      let msg: any;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        setSessionError("The interviewer sent an unreadable response. Please restart the session.");
        return;
      }
      if (msg.type === "question" || msg.type === "message") {
        const d = msg.data || {};
        const text = d.message || d.question || "";
        if (text) {
          setTurns((t) => [...t, { role: "interviewer", text }]);
          if (audioMode) speak(text);
        }
      } else if (msg.type === "report") {
        setReport(msg.data);
      }
    };
    ws.onerror = () => setSessionError("The interview connection was interrupted. Your saved preparation pack is unaffected.");
    ws.onclose = () => setConnected(false);
    wsRef.current = ws;
  };

  const send = (textOverride?: string) => {
    const text = textOverride ?? input;
    if (!text.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "message", text }));
    setTurns((t) => [...t, { role: "candidate", text }]);
    setInput("");
  };

  const end = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ type: "end" }));
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <section><p className="text-sm font-semibold text-primary">Live practice</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Stay present. Answer with evidence.</h1><p className="mt-2 text-muted-foreground">Your prepared context supports the interviewer while body-language signals remain local to your device.</p></section>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle>Start / configuration</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Workflow ID (from Prepare)</Label>
              <Input value={workflowId} onChange={(e) => setWorkflowId(e.target.value)} placeholder="paste workflow id" />
            </div>
            <div className="space-y-2">
              <Label>Duration (5–60 min)</Label>
              <Input type="number" min={5} max={60} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <input id="audioMode" type="checkbox" checked={audioMode} onChange={(e) => setAudioMode(e.target.checked)} />
              <Label htmlFor="audioMode" className="mb-0">Audio mode (speak answers, hear questions)</Label>
              {audioSupported ? null : <span className="text-muted-foreground text-xs">(not supported in this browser)</span>}
            </div>
            <Button onClick={begin} disabled={starting || !workflowId} className="w-full">
              {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : connected ? "Reconnect interviewer" : "Start interview"}
            </Button>
            {connected && <Button variant="destructive" onClick={end} className="w-full">End session</Button>}
            {sessionError && <p className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{sessionError}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Live body-language tracking</CardTitle></CardHeader>
          <CardContent>
            <CameraPanel />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="min-h-[500px] flex flex-col">
          <CardHeader>
            <CardTitle>Interviewer</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-3">
            <div className="flex-1 space-y-3 overflow-auto max-h-[420px]">
              {turns.length === 0 && <p className="text-sm text-muted-foreground">The interviewer will greet you once connected.</p>}
              {turns.map((t, i) => (
                <div key={i} className={t.role === "candidate" ? "text-right" : "text-left"}>
                  <span className={`inline-block rounded-lg px-3 py-2 text-sm max-w-[85%] ${t.role === "candidate" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
                    {t.text}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              {audioMode && audioSupported && (
                <Button
                  onClick={listening ? stopMic : startMic}
                  disabled={!connected}
                  variant={listening ? "destructive" : "secondary"}
                  title={listening ? "Stop dictation" : "Hold to dictate"}
                >
                  {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>
              )}
              <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Type or speak your answer…" />
              <Button onClick={() => send()} disabled={!connected}><Send className="h-4 w-4" /></Button>
            </div>
          </CardContent>
        </Card>
      </div>
      </div>
      {report && <ReportPanel report={report} />}
    </div>
  );
}

function ReportPanel({ report }: { report: any }) {
  const scores = Object.entries(report?.scores || {}) as [string, number][];
  return <Card><CardHeader><CardTitle>Your coaching report</CardTitle><p className="text-sm text-muted-foreground">Use this feedback to choose the next practice focus.</p></CardHeader><CardContent className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
    <div className="grid grid-cols-2 gap-3">{scores.map(([label, score]) => <div key={label} className="rounded-lg bg-secondary p-3"><p className="text-xs font-medium text-muted-foreground capitalize">{label.replace(/_/g, " ")}</p><p className="mt-1 text-2xl font-semibold">{score}<span className="text-sm text-muted-foreground">/100</span></p></div>)}</div>
    <div className="space-y-4"><div><h3 className="font-semibold">Summary</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">{report?.summary || "Your report has been saved to history."}</p></div>{report?.improvements?.length ? <div><h3 className="font-semibold">Next focus</h3><ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">{report.improvements.slice(0, 3).map((item: string) => <li key={item}>{item}</li>)}</ul></div> : null}</div>
  </CardContent></Card>;
}

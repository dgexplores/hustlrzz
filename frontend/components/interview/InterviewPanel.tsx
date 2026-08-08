"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { api, wsUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useCamera } from "@/hooks/useCamera";
import { useMediapipe } from "@/hooks/useMediaPipe";
import { useAudio } from "@/hooks/useAudio";
import { CameraPanel } from "@/components/interview/CameraPanel";
import { Loader2, Mic, MicOff, Send, Volume2 } from "lucide-react";

interface Turn { role: string; text: string }

export function InterviewPanel() {
  const [workflowId, setWorkflowId] = useState("");
  const [duration, setDuration] = useState(15);
  const [picked, setPicked] = useState<any>(null);
  const [wsInfo, setWsInfo] = useState<{ session_id: string; websocket_parameter: string } | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [starting, setStarting] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [audioMode, setAudioMode] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);

  const { supported: audioSupported, listening, start: startMic, stop: stopMic, speak } =
    useAudio((text) => send(text));

  useEffect(() => {
    api<{ data: any[] }>("/workflows").then(() => {}).catch(() => {});
  }, []);

  const begin = async () => {
    if (!workflowId) return alert("Enter a workflow id from Prepare");
    setStarting(true);
    try {
      const r = await api<{ data: { session_id: string; websocket_parameter: string } }>("/interviews/start", {
        method: "POST",
        body: JSON.stringify({ workflow_id: workflowId, duration, is_audio: audioMode }),
      });
      setWsInfo(r.data);
      connectWs(r.data.session_id, r.data.websocket_parameter);
    } catch (err) {
      alert(err instanceof Error ? err.message : "failed to start");
    } finally {
      setStarting(false);
    }
  };

  const connectWs = async (sid: string, qs: string) => {
    const supabase = getSupabase();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token || "";
    const ws = new WebSocket(wsUrl(`/ws/${sid}${qs}`, {}));
    ws.onopen = () => { setConnected(true); };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
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
    ws.onclose = () => setConnected(false);
    wsRef.current = ws;
  };

  const send = (textOverride?: string) => {
    const text = textOverride ?? input;
    if (!text.trim() || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({ type: "message", text }));
    setTurns((t) => [...t, { role: "candidate", text }]);
    setInput("");
  };

  const end = () => {
    wsRef.current?.send(JSON.stringify({ type: "end" }));
    wsRef.current?.close();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
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
  );
}
"use client";

import { useRef, useState } from "react";
import { useCamera } from "@/hooks/useCamera";
import { useMediapipe } from "@/hooks/useMediaPipe";
import { useMetrics } from "@/context/MetricsContext";
import { Button } from "@/components/ui/button";
import { Badge, Switch } from "@/components/ui/badge";
import { PresenceCoach } from "@/components/interview/PresenceCoach";
import { Hand, Eye, Activity, CameraOff, Loader2 } from "lucide-react";

type AuraState = "good" | "warn" | "alert";

const auraClass = (state: AuraState) =>
  state === "good" ? "presence-aura presence-aura-good" : state === "warn" ? "presence-aura presence-aura-warn" : "presence-aura presence-aura-alert";

export function CameraPanel({ compact = false }: { compact?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [overlay, setOverlay] = useState(true);
  const [retryKey, setRetryKey] = useState(0);

  const { status } = useCamera(videoRef, retryKey);
  const live = status === "live";

  const {
    handDetectionCounter,
    handDetectionDuration,
    notFacingCounter,
    notFacingDuration,
    badPostureDetectionCounter,
    badPostureDuration,
    handVisible,
    eyeContact,
    postureGood,
    ready,
    processingError,
  } = useMediapipe(videoRef, canvasRef, overlay, live);

  const metrics = useMetrics((state) => state.metrics);
  const aura: AuraState =
    !postureGood || !eyeContact ? (metrics.postureScore < 60 ? "alert" : "warn") : "good";

  if (compact) {
    return (
      <div className={`relative h-full w-full overflow-hidden rounded-2xl border bg-secondary ${auraClass(aura)}`}>
        <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-cover" />
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        {!live && (
          <p className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
            {live === false && status === "denied" ? "Camera blocked" : "Camera off"}
          </p>
        )}
        {live && !ready && !processingError && (
          <span className="absolute inset-x-0 bottom-1 flex items-center justify-center gap-1.5 bg-background/40 py-0.5 text-[10px] text-muted-foreground backdrop-blur-sm">
            <Loader2 className="h-3 w-3 animate-spin" /> presence starting…
          </span>
        )}
        <div className="absolute right-1.5 top-1.5 flex gap-1 rounded-lg bg-background/70 p-1 backdrop-blur-md">
          <PresenceDot good={postureGood} label="Posture" />
          <PresenceDot good={eyeContact} label="Gaze" />
          <PresenceDot good={handVisible} label="Hands" invert />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PresenceCoach active={live} sessionKey="camera-panel" />
      {status === "no-device" && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-foreground">
          <p className="font-semibold flex items-center gap-2"><CameraOff className="h-4 w-4" /> No camera detected (browser reports 0 devices).</p>
          <p className="mt-1">Open the MacBook lid or check System Settings → Privacy &amp; Security → Camera so your browser is enabled, then reload.</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => setRetryKey((k) => k + 1)}>Retry camera</Button>
        </div>
      )}
      {status === "denied" && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Camera permission blocked. Allow it in the browser address bar, then retry.
          <Button size="sm" variant="outline" className="mt-2" onClick={() => setRetryKey((k) => k + 1)}>Retry</Button>
        </div>
      )}
      {status === "in-use" && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-foreground">
          Camera busy. Close Zoom, FaceTime, or Meet, then retry.
          <Button size="sm" variant="outline" className="mt-2" onClick={() => setRetryKey((k) => k + 1)}>Retry</Button>
        </div>
      )}

      <div className={`relative aspect-video w-full overflow-hidden rounded-xl border-2 bg-secondary ${auraClass(aura)}`}>
        <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover z-10" />
        <canvas ref={canvasRef} width={600} height={480} className="absolute inset-0 w-full h-full z-20" style={{ backgroundColor: "transparent" }} />
        {status !== "live" && <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground z-30">Camera off</p>}
        {live && !ready && !processingError && <p className="absolute inset-0 flex items-center justify-center gap-2 bg-background/50 text-sm text-muted-foreground z-30"><Loader2 className="h-4 w-4 animate-spin" /> Starting private posture feedback…</p>}
        {live && (
          <div className="absolute left-3 top-3 z-30 flex items-center gap-2 rounded-full bg-background/75 px-2.5 py-1 text-[11px] font-semibold backdrop-blur-md">
            <span className={`h-2 w-2 rounded-full ${aura === "good" ? "bg-emerald-500" : aura === "warn" ? "bg-amber-500 rec-dot" : "bg-red-500 rec-dot"}`} />
            Presence {aura === "good" ? "steady" : aura === "warn" ? "adjusting" : "needs attention"}
            <span className="font-normal text-muted-foreground">· posture {metrics.postureScore}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Show posture and hand guide</span>
        <Switch checked={overlay} onCheckedChange={setOverlay} />
      </div>
      {processingError && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-foreground">{processingError}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Metric icon={<Hand className="h-4 w-4" />} title="Gesture" good={handVisible} activeLabel="detected" idleLabel="not detected" count={handDetectionCounter} dur={handDetectionDuration} />
        <Metric icon={<Eye className="h-4 w-4" />} title="Eye contact" good={eyeContact} activeLabel="contact" idleLabel="looking away" count={notFacingCounter} dur={notFacingDuration} />
        <Metric icon={<Activity className="h-4 w-4" />} title="Posture" good={postureGood} activeLabel="steady" idleLabel="adjust" count={badPostureDetectionCounter} dur={badPostureDuration} extra={`score ${metrics.postureScore} · tilt ${metrics.headTiltDeg}°`} />
      </div>
    </div>
  );
}

function PresenceDot({ good, label, invert = false }: { good: boolean; label: string; invert?: boolean }) {
  const positive = invert ? good : good;
  return (
    <span title={`${label}: ${invert ? (good ? "active" : "idle") : good ? "good" : "off"}`}>
      <span className={`block h-2 w-2 rounded-full ${positive ? (invert ? "bg-violet-400" : "bg-emerald-400") : "bg-muted-foreground/50"}`} />
    </span>
  );
}

function Metric({ icon, title, good, activeLabel, idleLabel, count, dur, extra }: { icon: React.ReactNode; title: string; good: boolean; activeLabel: string; idleLabel: string; count: number; dur: number; extra?: string }) {
  return (
    <div className="rounded-lg border p-3 surface-transition">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium flex items-center gap-1">{icon}{title}</span>
        <Badge className={good ? "bg-emerald-500" : "bg-amber-500"}>{good ? activeLabel : idleLabel}</Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{count} events · {dur.toFixed(1)}s{extra ? ` · ${extra}` : ""}</p>
    </div>
  );
}

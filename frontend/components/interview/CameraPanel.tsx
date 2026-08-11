"use client";

import { useRef, useState } from "react";
import { useCamera } from "@/hooks/useCamera";
import { useMediapipe } from "@/hooks/useMediaPipe";
import { Button } from "@/components/ui/button";
import { Badge, Switch } from "@/components/ui/badge";
import { Hand, Eye, Activity, CameraOff, Loader2 } from "lucide-react";

export function CameraPanel() {
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

  return (
    <div className="space-y-4">
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
          Camera busy — close Zoom/FaceTime/Meet, then retry.
          <Button size="sm" variant="outline" className="mt-2" onClick={() => setRetryKey((k) => k + 1)}>Retry</Button>
        </div>
      )}

      <div className="relative w-full h-72 bg-secondary rounded-xl overflow-hidden">
        <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover z-10" />
        <canvas ref={canvasRef} width={600} height={480} className="absolute inset-0 w-full h-full z-20" style={{ backgroundColor: "transparent" }} />
        {status !== "live" && <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground z-30">Camera off</p>}
        {live && !ready && !processingError && <p className="absolute inset-0 flex items-center justify-center gap-2 bg-background/50 text-sm text-muted-foreground z-30"><Loader2 className="h-4 w-4 animate-spin" /> Starting private posture feedback…</p>}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Show posture and hand guide</span>
        <Switch checked={overlay} onCheckedChange={setOverlay} />
      </div>
      {processingError && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-foreground">{processingError}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Metric icon={<Hand className="h-4 w-4" />} title="Gesture" good={handVisible} activeLabel="detected" idleLabel="not detected" count={handDetectionCounter} dur={handDetectionDuration} />
        <Metric icon={<Eye className="h-4 w-4" />} title="Eye contact" good={eyeContact} activeLabel="contact" idleLabel="looking away" count={notFacingCounter} dur={notFacingDuration} />
        <Metric icon={<Activity className="h-4 w-4" />} title="Posture" good={postureGood} activeLabel="steady" idleLabel="adjust" count={badPostureDetectionCounter} dur={badPostureDuration} />
      </div>
    </div>
  );
}

function Metric({ icon, title, good, activeLabel, idleLabel, count, dur }: { icon: React.ReactNode; title: string; good: boolean; activeLabel: string; idleLabel: string; count: number; dur: number }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium flex items-center gap-1">{icon}{title}</span>
        <Badge className={good ? "bg-green-500" : "bg-amber-500"}>{good ? activeLabel : idleLabel}</Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{count} events · {dur.toFixed(1)}s</p>
    </div>
  );
}

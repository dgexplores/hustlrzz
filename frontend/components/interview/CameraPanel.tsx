"use client";

import { useRef, useState } from "react";
import { useCamera } from "@/hooks/useCamera";
import { useMediapipe } from "@/hooks/useMediaPipe";
import { Button } from "@/components/ui/button";
import { Badge, Switch } from "@/components/ui/badge";
import { Hand, Eye, Activity, CameraOff } from "lucide-react";

export function CameraPanel() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [overlay, setOverlay] = useState(true);
  const [retryKey, setRetryKey] = useState(0);

  const { status, errorName } = useCamera(videoRef, retryKey);
  const live = status === "live";

  const {
    handDetectionCounter,
    handDetectionDuration,
    notFacingCounter,
    notFacingDuration,
    badPostureDetectionCounter,
    badPostureDuration,
    isHandOnScreenRef,
    notFacingRef,
    hasBadPostureRef,
  } = useMediapipe(videoRef, canvasRef, overlay, live);

  return (
    <div className="space-y-4">
      {status === "no-device" && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold flex items-center gap-2"><CameraOff className="h-4 w-4" /> No camera detected (browser reports 0 devices).</p>
          <p className="mt-1">Open the MacBook lid or check System Settings → Privacy &amp; Security → Camera so your browser is enabled, then reload.</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => setRetryKey((k) => k + 1)}>Retry camera</Button>
        </div>
      )}
      {status === "denied" && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          Camera permission blocked. Allow it in the browser address bar, then retry.
          <Button size="sm" variant="outline" className="mt-2" onClick={() => setRetryKey((k) => k + 1)}>Retry</Button>
        </div>
      )}
      {status === "in-use" && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Camera busy — close Zoom/FaceTime/Meet, then retry.
          <Button size="sm" variant="outline" className="mt-2" onClick={() => setRetryKey((k) => k + 1)}>Retry</Button>
        </div>
      )}

      <div className="relative w-full h-72 bg-slate-100 rounded-xl overflow-hidden">
        <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover z-10" />
        <canvas ref={canvasRef} width={600} height={480} className="absolute inset-0 w-full h-full z-20" style={{ backgroundColor: "transparent" }} />
        {status !== "live" && <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground z-30">Camera off</p>}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Overlay</span>
        <Switch checked={overlay} onCheckedChange={setOverlay} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Metric icon={<Hand className="h-4 w-4" />} title="Gesture" on={isHandOnScreenRef.current} count={handDetectionCounter} dur={handDetectionDuration} />
        <Metric icon={<Eye className="h-4 w-4" />} title="Eye contact" on={!notFacingRef.current} count={notFacingCounter} dur={notFacingDuration} invert />
        <Metric icon={<Activity className="h-4 w-4" />} title="Bad posture" on={hasBadPostureRef.current} count={badPostureDetectionCounter} dur={badPostureDuration} />
      </div>
    </div>
  );
}

function Metric({ icon, title, on, count, dur, invert }: { icon: React.ReactNode; title: string; on: boolean; count: number; dur: number; invert?: boolean }) {
  const good = invert ? !on : on;
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium flex items-center gap-1">{icon}{title}</span>
        <Badge className={good ? "bg-green-500" : "bg-red-500"}>{on ? (invert ? "away" : "detected") : (invert ? "contact" : "none")}</Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{count} events · {dur.toFixed(1)}s</p>
    </div>
  );
}
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMetrics } from "@/context/MetricsContext";
import {
  Activity, Eye, Hand, Sparkles, X,
} from "lucide-react";

export type NudgeTone = "posture" | "gaze" | "gesture" | "praise";

interface Nudge {
  id: number;
  tone: NudgeTone;
  title: string;
  message: string;
}

const TONE_STYLES: Record<NudgeTone, { ring: string; iconBg: string; bar: string }> = {
  posture: { ring: "border-amber-400/50", iconBg: "bg-amber-500/15 text-amber-600 dark:text-amber-300", bar: "bg-amber-400" },
  gaze: { ring: "border-sky-400/50", iconBg: "bg-sky-500/15 text-sky-600 dark:text-sky-300", bar: "bg-sky-400" },
  gesture: { ring: "border-violet-400/50", iconBg: "bg-violet-500/15 text-violet-600 dark:text-violet-300", bar: "bg-violet-400" },
  praise: { ring: "border-emerald-400/50", iconBg: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300", bar: "bg-emerald-400" },
};

const COPY: Record<NudgeTone, { title: string; messages: string[] }> = {
  posture: {
    title: "Posture check",
    messages: [
      "Roll your shoulders back and unstack your head over your spine.",
      "Sit tall - imagine a string lifting the crown of your head.",
      "You're drifting forward. Ease back into the chair.",
    ],
  },
  gaze: {
    title: "Bring your eyes back",
    messages: [
      "Look toward the camera when you land key points - it reads as confidence.",
      "Eyes drifting. Anchor on the lens, glance at notes only briefly.",
      "Recenter your gaze; steady eye contact holds attention.",
    ],
  },
  gesture: {
    title: "Add a gesture",
    messages: [
      "Hands have been still for a while - one open palm gesture can emphasize your next point.",
      "Try a natural hand movement to punctuate this answer.",
    ],
  },
  praise: {
    title: "Great presence",
    messages: [
      "Steady posture and eye contact for a while now - keep exactly this.",
      "Your delivery signals look strong. Ride this momentum.",
    ],
  },
};

const COOLDOWN_MS = 45_000;
const PRAISE_COOLDOWN_MS = 90_000;
const AUTO_DISMISS_MS = 5_200;

/**
 * PresenceCoach renders animated, aesthetic nudges derived from live browser
 * presence metrics. Cooldowns keep it calm; reduced-motion users get instant
 * static toasts via the global media query.
 */
export function PresenceCoach({
  active,
  cameraActive = false,
  sessionKey = "default",
}: {
  active: boolean;
  cameraActive?: boolean;
  sessionKey?: string;
}) {
  const [nudges, setNudges] = useState<Nudge[]>([]);
  const [exiting, setExiting] = useState<Set<number>>(new Set());
  const lastShownRef = useRef<Record<string, number>>({});
  const idRef = useRef(0);
  const countersRef = useRef({ badPosture: 0, notFacing: 0, gestures: 0 });
  const dismissTimersRef = useRef<number[]>([]);

  const metrics = useMetrics((state) => state.metrics);

  const dismiss = useCallback((id: number) => {
    setExiting((current) => new Set(current).add(id));
    window.setTimeout(() => {
      setNudges((current) => current.filter((nudge) => nudge.id !== id));
      setExiting((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }, 260);
  }, []);

  const enqueue = useCallback((tone: NudgeTone) => {
    const now = Date.now();
    const cooldown = tone === "praise" ? PRAISE_COOLDOWN_MS : COOLDOWN_MS;
    if (now - (lastShownRef.current[tone] || 0) < cooldown) return;
    lastShownRef.current[tone] = now;
    const pool = COPY[tone].messages;
    const message = pool[Math.floor(Math.random() * pool.length)];
    const nudge: Nudge = { id: ++idRef.current, tone, title: COPY[tone].title, message };
    setNudges((current) => {
      if (current.length >= 2) return current;
      return [...current.slice(-1), nudge];
    });
    const timer = window.setTimeout(() => dismiss(nudge.id), AUTO_DISMISS_MS);
    dismissTimersRef.current.push(timer);
  }, [dismiss]);

  useEffect(() => {
    if (!active) return;
    // Reset per-session baselines.
    countersRef.current = { badPosture: metrics.badPostureDetectionCounter, notFacing: metrics.notFacingCounter, gestures: metrics.handDetectionCounter };
    lastShownRef.current = {};
    setNudges([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, sessionKey]);

  useEffect(() => {
    if (!active) return;

    const push = enqueue;

    if (metrics.badPostureDetectionCounter > countersRef.current.badPosture) {
      countersRef.current.badPosture = metrics.badPostureDetectionCounter;
      push("posture");
    }
    if (metrics.notFacingCounter > countersRef.current.notFacing) {
      countersRef.current.notFacing = metrics.notFacingCounter;
      push("gaze");
    }
    if (metrics.handDetectionCounter - countersRef.current.gestures >= 6 && metrics.postureScore > 85) {
      countersRef.current.gestures = metrics.handDetectionCounter;
      push("praise");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, metrics.badPostureDetectionCounter, metrics.notFacingCounter, metrics.handDetectionCounter, metrics.postureScore]);

  // Gesture encouragement: when the camera is on but hands stay idle for a long
  // stretch, suggest one natural gesture (once per cooldown).
  useEffect(() => {
    if (!active || !cameraActive) return;
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      const { handDetectionCounter, postureScore } = useMetrics.getState().metrics;
      const elapsed = (Date.now() - startedAt) / 1000;
      if (
        elapsed > 90 &&
        handDetectionCounter === 0 &&
        postureScore >= 60 &&
        Date.now() - (lastShownRef.current.gesture || 0) > COOLDOWN_MS * 3 &&
        nudges.length === 0
      ) {
        lastShownRef.current.gesture = Date.now();
        enqueue("gesture");
      }
    }, 20_000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, cameraActive]);

  useEffect(() => () => {
    dismissTimersRef.current.forEach((id) => window.clearTimeout(id));
    dismissTimersRef.current = [];
  }, []);

  if (!active) return null;

  return (
    <div aria-live="polite" className="pointer-events-none absolute inset-x-0 top-3 z-40 flex flex-col items-center gap-2 px-3">
      {nudges.map((nudge) => {
        const styles = TONE_STYLES[nudge.tone];
        const Icon = nudge.tone === "posture" ? Activity : nudge.tone === "gaze" ? Eye : nudge.tone === "praise" ? Sparkles : Hand;
        return (
          <div
            key={nudge.id}
            role="status"
            className={`nudge-card pointer-events-auto relative flex w-full max-w-md items-start gap-3 overflow-hidden rounded-xl p-3 ${styles.ring} bg-card/85 ${exiting.has(nudge.id) ? "nudge-exit" : "nudge-enter"}`}
          >
            <span className={`mt-0.5 shrink-0 rounded-lg p-2 ${styles.iconBg}`}><Icon className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-5">{nudge.title}</p>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{nudge.message}</p>
            </div>
            <button
              type="button"
              onClick={() => dismiss(nudge.id)}
              aria-label="Dismiss coaching nudge"
              className="rounded-md p-1 text-muted-foreground surface-transition hover:bg-accent hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <span className={`absolute inset-x-0 bottom-0 h-0.5 ${styles.bar}`} style={{ animation: `shrink-bar ${AUTO_DISMISS_MS}ms linear forwards` }} />
          </div>
        );
      })}
      <style>{`@keyframes shrink-bar { from { transform: scaleX(1); transform-origin: left; } to { transform: scaleX(0); transform-origin: left; } }`}</style>
    </div>
  );
}

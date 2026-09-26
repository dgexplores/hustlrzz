"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { api } from "@/lib/api";
import { trackEvent } from "@/lib/analytics";

type FeedbackStarsProps = {
  /** Server-issued interview or practice session id. */
  sessionId: string;
  /** `on-primary` for headers sitting on the cobalt fill. */
  tone?: "default" | "on-primary";
};

/**
 * Usefulness rating widget (T4). Hidden by parents until a report is visible.
 * One rating per session: a repeat tap upserts via POST /feedback (200), then
 * shows the saved rating with an inline update affordance.
 */
export function FeedbackStars({ sessionId, tone = "default" }: FeedbackStarsProps) {
  const [saved, setSaved] = useState(0);
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!sessionId) return null;

  const active = pending || saved;
  const isOnPrimary = tone === "on-primary";
  const labelClass = isOnPrimary ? "text-primary-foreground/75" : "text-muted-foreground";
  const errorClass = isOnPrimary ? "text-primary-foreground" : "text-destructive";
  const starFilled = isOnPrimary ? "text-primary-foreground" : "text-primary";
  const starEmpty = isOnPrimary ? "text-primary-foreground/35" : "text-muted-foreground/40";

  const submit = async (value: number) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setPending(value); // optimistic; rolled back on failure
    try {
      await api("/feedback", {
        method: "POST",
        body: JSON.stringify({ session_id: sessionId, rating: value }),
      });
      setSaved(value);
      setPending(0);
      trackEvent("feedback_submitted");
    } catch (requestError) {
      setPending(0);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Your rating could not be saved. Please try again."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="print-hide space-y-1.5">
      <p className={`text-xs font-semibold ${labelClass}`}>Was this report useful?</p>
      <div className="flex items-center gap-1" role="group" aria-label="Rate this report">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            disabled={busy}
            aria-label={`Rate ${value} of 5`}
            aria-pressed={value <= active}
            onClick={() => submit(value)}
            className={`surface-transition rounded-md p-3 disabled:opacity-60 ${
              isOnPrimary ? "hover:bg-white/10" : "hover:bg-accent"
            }`}
          >
            <Star
              className={`h-5 w-5 transition-colors duration-200 ${
                value <= active ? starFilled : starEmpty
              }`}
              fill={value <= active ? "currentColor" : "none"}
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
      {saved > 0 && !error && (
        <p className={`text-xs ${labelClass}`} aria-live="polite">
          Thanks — your {saved}★ rating is saved. Tap a star to update.
        </p>
      )}
      {error && (
        <p role="alert" className={`text-xs ${errorClass}`}>
          {error}
        </p>
      )}
    </div>
  );
}

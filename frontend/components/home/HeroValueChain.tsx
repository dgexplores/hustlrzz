"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { CheckCircle, FileText } from "@phosphor-icons/react";
import { HERO_SPRING, REVEAL_FLOOR } from "./heroMotion";

const STEP_MS = 900;
const BARS = [100, 68, 86, 52, 78];
const BAR_MAX = 26;

function Badge({ children, tone }: { children: string; tone: "emerald" | "muted" }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${
        tone === "emerald"
          ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
          : "border-border text-muted-foreground"
      }`}
    >
      {tone === "emerald" ? <CheckCircle className="h-3 w-3" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

/**
 * A simulated run of the product, labelled as such. It depicts the three steps the
 * hero copy promises rather than asserting anything about the visitor.
 */
const STAGES: { key: string; label: string; badge: string; tone: "emerald" | "muted"; body: ReactNode }[] = [
  {
    key: "resume",
    label: "Paste your resume",
    badge: "Verify",
    tone: "emerald",
    body: (
      <>
        <p className="text-[12px] leading-5 text-muted-foreground">
          Your experience extracted into structured competence vectors.
        </p>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-2">
          <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate text-[12px] text-foreground">staff_product_designer_resume.pdf</span>
          <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">142 KB</span>
        </div>
      </>
    ),
  },
  {
    key: "pack",
    label: "Targeted question pack",
    badge: "Dynamics A1",
    tone: "muted",
    body: (
      <>
        <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">RAG synthesis</p>
        <blockquote className="border-l-2 border-primary/50 pl-3 text-[12px] leading-5 text-foreground/90">
          &ldquo;Tell me about a high-functioning team you navigated between systems architecture and urgent GTM
          timelines.&rdquo;
        </blockquote>
      </>
    ),
  },
  {
    key: "live",
    label: "Rehearse live telemetry",
    badge: "Mic active",
    tone: "emerald",
    body: (
      <>
        <div className="flex items-end gap-1.5" aria-hidden="true">
          {BARS.map((pct, i) => (
            <span
              key={i}
              className={`w-full rounded-sm ${i === 0 ? "bg-primary" : "bg-primary/45"}`}
              style={{ height: `${Math.round((pct / 100) * BAR_MAX)}px` }}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <p>
            Pace: <span className="text-foreground">148 wpm</span>{" "}
            <span className="text-emerald-600 dark:text-emerald-400">Optimal</span>
          </p>
          <p>
            Eye contact: <span className="text-foreground">94%</span>
          </p>
        </div>
      </>
    ),
  },
];

/**
 * Plays once on mount and holds. Hover or focus replays it. It never auto-loops,
 * and with reduced motion it renders the finished state with no motion nodes.
 */
export function HeroValueChain() {
  const reduce = useReducedMotion() ?? false;
  const [stage, setStage] = useState(0);
  const [replay, setReplay] = useState(0);

  useEffect(() => {
    if (reduce) {
      setStage(STAGES.length);
      return;
    }
    setStage(0);
    const timers = STAGES.map((_, i) => setTimeout(() => setStage(i + 1), (i + 1) * STEP_MS));
    return () => timers.forEach(clearTimeout);
  }, [reduce, replay]);

  const done = (i: number) => reduce || stage > i;

  return (
    <div
      onPointerEnter={() => setReplay((n) => n + 1)}
      onFocus={() => setReplay((n) => n + 1)}
      className="rounded-2xl border border-border bg-card/70 p-5 backdrop-blur-sm"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
          Simulated cockpit v2.4
        </p>
        <p className="text-[11px] tabular-nums text-muted-foreground">Latency: 24ms</p>
      </div>

      <ol aria-label="How it works" className="mt-4 flex flex-col gap-5">
        {STAGES.map((s, i) => {
          const body = (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] font-semibold text-foreground">
                  <span className="me-1.5 text-primary tabular-nums">{i + 1}</span>
                  {s.label}
                </p>
                <Badge tone={s.tone}>{s.badge}</Badge>
              </div>
              <div className="mt-2 flex flex-col gap-2">{s.body}</div>
            </>
          );

          return (
            <li key={s.key} className="border-t border-border/70 pt-5 first:border-t-0 first:pt-0">
              {reduce ? (
                body
              ) : (
                <motion.div
                  initial={{ opacity: REVEAL_FLOOR, y: 8 }}
                  animate={done(i) ? { opacity: 1, y: 0 } : { opacity: REVEAL_FLOOR, y: 8 }}
                  transition={HERO_SPRING}
                >
                  {body}
                </motion.div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

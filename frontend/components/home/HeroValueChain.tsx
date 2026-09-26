"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { FileText, Microphone } from "@phosphor-icons/react";
import { HERO_SPRING, HERO_STEPS, REVEAL_FLOOR } from "./heroMotion";

const STEP_MS = 900;
const SCORES = [100, 68, 86, 52, 78];
const BAR_MAX = 30;

function StepFrame({ index, label, detail, children }: { index: number; label: string; detail: string; children: React.ReactNode }) {
  return (
    <>
      <div className="flex items-baseline gap-3">
        <span className="display-serif text-2xl leading-none text-primary tabular-nums">{index}</span>
        <span className="text-[13px] font-semibold text-foreground">{label}</span>
      </div>
      <p className="text-[12px] leading-5 text-muted-foreground">{detail}</p>
      {children}
    </>
  );
}

function QuestionCards({ lifted }: { lifted: boolean }) {
  return (
    <div aria-hidden="true" className="relative h-14">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="absolute inset-x-0 rounded-lg border border-border bg-card px-3 py-2"
          style={{ top: i * 14, opacity: lifted ? 1 - i * 0.22 : 0.9 - i * 0.18 }}
        >
          <div className="h-1.5 w-2/3 rounded-full bg-muted" />
          <div className="mt-1.5 h-1.5 w-1/3 rounded-full bg-muted" />
        </div>
      ))}
    </div>
  );
}

function Listening() {
  return (
    <div aria-hidden="true" className="flex h-14 items-center gap-3">
      <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-primary/40">
        <span className="absolute inset-0 rounded-full border border-primary/25" />
        <Microphone className="h-4 w-4 text-primary" />
      </span>
      <div className="flex flex-1 items-end gap-1.5">
        {SCORES.map((pct, i) => (
          <span
            key={i}
            className={`w-full rounded-sm ${i === 0 ? "bg-primary" : "bg-primary/45"}`}
            style={{ height: `${Math.round((pct / 100) * BAR_MAX)}px` }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * The three-step value chain. It depicts the promise the hero copy makes
 * ("3 steps, about 5 minutes") instead of decorating the page, so the steps are
 * labelled rather than implied.
 *
 * It plays once on mount and holds. Hover or focus replays it. It never
 * auto-loops, and with reduced motion it renders the finished state with no
 * motion nodes at all.
 */
export function HeroValueChain() {
  const reduce = useReducedMotion() ?? false;
  const [stage, setStage] = useState(0);
  const [replay, setReplay] = useState(0);

  useEffect(() => {
    if (reduce) {
      setStage(HERO_STEPS.length);
      return;
    }
    setStage(0);
    const timers = HERO_STEPS.map((_, i) =>
      setTimeout(() => setStage(i + 1), (i + 1) * STEP_MS)
    );
    return () => timers.forEach(clearTimeout);
  }, [reduce, replay]);

  const done = (i: number) => reduce || stage > i;
  const settled = reduce || stage >= HERO_STEPS.length;

  const visuals = [
    <div key="resume" aria-hidden="true" className="flex h-14 items-center gap-2 rounded-lg border border-border bg-card px-3">
      <FileText className="h-4 w-4 shrink-0 text-primary" />
      <span className="truncate text-[12px] text-muted-foreground">resume.pdf</span>
    </div>,
    <QuestionCards key="pack" lifted={settled} />,
    <Listening key="live" />,
  ];

  return (
    <ol
      aria-label="How it works"
      onPointerEnter={() => setReplay((n) => n + 1)}
      onFocus={() => setReplay((n) => n + 1)}
      className="flex flex-col gap-4 rounded-2xl border border-border bg-card/60 p-5 backdrop-blur-sm"
    >
      {HERO_STEPS.map((step, i) => {
        const body = (
          <StepFrame index={i + 1} label={step.label} detail={step.detail}>
            {visuals[i]}
          </StepFrame>
        );

        return (
          <li
            key={step.key}
            className="flex flex-col gap-2 border-t border-border/70 pt-4 first:border-t-0 first:pt-0"
          >
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
  );
}

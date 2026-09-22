"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { FileText, Target } from "@phosphor-icons/react";

const TABS = [
  { key: "questions", label: "Questions" },
  { key: "match", label: "Match" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const QUESTIONS = [
  {
    prompt: "Tell me about a technical decision you reversed after new evidence.",
    evidence: "Resume: 4 yrs React",
  },
  {
    prompt: "How do you keep a large React codebase fast as it grows?",
    evidence: "Resume: perf work",
  },
  {
    prompt: "Describe a disagreement with a designer and how you resolved it.",
    evidence: "Gap: storytelling",
  },
];

const MATCHED = ["React", "TypeScript", "Performance"];
const GAPS = ["System design", "Testing"];

export function ProductPreview() {
  const [tab, setTab] = useState<TabKey>("questions");
  const reduce = useReducedMotion();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const order: TabKey[] = ["questions", "match"];
    const next = order[(order.indexOf(tab) + (e.key === "ArrowRight" ? 1 : order.length - 1)) % order.length];
    setTab(next);
    tabRefs.current[order.indexOf(next)]?.focus();
  };

  return (
    <div className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-[0_20px_40px_-24px_hsl(var(--foreground)/0.2)]">
      <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">Senior Frontend Engineer</p>
          <p className="text-xs text-muted-foreground">Your question pack</p>
        </div>
        <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
          Sample
        </span>
      </div>

      <div role="tablist" aria-label="Pack preview" className="flex gap-1 border-b border-border px-3 pt-3" onKeyDown={onKeyDown}>
        {TABS.map((t, i) => {
          const selected = tab === t.key;
          const Icon = t.key === "questions" ? FileText : Target;
          return (
            <button
              key={t.key}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => setTab(t.key)}
              className={`relative flex min-h-[44px] items-center gap-1.5 rounded-t-lg px-3 text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                selected ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {t.label}
              {selected && (
                <motion.span
                  layoutId="pack-tab-underline"
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary"
                  transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          role="tabpanel"
          className="p-5"
        >
          {tab === "questions" ? (
            <ol className="space-y-3">
              {QUESTIONS.map((q, i) => (
                <li key={q.prompt} className="rounded-xl border border-border bg-background p-3.5">
                  <p className="text-sm font-semibold leading-6 text-foreground">
                    <span className="me-2 tabular-nums text-muted-foreground">{i + 1}.</span>
                    {q.prompt}
                  </p>
                  <p className="mt-1.5 text-xs text-muted-foreground">{q.evidence}</p>
                </li>
              ))}
            </ol>
          ) : (
            <div>
              <div className="flex items-baseline gap-2">
                <p className="display-type text-5xl font-semibold tracking-tighter text-foreground tabular-nums">82%</p>
                <p className="text-sm text-muted-foreground">role match</p>
              </div>
              <p className="mt-4 text-xs font-semibold text-muted-foreground">Matched from your resume</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {MATCHED.map((s) => (
                  <span key={s} className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                    {s}
                  </span>
                ))}
              </div>
              <p className="mt-4 text-xs font-semibold text-muted-foreground">Worth drilling</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {GAPS.map((s) => (
                  <span key={s} className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="border-t border-border px-5 py-3.5">
        <p className="text-xs text-muted-foreground">3 evidence-linked questions, grounded in your resume</p>
      </div>
    </div>
  );
}

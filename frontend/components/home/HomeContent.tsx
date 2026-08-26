"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  AudioLines,
  Building2,
  Camera,
  Check,
  CircleDollarSign,
  FileSearch,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";

const capabilities = [
  {
    icon: FileSearch,
    title: "Questions built around your experience",
    copy: "Add a resume and job description. Hustlrzz finds the evidence worth practising and creates a focused interview pack.",
    className: "md:col-span-7",
  },
  {
    icon: Building2,
    title: "Current company context",
    copy: "Research runs when you need it, with source links and preparation cues for the role you selected.",
    className: "md:col-span-5",
  },
  {
    icon: MessageSquareText,
    title: "A conversation, not a question list",
    copy: "The interviewer listens to each answer, asks follow-ups, and keeps the discussion grounded in your preparation.",
    className: "md:col-span-5",
  },
  {
    icon: Camera,
    title: "Content and presence in one review",
    copy: "See answer quality alongside posture, gaze, and gesture signals. Camera processing remains on your device.",
    className: "md:col-span-7",
  },
];

export function HomeContent() {
  return (
    <main className="flex-1 overflow-hidden">
      <section className="mx-auto grid min-h-[calc(100dvh-4rem)] max-w-7xl items-center gap-12 px-4 py-12 md:px-6 lg:grid-cols-[0.88fr_1.12fr] lg:py-16">
        <div className="motion-enter max-w-xl">
          <p className="mb-5 text-sm font-semibold text-primary">AI interview practice that uses your context</p>
          <h1 className="text-5xl font-semibold leading-[1.02] tracking-[-0.045em] text-foreground md:text-6xl">
            Walk into the interview prepared.
          </h1>
          <p className="mt-6 max-w-[50ch] text-lg leading-8 text-muted-foreground">
            Prepare from your resume, practise a live conversation, and review what to improve next.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/prepare"><Button size="lg">Start preparing <ArrowRight className="h-4 w-4" /></Button></Link>
            <Link href="/interview"><Button size="lg" variant="outline">Open interview</Button></Link>
          </div>
        </div>

        <div className="motion-enter motion-enter-delay-1 relative lg:pl-8">
          <div className="product-window overflow-hidden rounded-[1.5rem]">
            <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary"><Sparkles className="h-4 w-4" /></span>
                <div><p className="text-sm font-semibold">Product interview</p><p className="text-xs text-muted-foreground">Senior frontend engineer</p></div>
              </div>
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">Live</span>
            </div>
            <div className="grid min-h-[440px] lg:grid-cols-[1fr_190px]">
              <div className="flex flex-col p-5 md:p-7">
                <div className="max-w-[90%] rounded-2xl rounded-tl-md bg-secondary p-4">
                  <p className="text-sm leading-6">Tell me about a technical decision you changed after receiving new evidence.</p>
                </div>
                <div className="mt-4 ml-auto max-w-[88%] rounded-2xl rounded-tr-md bg-primary px-4 py-3.5 text-primary-foreground">
                  <p className="text-sm leading-6">I changed our client-side data strategy after profiling the slowest user journeys...</p>
                </div>
                <div className="mt-auto rounded-2xl border bg-background/80 p-3.5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground"><AudioLines className="h-4 w-4" /></span>
                    <div className="live-wave flex flex-1 items-center gap-1" aria-hidden="true">
                      {[5, 11, 17, 9, 22, 14, 7, 19, 12, 6, 15, 9, 20, 11, 5].map((height, index) => <span key={index} className="w-full rounded-full bg-primary/60" style={{ height }} />)}
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">Listening</span>
                  </div>
                </div>
              </div>
              <aside className="hidden border-l border-border/70 bg-secondary/35 p-4 lg:block">
                <p className="text-xs font-semibold text-muted-foreground">Session signals</p>
                <div className="mt-5 space-y-5">
                  <Signal label="Answer structure" value="Clear" />
                  <Signal label="Eye contact" value="Steady" />
                  <Signal label="Posture" value="Balanced" />
                </div>
                <div className="mt-7 rounded-xl bg-background p-3 shadow-sm">
                  <Target className="h-4 w-4 text-primary" />
                  <p className="mt-2 text-xs font-semibold">Current focus</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">Explain the measurable outcome.</p>
                </div>
              </aside>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y bg-secondary/35">
        <div className="mx-auto grid max-w-7xl gap-5 px-4 py-6 text-sm md:grid-cols-3 md:px-6">
          <p className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" />Voice and typing</p>
          <p className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" />Multi-provider AI with automatic failover</p>
          <p className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" />Private camera processing</p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 md:px-6 md:py-28">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-[-0.03em] md:text-4xl">One place to prepare and practise.</h2>
          <p className="mt-4 text-base leading-7 text-muted-foreground">Every feature supports the same goal: a more specific, confident answer in your next interview.</p>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-12">
          {capabilities.map(({ icon: Icon, title, copy, className }, index) => (
            <article key={title} className={`feature-surface group min-h-56 rounded-2xl p-6 md:p-8 ${className} ${index === 0 || index === 3 ? "bg-primary/[0.055]" : ""}`}>
              <Icon className="h-6 w-6 text-primary" />
              <h3 className="mt-12 max-w-md text-xl font-semibold tracking-[-0.015em]">{title}</h3>
              <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-20 md:px-6 md:pb-28">
        <div className="feature-surface rounded-[1.75rem] bg-primary/[0.055] px-6 py-10 text-foreground md:px-10 md:py-12">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div><h2 className="text-3xl font-semibold tracking-[-0.03em]">Practise the conversations around the interview too.</h2><p className="mt-3 max-w-2xl text-sm leading-6 opacity-70">Check role fit, understand company interview patterns, and rehearse salary negotiation with voice, camera, or typing.</p></div>
            <Link href="/coaching"><Button size="lg">Open coaching <CircleDollarSign className="h-4 w-4" /></Button></Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function Signal({ label, value }: { label: string; value: string }) {
  return <div><div className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{label}</span><span className="text-xs font-semibold">{value}</span></div><div className="mt-2 h-1 overflow-hidden rounded-full bg-border"><div className="h-full w-[76%] rounded-full bg-primary" /></div></div>;
}

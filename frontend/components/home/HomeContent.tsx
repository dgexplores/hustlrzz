"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Activity, ArrowRight, Building2, CheckCircle2, CircleDollarSign, FileText, Mic2, ShieldCheck, Sparkles, Volume2 } from "lucide-react";

const FEATURES = [
  {
    icon: FileText,
    title: "Prepare with your evidence",
    description: "Turn your resume, role and job description into a focused question pack, match analysis and answer prompts.",
  },
  {
    icon: Mic2,
    title: "Realistic AI interviewer",
    description: "An AI interviewer asks role-specific questions over WebSocket, listens, and follows up like a real interviewer.",
  },
  {
    icon: Building2,
    title: "Grounded follow-ups",
    description: "Optional private knowledge search lets the interviewer reference your resume, portfolio and past coaching notes.",
  },
  {
    icon: CircleDollarSign,
    title: "Salary negotiation coaching",
    description: "Rehearse a clear salary conversation from your target range, current compensation and offer context.",
  },
  {
    icon: Activity,
    title: "Scored coaching report",
    description: "Receive a saved report across communication, structure, depth, technical accuracy and confidence.",
  },
  {
    icon: FileText,
    title: "Reports & history",
    description: "Return to your practice history to identify a repeatable next improvement, not just a one-off score.",
  },
];

export function HomeContent() {
  return (
    <main className="flex-1">
      <section className="relative overflow-hidden border-b border-foreground/15">
        <div className="absolute inset-y-0 right-0 hidden w-[44%] studio-grid opacity-70 lg:block" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-14 md:py-24 lg:grid-cols-[1.06fr_.94fr]">
          <div className="motion-enter">
            <div className="inline-flex items-center gap-2 border-l-2 border-primary pl-3 text-xs font-bold uppercase tracking-[0.19em] text-muted-foreground"><Sparkles className="h-3.5 w-3.5 text-primary" />Your private rehearsal room</div>
            <h1 className="font-display mt-6 max-w-3xl text-5xl font-semibold leading-[.95] tracking-[-0.035em] text-foreground md:text-7xl">Practice the answer.<br /><span className="italic text-primary">Train the room.</span></h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">Turn your resume and target role into a live interview, then leave with one clear improvement for the next round.</p>
            <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/prepare">
            <Button size="lg" className="gap-2">Prepare an interview
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/interview">
            <Button size="lg" variant="outline">
              Start an interview
            </Button>
          </Link>
          <Link href="/coaching">
            <Button size="lg" variant="outline">
              Salary &amp; coaching
            </Button>
          </Link>
            </div>
            <div className="mt-9 flex flex-wrap gap-x-6 gap-y-2 border-t border-foreground/15 pt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-primary" />Role-specific</span><span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-primary" />Camera stays local</span></div>
          </div>
          <div className="motion-enter motion-enter-delay-2 relative mx-auto w-full max-w-xl" aria-label="Live interview preview">
            <div className="absolute -left-6 top-12 h-20 w-20 rounded-full border border-primary/35 signal-pulse" aria-hidden="true" />
            <div className="relative border border-foreground bg-foreground p-5 text-background shadow-[10px_10px_0_hsl(var(--primary))] dark:bg-card dark:text-foreground">
              <div className="flex items-center justify-between border-b border-background/20 pb-4 dark:border-foreground/15"><span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.18em]"><span className="h-2 w-2 rounded-full bg-primary signal-pulse" />Live rehearsal</span><span className="font-mono text-xs opacity-60">08:42</span></div>
              <div className="py-8"><p className="text-xs font-bold uppercase tracking-[.16em] text-primary">Interviewer</p><p className="font-display mt-3 text-2xl leading-snug">“Tell me about a difficult technical decision—and what changed because of it.”</p></div>
              <div className="flex items-end gap-1 border-t border-background/20 pt-5 dark:border-foreground/15" aria-hidden="true">{[35,65,48,92,58,78,42,68,31,55,84,46,72,38,60,28,50,76,44,62].map((height, index) => <span key={index} className="wave-bar w-full bg-primary" style={{ height: `${height * .38}px`, animationDelay: `${index * -70}ms` }} />)}</div>
              <div className="mt-4 flex items-center justify-between text-xs opacity-70"><span className="flex items-center gap-1.5"><Volume2 className="h-3.5 w-3.5" />Listening for evidence</span><span>Voice + presence</span></div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 md:py-20">
        <div className="grid gap-10 lg:grid-cols-[.55fr_1.45fr]"><div className="lg:sticky lg:top-28 lg:self-start"><p className="text-xs font-bold uppercase tracking-[.19em] text-primary">The rehearsal loop</p><h2 className="font-display mt-3 text-4xl leading-tight">One flow.<br />Three deliberate moves.</h2><p className="mt-4 text-sm leading-6 text-muted-foreground">No scattered tools. Every session starts with your evidence and ends with a usable next move.</p></div><ol className="border-t border-foreground/20">{[["01", "Prepare the evidence", "Resume, role, and current company signals become a targeted interview map."], ["02", "Rehearse under pressure", "Speak or type while the interviewer follows up and local camera signals track presence."], ["03", "Review what changes next", "Scores, transcript evidence, and coaching turn feedback into the next practice goal."]].map(([number,title,copy], index) => <li key={number} className={`motion-enter grid gap-3 border-b border-foreground/20 py-7 sm:grid-cols-[70px_1fr_1.35fr] ${index ? `motion-enter-delay-${Math.min(index,3)}` : ""}`}><span className="font-mono text-sm text-primary">{number}</span><h3 className="text-lg font-bold">{title}</h3><p className="text-sm leading-6 text-muted-foreground">{copy}</p></li>)}</ol></div>
      </section>

      <section className="border-y border-foreground/15 bg-foreground py-16 text-background dark:bg-card dark:text-foreground">
        <div className="mx-auto max-w-7xl px-4"><div className="mb-9 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-xs font-bold uppercase tracking-[.19em] text-primary">Inside the studio</p><h2 className="font-display mt-2 text-4xl">Tools with a job to do.</h2></div><p className="max-w-md text-sm leading-6 opacity-65">Each capability serves the same rehearsal loop—nothing is added just to decorate a dashboard.</p></div>
        <div className="grid grid-cols-1 border-l border-t border-background/20 md:grid-cols-3 dark:border-foreground/15">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div key={title} className="interactive-lift border-b border-r border-background/20 p-6 surface-transition hover:bg-background/5 dark:border-foreground/15">
              <Icon className="mb-8 h-6 w-6 text-primary" />
              <h3 className="font-bold">{title}</h3>
              <p className="mt-2 text-sm leading-6 opacity-65">{description}</p>
            </div>
          ))}
        </div></div>
      </section>
    </main>
  );
}

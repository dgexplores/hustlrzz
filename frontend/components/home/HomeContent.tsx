"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Activity, ArrowRight, Brain, Building2, CheckCircle2, CircleDollarSign, FileText, Mic2, ShieldCheck } from "lucide-react";

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
      <section className="max-w-6xl mx-auto px-4 py-12 md:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground"><Brain className="h-4 w-4 text-primary" />Hustlrzz V2 interview practice</div>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-foreground md:text-6xl">Rehearse the answer and the presence behind it.</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">A focused coach for role-specific interview preparation, real-time conversation practice and feedback you can act on in the next session.</p>
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
            <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground"><span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-primary" />Personalized question packs</span><span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-primary" />Camera analysis stays local</span></div>
          </div>
          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            <p className="text-sm font-semibold text-primary">A single practice loop</p>
            <ol className="mt-6 space-y-5">{[["01", "Prepare", "Add your resume and the target role."], ["02", "Practice", "Answer live questions by text or voice."], ["03", "Improve", "Review the report and choose your next focus."]].map(([number, title, description]) => <li key={number} className="flex gap-4"><span className="font-mono text-sm text-primary">{number}</span><div><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p></div></li>)}</ol>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 pb-16 md:pb-24">
        <div className="mb-6 max-w-xl"><p className="text-sm font-semibold text-primary">Built for deliberate practice</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Everything needed to turn a session into progress.</h2></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div key={title} className="rounded-xl border bg-card p-6 surface-transition hover:border-primary/30">
              <Icon className="h-6 w-6 text-primary mb-3" />
              <h3 className="font-semibold text-slate-900">{title}</h3>
              <p className="mt-1 text-sm text-slate-600">{description}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

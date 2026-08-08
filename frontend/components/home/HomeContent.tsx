"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Eye, Mic2, Activity, FileText, ArrowRight, Brain, CircleDollarSign, Building2 } from "lucide-react";

const FEATURES = [
  {
    icon: Eye,
    title: "Body language analysis",
    description: "Camera feed analyzed in-browser with MediaPipe — eye contact, posture, and hand gestures tracked live; nothing is uploaded.",
  },
  {
    icon: Mic2,
    title: "Realistic AI interviewer",
    description: "An AI interviewer asks role-specific questions over WebSocket, listens, and follows up like a real interviewer.",
  },
  {
    icon: Building2,
    title: "Company-style interviews",
    description: "Profile-matching for Google, Amazon, Meta, Microsoft and more — tech, project, behavioral and salary-negotiation modes.",
  },
  {
    icon: CircleDollarSign,
    title: "Salary negotiation coaching",
    description: "Structured, say-it-aloud negotiation scripts built from your current salary, target range and offers.",
  },
  {
    icon: Activity,
    title: "Scored coaching report",
    description: "Every session produces scores across communication, structure, depth, behavioral STAR, technical accuracy and confidence.",
  },
  {
    icon: FileText,
    title: "Reports & history",
    description: "All transcripts and reports are saved to your account so you can measure improvement over time.",
  },
];

export function HomeContent() {
  return (
    <main className="flex-1">
      <section className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Brain className="h-8 w-8 text-primary" />
          <span className="font-semibold text-slate-900">Hustlrzz V2</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900">
          Practice interviews with an{" "}
          <span className="text-primary">AI coach</span> that watches how you answer
        </h1>
        <p className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto">
          Company-matched questions, a live AI interviewer, camera body-language
          tracking, and a scored coaching report — all in one.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/prepare">
            <Button size="lg" className="gap-2">
              Prepare an interview
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
      </section>

      <section className="max-w-5xl mx-auto px-4 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div key={title} className="rounded-xl border bg-white p-6 hover:shadow-md transition-shadow">
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
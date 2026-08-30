import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How Hustlrzz handles resumes, transcripts, camera signals, and account data.",
};

const sections = [
  {
    title: "What we store",
    body: [
      "Account basics (email, display name) via Supabase Auth.",
      "Preparation packs: your resume text, job description, generated questions and reports - scoped to your user id with row-level security.",
      "Interview transcripts and coaching reports you complete, so history works.",
      "Assessment attempts including per-round scores.",
      "Resume Analyzer stores structured results only; raw PDF/DOCX bytes are discarded in memory right after parsing.",
    ],
  },
  {
    title: "What stays on your device",
    body: [
      "Camera frames are processed locally by MediaPipe in your browser. The application does not upload video.",
      "Microphone audio is converted to text by your browser's speech recognition; only the transcript you send is transmitted.",
      "Coaching attempt scores live in your browser's local storage until you clear it.",
    ],
  },
  {
    title: "Third parties",
    body: [
      "Supabase (auth + database), Vercel/Railway (hosting), Groq/Google (AI inference), DuckDuckGo (public web research).",
      "Company intelligence summaries link their public sources; we do not scrape private systems.",
    ],
  },
  {
    title: "Your controls",
    body: [
      "Delete preparation packs or ask for full account deletion at any time; deletion cascades through your stored data.",
      "Export any report as JSON from its detail view.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-14 md:px-6">
      <Link href="/" className="text-sm font-semibold text-primary">← Back to Hustlrzz</Link>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight">Privacy</h1>
      <p className="mt-2 text-sm text-muted-foreground">How your data moves through Hustlrzz.</p>
      <div className="mt-10 space-y-8">
        {sections.map((section) => (
          <section key={section.title}>
            <h2 className="text-lg font-semibold">{section.title}</h2>
            {section.body.map((item) => (
              <p key={item.slice(0, 24)} className="mt-3 flex gap-2 text-sm leading-7 text-muted-foreground">
                <span className="text-primary">•</span>
                <span>{item}</span>
              </p>
            ))}
          </section>
        ))}
      </div>
    </main>
  );
}

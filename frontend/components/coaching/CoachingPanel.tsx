"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { downloadJson } from "@/lib/download";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CameraPanel } from "@/components/interview/CameraPanel";
import { useAudio } from "@/hooks/useAudio";
import { useMetrics } from "@/context/MetricsContext";
import {
  AlertCircle, ArrowRight, BriefcaseBusiness, Building2, CheckCircle2,
  Camera, CircleDollarSign, Download, Keyboard, Lightbulb, Loader2,
  MessageSquareQuote, Mic, MicOff, RotateCcw, Search, ShieldCheck,
  Sparkles, Target, TriangleAlert, Volume2,
} from "lucide-react";

type Workspace = "fit" | "company" | "salary" | "practice";

const PRACTICE_PROMPTS: Record<string, string> = {
  "behavioral interview": "Tell me about a difficult project, the action you personally took, and the measurable result.",
  "salary negotiation": "The offer is fixed at the current amount. Why should we reconsider the compensation range?",
  "leadership conversation": "Describe a time you influenced a decision without having formal authority.",
  "career introduction": "Walk me through your background and why it makes you a strong fit for this opportunity.",
};

export function CoachingPanel() {
  const [workspace, setWorkspace] = useState<Workspace>("fit");
  const [companies, setCompanies] = useState<any[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<any>(null);
  const [companyQuery, setCompanyQuery] = useState("");
  const [salaryForm, setSalaryForm] = useState({ company: "", role: "", current_salary: "", target_range: "", has_offer: "" });
  const [fitForm, setFitForm] = useState({ job_description: "", resume_text: "" });
  const [salaryScript, setSalaryScript] = useState<any>(null);
  const [fitResult, setFitResult] = useState<any>(null);
  const [practiceForm, setPracticeForm] = useState({ scenario: "behavioral interview", prompt: PRACTICE_PROMPTS["behavioral interview"], answer: "" });
  const [practiceResult, setPracticeResult] = useState<any>(null);
  const [busy, setBusy] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ data: any[] }>("/companies")
      .then((response) => setCompanies(response.data || []))
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Company playbooks could not be loaded."));
  }, []);

  const runFit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy("fit");
    setError(null);
    setFitResult(null);
    try {
      const response = await api<{ data: any }>("/coaching/analyze", { method: "POST", body: JSON.stringify(fitForm) });
      if (!response.data || typeof response.data !== "object" || response.data.error) throw new Error(response.data?.error || "The coach returned an incomplete role-fit analysis.");
      setFitResult(response.data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Role-fit analysis failed.");
    } finally {
      setBusy(null);
    }
  };

  const runSalary = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy("salary");
    setError(null);
    setSalaryScript(null);
    try {
      const response = await api<{ data: any }>("/coaching/salary", { method: "POST", body: JSON.stringify(salaryForm) });
      if (!response.data || typeof response.data !== "object" || response.data.error) throw new Error(response.data?.error || "The coach returned an incomplete negotiation plan.");
      setSalaryScript(response.data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Negotiation plan failed.");
    } finally {
      setBusy(null);
    }
  };

  const runPractice = async (event: React.FormEvent, presenceMetrics: Record<string, number>) => {
    event.preventDefault();
    setBusy("practice");
    setError(null);
    setPracticeResult(null);
    try {
      const response = await api<{ data: any }>("/coaching/practice", {
        method: "POST",
        body: JSON.stringify({ ...practiceForm, presence_metrics: presenceMetrics }),
      });
      if (!response.data || typeof response.data !== "object" || response.data.error) throw new Error(response.data?.error || "The coach returned incomplete practice feedback.");
      setPracticeResult(response.data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Practice feedback failed.");
    } finally {
      setBusy(null);
    }
  };

  const chooseCompany = (company: any) => {
    setSelectedCompany(company);
    setSalaryForm((current) => ({ ...current, company: company.name === "generic" ? "" : company.name }));
  };

  const filteredCompanies = companies.filter((company) => company.name !== "generic" && `${company.name} ${company.style} ${company.focus}`.toLowerCase().includes(companyQuery.toLowerCase()));

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 md:px-6">
      <section className="max-w-3xl">
        <p className="text-sm font-semibold text-primary">Career coaching lab</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">Turn uncertainty into a prepared conversation.</h1>
        <p className="mt-2 max-w-2xl leading-7 text-muted-foreground">Diagnose role fit, understand interview styles, and rehearse a composed offer negotiation from one workspace.</p>
      </section>

      <nav aria-label="Coaching workspaces" className="grid gap-2 rounded-xl border bg-card p-2 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <WorkspaceButton active={workspace === "fit"} onClick={() => setWorkspace("fit")} icon={<Target className="h-4 w-4" />} title="Role fit" description="Find evidence and gaps" />
        <WorkspaceButton active={workspace === "company"} onClick={() => setWorkspace("company")} icon={<Building2 className="h-4 w-4" />} title="Company playbooks" description="Understand interview style" />
        <WorkspaceButton active={workspace === "salary"} onClick={() => setWorkspace("salary")} icon={<CircleDollarSign className="h-4 w-4" />} title="Offer negotiation" description="Build your exact script" />
        <WorkspaceButton active={workspace === "practice"} onClick={() => setWorkspace("practice")} icon={<Camera className="h-4 w-4" />} title="Practice room" description="Speak or type with presence feedback" />
      </nav>

      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

      {workspace === "fit" && <RoleFitWorkspace form={fitForm} setForm={setFitForm} result={fitResult} loading={busy === "fit"} onSubmit={runFit} />}
      {workspace === "company" && <CompanyWorkspace companies={filteredCompanies} query={companyQuery} setQuery={setCompanyQuery} selected={selectedCompany} onSelect={chooseCompany} onNegotiate={() => setWorkspace("salary")} />}
      {workspace === "salary" && <SalaryWorkspace form={salaryForm} setForm={setSalaryForm} script={salaryScript} loading={busy === "salary"} onSubmit={runSalary} />}
      {workspace === "practice" && <PracticeWorkspace form={practiceForm} setForm={setPracticeForm} result={practiceResult} loading={busy === "practice"} onSubmit={runPractice} onReset={() => setPracticeResult(null)} />}
    </main>
  );
}

function WorkspaceButton({ active, onClick, icon, title, description }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; description: string }) {
  return <button type="button" onClick={onClick} aria-current={active ? "page" : undefined} className={`min-h-16 rounded-lg px-4 py-3 text-left surface-transition ${active ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-accent"}`}><span className="flex items-center gap-2 text-sm font-semibold">{icon}{title}</span><span className={`mt-1 block text-xs ${active ? "text-primary-foreground/75" : "text-muted-foreground"}`}>{description}</span></button>;
}

function RoleFitWorkspace({ form, setForm, result, loading, onSubmit }: { form: any; setForm: (value: any) => void; result: any; loading: boolean; onSubmit: (event: React.FormEvent) => void }) {
  return <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
    <Card><CardHeader><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Evidence audit</p><CardTitle className="text-xl">Compare your resume to the role</CardTitle><p className="text-sm leading-6 text-muted-foreground">The coach separates demonstrated strengths from requirements that need stronger proof.</p></CardHeader><CardContent><form onSubmit={onSubmit} className="space-y-4"><div className="space-y-2"><Label htmlFor="fit-jd">Job description</Label><Textarea id="fit-jd" rows={9} required value={form.job_description} onChange={(event) => setForm({ ...form, job_description: event.target.value })} placeholder="Paste responsibilities, requirements, and preferred skills…" /></div><div className="space-y-2"><Label htmlFor="fit-resume">Resume or experience summary</Label><Textarea id="fit-resume" rows={9} required value={form.resume_text} onChange={(event) => setForm({ ...form, resume_text: event.target.value })} placeholder="Paste relevant projects, experience, skills, and outcomes…" /></div><Button type="submit" size="lg" disabled={loading || !form.job_description.trim() || !form.resume_text.trim()} className="w-full">{loading ? <><Loader2 className="h-4 w-4 animate-spin" />Analyzing evidence…</> : <><Sparkles className="h-4 w-4" />Run role-fit analysis</>}</Button></form></CardContent></Card>
    <Card className="min-h-[700px]"><CardHeader className="flex-row items-start justify-between space-y-0"><div><CardTitle className="text-xl">Fit diagnosis</CardTitle><p className="mt-1 text-sm text-muted-foreground">A coaching signal—not a hiring decision.</p></div>{result && <Button variant="outline" size="sm" onClick={() => downloadJson("hustlrzz-role-fit.json", result)}><Download className="h-4 w-4" />Export</Button>}</CardHeader><CardContent>{result ? <FitResult result={result} /> : <EmptyResult icon={<BriefcaseBusiness className="h-7 w-7" />} title="Your evidence map will appear here" copy="You’ll see matched skills, proof gaps, resume weaknesses, and a prioritized next move." />}</CardContent></Card>
  </div>;
}

function FitResult({ result }: { result: any }) {
  const score = Math.max(0, Math.min(Number(result.overall_match_percent) || 0, 100));
  return <div className="space-y-6"><div className="rounded-2xl border bg-secondary/25 p-5"><div className="flex items-end justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Evidence alignment</p><p className="mt-1 text-4xl font-semibold">{score}<span className="text-lg text-muted-foreground">%</span></p></div><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">Directional score</span></div><div className="mt-4 h-2.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${score}%` }} /></div><p className="mt-4 text-sm leading-6 text-muted-foreground">{result.summary}</p></div><InsightList icon={<CheckCircle2 className="h-4 w-4" />} title="Evidence already working" items={result.matched_skills || []} tone="success" /><InsightList icon={<TriangleAlert className="h-4 w-4" />} title="Requirements to strengthen" items={result.gap_skills || []} tone="warning" /><InsightList icon={<Lightbulb className="h-4 w-4" />} title="Resume improvements" items={result.resume_weaknesses || []} tone="primary" /><div className="rounded-xl border border-primary/30 bg-primary/5 p-4"><p className="text-sm font-semibold">Recommended next step</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Add measurable evidence for the top gap, then create a new preparation pack to test it in a live interview.</p><Link href="/prepare" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary">Open Prepare <ArrowRight className="h-4 w-4" /></Link></div></div>;
}

function InsightList({ icon, title, items, tone }: { icon: React.ReactNode; title: string; items: string[]; tone: "success" | "warning" | "primary" }) {
  const toneClass = tone === "success" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : tone === "warning" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-primary/10 text-primary";
  return <section><h3 className="flex items-center gap-2 text-sm font-semibold"><span className={`rounded-md p-1.5 ${toneClass}`}>{icon}</span>{title}</h3>{items.length ? <div className="mt-3 flex flex-wrap gap-2">{items.map((item) => <span key={item} className="rounded-lg border bg-card px-3 py-2 text-sm">{item}</span>)}</div> : <p className="mt-2 text-sm text-muted-foreground">No items returned.</p>}</section>;
}

function CompanyWorkspace({ companies, query, setQuery, selected, onSelect, onNegotiate }: { companies: any[]; query: string; setQuery: (value: string) => void; selected: any; onSelect: (company: any) => void; onNegotiate: () => void }) {
  return <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,1.1fr)]"><Card><CardHeader><CardTitle className="text-xl">Interview-style library</CardTitle><p className="text-sm text-muted-foreground">Use these durable patterns as a starting point. Prepare adds current, source-linked company intelligence.</p></CardHeader><CardContent><div className="relative mb-4"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Search company or focus…" aria-label="Search company playbooks" /></div><div className="grid gap-2 sm:grid-cols-2">{companies.map((company) => <button key={company.name} type="button" onClick={() => onSelect(company)} className={`rounded-xl border p-4 text-left surface-transition hover:border-primary/40 hover:bg-accent ${selected?.name === company.name ? "border-primary bg-primary/5 ring-1 ring-primary" : ""}`}><p className="font-semibold capitalize">{company.name}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{company.style}</p></button>)}</div></CardContent></Card><Card className="min-h-[560px]"><CardHeader><CardTitle className="text-xl">Company playbook</CardTitle></CardHeader><CardContent>{selected ? <div className="space-y-6"><div className="rounded-2xl bg-primary p-6 text-primary-foreground"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-foreground/70">{selected.name}</p><h2 className="mt-2 text-2xl font-semibold">{selected.style}</h2><p className="mt-3 text-sm leading-6 text-primary-foreground/80">Primary focus: {selected.focus}</p></div><div><h3 className="text-sm font-semibold">What to demonstrate</h3><ul className="mt-3 space-y-3">{(selected.notes || [selected.focus]).map((note: string, index: number) => <li key={`${note}-${index}`} className="flex gap-3 text-sm leading-6"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">{index + 1}</span>{note}</li>)}</ul></div><div className="rounded-xl border bg-secondary/25 p-4"><ShieldCheck className="h-5 w-5 text-primary" /><p className="mt-2 text-sm font-semibold">Need current market context?</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Create a preparation pack with this company to retrieve dated, source-linked hiring and strategy signals.</p><Link href="/prepare" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary">Research in Prepare <ArrowRight className="h-4 w-4" /></Link></div><Button variant="outline" className="w-full" onClick={onNegotiate}><CircleDollarSign className="h-4 w-4" />Plan an offer conversation</Button></div> : <EmptyResult icon={<Building2 className="h-7 w-7" />} title="Select a company" copy="Review its interview style, evaluation focus, and practical preparation cues." />}</CardContent></Card></div>;
}

function SalaryWorkspace({ form, setForm, script, loading, onSubmit }: { form: any; setForm: (value: any) => void; script: any; loading: boolean; onSubmit: (event: React.FormEvent) => void }) {
  return <div className="grid gap-6 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]"><Card><CardHeader><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Offer strategy</p><CardTitle className="text-xl">Build a say-it-aloud negotiation plan</CardTitle><p className="text-sm leading-6 text-muted-foreground">Provide enough context for firm, professional wording—not an aggressive template.</p></CardHeader><CardContent><form onSubmit={onSubmit} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="salary-company">Company</Label><Input id="salary-company" required placeholder="Company name" value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="salary-role">Role</Label><Input id="salary-role" required placeholder="Target role" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} /></div></div><div className="space-y-2"><Label htmlFor="current-salary">Current compensation <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="current-salary" placeholder="e.g. ₹12 LPA or $120k" value={form.current_salary} onChange={(event) => setForm({ ...form, current_salary: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="target-range">Target range</Label><Input id="target-range" required placeholder="e.g. ₹18–22 LPA or $150–170k" value={form.target_range} onChange={(event) => setForm({ ...form, target_range: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="existing-offer">Existing offers or leverage <span className="font-normal text-muted-foreground">(optional)</span></Label><Textarea id="existing-offer" rows={4} placeholder="Another offer, rare skills, measurable impact, relocation constraints…" value={form.has_offer} onChange={(event) => setForm({ ...form, has_offer: event.target.value })} /></div><Button type="submit" size="lg" disabled={loading || !form.company.trim() || !form.role.trim() || !form.target_range.trim()} className="w-full">{loading ? <><Loader2 className="h-4 w-4 animate-spin" />Building strategy…</> : <><MessageSquareQuote className="h-4 w-4" />Build negotiation plan</>}</Button></form></CardContent></Card><Card className="min-h-[680px]"><CardHeader className="flex-row items-start justify-between space-y-0"><div><CardTitle className="text-xl">Negotiation playbook</CardTitle><p className="mt-1 text-sm text-muted-foreground">Practice the wording until it sounds like you.</p></div>{script && <Button variant="outline" size="sm" onClick={() => downloadJson("hustlrzz-negotiation-plan.json", script)}><Download className="h-4 w-4" />Export</Button>}</CardHeader><CardContent>{script ? <SalaryScript script={script} /> : <EmptyResult icon={<CircleDollarSign className="h-7 w-7" />} title="Your negotiation plan will appear here" copy="You’ll receive leverage analysis, exact wording, risky phrases to avoid, and clear closing options." />}</CardContent></Card></div>;
}

function SalaryScript({ script }: { script: any }) {
  return <div className="space-y-6">{script.situation && <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Strongest leverage</p><p className="mt-2 text-sm leading-6">{script.situation.strongest_leverage}</p></div><div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Watch this risk</p><p className="mt-2 text-sm leading-6">{script.situation.biggest_risk}</p></div></div>}{script.strategy?.length ? <section><h3 className="text-sm font-semibold">Your strategy</h3><ol className="mt-3 grid gap-2 sm:grid-cols-2">{script.strategy.map((item: string, index: number) => <li key={`${item}-${index}`} className="flex gap-3 rounded-lg bg-secondary/50 p-3 text-sm leading-6"><span className="font-mono text-xs font-semibold text-primary">0{index + 1}</span>{item}</li>)}</ol></section> : null}<section><h3 className="text-sm font-semibold">Conversation scenarios</h3><div className="mt-3 space-y-3">{(script.scenarios || []).map((scenario: any, index: number) => <details key={`${scenario.name}-${index}`} open={index === 0} className="rounded-xl border bg-card p-4"><summary className="cursor-pointer font-semibold">{scenario.name}</summary><div className="mt-4 space-y-3"><div className="rounded-lg bg-primary/5 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-primary">Say this</p><p className="mt-1 text-sm leading-6">“{scenario.say_this}”</p></div>{scenario.why && <p className="text-sm leading-6 text-muted-foreground"><span className="font-semibold text-foreground">Why it works:</span> {scenario.why}</p>}{scenario.avoid && <p className="flex gap-2 text-sm leading-6 text-amber-700 dark:text-amber-300"><TriangleAlert className="mt-1 h-4 w-4 shrink-0" /><span><span className="font-semibold">Avoid:</span> {scenario.avoid}</span></p>}</div></details>)}</div></section>{script.closing && <section className="rounded-xl border bg-secondary/25 p-4"><h3 className="text-sm font-semibold">Decision guardrails</h3><div className="mt-3 space-y-2 text-sm leading-6"><p><span className="font-semibold">Keep negotiating:</span> {script.closing.keep_negotiating}</p><p><span className="font-semibold">Accept when:</span> {script.closing.acceptable_to_accept}</p><p><span className="font-semibold">Exit politely:</span> {script.closing.polite_exit}</p></div></section>}</div>;
}

function PracticeWorkspace({ form, setForm, result, loading, onSubmit, onReset }: { form: any; setForm: (value: any) => void; result: any; loading: boolean; onSubmit: (event: React.FormEvent, metrics: Record<string, number>) => void; onReset: () => void }) {
  const metrics = useMetrics((state) => state.metrics);
  const resetMetrics = useMetrics((state) => state.reset);
  const { supported, listening, start, stop, speak } = useAudio((text) => {
    setForm((current: any) => ({ ...current, answer: `${current.answer}${current.answer ? " " : ""}${text}` }));
  });

  const resetAttempt = () => {
    stop();
    resetMetrics();
    onReset();
    setForm((current: any) => ({ ...current, answer: "" }));
  };

  return <div className="grid gap-6 xl:grid-cols-[minmax(360px,0.82fr)_minmax(0,1.18fr)]">
    <div className="space-y-6">
      <Card><CardHeader className="flex-row items-start justify-between space-y-0"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Private presence coach</p><CardTitle className="mt-1 text-xl">Rehearse on camera</CardTitle><p className="mt-1 text-sm leading-6 text-muted-foreground">Gesture, gaze, and posture are processed locally in your browser.</p></div><span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">Local only</span></CardHeader><CardContent><CameraPanel /></CardContent></Card>
    </div>
    <div className="space-y-6">
      <Card><CardHeader><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Realistic rehearsal</p><CardTitle className="text-xl">Answer by voice or keyboard</CardTitle><p className="text-sm leading-6 text-muted-foreground">Speak naturally, edit the transcript if speech recognition misheard you, then request combined content and delivery feedback.</p></CardHeader><CardContent>
        <form onSubmit={(event) => onSubmit(event, metrics)} className="space-y-5">
          <div className="space-y-2"><Label htmlFor="practice-scenario">Scenario</Label><select id="practice-scenario" value={form.scenario} onChange={(event) => { const scenario = event.target.value; stop(); onReset(); setForm({ scenario, prompt: PRACTICE_PROMPTS[scenario], answer: "" }); }} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring">{Object.keys(PRACTICE_PROMPTS).map((scenario) => <option key={scenario} value={scenario}>{scenario.replace(/\b\w/g, (letter) => letter.toUpperCase())}</option>)}</select></div>
          <div className="rounded-xl border bg-secondary/25 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Coach prompt</p><p className="mt-2 text-base font-medium leading-7">{form.prompt}</p></div><Button type="button" size="icon" variant="outline" onClick={() => speak(form.prompt)} disabled={!supported} aria-label="Read prompt aloud"><Volume2 className="h-4 w-4" /></Button></div></div>
          <div className="space-y-2"><div className="flex items-center justify-between gap-3"><Label htmlFor="practice-answer">Your answer</Label><span className="flex items-center gap-1 text-xs text-muted-foreground"><Keyboard className="h-3.5 w-3.5" />Editable transcript</span></div><Textarea id="practice-answer" rows={10} maxLength={12000} value={form.answer} onChange={(event) => setForm({ ...form, answer: event.target.value })} placeholder="Type here, or press the microphone and speak your answer…" required /><div className="flex items-center justify-between text-[11px] text-muted-foreground"><span>{listening ? "Listening—speak naturally…" : "Your audio is transcribed in the browser."}</span><span>{form.answer.length}/12,000</span></div></div>
          <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto]"><Button type="button" variant={listening ? "destructive" : "secondary"} onClick={listening ? stop : start} disabled={!supported || loading}>{listening ? <><MicOff className="h-4 w-4" />Stop listening</> : <><Mic className="h-4 w-4" />Answer by voice</>}</Button><Button type="submit" disabled={loading || form.answer.trim().length < 20}>{loading ? <><Loader2 className="h-4 w-4 animate-spin" />Reviewing attempt…</> : <><Sparkles className="h-4 w-4" />Coach my answer</>}</Button><Button type="button" size="icon" variant="outline" onClick={resetAttempt} disabled={loading} aria-label="Reset attempt"><RotateCcw className="h-4 w-4" /></Button></div>
          {!supported && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-5">Voice recognition is not available in this browser. Camera feedback and typed answers still work fully; Chrome or Edge provides the best browser speech support.</p>}
        </form>
      </CardContent></Card>
      {result && <PracticeFeedback result={result} onSpeak={() => speak(result.better_answer || result.summary || "")} />}
    </div>
  </div>;
}

function PracticeFeedback({ result, onSpeak }: { result: any; onSpeak: () => void }) {
  const score = Math.max(0, Math.min(Number(result.overall_score) || 0, 100));
  return <Card><CardHeader className="flex-row items-start justify-between space-y-0"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Attempt review</p><CardTitle className="mt-1 text-xl">Combined coaching feedback</CardTitle></div><div className="rounded-xl bg-primary px-4 py-2 text-center text-primary-foreground"><p className="text-2xl font-semibold">{score}</p><p className="text-[10px] uppercase tracking-wide opacity-75">overall</p></div></CardHeader><CardContent className="space-y-5"><p className="text-sm leading-6 text-muted-foreground">{result.summary}</p><div className="grid gap-3 sm:grid-cols-2"><FeedbackDimension title="Content" data={result.content} /><FeedbackDimension title="Delivery" data={result.delivery} /></div>{result.better_answer && <div className="rounded-xl border border-primary/30 bg-primary/5 p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">A stronger version</p><Button type="button" size="icon" variant="ghost" onClick={onSpeak} aria-label="Read stronger answer aloud"><Volume2 className="h-4 w-4" /></Button></div><p className="mt-2 text-sm leading-6">{result.better_answer}</p></div>}{result.next_drill && <div className="rounded-xl bg-secondary/50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next drill</p><p className="mt-2 text-sm leading-6">{result.next_drill}</p></div>}<Button variant="outline" size="sm" onClick={() => downloadJson("hustlrzz-coaching-practice.json", result)}><Download className="h-4 w-4" />Export feedback</Button></CardContent></Card>;
}

function FeedbackDimension({ title, data }: { title: string; data: any }) {
  return <div className="rounded-xl border p-4"><div className="flex items-center justify-between"><p className="font-semibold">{title}</p><span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold">{Number(data?.score) || 0}/10</span></div>{data?.strengths?.length ? <ul className="mt-3 space-y-1 text-xs leading-5 text-emerald-700 dark:text-emerald-300">{data.strengths.map((item: string) => <li key={item}>+ {item}</li>)}</ul> : null}{data?.improvements?.length ? <ul className="mt-3 space-y-1 text-xs leading-5 text-amber-700 dark:text-amber-300">{data.improvements.map((item: string) => <li key={item}>→ {item}</li>)}</ul> : null}</div>;
}

function EmptyResult({ icon, title, copy }: { icon: React.ReactNode; title: string; copy: string }) {
  return <div className="flex min-h-[460px] flex-col items-center justify-center text-center"><span className="rounded-2xl bg-secondary p-4 text-muted-foreground">{icon}</span><p className="mt-4 font-semibold">{title}</p><p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{copy}</p></div>;
}

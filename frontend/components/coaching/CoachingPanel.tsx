"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Building2, CircleDollarSign } from "lucide-react";

export function CoachingPanel() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [sel, setSel] = useState<any>(null);
  const [form, setForm] = useState({ company: "", role: "", current_salary: "", target_range: "", has_offer: "" });
  const [script, setScript] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<{ data: any[] }>("/companies")
      .then((r) => setCompanies(r.data))
      .catch(() => {});
  }, []);

  const runSalary = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setScript(null);
    try {
      const r = await api<{ data: any }>("/coaching/salary", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setScript(r.data);
    } catch (err) {
      alert(err instanceof Error ? err.message : "failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Company interview styles</CardTitle>
        </CardHeader>
        <CardContent>
          {companies.length === 0 && <p className="text-sm text-muted-foreground">Loading… (connect backend)</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {companies.map((c) => (
              <button
                key={c.name}
                onClick={() => setSel(c)}
                className={`text-left rounded-lg border p-3 hover:bg-accent transition-colors ${sel?.name === c.name ? "ring-2 ring-primary" : ""}`}
              >
                <p className="font-medium capitalize">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.style}</p>
              </button>
            ))}
          </div>
          {sel && (
            <div className="mt-4 rounded-lg border p-4 space-y-1">
              <p className="font-semibold capitalize">{sel.name} — {sel.focus}</p>
              {(sel.notes || []).map((n: string, i: number) => (
                <p key={i} className="text-sm text-muted-foreground">· {n}</p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CircleDollarSign className="h-5 w-5" /> Salary negotiation</CardTitle>
          <p className="text-sm text-muted-foreground">Build a structured, say-it-aloud negotiation script.</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={runSalary} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Company</Label><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></div>
              <div className="space-y-1"><Label>Role</Label><Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /></div>
            </div>
            <div className="space-y-1"><Label>Current salary</Label><Input placeholder="e.g. 120k" value={form.current_salary} onChange={(e) => setForm({ ...form, current_salary: e.target.value })} /></div>
            <div className="space-y-1"><Label>Target range</Label><Input placeholder="e.g. 150-170k" value={form.target_range} onChange={(e) => setForm({ ...form, target_range: e.target.value })} /></div>
            <div className="space-y-1"><Label>Existing offer</Label><Input placeholder="e.g. 155k from another company" value={form.has_offer} onChange={(e) => setForm({ ...form, has_offer: e.target.value })} /></div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Build negotiation script"}
            </Button>
          </form>
          {script && <SalaryScript script={script} />}
        </CardContent>
      </Card>
    </div>
  );
}

function SalaryScript({ script }: { script: any }) {
  return (
    <div className="mt-4 space-y-3">
      {script.situation && (
        <div className="rounded-lg border p-3 text-sm">
          <p><span className="font-medium">Leverage:</span> {script.situation.strongest_leverage}</p>
          <p className="text-muted-foreground"><span className="font-medium">Risk:</span> {script.situation.biggest_risk}</p>
        </div>
      )}
      {(script.scenarios || []).map((s: any, i: number) => (
        <div key={i} className="rounded-lg border p-3">
          <p className="font-medium text-sm">{s.name}</p>
          <p className="text-sm mt-1"><span className="font-medium">Say:</span> {s.say_this}</p>
          {s.why && <p className="text-xs mt-1 text-muted-foreground">Why: {s.why}</p>}
          {s.avoid && <p className="text-xs mt-1 text-amber-600">Avoid: {s.avoid}</p>}
        </div>
      ))}
    </div>
  );
}
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, CheckCircle, Loader2 } from "lucide-react";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<"verifying" | "ready" | "done">("verifying");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function verify() {
      try {
        const supabase = getSupabase();
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        // PKCE flow: exchange code for session
        if (code) {
          const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
          if (exErr) throw exErr;
        }
        // Check we have a recovery session
        const { data, error: sessErr } = await supabase.auth.getSession();
        if (sessErr) throw sessErr;
        if (!data.session) {
          throw new Error("Reset link is invalid or expired. Request a new one from the sign-in page.");
        }
        setPhase("ready");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Link verification failed");
        setPhase("ready"); // still allow retry; user can request new link
      }
    }
    verify();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true);
    try {
      const { error } = await getSupabase().auth.updateUser({ password });
      if (error) throw error;
      setMessage("Password updated. Redirecting to sign in...");
      setPhase("done");
      setTimeout(() => router.replace("/"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-secondary/25 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Set a new password</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {phase === "verifying" ? "Verifying your reset link..." : phase === "done" ? "All set" : "Choose a new password for your account."}
          </p>
        </CardHeader>
        <CardContent>
          {phase === "verifying" ? (
            <div className="flex items-center justify-center gap-3 py-8 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Verifying link</div>
          ) : phase === "done" ? (
            <div className="flex flex-col items-center gap-3 py-4 text-sm text-green-600"><CheckCircle className="h-8 w-8" />{message}</div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New password</Label>
                <Input id="password" type="password" required minLength={6} autoComplete="new-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input id="confirm" type="password" required minLength={6} autoComplete="new-password" placeholder="••••••••" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
              {error && <p role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm leading-5 text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
              {message && <p className="text-sm text-green-600">{message}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Update password"}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => router.replace("/")}>Back to sign in</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase/client";
import { signInMethods, validatePasswordChange } from "@/lib/settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { AlertCircle, CheckCircle, Loader2, LogOut } from "lucide-react";
import type { User } from "@supabase/supabase-js";

export function SettingsPanel() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getSupabase()
      .auth.getUser()
      .then(({ data }) => {
        if (active) setUser(data.user);
      })
      .catch(() => {
        /* AuthGate already handles missing session */
      })
      .finally(() => {
        if (active) setLoadingUser(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const validationError = validatePasswordChange(password, confirm);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    try {
      const { error: updateError } = await getSupabase().auth.updateUser({ password });
      if (updateError) throw updateError;
      setSuccess("Password updated — use it next sign-in.");
      setPassword("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update password");
    } finally {
      setSubmitting(false);
    }
  };

  const signOut = async () => {
    await getSupabase().auth.signOut();
    router.push("/");
  };

  const methods = signInMethods(user);

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="text-4xl font-semibold leading-[1.08] tracking-[-0.04em] md:text-5xl">Settings</h1>
        <p className="mt-3 text-base leading-7 text-muted-foreground">Manage your account security and preferences.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Sign-in methods</CardTitle>
          <p className="text-sm text-muted-foreground">How you can access this account.</p>
        </CardHeader>
        <CardContent>
          {loadingUser ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading account…
            </p>
          ) : methods.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sign-in methods found.</p>
          ) : (
            <ul className="space-y-3">
              {methods.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 rounded-xl border bg-secondary/30 px-4 py-3">
                  <span className="text-sm font-medium">{m.label}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{m.detail}</span>
                    <Badge variant="outline">{m.id}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Change password</CardTitle>
          <p className="text-sm text-muted-foreground">At least 6 characters. Applies to email sign-in.</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                placeholder="••••••••"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            {error && (
              <p role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm leading-5 text-destructive dark:text-red-400">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </p>
            )}
            {success && (
              <p role="status" className="flex items-start gap-2 rounded-xl border border-green-600/25 bg-green-600/5 p-3 text-sm leading-5 text-green-700 dark:text-green-400">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {success}
              </p>
            )}
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Update password
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Legal</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 text-sm">
          <Link href="/legal/privacy" className="font-semibold text-primary hover:underline">Privacy policy</Link>
          <Link href="/legal/terms" className="font-semibold text-primary hover:underline">Terms of service</Link>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button variant="outline" onClick={signOut} className="gap-1.5">
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </Button>
      </div>
    </main>
  );
}

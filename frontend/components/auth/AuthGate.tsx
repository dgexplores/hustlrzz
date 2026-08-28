"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Session } from "@supabase/supabase-js";
import { AuthForm } from "@/components/auth/AuthForm";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2, LogOut } from "lucide-react";

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    update();
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setConfigError(
        "This deployment is missing its Supabase configuration. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then redeploy."
      );
      setLoading(false);
      return;
    }
    let active = true;
    try {
      const supabase = getSupabase();
      supabase.auth
        .getSession()
        .then(({ data }) => {
          if (!active) return;
          setSession(data.session);
          setLoading(false);
        })
        .catch(() => {
          if (!active) return;
          setSession(null);
          setLoading(false);
        });
      const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
      return () => {
        active = false;
        sub.subscription.unsubscribe();
      };
    } catch (error) {
      setConfigError(error instanceof Error ? error.message : "Authentication could not start.");
      setLoading(false);
      return () => { active = false; };
    }
  }, []);

  const signOut = async () => {
    await getSupabase().auth.signOut();
    router.push("/");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (configError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-lg rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-destructive" />
          <h1 className="mt-3 text-xl font-semibold">Configuration needed</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{configError}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => window.location.reload()}>Reload</Button>
        </div>
      </main>
    );
  }

  if (!session) {
    if (pathname === "/") {
      return (
        <div className="min-h-screen bg-background">
          <header className="sticky top-0 z-40 bg-background/78 backdrop-blur-2xl">
            <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-6">
              <Link href="/" className="text-foreground">
                <span className="text-lg font-bold tracking-[-0.04em]">HUSTLRZZ</span>
              </Link>
              <div className="flex items-center gap-2"><ThemeToggle /><Link href="/prepare"><Button size="sm">Get started</Button></Link></div>
            </div>
          </header>
          {children}
        </div>
      );
    }
    return (
      <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-secondary/25 p-4">
        <div className="absolute right-4 top-4"><ThemeToggle /></div>
        <div className="w-full max-w-md">
          <div className="flex justify-center mb-6">
            <span className="text-xl font-bold tracking-[-0.04em]">HUSTLRZZ</span>
          </div>
          <AuthForm />
          <p className="mt-4 text-center text-xs text-muted-foreground">
            By continuing you agree to our{" "}
            <Link href="/legal/terms" className="font-semibold text-primary hover:underline">Terms</Link> and{" "}
            <Link href="/legal/privacy" className="font-semibold text-primary hover:underline">Privacy policy</Link>.
          </p>
        </div>
      </main>
    );
  }

  const nav = [
    { href: "/", label: "Home" },
    { href: "/prepare", label: "Prepare" },
    { href: "/interview", label: "Practice" },
    { href: "/dashboard", label: "Progress" },
  ];
  const moreNav = [
    { href: "/resume-analyzer", label: "Resume Analyzer" },
    { href: "/assessment", label: "Assessment" },
    { href: "/coaching", label: "Coaching" },
  ];
  const workflowSteps = [
    { href: "/prepare", label: "1. Prepare", active: pathname === "/prepare" },
    { href: "/interview", label: "2. Practice", active: pathname === "/interview" },
    { href: "/dashboard", label: "3. Progress", active: pathname === "/dashboard" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 bg-background/78 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-6">
          <Link href="/" className="text-foreground" aria-label="Hustlrzz home">
            <span className="text-lg font-bold tracking-[-0.04em]">HUSTLRZZ</span>
          </Link>
          <nav className="hidden items-stretch self-stretch md:flex" aria-label="Product journey">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`group relative flex items-center px-3 text-sm font-medium surface-transition ${
                  pathname === n.href ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {n.label}
                <span className={`absolute inset-x-3 bottom-2 h-0.5 origin-left rounded-full bg-primary transition-transform ${pathname === n.href ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"}`} />
              </Link>
            ))}
            <div className="relative flex items-center">
              <button onClick={() => setMoreOpen(!moreOpen)} onBlur={() => setTimeout(() => setMoreOpen(false), 150)} className={`flex items-center gap-1 px-3 text-sm font-medium ${moreNav.some(m => pathname === m.href) ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                More <span className={`transition-transform ${moreOpen ? "rotate-180" : ""}`}>▾</span>
              </button>
              {moreOpen && (
                <div className="absolute top-full right-0 mt-2 w-48 rounded-xl border bg-background shadow-lg overflow-hidden">
                  {moreNav.map(m => (
                    <Link key={m.href} href={m.href} onClick={() => setMoreOpen(false)} className={`block px-4 py-2.5 text-sm ${pathname === m.href ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>{m.label}</Link>
                  ))}
                </div>
              )}
            </div>
          </nav>
          <div className="flex items-center gap-2">
            {!isOnline && <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">● Offline — cached</span>}
            <ThemeToggle />
            <Button variant="outline" size="sm" onClick={signOut} className="gap-1.5">
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
        <nav className="flex max-w-full items-center overflow-x-auto px-3 md:hidden" aria-label="Mobile navigation">
          {[...nav, ...moreNav].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`shrink-0 border-b-2 px-3 py-2.5 text-xs font-semibold ${pathname === item.href ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {(pathname === "/prepare" || pathname === "/interview" || pathname === "/dashboard") && (
          <div className="border-t bg-secondary/30">
            <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2.5 md:px-6">
              {workflowSteps.map((step, i) => (
                <div key={step.href} className="flex items-center gap-2">
                  {i > 0 && <span className="text-muted-foreground/40">→</span>}
                  <Link href={step.href} className={`text-xs font-medium px-2.5 py-1 rounded-full ${step.active ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border"}`}>{step.label}</Link>
                </div>
              ))}
              <span className="ml-auto hidden text-xs text-muted-foreground md:inline">Follow the steps — each one feeds the next.</span>
            </div>
          </div>
        )}
      </header>
      {children}
    </div>
  );
}

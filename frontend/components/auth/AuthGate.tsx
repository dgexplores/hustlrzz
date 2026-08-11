"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase/client";
import type { Session } from "@supabase/supabase-js";
import { AuthForm } from "@/components/auth/AuthForm";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Loader2, LogOut, Radio } from "lucide-react";

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const supabase = getSupabase();
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
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

  if (!session) {
    if (pathname === "/") {
      return (
        <div className="min-h-screen bg-background">
          <header className="sticky top-0 z-40 border-b border-foreground/15 bg-background/92 backdrop-blur-xl">
            <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
              <Link href="/" className="flex items-center gap-2.5 text-foreground">
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-foreground bg-primary text-primary-foreground"><Radio className="h-4 w-4" /></span>
                <span className="font-display text-xl font-semibold tracking-tight">Hustlrzz</span>
              </Link>
              <div className="flex items-center gap-2"><ThemeToggle /><Link href="/prepare"><Button size="sm">Enter studio <span aria-hidden="true">→</span></Button></Link></div>
            </div>
          </header>
          {children}
        </div>
      );
    }
    return (
      <main className="relative min-h-screen flex items-center justify-center overflow-hidden p-4 studio-grid">
        <div className="absolute right-4 top-4"><ThemeToggle /></div>
        <div className="w-full max-w-md">
          <div className="flex justify-center mb-6">
            <div className="flex items-center gap-2 text-foreground">
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-foreground bg-primary text-primary-foreground"><Radio className="h-4 w-4" /></span>
              <span className="font-display text-2xl font-semibold">Hustlrzz</span>
            </div>
          </div>
          <AuthForm />
        </div>
      </main>
    );
  }

  const nav = [
    { href: "/", label: "Studio", number: "00" },
    { href: "/prepare", label: "Prepare", number: "01" },
    { href: "/interview", label: "Rehearse", number: "02" },
    { href: "/coaching", label: "Coach", number: "03" },
    { href: "/dashboard", label: "Review", number: "04" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-foreground/15 bg-background/92 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <Link href="/" className="group flex items-center gap-2.5 text-foreground" aria-label="Hustlrzz home">
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-foreground bg-primary text-primary-foreground surface-transition group-hover:rotate-12"><Radio className="h-4 w-4" /></span>
            <span className="font-display text-xl font-semibold tracking-tight">Hustlrzz</span>
          </Link>
          <nav className="hidden items-stretch self-stretch md:flex" aria-label="Product journey">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`group relative flex items-center gap-1.5 px-3 text-sm font-semibold surface-transition ${
                  pathname === n.href ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className={`font-mono text-[10px] ${pathname === n.href ? "text-primary" : "opacity-45"}`}>{n.number}</span>{n.label}
                <span className={`absolute inset-x-3 bottom-0 h-0.5 origin-left bg-primary transition-transform ${pathname === n.href ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"}`} />
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="outline" size="sm" onClick={signOut} className="gap-1.5">
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
        <nav className="flex max-w-full items-center overflow-x-auto border-t border-foreground/10 px-3 md:hidden" aria-label="Mobile navigation">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`shrink-0 border-b-2 px-3 py-2.5 text-xs font-semibold ${pathname === item.href ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              <span className="mr-1 font-mono text-[9px] text-primary">{item.number}</span>{item.label}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}

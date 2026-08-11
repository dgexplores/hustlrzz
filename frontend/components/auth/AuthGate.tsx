"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase/client";
import type { Session } from "@supabase/supabase-js";
import { AuthForm } from "@/components/auth/AuthForm";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Loader2, LogOut, Brain } from "lucide-react";

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
    return (
      <main className="relative min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-background to-secondary/70">
        <div className="absolute right-4 top-4"><ThemeToggle /></div>
        <div className="w-full max-w-md">
          <div className="flex justify-center mb-6">
            <div className="flex items-center gap-2 text-foreground">
              <Brain className="h-6 w-6" />
              <span className="text-lg font-semibold">Hustlrzz V2</span>
            </div>
          </div>
          <AuthForm />
        </div>
      </main>
    );
  }

  const nav = [
    { href: "/", label: "Home" },
    { href: "/prepare", label: "Prepare" },
    { href: "/interview", label: "Interview" },
    { href: "/coaching", label: "Coaching" },
    { href: "/dashboard", label: "History" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b bg-background/85 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-semibold text-foreground">
            <Brain className="h-5 w-5" />
            Hustlrzz V2
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                  pathname === n.href ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-accent"
                }`}
              >
                {n.label}
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
      </header>
      {children}
    </div>
  );
}

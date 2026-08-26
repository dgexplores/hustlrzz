"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    console.error("Unhandled app error:", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-lg rounded-2xl border bg-card p-8 text-center shadow-lg">
        <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          An unexpected error interrupted this page. Your saved practice history is safe.
        </p>
        {error.digest && <p className="mt-2 font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>}
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={reset}><RefreshCw className="h-4 w-4" />Try again</Button>
          <Button variant="outline" onClick={() => router.push("/")}>Go home</Button>
        </div>
      </div>
    </main>
  );
}

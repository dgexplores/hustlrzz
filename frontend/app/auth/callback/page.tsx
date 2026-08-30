"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { waitForRedirectSession } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function finishSignIn() {
      const params = new URLSearchParams(window.location.search);
      const providerError = params.get("error_description") || params.get("error");
      if (providerError) {
        if (active) setError(providerError);
        return;
      }

      try {
        const session = await waitForRedirectSession();
        if (!session) throw new Error("Google returned without creating a session. Verify the Google provider and redirect URLs in Supabase.");

        const requested = params.get("next") || "/prepare";
        const destination = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/prepare";
        router.replace(destination);
        router.refresh();
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Google sign-in could not be completed.");
      }
    }

    finishSignIn();
    return () => { active = false; };
  }, [router]);

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-secondary/25 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>{error ? "Google sign-in failed" : "Finishing sign-in"}</CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          {error ? (
            <>
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-left text-sm leading-6 text-destructive"><AlertCircle className="mt-1 h-4 w-4 shrink-0" />{error}</div>
              <Button className="mt-5 w-full" onClick={() => router.replace("/prepare")}>Return to sign in</Button>
            </>
          ) : (
            <div className="flex items-center justify-center gap-3 py-6 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Securely connecting your Google account</div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

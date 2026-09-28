import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase/client";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { AlertCircle, CheckCircle, Download, Loader2, Trash2 } from "lucide-react";

const CONFIRM_WORD = "DELETE";

/**
 * Data subject rights: download everything, or erase the account.
 *
 * The erasure path is irreversible, so the button is inert until the exact word is
 * typed. The export is offered first on purpose — a user asking to delete has
 * usually not realised there is a copy they can still keep.
 */
export function DataRightsCard() {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "confirming" | "working">("idle");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function handleExport() {
    setError(null);
    setDone(null);
    setPhase("working");
    try {
      const res = await api<{ data: Record<string, unknown> }>("/account/export");
      const blob = new Blob([JSON.stringify(res.data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "hustlrzz-my-data.json";
      a.click();
      URL.revokeObjectURL(url);
      setDone("Your data has been downloaded.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not export your data");
    } finally {
      setPhase("idle");
    }
  }

  async function handleDelete() {
    if (typed !== CONFIRM_WORD) return;
    setError(null);
    setDone(null);
    setPhase("working");
    try {
      await api("/account", {
        method: "DELETE",
        body: JSON.stringify({ confirm: CONFIRM_WORD }),
      });
      await getSupabase().auth.signOut();
      router.push("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete your account");
      setPhase("idle");
      setTyped("");
    }
  }

  const busy = phase === "working";
  const armed = typed === CONFIRM_WORD;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Your data</CardTitle>
        <p className="text-sm text-muted-foreground">
          Download everything we hold about you, or erase your account permanently.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleExport}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="h-4 w-4" aria-hidden="true" />
            )}
            Download my data
          </Button>

          {phase !== "confirming" ? (
            <Button
              type="button"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                setError(null);
                setDone(null);
                setTyped("");
                setPhase("confirming");
              }}
              disabled={busy}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete my account
            </Button>
          ) : null}
        </div>

        {phase === "confirming" ? (
          <div className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
            <p className="text-sm text-foreground">
              This permanently erases your account: every interview, resume, saved
              report, knowledge source, and stored API key. It cannot be undone.
            </p>
            <div className="space-y-2">
              <Label htmlFor="confirm-delete" className="text-sm">
                Type <span className="font-mono font-semibold">{CONFIRM_WORD}</span> to
                confirm
              </Label>
              <Input
                id="confirm-delete"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={CONFIRM_WORD}
                autoComplete="off"
                disabled={busy}
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={!armed || busy}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                )}
                Permanently delete
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setPhase("idle")}
                disabled={busy}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {done ? (
          <p
            className="flex items-center gap-2 text-sm text-muted-foreground"
            role="status"
          >
            <CheckCircle className="h-4 w-4" aria-hidden="true" />
            {done}
          </p>
        ) : null}

        {error ? (
          <p
            className="flex items-start gap-2 text-sm text-destructive"
            role="alert"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

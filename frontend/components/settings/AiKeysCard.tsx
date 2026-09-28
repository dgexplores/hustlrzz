"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { KeyRound, Loader2, Trash2 } from "lucide-react";

interface StoredKey {
  provider: string;
  key_hint: string;
  updated_at?: string;
}

interface Quota {
  daily_cap: number;
  used_today: number | null;
  remaining: number | null;
  own_key: boolean;
  byok_enabled: boolean;
  shared_free_providers: string[];
  paid_allowed: boolean;
}

const PROVIDERS = [
  { value: "groq", label: "Groq", hint: "Free tier, no card." },
  { value: "gemini", label: "Google Gemini", hint: "Free tier via AI Studio." },
  { value: "openai", label: "OpenAI", hint: "No free tier — uses your own credit." },
  { value: "openrouter", label: "OpenRouter", hint: "One key, many models." },
];

export function AiKeysCard() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [keys, setKeys] = useState<StoredKey[]>([]);
  const [provider, setProvider] = useState("groq");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api<{ data: Quota }>("/ai/quota");
      setQuota(res.data);
      setEnabled(true);
      const list = await api<{ data: StoredKey[] }>("/ai/keys");
      setKeys(list.data || []);
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 503) setEnabled(false);
      else setError(e instanceof Error ? e.message : "Could not load your keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await api<{ data: { key_hint: string } }>("/ai/keys", {
        method: "PUT",
        body: JSON.stringify({ provider, api_key: apiKey }),
      });
      setNote(`${PROVIDERS.find((p) => p.value === provider)?.label} key saved (${res.data.key_hint}).`);
      setApiKey("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that key");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (name: string) => {
    setBusy(true);
    setError(null);
    try {
      await api<void>(`/ai/keys/${encodeURIComponent(name)}`, { method: "DELETE" });
      setNote(`${PROVIDERS.find((p) => p.value === name)?.label ?? name} key removed.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove that key");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-8" role="status" aria-label="Loading AI keys">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (enabled === false) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" /> Your own AI key
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-6 text-muted-foreground">
            Not enabled on this deployment. Everyone is served by the shared free tier.
          </p>
        </CardContent>
      </Card>
    );
  }

  const saved = new Set(keys.map((k) => k.provider));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5" /> Your own AI key
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-6 text-muted-foreground">
          Optional. Without one you are served by the shared free tier
          {quota?.shared_free_providers?.length
            ? ` (${quota.shared_free_providers.join(", ")})`
            : ""}
          . Adding your own key lifts the daily limit and uses your own quota. It is stored encrypted and
          never shown again.
        </p>

        {quota?.daily_cap ? (
          <p className="rounded-lg border border-border bg-secondary/30 p-3 text-sm">
            {quota.used_today ?? 0} of {quota.daily_cap} included runs used today
            {quota.remaining !== null && quota.remaining > 0
              ? ` · ${quota.remaining} left`
              : quota.remaining === 0
                ? " · add a key to keep going"
                : ""}
            .
          </p>
        ) : null}

        {keys.length > 0 && (
          <ul className="divide-y rounded-lg border border-border">
            {keys.map((k) => (
              <li key={k.provider} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="text-sm">
                  {PROVIDERS.find((p) => p.value === k.provider)?.label ?? k.provider}{" "}
                  <span className="text-muted-foreground">{k.key_hint}</span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${k.provider} key`}
                  disabled={busy}
                  onClick={() => remove(k.provider)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={save} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="byok-provider">Provider</Label>
              <select
                id="byok-provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="flex h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
              >
                {PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value} disabled={saved.has(p.value)}>
                    {p.label}
                    {saved.has(p.value) ? " — added" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="byok-key">API key</Label>
              <Input
                id="byok-key"
                type="password"
                autoComplete="off"
                required
                minLength={8}
                placeholder="Paste your key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {PROVIDERS.find((p) => p.value === provider)?.hint} Your key is encrypted before storage and
            cannot be read back — you can only replace or remove it.
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {note && (
            <p role="status" className="text-sm text-muted-foreground">
              {note}
            </p>
          )}
          <Button type="submit" disabled={busy || !apiKey.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            <span className="ml-2">Save key</span>
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  RefreshCw,
  Database,
  FileText,
  Loader2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

interface KnowledgeDocument {
  document_id: string;
  title: string;
  source_type: string;
  chunk_count: number;
  created_at: string;
}

interface KnowledgeSearchHit {
  content: string;
  source_title: string;
  source_type: string;
  document_id: string;
  similarity: number;
}

interface IngestResult {
  document_id: string;
  chunk_count: number;
  duplicate: boolean;
}

/** Mirrors rag.service.ALLOWED_SOURCE_TYPES on the backend. */
const SOURCE_TYPES = [
  { value: "resume", label: "Resume" },
  { value: "portfolio", label: "Portfolio / work samples" },
  { value: "notes", label: "Notes & talking points" },
  { value: "session_report", label: "Session report" },
  { value: "company_intelligence", label: "Company intelligence" },
] as const;

const TYPE_LABELS: Record<string, string> = Object.fromEntries(
  SOURCE_TYPES.map((t) => [t.value, t.label])
);

function typeLabel(value: string) {
  return TYPE_LABELS[value] ?? value.replace(/_/g, " ");
}

function formatDateTime(value?: string) {
  if (!value) return "Unknown date";
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? "Unknown date" : new Date(value).toLocaleString();
}

function scoreLabel(similarity: number) {
  if (!Number.isFinite(similarity)) return "";
  return `${Math.round(similarity * 100)}% match`;
}

export function KnowledgePanel() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [topK, setTopK] = useState(5);
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<KnowledgeSearchHit[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [sourceType, setSourceType] = useState<string>("notes");
  const [content, setContent] = useState("");
  const [ingesting, setIngesting] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [ingestNote, setIngestNote] = useState<string | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<KnowledgeDocument | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [status, docs] = await Promise.all([
      api<{ data: { available: boolean } }>("/knowledge/status").catch(() => ({
        data: { available: false },
      })),
      api<{ data: KnowledgeDocument[] }>("/knowledge/documents").then(
        (r) => ({ data: r.data ?? [], error: null as unknown }),
        (e: unknown) => ({ data: [] as KnowledgeDocument[], error: e })
      ),
    ]);
    setAvailable(Boolean(status.data?.available));
    setDocuments(docs.data);
    setError(docs.error instanceof Error ? docs.error.message : null);
  }, []);

  useEffect(() => {
    let active = true;
    load().finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const runSearch = async (e: FormEvent) => {
    e.preventDefault();
    const clean = query.trim();
    if (!clean) return;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await api<{ data: KnowledgeSearchHit[] }>("/knowledge/search", {
        method: "POST",
        body: JSON.stringify({ query: clean, top_k: topK }),
      });
      setHits(res.data || []);
    } catch (err) {
      setHits(null);
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const addSource = async (e: FormEvent) => {
    e.preventDefault();
    setIngesting(true);
    setIngestError(null);
    setIngestNote(null);
    try {
      const res = await api<{ success: boolean; data: IngestResult }>("/knowledge/documents", {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), source_type: sourceType, content: content.trim() }),
      });
      const data = res?.data;
      setIngestNote(
        data?.duplicate
          ? "That source is already indexed — nothing to do."
          : `Added and split into ${data?.chunk_count ?? 0} chunk${data?.chunk_count === 1 ? "" : "s"}.`
      );
      setTitle("");
      setContent("");
      await load();
    } catch (err) {
      setIngestError(err instanceof Error ? err.message : "Could not add that source");
    } finally {
      setIngesting(false);
    }
  };

  const removeDocument = async (doc: KnowledgeDocument) => {
    setConfirmDelete(null);
    setDeletingId(doc.document_id);
    setError(null);
    try {
      await api<void>(`/knowledge/documents/${encodeURIComponent(doc.document_id)}`, {
        method: "DELETE",
      });
      setDocuments((prev) => prev.filter((d) => d.document_id !== doc.document_id));
      setHits((prev) => (prev ? prev.filter((h) => h.document_id !== doc.document_id) : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-16 flex justify-center" role="status" aria-label="Loading knowledge">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasDocuments = documents.length > 0;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <section className="motion-enter pb-2">
        <h1 className="text-4xl font-semibold leading-[1.08] tracking-[-0.04em] md:text-5xl">
          Your knowledge base.
        </h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">
          Everything here grounds your live answers. Add a source below, or let Prepare index your resume
          and company research automatically.
        </p>
      </section>

      <div
        role="status"
        className={`rounded-2xl border p-4 text-sm ${
          available
            ? "border-primary/30 bg-accent/50"
            : "border-amber-500/40 bg-amber-500/10"
        }`}
      >
        <p className="font-semibold">
          {available ? "Knowledge search is ready" : "Knowledge search is unavailable"}
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {available
            ? "Semantic retrieval is configured for live interviews and this workspace."
            : "The interview pack still works. Search and delete need the knowledge service configured."}
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive dark:text-red-400"
        >
          {error}
        </p>
      )}

      <Card className="motion-enter motion-enter-delay-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" /> Add a source
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={addSource} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="knowledge-title">Title</Label>
                <Input
                  id="knowledge-title"
                  required
                  placeholder="e.g. Stripe payments redesign"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="knowledge-type">Type</Label>
                <select
                  id="knowledge-type"
                  value={sourceType}
                  onChange={(e) => setSourceType(e.target.value)}
                  className="flex h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
                >
                  {SOURCE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="knowledge-content">Content</Label>
              <textarea
                id="knowledge-content"
                required
                rows={8}
                placeholder="Paste the text you want grounded in your answers — project write-ups, talking points, a portfolio narrative."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full rounded-lg border border-input bg-background p-3 text-sm leading-6"
              />
              <p className="text-xs text-muted-foreground">
                At least 120 characters. Duplicates are detected, so pasting the same source twice is safe.
              </p>
            </div>
            {ingestError && (
              <p role="alert" className="text-sm text-destructive dark:text-red-400">
                {ingestError}
              </p>
            )}
            {ingestNote && (
              <p role="status" className="text-sm text-muted-foreground">
                {ingestNote}
              </p>
            )}
            <Button type="submit" disabled={ingesting || !title.trim() || !content.trim()}>
              {ingesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              <span className="ml-2">Add source</span>
            </Button>
          </form>
        </CardContent>
      </Card>

      {hasDocuments && (
        <Card className="motion-enter motion-enter-delay-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" /> Search your sources
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={runSearch} className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="knowledge-search"
                aria-label="Search knowledge"
                placeholder="e.g. payment API design, leadership examples…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <label htmlFor="knowledge-topk" className="sr-only">
                  Results to return
                </label>
                <Input
                  id="knowledge-topk"
                  type="number"
                  min={1}
                  max={25}
                  value={topK}
                  onChange={(e) => setTopK(Math.max(1, Math.min(25, Number(e.target.value) || 1)))}
                  className="w-20"
                />
                <Button type="submit" disabled={searching || !query.trim() || available === false}>
                  {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  <span className="ml-2">Search</span>
                </Button>
              </div>
            </form>
            {searchError && (
              <p role="alert" className="text-sm text-destructive dark:text-red-400">
                {searchError}
              </p>
            )}
            {hits && hits.length === 0 && !searchError && (
              <p className="text-sm text-muted-foreground">No matching chunks. Try broader wording.</p>
            )}
            {hits && hits.length > 0 && (
              <ul className="space-y-3">
                {hits.map((hit, index) => (
                  <li key={`${hit.document_id}-${index}`} className="rounded-xl border bg-secondary/25 p-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                        {hit.source_title} · {typeLabel(hit.source_type)}
                      </p>
                      {scoreLabel(hit.similarity) && (
                        <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {scoreLabel(hit.similarity)}
                        </p>
                      )}
                    </div>
                    <p className="mt-1 break-words text-sm leading-6 text-foreground">{hit.content}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="motion-enter motion-enter-delay-2">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" /> Documents ({documents.length})
          </CardTitle>
          <Button type="button" variant="ghost" size="sm" onClick={refresh} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">Refresh</span>
          </Button>
        </CardHeader>
        <CardContent>
          {!hasDocuments ? (
            <div className="py-14 text-center">
              <FileText className="mx-auto h-7 w-7 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">No documents yet.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add a source above, or upload a resume on Prepare — it appears here automatically.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {documents.map((doc) => (
                <li key={doc.document_id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{doc.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {typeLabel(doc.source_type)} · {doc.chunk_count} chunk
                      {doc.chunk_count === 1 ? "" : "s"} · {formatDateTime(doc.created_at)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Delete ${doc.title}`}
                    disabled={deletingId === doc.document_id}
                    onClick={() => setConfirmDelete(doc)}
                    className="shrink-0 text-destructive hover:text-destructive"
                  >
                    {deletingId === doc.document_id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-delete-title"
            className="w-full max-w-md rounded-2xl border bg-background p-6 shadow-xl"
          >
            <h2 id="confirm-delete-title" className="text-lg font-semibold">
              Delete this source?
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              &ldquo;{confirmDelete.title}&rdquo; and its {confirmDelete.chunk_count} chunk
              {confirmDelete.chunk_count === 1 ? "" : "s"} will be removed permanently. Live answers will stop
              drawing on it.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setConfirmDelete(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => removeDocument(confirmDelete)}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Database, FileText, Loader2, Search, Trash2 } from "lucide-react";

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

function formatDateTime(value?: string) {
  if (!value) return "Unknown date";
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? "Unknown date" : new Date(value).toLocaleString();
}

export function KnowledgePanel() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<KnowledgeSearchHit[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      api<{ data: { available: boolean } }>("/knowledge/status").catch(() => ({ data: { available: false } })),
      api<{ data: KnowledgeDocument[] }>("/knowledge/documents").catch((e) => ({ data: [], error: e })),
    ]).then(([status, docs]: any[]) => {
      if (!active) return;
      setAvailable(Boolean(status?.data?.available));
      setDocuments(docs.data || []);
      setError(docs.error instanceof Error ? docs.error.message : null);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const runSearch = async (e: FormEvent) => {
    e.preventDefault();
    const clean = query.trim();
    if (!clean) return;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await api<{ data: KnowledgeSearchHit[] }>("/knowledge/search", {
        method: "POST",
        body: JSON.stringify({ query: clean, top_k: 5 }),
      });
      setHits(res.data || []);
    } catch (err) {
      setHits(null);
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const removeDocument = async (doc: KnowledgeDocument) => {
    if (deletingId) return;
    const ok = window.confirm(`Delete “${doc.title}”? This removes it and its chunks permanently.`);
    if (!ok) return;
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

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <section className="motion-enter pb-2">
        <h1 className="text-4xl font-semibold leading-[1.08] tracking-[-0.04em] md:text-5xl">Your knowledge base.</h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">
          Sources indexed from Prepare — search them, remove what you no longer need.
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
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive dark:text-red-400">
          {error}
        </p>
      )}

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
            <Button type="submit" disabled={searching || !query.trim() || available === false}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="ml-2">Search</span>
            </Button>
          </form>
          {searchError && (
            <p role="alert" className="text-sm text-destructive dark:text-red-400">{searchError}</p>
          )}
          {hits && hits.length === 0 && !searchError && (
            <p className="text-sm text-muted-foreground">No matching chunks yet. Index more material from Prepare.</p>
          )}
          {hits && hits.length > 0 && (
            <ul className="space-y-3">
              {hits.map((hit, index) => (
                <li key={`${hit.document_id}-${index}`} className="rounded-xl border bg-secondary/25 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                    {hit.source_title} · {hit.source_type}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-foreground">{hit.content}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="motion-enter motion-enter-delay-2">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" /> Documents ({documents.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <div className="py-14 text-center">
              <FileText className="mx-auto h-7 w-7 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">No documents yet.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Upload a resume or add sources on Prepare — they appear here automatically.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {documents.map((doc) => (
                <li key={doc.document_id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{doc.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {doc.source_type} · {doc.chunk_count} chunk{doc.chunk_count === 1 ? "" : "s"} · {formatDateTime(doc.created_at)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Delete ${doc.title}`}
                    disabled={deletingId === doc.document_id}
                    onClick={() => removeDocument(doc)}
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
    </div>
  );
}

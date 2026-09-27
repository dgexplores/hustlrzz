import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));

import { KnowledgePanel } from "../KnowledgePanel";

const DOCS = [
  {
    document_id: "d1",
    title: "staff_product_designer_resume",
    source_type: "resume",
    chunk_count: 4,
    created_at: "2026-09-20T10:00:00Z",
  },
  {
    document_id: "d2",
    title: "Acme hiring intel",
    source_type: "company_intelligence",
    chunk_count: 2,
    created_at: "2026-09-21T10:00:00Z",
  },
];

function respond({ docs = DOCS, available = true }: { docs?: typeof DOCS; available?: boolean } = {}) {
  apiMock.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === "/knowledge/status") return { data: { available } };
    if (path === "/knowledge/documents" && !init?.method) return { data: docs };
    if (path === "/knowledge/documents" && init?.method === "POST")
      return { success: true, data: { document_id: "d3", chunk_count: 3, duplicate: false } };
    if (path.startsWith("/knowledge/documents/") && init?.method === "DELETE") return undefined;
    if (path === "/knowledge/search")
      return {
        data: [
          {
            content: "Led the payments platform rebuild.",
            source_title: "staff_product_designer_resume",
            source_type: "resume",
            document_id: "d1",
            similarity: 0.82,
          },
        ],
      };
    throw new Error(`unhandled ${path}`);
  });
}

const postCall = () => apiMock.mock.calls.find((c) => c[0] === "/knowledge/documents" && c[1]?.method === "POST");
const body = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string);

describe("KnowledgePanel", () => {
  beforeEach(() => {
    apiMock.mockReset();
    respond();
  });

  it("lists documents with a readable type label instead of the raw enum", async () => {
    render(<KnowledgePanel />);

    expect(await screen.findByText("staff_product_designer_resume")).toBeInTheDocument();

    const row = screen.getByText("Acme hiring intel").closest("li") as HTMLElement;
    expect(row).toHaveTextContent(/company intelligence/i);
    // the raw snake_case enum must never reach the user
    expect(document.body.textContent).not.toContain("company_intelligence");
  });

  it("can add a source, the option the page was missing entirely", async () => {
    render(<KnowledgePanel />);
    await screen.findByText("staff_product_designer_resume");

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "Interview notes" } });
    fireEvent.change(screen.getByLabelText(/content/i), { target: { value: "x".repeat(200) } });
    fireEvent.click(screen.getByRole("button", { name: /add source/i }));

    await waitFor(() => expect(postCall()).toBeDefined());
    expect(body(postCall()!)).toMatchObject({ title: "Interview notes", source_type: expect.any(String) });
  });

  it("offers every source type the backend accepts, not only the reachable ones", async () => {
    render(<KnowledgePanel />);
    await screen.findByText("staff_product_designer_resume");

    const select = screen.getByLabelText(/type/i) as HTMLSelectElement;
    const values = within(select)
      .getAllByRole("option")
      .map((o) => (o as HTMLOptionElement).value);
    // mirrors backend rag.service.ALLOWED_SOURCE_TYPES
    expect(values).toEqual(
      expect.arrayContaining(["resume", "portfolio", "notes", "session_report", "company_intelligence"])
    );
  });

  it("reports the ingest outcome, including a duplicate", async () => {
    apiMock.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/knowledge/status") return { data: { available: true } };
      if (path === "/knowledge/documents" && !init?.method) return { data: DOCS };
      if (path === "/knowledge/documents" && init?.method === "POST")
        return { success: true, data: { document_id: "d1", chunk_count: 4, duplicate: true } };
      throw new Error(`unhandled ${path}`);
    });
    render(<KnowledgePanel />);
    await screen.findByText("staff_product_designer_resume");

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "Same again" } });
    fireEvent.change(screen.getByLabelText(/content/i), { target: { value: "y".repeat(200) } });
    fireEvent.click(screen.getByRole("button", { name: /add source/i }));

    expect(await screen.findByText(/already indexed/i)).toBeInTheDocument();
  });

  it("surfaces the similarity score the search API already returns", async () => {
    render(<KnowledgePanel />);
    await screen.findByText("staff_product_designer_resume");

    fireEvent.change(screen.getByLabelText(/search knowledge/i), { target: { value: "payments" } });
    fireEvent.click(screen.getByRole("button", { name: /^search$/i }));

    expect(await screen.findByText(/82%/)).toBeInTheDocument();
  });

  it("lets the user choose the result count instead of hardcoding 5", async () => {
    render(<KnowledgePanel />);
    await screen.findByText("staff_product_designer_resume");

    const k = screen.getByLabelText(/results/i) as HTMLInputElement;
    expect(k.value).toBe("5");
    fireEvent.change(k, { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText(/search knowledge/i), { target: { value: "payments" } });
    fireEvent.click(screen.getByRole("button", { name: /^search$/i }));

    await waitFor(() => {
      const call = apiMock.mock.calls.find((c) => c[0] === "/knowledge/search");
      expect(body(call!)).toMatchObject({ top_k: 12 });
    });
  });

  it("confirms in the app rather than with a native confirm", async () => {
    const nativeConfirm = vi.spyOn(window, "confirm");
    render(<KnowledgePanel />);
    await screen.findByText("staff_product_designer_resume");

    fireEvent.click(screen.getByRole("button", { name: /delete staff_product_designer_resume/i }));

    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(nativeConfirm).not.toHaveBeenCalled();
    nativeConfirm.mockRestore();
  });

  it("deletes only after the in-app confirmation is accepted", async () => {
    render(<KnowledgePanel />);
    await screen.findByText("staff_product_designer_resume");

    fireEvent.click(screen.getByRole("button", { name: /delete staff_product_designer_resume/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^delete$/i }));

    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith("/knowledge/documents/d1", expect.objectContaining({ method: "DELETE" }))
    );
  });

  it("keeps the document when the confirmation is cancelled", async () => {
    render(<KnowledgePanel />);
    await screen.findByText("staff_product_designer_resume");

    fireEvent.click(screen.getByRole("button", { name: /delete staff_product_designer_resume/i }));
    fireEvent.click(await screen.findByRole("button", { name: /cancel/i }));

    expect(apiMock.mock.calls.some((c) => c[1]?.method === "DELETE")).toBe(false);
    expect(screen.getByText("staff_product_designer_resume")).toBeInTheDocument();
  });

  it("can refresh without a full page reload", async () => {
    render(<KnowledgePanel />);
    await screen.findByText("staff_product_designer_resume");

    const before = apiMock.mock.calls.filter((c) => c[0] === "/knowledge/documents").length;
    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));

    await waitFor(() =>
      expect(apiMock.mock.calls.filter((c) => c[0] === "/knowledge/documents").length).toBeGreaterThan(before)
    );
  });

  it("does not offer to search an empty knowledge base", async () => {
    respond({ docs: [] });
    render(<KnowledgePanel />);

    expect(await screen.findByText(/no documents yet/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/search knowledge/i)).not.toBeInTheDocument();
  });
});

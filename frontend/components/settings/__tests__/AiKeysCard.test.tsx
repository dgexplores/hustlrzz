import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));

import { AiKeysCard } from "../AiKeysCard";

const QUOTA = {
  daily_cap: 20,
  used_today: 7,
  remaining: 13,
  own_key: false,
  byok_enabled: true,
  shared_free_providers: ["groq", "gemini"],
  paid_allowed: false,
};

interface Opts {
  keys?: { provider: string; key_hint: string }[];
  quota?: typeof QUOTA;
  quotaStatus?: number;
}

function respond({ keys = [], quota = QUOTA, quotaStatus }: Opts = {}) {
  apiMock.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === "/ai/quota") {
      if (quotaStatus) throw Object.assign(new Error("nope"), { status: quotaStatus });
      return { data: quota };
    }
    if (path === "/ai/keys" && !init?.method) return { data: keys };
    if (path === "/ai/keys" && init?.method === "PUT")
      return { data: { provider: "groq", key_hint: "…cret" } };
    if (/^\/ai\/keys\//.test(path) && init?.method === "DELETE") return undefined;
    throw new Error(`unhandled ${path}`);
  });
}

describe("AiKeysCard", () => {
  beforeEach(() => {
    // mockClear (not mockReset): a previous test's component can still have an
    // in-flight load(), and wiping the implementation makes that late call
    // throw during cleanup instead of failing the assertion it belongs to.
    apiMock.mockClear();
    respond();
  });

  it("explains the shared free tier when no key is set", async () => {
    respond();
    render(<AiKeysCard />);

    expect(await screen.findByText(/shared free tier/i)).toBeInTheDocument();
    expect(screen.getByText(/groq, gemini/)).toBeInTheDocument();
  });

  it("shows the remaining included runs", async () => {
    respond();
    render(<AiKeysCard />);

    expect(await screen.findByText(/7 of 20 included runs used today/i)).toBeInTheDocument();
    expect(screen.getByText(/13 left/i)).toBeInTheDocument();
  });

  it("says the deployment has BYOK off instead of erroring", async () => {
    respond({ quotaStatus: 503 });
    render(<AiKeysCard />);

    expect(await screen.findByText(/not enabled on this deployment/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/api key/i)).not.toBeInTheDocument();
  });

  it("never renders a stored key, only a hint", async () => {
    respond({ keys: [{ provider: "groq", key_hint: "…cdef" }] });
    render(<AiKeysCard />);

    expect(await screen.findByText("…cdef")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/gsk_[A-Za-z0-9]/);
  });

  it("sends the chosen provider and key, then clears the field", async () => {
    respond();
    render(<AiKeysCard />);
    await screen.findByText(/shared free tier/i);

    fireEvent.change(screen.getByLabelText(/api key/i), { target: { value: "gsk_live_supersecret" } });
    fireEvent.click(screen.getByRole("button", { name: /save key/i }));

    await waitFor(() => {
      const call = apiMock.mock.calls.find((c) => c[1]?.method === "PUT");
      expect(JSON.parse(call![1].body as string)).toEqual({
        provider: "groq",
        api_key: "gsk_live_supersecret",
      });
    });
    expect((screen.getByLabelText(/api key/i) as HTMLInputElement).value).toBe("");
  });

  it("masks the key input", async () => {
    respond();
    render(<AiKeysCard />);
    await screen.findByText(/shared free tier/i);

    expect(screen.getByLabelText(/api key/i)).toHaveAttribute("type", "password");
  });

  it("removes a stored key", async () => {
    respond({ keys: [{ provider: "groq", key_hint: "…cdef" }] });
    render(<AiKeysCard />);

    fireEvent.click(await screen.findByRole("button", { name: /remove groq key/i }));

    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith("/ai/keys/groq", expect.objectContaining({ method: "DELETE" }))
    );
  });

  it("marks an already-added provider so it cannot be added twice", async () => {
    respond({ keys: [{ provider: "groq", key_hint: "…cdef" }] });
    render(<AiKeysCard />);

    await screen.findByLabelText(/provider/i);
    const opt = screen.getByRole("option", { name: /groq — added/i }) as HTMLOptionElement;
    expect(opt.disabled).toBe(true);
  });

  it("flags that OpenAI has no free tier", async () => {
    respond();
    render(<AiKeysCard />);
    await screen.findByText(/shared free tier/i);

    fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: "openai" } });
    expect(screen.getByText(/no free tier/i)).toBeInTheDocument();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (event: unknown) => void;

const ORIGIN = "https://hustlrzz.vercel.app";

let fetchHandler: Handler;
let respondWith: ReturnType<typeof vi.fn>;
let addEventListener: ReturnType<typeof vi.fn>;

function stubRequest(path: string, init: RequestInit & { mode?: string } = {}) {
  return {
    method: init.method ?? "GET",
    url: ORIGIN + path,
    mode: init.mode ?? "no-cors",
    headers: new Headers(init.headers ?? {}),
  };
}

async function loadServiceWorker() {
  addEventListener = vi.fn();
  respondWith = vi.fn();
  const scope = vi.fn();
  (globalThis as Record<string, unknown>).self = {
    addEventListener,
    location: { origin: ORIGIN },
    clients: { claim: vi.fn() },
    skipWaiting: vi.fn(),
    registration: { scope: scope() },
  };
  (globalThis as Record<string, unknown>).caches = {
    open: vi.fn(async () => ({ addAll: vi.fn(), put: vi.fn(), match: vi.fn(async () => undefined) })),
    match: vi.fn(async () => undefined),
    keys: vi.fn(async () => []),
    delete: vi.fn(),
  };
  vi.resetModules();
  // The worker is a plain classic script, not an ES module, so it is loaded via a
  // computed specifier: TypeScript cannot type it, and it needs no suppression.
  const workerPath = ["..", "..", "public", "sw.js"].join("/");
  await import(/* @vite-ignore */ workerPath);
  fetchHandler = addEventListener.mock.calls.find((c) => c[0] === "fetch")?.[1] as Handler;
}

describe("service worker fetch handling", () => {
  beforeEach(async () => {
    await loadServiceWorker();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("registers a fetch handler", () => {
    expect(fetchHandler).toBeTypeOf("function");
  });

  it.each(["/robots.txt", "/llms.txt", "/sitemap.xml"])(
    "does not intercept %s, so crawlers always reach the network",
    (path) => {
      fetchHandler({ request: stubRequest(path), respondWith });

      expect(respondWith).not.toHaveBeenCalled();
    }
  );

  it("does not intercept non-GET requests", () => {
    fetchHandler({ request: stubRequest("/prepare", { method: "POST" }), respondWith });

    expect(respondWith).not.toHaveBeenCalled();
  });

  it("does not intercept cross-origin requests", () => {
    fetchHandler({
      request: { method: "GET", url: "https://cdn.example.com/x.js", mode: "no-cors", headers: new Headers() },
      respondWith,
    });

    expect(respondWith).not.toHaveBeenCalled();
  });

  it("leaves auth and api routes to the network", () => {
    for (const path of ["/api/auth/session", "/auth/callback"]) {
      respondWith.mockClear();
      fetchHandler({ request: stubRequest(path), respondWith });
      expect(respondWith).not.toHaveBeenCalled();
    }
  });

  it("handles document navigations", () => {
    fetchHandler({ request: stubRequest("/", { mode: "navigate" }), respondWith });

    expect(respondWith).toHaveBeenCalledTimes(1);
  });
});

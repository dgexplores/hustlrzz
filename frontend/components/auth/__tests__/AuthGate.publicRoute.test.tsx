import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const state = vi.hoisted(() => ({
  configured: true,
  getSupabase: vi.fn(),
  restoreSessionFromCookie: vi.fn(),
  push: vi.fn(),
  pathname: "/",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: state.push, replace: vi.fn() }),
  usePathname: () => state.pathname,
}));

vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return {
    default: ({
      href,
      children,
      ...rest
    }: {
      href: string;
      children: React.ReactNode;
      [key: string]: unknown;
    }) => createElement("a", { href, ...rest }, children),
  };
});

vi.mock("@/components/theme/ThemeToggle", () => ({ ThemeToggle: () => null }));

vi.mock("@/lib/supabase/client", () => ({
  get isSupabaseConfigured() {
    return state.configured;
  },
  getSupabase: () => state.getSupabase(),
  restoreSessionFromCookie: () => state.restoreSessionFromCookie(),
}));

import { AuthGate } from "../AuthGate";

/**
 * The session probe is a server round-trip. Blocking the whole page on it made
 * the public front page an empty spinner for as long as that request took, and
 * left crawlers a page with no content in it. The public route must not wait.
 */
describe("AuthGate does not block the public front page on the session probe", () => {
  beforeEach(() => {
    state.configured = true;
    state.getSupabase.mockReset();
    state.restoreSessionFromCookie.mockReset();
    state.push.mockReset();
    state.pathname = "/";
  });

  function pendingProbe() {
    // Never settles: stands in for a slow or cold /api/auth/session.
    state.restoreSessionFromCookie.mockReturnValue(new Promise(() => {}));
    state.getSupabase.mockReturnValue({
      auth: {
        getSession: vi.fn(() => new Promise(() => {})),
        onAuthStateChange: vi.fn(() => ({
          data: { subscription: { unsubscribe: vi.fn() } },
        })),
        signOut: vi.fn(),
      },
    });
  }

  it("renders homepage content while the session probe is still in flight", () => {
    pendingProbe();

    render(
      <AuthGate>
        <div>homepage content</div>
      </AuthGate>
    );

    expect(screen.getByText("homepage content")).toBeInTheDocument();
    expect(screen.queryByLabelText("Loading")).not.toBeInTheDocument();
  });

  it("still waits on a protected route so a signed-in user never sees the sign-in form", () => {
    state.pathname = "/prepare";
    pendingProbe();

    render(
      <AuthGate>
        <div>app content</div>
      </AuthGate>
    );

    expect(screen.getByLabelText("Loading")).toBeInTheDocument();
    expect(screen.queryByText("app content")).not.toBeInTheDocument();
    expect(screen.queryByText("Welcome to Hustlrzz")).not.toBeInTheDocument();
  });

  it("keeps the configuration error winning over the public-route bypass", async () => {
    state.configured = false;

    render(
      <AuthGate>
        <div>homepage content</div>
      </AuthGate>
    );

    expect(
      await screen.findByRole("heading", { name: "Configuration needed" })
    ).toBeInTheDocument();
  });

  it("promotes the homepage to the signed-in chrome once a session arrives", async () => {
    state.restoreSessionFromCookie.mockResolvedValue(null);
    state.getSupabase.mockReturnValue({
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: { access_token: "t" } },
          error: null,
        })),
        onAuthStateChange: vi.fn(() => ({
          data: { subscription: { unsubscribe: vi.fn() } },
        })),
        signOut: vi.fn(),
      },
    });

    render(
      <AuthGate>
        <div>homepage content</div>
      </AuthGate>
    );

    // Content was already there before the probe settled; the gate header joins after.
    expect(screen.getByText("homepage content")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });
});

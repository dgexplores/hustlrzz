import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

const state = vi.hoisted(() => ({
  configured: true,
  getSupabase: vi.fn(),
  restoreSessionFromCookie: vi.fn(),
  push: vi.fn(),
  pathname: "/dashboard",
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

vi.mock("@/components/theme/ThemeToggle", () => ({
  ThemeToggle: () => null,
}));

vi.mock("@/lib/supabase/client", () => ({
  get isSupabaseConfigured() {
    return state.configured;
  },
  getSupabase: () => state.getSupabase(),
  restoreSessionFromCookie: () => state.restoreSessionFromCookie(),
}));

import { AuthGate } from "../AuthGate";

describe("AuthGate", () => {
  beforeEach(() => {
    state.configured = true;
    state.getSupabase.mockReset();
    state.restoreSessionFromCookie.mockReset();
    state.push.mockReset();
    state.pathname = "/dashboard";
  });

  it("shows the configuration error screen when Supabase is unconfigured", async () => {
    state.configured = false;

    render(
      <AuthGate>
        <div>app content</div>
      </AuthGate>
    );

    expect(
      await screen.findByRole("heading", { name: "Configuration needed" })
    ).toBeInTheDocument();
    expect(screen.queryByText("app content")).not.toBeInTheDocument();
  });

  it("renders the sign-in form when there is no session", async () => {
    state.configured = true;
    state.restoreSessionFromCookie.mockResolvedValue(null);
    state.getSupabase.mockReturnValue({
      auth: {
        getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
        onAuthStateChange: vi.fn(() => ({
          data: { subscription: { unsubscribe: vi.fn() } },
        })),
        signOut: vi.fn(),
      },
    });

    render(
      <AuthGate>
        <div>app content</div>
      </AuthGate>
    );

    expect(await screen.findByText("Welcome to Hustlrzz")).toBeInTheDocument();
    expect(screen.queryByText("app content")).not.toBeInTheDocument();
  });

  it("renders children when a session exists", async () => {
    state.configured = true;
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
        <div>app content</div>
      </AuthGate>
    );

    expect(await screen.findByText("app content")).toBeInTheDocument();
  });

  it("keeps the homepage header owned by the homepage", async () => {
    state.pathname = "/";
    state.restoreSessionFromCookie.mockResolvedValue(null);
    state.getSupabase.mockReturnValue({
      auth: {
        getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
        onAuthStateChange: vi.fn(() => ({
          data: { subscription: { unsubscribe: vi.fn() } },
        })),
        signOut: vi.fn(),
      },
    });

    render(
      <AuthGate>
        <header>
          <nav aria-label="Primary">Homepage navigation</nav>
        </header>
      </AuthGate>
    );

    expect(await screen.findByRole("navigation", { name: "Primary" })).toBeInTheDocument();
    expect(screen.getAllByRole("banner")).toHaveLength(1);
  });

  it("keeps mobile navigation to the four primary destinations", async () => {
    state.pathname = "/prepare";
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
        <div>app content</div>
      </AuthGate>
    );

    const mobileNav = await screen.findByRole("navigation", { name: "Mobile navigation" });
    expect(within(mobileNav).getAllByRole("link")).toHaveLength(4);
    expect(within(mobileNav).getByRole("link", { name: "Prepare" })).toHaveAttribute("aria-current", "page");
  });
});

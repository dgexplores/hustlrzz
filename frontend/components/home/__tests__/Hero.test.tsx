import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

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

import { Hero } from "../Hero";

function renderHero() {
  render(<Hero />);
  const heading = screen.getByRole("heading", { level: 1 });
  const hero = heading.closest("section");
  if (!hero) throw new Error("hero section not found");
  return { heading, hero };
}

describe("Hero", () => {
  it("renders a single level-one heading", () => {
    render(<Hero />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("gives the headline the top of the type scale", () => {
    const { heading } = renderHero();

    expect(heading.className).toContain("hero-display");
  });

  it("sets the headline in the display serif rather than the UI sans", () => {
    const { heading } = renderHero();

    expect(heading.className).toContain("display-serif");
  });

  it("sets one headline word in italic display type for editorial contrast", () => {
    const { heading } = renderHero();

    const emphasis = heading.querySelector("em");

    expect(emphasis).not.toBeNull();
    expect(emphasis?.textContent).toMatch(/unforgettable/i);
  });

  it("labels the hero as an opening slide with an index marker", () => {
    const { hero } = renderHero();

    expect(within(hero).getByText("01")).toBeInTheDocument();
  });

  it("labels the three value steps in order", () => {
    const { hero } = renderHero();

    const steps = within(hero).getByRole("list", { name: "How it works" });
    const items = within(steps).getAllByRole("listitem");

    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent(/paste your resume/i);
    expect(items[1]).toHaveTextContent(/question pack/i);
    expect(items[2]).toHaveTextContent(/rehearse live/i);
  });

  it("shows the privacy reassurance inside the hero, not only in the footer", () => {
    const { hero } = renderHero();

    expect(within(hero).getByText(/camera never leaves the browser/i)).toBeInTheDocument();
  });

  it("keeps every hero action touch-friendly", () => {
    const { hero } = renderHero();

    const actions = within(hero).getAllByRole("link");
    expect(actions.length).toBeGreaterThanOrEqual(2);
    for (const action of actions) {
      expect(action.className).toContain("min-h-11");
    }
  });

  it("does not hardcode color values instead of using theme tokens", () => {
    const { hero } = renderHero();

    const literals = hero.querySelectorAll("[class*='#'], [style*='color']");
    expect(literals).toHaveLength(0);
    expect(hero.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

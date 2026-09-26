import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

// Motion resolves prefers-reduced-motion once per module instance, so a
// matchMedia override in a sibling test file would not reach it. Mocking the
// hook keeps this file's assertion honest about the reduced-motion branch.
vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return { ...actual, useReducedMotion: () => true };
});

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

describe("Hero with reduced motion", () => {
  it("shows the full value chain instead of an empty shell", () => {
    render(<Hero />);

    const steps = within(screen.getByRole("list", { name: "How it works" }));
    const items = steps.getAllByRole("listitem");

    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent(/paste your resume/i);
    expect(items[1]).toHaveTextContent(/question pack/i);
    expect(items[2]).toHaveTextContent(/rehearse live/i);
  });

  it("applies no transform anywhere in the hero", () => {
    render(<Hero />);

    const hero = screen.getByRole("heading", { level: 1 }).closest("section");
    const transformed = [...hero!.querySelectorAll<HTMLElement>("[style*='transform']")];

    expect(transformed).toHaveLength(0);
  });
});

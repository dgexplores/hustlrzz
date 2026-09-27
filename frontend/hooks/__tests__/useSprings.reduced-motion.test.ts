import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Motion resolves prefers-reduced-motion once per module instance, so the hook
// is mocked rather than driven through matchMedia.
vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return { ...actual, useReducedMotion: () => true };
});

import { usePressAndHover, useFlexSpring } from "@/hooks/useSprings";

const settle = () => new Promise((r) => setTimeout(r, 350));

describe("useSprings with reduced motion", () => {
  it("does not move the press scale at all", async () => {
    const { result } = renderHook(() => usePressAndHover(0.97, 1.03));

    act(() => result.current.handlers.onPointerDown());
    await settle();

    expect(result.current.scale.get()).toBe(1);
  });

  it("does not move the hover scale at all", async () => {
    const { result } = renderHook(() => usePressAndHover(0.97, 1.03));

    act(() => result.current.handlers.onPointerEnter());
    await settle();

    expect(result.current.scale.get()).toBe(1);
  });

  it("does not animate flex growth, but still flips state so content stays reachable", async () => {
    const { result } = renderHook(() => useFlexSpring(1, 2.4));

    act(() => result.current.expand());
    await settle();

    expect(result.current.flex.get()).toBe(1);
    expect(result.current.isExpanded).toBe(true);
  });
});

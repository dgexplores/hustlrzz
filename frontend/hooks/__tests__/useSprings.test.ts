import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePressAndHover, useFlexSpring } from "@/hooks/useSprings";

const settle = () => new Promise((r) => setTimeout(r, 350));

describe("useSprings with motion allowed", () => {
  it("animates the press scale on pointer down", async () => {
    const { result } = renderHook(() => usePressAndHover(0.97, 1.03));

    act(() => result.current.handlers.onPointerDown());
    await settle();

    expect(result.current.scale.get()).toBeLessThan(1);
  });

  it("animates the hover scale on pointer enter", async () => {
    const { result } = renderHook(() => usePressAndHover(0.97, 1.03));

    act(() => result.current.handlers.onPointerEnter());
    await settle();

    expect(result.current.scale.get()).toBeGreaterThan(1);
  });

  it("animates flex growth when expanded", async () => {
    const { result } = renderHook(() => useFlexSpring(1, 2.4));

    act(() => result.current.expand());
    await settle();

    expect(result.current.flex.get()).toBeGreaterThan(1);
  });
});

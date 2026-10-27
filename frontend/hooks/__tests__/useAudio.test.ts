import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

async function hook(throws = false) {
  const instances: any[] = [];
  class Recognizer {
    start = vi.fn(() => { if (throws) throw new Error("Permission blocked"); });
    stop = vi.fn();
    onerror: any;
    constructor() { instances.push(this); }
  }
  vi.stubGlobal("SpeechRecognition", Recognizer);
  vi.stubGlobal("speechSynthesis", { cancel: vi.fn(), getVoices: () => [], addEventListener: vi.fn(), removeEventListener: vi.fn() });
  const { useAudio } = await import("@/hooks/useAudio");
  return { ...renderHook(() => useAudio(vi.fn())), instances };
}

it("keeps typed input available when speech recognition cannot start", async () => {
  const { result } = await hook(true);
  act(() => result.current.start());
  expect(result.current.listening).toBe(false);
  expect(result.current.error).toMatch(/could not start/);
});

it("reports a speech network outage instead of silently retrying", async () => {
  const { result, instances } = await hook();
  act(() => result.current.start());
  act(() => instances[0].onerror({ error: "network" }));
  expect(result.current.error).toMatch(/network/);
  expect(result.current.listening).toBe(false);
});

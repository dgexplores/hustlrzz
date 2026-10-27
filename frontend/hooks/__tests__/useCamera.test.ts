import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCamera } from "@/hooks/useCamera";

afterEach(() => vi.unstubAllGlobals());
const camera = (getUserMedia: ReturnType<typeof vi.fn>) => {
  vi.stubGlobal("navigator", { mediaDevices: {
    enumerateDevices: vi.fn().mockResolvedValue([{ kind: "videoinput" }]), getUserMedia,
  }});
};

describe("camera lifetime", () => {
  it("stops a stream whose permission resolves after disabling the camera", async () => {
    let grant!: (stream: MediaStream) => void;
    const getUserMedia = vi.fn(() => new Promise<MediaStream>((resolve) => { grant = resolve; }));
    camera(getUserMedia);
    const stop = vi.fn();
    const ref = { current: null };
    const { result, rerender } = renderHook(({ enabled }) => useCamera(ref, 0, enabled), { initialProps: { enabled: true } });
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());
    rerender({ enabled: false });
    await act(async () => grant({ getTracks: () => [{ stop }] } as unknown as MediaStream));
    expect(stop).toHaveBeenCalledOnce();
    expect(result.current.status).toBe("off");
  });

  it("does not request permission while off, and releases a live stream on unmount", async () => {
    const stop = vi.fn();
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] });
    camera(getUserMedia);
    const ref = { current: null };
    const { result, rerender, unmount } = renderHook(({ enabled }) => useCamera(ref, 0, enabled), { initialProps: { enabled: false } });
    expect(getUserMedia).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.status).toBe("live"));
    unmount();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("reports denied permission without a live stream", async () => {
    camera(vi.fn().mockRejectedValue(new DOMException("Denied", "NotAllowedError")));
    const ref = { current: null };
    const { result } = renderHook(() => useCamera(ref, 0, true));
    await waitFor(() => expect(result.current.status).toBe("denied"));
  });
});

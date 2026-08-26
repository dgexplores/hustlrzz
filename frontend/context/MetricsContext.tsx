import { create } from "zustand";

export interface PresenceMetrics {
  handDetectionCounter: number;
  handDetectionDuration: number;
  notFacingCounter: number;
  notFacingDuration: number;
  badPostureDetectionCounter: number;
  badPostureDuration: number;
  // Advanced continuous signals (EMA-smoothed).
  headTiltDeg: number;
  shoulderTiltDeg: number;
  forwardHeadProxy: number;
  gazeStabilityScore: number;
  postureScore: number;
}

interface MetricsState {
  metrics: PresenceMetrics;
  updateMetrics: (m: Partial<PresenceMetrics>) => void;
  reset: () => void;
}

const empty: PresenceMetrics = {
  handDetectionCounter: 0,
  handDetectionDuration: 0,
  notFacingCounter: 0,
  notFacingDuration: 0,
  badPostureDetectionCounter: 0,
  badPostureDuration: 0,
  headTiltDeg: 0,
  shoulderTiltDeg: 0,
  forwardHeadProxy: 0,
  gazeStabilityScore: 100,
  postureScore: 100,
};

export const useMetrics = create<MetricsState>((set) => ({
  metrics: { ...empty },
  updateMetrics: (metrics) => set((state) => ({ metrics: { ...state.metrics, ...metrics } })),
  reset: () => set({ metrics: { ...empty } }),
}));

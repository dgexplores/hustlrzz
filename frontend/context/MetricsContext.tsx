import { create } from "zustand";

interface MetricsState {
  metrics: {
    handDetectionCounter: number;
    handDetectionDuration: number;
    notFacingCounter: number;
    notFacingDuration: number;
    badPostureDetectionCounter: number;
    badPostureDuration: number;
  };
  updateMetrics: (m: MetricsState["metrics"]) => void;
  reset: () => void;
}

const empty = {
  handDetectionCounter: 0,
  handDetectionDuration: 0,
  notFacingCounter: 0,
  notFacingDuration: 0,
  badPostureDetectionCounter: 0,
  badPostureDuration: 0,
};

export const useMetrics = create<MetricsState>((set) => ({
  metrics: { ...empty },
  updateMetrics: (metrics) => set({ metrics }),
  reset: () => set({ metrics: { ...empty } }),
}));
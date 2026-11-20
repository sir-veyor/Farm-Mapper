import { create } from 'zustand';

type LonLat = [number, number];

/** Points of the current on-screen measurement (kept only in memory). */
export const useMeasure = create<{
  points: LonLat[];
  add: (p: LonLat) => void;
  undo: () => void;
  clear: () => void;
}>((set, get) => ({
  points: [],
  add: (p) => set({ points: [...get().points, p] }),
  undo: () => set({ points: get().points.slice(0, -1) }),
  clear: () => set({ points: [] }),
}));

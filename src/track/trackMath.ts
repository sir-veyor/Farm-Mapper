import type { LineOrPolygon } from '../types';
import { metersBetween } from '../util/geo';

export const MIN_STEP_M = 3.0;        // a new point only after moving about 10 ft (filters GPS wobble while standing)
export const MAX_ACCURACY_M = 25;     // ignore fixes worse than about 80 ft
export const MAX_SPEED_MPS = 15;      // faster than this on foot is a GPS glitch
export const GAP_MS = 30000;          // no fix for this long: start a new segment instead of drawing a straight line across the gap

export interface TrackFix { lon: number; lat: number; accuracyM: number; time: number }
export type Verdict = 'accept' | 'poor-accuracy' | 'too-close' | 'glitch';

export function judgeFix(prev: { lon: number; lat: number; time: number } | null, fix: TrackFix): Verdict {
  if (fix.accuracyM > MAX_ACCURACY_M) return 'poor-accuracy';
  if (!prev) return 'accept';
  const d = metersBetween([prev.lon, prev.lat], [fix.lon, fix.lat]);
  const dt = Math.max(1, (fix.time - prev.time) / 1000);
  if (d / dt > MAX_SPEED_MPS && d > 30) return 'glitch';
  // standing still: the step threshold grows a little with poor accuracy so noise does not draw a scribble
  if (d < Math.max(MIN_STEP_M, Math.min(fix.accuracyM * 0.5, 8))) return 'too-close';
  return 'accept';
}

export type Segments = number[][][];

export function segmentsLength(segs: Segments): number {
  let t = 0;
  for (const s of segs) for (let i = 1; i < s.length; i++) t += metersBetween([s[i - 1][0], s[i - 1][1]], [s[i][0], s[i][1]]);
  return t;
}

/** Segments with fewer than 2 points cannot be drawn and are left out. Null if nothing can be drawn yet. */
export function toGeometry(segs: Segments): LineOrPolygon | null {
  const lines = segs.filter((s) => s.length >= 2);
  if (!lines.length) return null;
  return lines.length === 1 ? { type: 'LineString', coordinates: lines[0] } : { type: 'MultiLineString', coordinates: lines };
}

export function fromGeometry(g: LineOrPolygon): Segments {
  if (g.type === 'LineString') return [g.coordinates.map((p) => [p[0], p[1]])];
  if (g.type === 'MultiLineString') return g.coordinates.map((l) => l.map((p) => [p[0], p[1]]));
  return [];
}

export const formatDuration = (s: number): string => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};

import { SYMBOLS } from '../config';
import { normalizeHex } from '../kml/kmlColor';
import type { FeatureSource, GpsFix, Layer, LineOrPolygon, Poi, PoiOrigin, Style, StyleOverride, VectorFeature } from '../types';

export const SHARE_FORMAT = 'farm-mapper-share';
export const SHARE_VERSION = 1;
export const MAX_SHARE_BYTES = 8 * 1024 * 1024;
const MAX_ITEMS = 50000;
const MAX_VERTICES = 400000;

export interface SharedLayer { key: string; name: string; style: StyleOverride }
export interface SharedPoi {
  id: string | null; layer: string; name: string; notes: string; lon: number; lat: number; origin: PoiOrigin;
  gps?: GpsFix; style: StyleOverride; extra?: Record<string, string>; createdAt: string;
}
export interface SharedFeature {
  id: string | null; layer: string; name: string; notes: string; geometry: LineOrPolygon; style: StyleOverride;
  source: FeatureSource; extra?: Record<string, string>; createdAt: string;
}
export interface ShareFile { format: typeof SHARE_FORMAT; version: number; createdAt: string; layers: SharedLayer[]; pois: SharedPoi[]; features: SharedFeature[] }

export class ShareError extends Error {
  constructor(message: string) { super(message); this.name = 'ShareError'; }
}

// ---------------------------------------------------------------- build (sender side)

export function buildShare(items: { layer: Layer; pois: Poi[]; features: VectorFeature[] }[]): ShareFile {
  const layers: SharedLayer[] = [], pois: SharedPoi[] = [], features: SharedFeature[] = [];
  for (const { layer, pois: ps, features: fs } of items) {
    const key = layer.id;
    layers.push({ key, name: layer.name, style: layer.defaultStyle });
    for (const p of ps) pois.push({ id: p.id, layer: key, name: p.name, notes: p.notes, lon: p.lon, lat: p.lat, origin: p.origin, gps: p.gps, style: p.style, extra: p.extra, createdAt: p.createdAt });
    for (const f of fs) features.push({ id: f.id, layer: key, name: f.name, notes: f.notes, geometry: f.geometry, style: f.style, source: f.source, extra: f.extra, createdAt: f.createdAt });
  }
  return { format: SHARE_FORMAT, version: SHARE_VERSION, createdAt: new Date().toISOString(), layers, pois, features };
}

// ---------------------------------------------------------------- parse + sanitize (receiver side: the file is untrusted)

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number): string =>
  (typeof v === 'string' ? v : '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, max);
const num = (v: unknown, lo: number, hi: number): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);
/** Coordinates must be in range, not clamped: an impossible position means the item is bad, so it is dropped. */
const inRange = (v: unknown, lo: number, hi: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
const iso = (v: unknown): string => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : new Date().toISOString());
const idOf = (v: unknown): string | null => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null);
const ORIGINS: PoiOrigin[] = ['gps', 'gps-averaged', 'map-tap', 'import'];

export function sanitizeStyle(v: unknown): StyleOverride {
  if (!isObj(v)) return {};
  const s: StyleOverride = {};
  for (const k of ['strokeColor', 'fillColor', 'symbolColor'] as const) { const c = normalizeHex(v[k]); if (c) s[k] = c; }
  const sw = num(v.strokeWidth, 0.5, 12); if (sw !== null) s.strokeWidth = sw;
  const so = num(v.strokeOpacity, 0, 1); if (so !== null) s.strokeOpacity = so;
  const fo = num(v.fillOpacity, 0, 1); if (fo !== null) s.fillOpacity = fo;
  const sz = num(v.symbolSize, 0.5, 2.5); if (sz !== null) s.symbolSize = sz;
  const band = num(v.searchBandFt, 0, 1000); if (band !== null) s.searchBandFt = band;
  if (typeof v.symbol === 'string' && (SYMBOLS as string[]).includes(v.symbol)) s.symbol = v.symbol as Style['symbol'];
  if (v.strokeDash === 'solid' || v.strokeDash === 'dashed' || v.strokeDash === 'dotted') s.strokeDash = v.strokeDash;
  if (typeof v.showLabels === 'boolean') s.showLabels = v.showLabels;
  return s;
}

function sanitizeExtra(v: unknown): Record<string, string> | undefined {
  if (!isObj(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v).slice(0, 50)) if (typeof val === 'string' || typeof val === 'number') out[text(k, 60)] = text(String(val), 500);
  return Object.keys(out).length ? out : undefined;
}

function sanitizeGps(v: unknown): GpsFix | undefined {
  if (!isObj(v)) return undefined;
  const acc = num(v.accuracyM, 0, 100000);
  if (acc === null) return undefined;
  const gps: GpsFix = { accuracyM: acc, fixTime: iso(v.fixTime) };
  const alt = num(v.altitudeM, -1000, 20000); if (alt !== null) gps.altitudeM = alt;
  if (isObj(v.avg)) {
    const [u, r, d, sp] = [num(v.avg.samplesUsed, 0, 1e6), num(v.avg.samplesRejected, 0, 1e6), num(v.avg.durationS, 0, 1e5), num(v.avg.spreadM, 0, 1e5)];
    if (u !== null && r !== null && d !== null && sp !== null) gps.avg = { samplesUsed: u, samplesRejected: r, durationS: d, spreadM: sp };
  }
  if (v.movedManually === true) gps.movedManually = true;
  return gps;
}

const pos = (p: unknown): number[] | null => {
  if (!Array.isArray(p) || p.length < 2) return null;
  const [lon, lat] = [p[0], p[1]];
  return typeof lon === 'number' && typeof lat === 'number' && Math.abs(lon) <= 180 && Math.abs(lat) <= 90 && Number.isFinite(lon + lat) ? [lon, lat] : null;
};

function cleanGeometry(g: unknown, budget: { left: number }): LineOrPolygon | null {
  if (!isObj(g) || !Array.isArray(g.coordinates)) return null;
  const line = (c: unknown): number[][] | null => {
    if (!Array.isArray(c) || c.length < 2) return null;
    const out: number[][] = [];
    for (const p of c) { const q = pos(p); if (!q) return null; out.push(q); }
    budget.left -= out.length;
    return budget.left >= 0 ? out : null;
  };
  const ring = (c: unknown): number[][] | null => { const l = line(c); return l && l.length >= 4 ? l : null; };
  const many = <T>(c: unknown, f: (x: unknown) => T | null): T[] | null => {
    if (!Array.isArray(c) || !c.length) return null;
    const out: T[] = []; for (const x of c) { const y = f(x); if (!y) return null; out.push(y); } return out;
  };
  switch (g.type) {
    case 'LineString': { const c = line(g.coordinates); return c ? { type: 'LineString', coordinates: c } : null; }
    case 'MultiLineString': { const c = many(g.coordinates, line); return c ? { type: 'MultiLineString', coordinates: c } : null; }
    case 'Polygon': { const c = many(g.coordinates, ring); return c ? { type: 'Polygon', coordinates: c } : null; }
    case 'MultiPolygon': { const c = many(g.coordinates, (p) => many(p, ring)); return c ? { type: 'MultiPolygon', coordinates: c } : null; }
    default: return null;
  }
}

function sanitizeSource(v: unknown): FeatureSource {
  if (isObj(v) && v.kind === 'track') {
    return { kind: 'track', startedAt: iso(v.startedAt), ...(typeof v.endedAt === 'string' ? { endedAt: iso(v.endedAt) } : {}),
      distanceM: num(v.distanceM, 0, 1e8) ?? 0, durationS: num(v.durationS, 0, 1e8) ?? 0 };
  }
  return { kind: 'import', fileName: 'Shared file', importedAt: new Date().toISOString(), datumShiftApplied: false };
}

/** Validates and cleans a share file's text. Anything invalid is dropped (counted in `dropped`), never trusted. */
export function parseShare(raw: string): ShareFile & { dropped: number } {
  if (raw.length > MAX_SHARE_BYTES) throw new ShareError('This file is too large to be a shared pin or layer.');
  let j: unknown;
  try { j = JSON.parse(raw); } catch { throw new ShareError('This file is not a Farm Mapper share file.'); }
  if (!isObj(j) || j.format !== SHARE_FORMAT) throw new ShareError('This file is not a Farm Mapper share file.');
  if (typeof j.version === 'number' && j.version > SHARE_VERSION) throw new ShareError('This file was made by a newer version of the app. Update the app first.');

  let dropped = 0;
  const layers: SharedLayer[] = [];
  for (const l of Array.isArray(j.layers) ? j.layers.slice(0, 500) : []) {
    if (!isObj(l) || typeof l.key !== 'string') { dropped++; continue; }
    const name = text(l.name, 100).trim();
    if (!name) { dropped++; continue; }
    layers.push({ key: text(l.key, 64), name, style: sanitizeStyle(l.style) });
  }
  const keys = new Set(layers.map((l) => l.key));

  const pois: SharedPoi[] = [];
  for (const p of (Array.isArray(j.pois) ? j.pois : []).slice(0, MAX_ITEMS)) {
    const lon = isObj(p) ? inRange(p.lon, -180, 180) : null, lat = isObj(p) ? inRange(p.lat, -90, 90) : null;
    if (!isObj(p) || lon === null || lat === null || typeof p.layer !== 'string' || !keys.has(p.layer)) { dropped++; continue; }
    pois.push({
      id: idOf(p.id), layer: p.layer, name: text(p.name, 200) || 'Pin', notes: text(p.notes, 5000), lon, lat,
      origin: ORIGINS.includes(p.origin as PoiOrigin) ? (p.origin as PoiOrigin) : 'import',
      gps: sanitizeGps(p.gps), style: sanitizeStyle(p.style), extra: sanitizeExtra(p.extra), createdAt: iso(p.createdAt),
    });
  }

  const budget = { left: MAX_VERTICES };
  const features: SharedFeature[] = [];
  for (const f of (Array.isArray(j.features) ? j.features : []).slice(0, MAX_ITEMS)) {
    const geometry = isObj(f) ? cleanGeometry(f.geometry, budget) : null;
    if (!isObj(f) || !geometry || typeof f.layer !== 'string' || !keys.has(f.layer)) { dropped++; continue; }
    features.push({
      id: idOf(f.id), layer: f.layer, name: text(f.name, 200) || 'Feature', notes: text(f.notes, 5000), geometry, style: sanitizeStyle(f.style),
      source: sanitizeSource(f.source), extra: sanitizeExtra(f.extra), createdAt: iso(f.createdAt),
    });
  }
  return { format: SHARE_FORMAT, version: SHARE_VERSION, createdAt: iso(j.createdAt), layers, pois, features, dropped };
}

import { kmlWithFolders } from '@tmcw/togeojson';
import type { LineOrPolygon, StyleOverride } from '../types';
import type { NewFeature } from '../db/featuresRepo';
import type { NewPoi } from '../db/poisRepo';
import { shiftGeometry } from './datumShift';
import { normalizeHex } from './kmlColor';
import { KmlError } from './kmzUnpack';

export type ParsedPoi = Omit<NewPoi, 'layerId'>;
export interface ParsedGroup { name: string; pois: ParsedPoi[]; features: NewFeature[] }
export interface ParseResult {
  docName: string;
  groups: ParsedGroup[];
  /** counts of things that were skipped, keyed by a plain-English reason */
  skipped: Record<string, number>;
}
export interface ParseOptions { fileName: string; splitFolders: boolean; applyShift: boolean }

const UNSUPPORTED_TAGS: Record<string, string> = {
  NetworkLink: 'NetworkLink (needs internet)', GroundOverlay: 'GroundOverlay (image overlay)',
  ScreenOverlay: 'ScreenOverlay', PhotoOverlay: 'PhotoOverlay', Model: '3D Model',
};

const KNOWN_PROPS = new Set(['name', 'description', 'styleUrl', 'visibility', 'timestamp', 'begin', 'end', 'altitudeMode',
  'tessellate', 'extrude', 'icon', 'icon-color', 'icon-opacity', 'marker-color', 'stroke', 'stroke-opacity', 'stroke-width',
  'fill', 'fill-opacity', '@geometry-type', 'drawOrder', 'open', 'snippet', 'phoneNumber', 'address']);

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function htmlToText(html: string): string {
  const withBreaks = html.replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr)>/gi, '\n');
  const text = new DOMParser().parseFromString(withBreaks, 'text/html').body.textContent ?? '';
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

function descriptionOf(p: Record<string, unknown>): string {
  const d = p.description;
  if (typeof d === 'string') return htmlToText(d);
  if (d && typeof d === 'object' && typeof (d as { value?: unknown }).value === 'string') return htmlToText((d as { value: string }).value);
  return '';
}

function extraOf(p: Record<string, unknown>): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(p)) {
    if (KNOWN_PROPS.has(k) || v === null || v === undefined || typeof v === 'object') continue;
    out[k] = String(v);
  }
  return Object.keys(out).length ? out : undefined;
}

function lineStyle(p: Record<string, unknown>): StyleOverride {
  const s: StyleOverride = {};
  const stroke = normalizeHex(p.stroke); if (stroke) s.strokeColor = stroke;
  const sw = num(p['stroke-width']); if (sw !== null) s.strokeWidth = clamp(sw, 0.5, 12);
  const so = num(p['stroke-opacity']); if (so !== null) s.strokeOpacity = clamp(so, 0, 1);
  const fill = normalizeHex(p.fill); if (fill) s.fillColor = fill;
  const fo = num(p['fill-opacity']); if (fo !== null) s.fillOpacity = clamp(fo, 0, 1);
  return s;
}

function pointStyle(p: Record<string, unknown>): StyleOverride {
  const c = normalizeHex(p['icon-color']) ?? normalizeHex(p['marker-color']);
  return c ? { symbolColor: c } : {};
}

const validPos = (c: number[]) => c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]) && Math.abs(c[1]) <= 90 && Math.abs(c[0]) <= 180;
const strip = (c: number[]) => [c[0], c[1]];

function cleanLine(c: number[][]): number[][] | null {
  return c.length >= 2 && c.every(validPos) ? c.map(strip) : null;
}
function cleanRing(c: number[][]): number[][] | null {
  if (c.length < 4 || !c.every(validPos)) return null;
  const r = c.map(strip);
  const [a, b] = [r[0], r[r.length - 1]];
  if (a[0] !== b[0] || a[1] !== b[1]) r.push([...a]);
  return r;
}

type Flat = { kind: 'poi'; lon: number; lat: number } | { kind: 'feature'; geometry: LineOrPolygon } | { kind: 'invalid' };

/** Splits any geometry into importable parts (points, lines, polygons). */
function flatten(g: GeoJSON.Geometry): Flat[] {
  switch (g.type) {
    case 'Point': return validPos(g.coordinates) ? [{ kind: 'poi', lon: g.coordinates[0], lat: g.coordinates[1] }] : [{ kind: 'invalid' }];
    case 'MultiPoint': return g.coordinates.flatMap((c) => flatten({ type: 'Point', coordinates: c }));
    case 'LineString': { const l = cleanLine(g.coordinates); return l ? [{ kind: 'feature', geometry: { type: 'LineString', coordinates: l } }] : [{ kind: 'invalid' }]; }
    case 'MultiLineString': {
      const ls = g.coordinates.map(cleanLine).filter((x): x is number[][] => !!x);
      return ls.length ? [{ kind: 'feature', geometry: { type: 'MultiLineString', coordinates: ls } }] : [{ kind: 'invalid' }];
    }
    case 'Polygon': {
      const rings = g.coordinates.map(cleanRing);
      return rings[0] ? [{ kind: 'feature', geometry: { type: 'Polygon', coordinates: rings.filter((r): r is number[][] => !!r) } }] : [{ kind: 'invalid' }];
    }
    case 'MultiPolygon': return g.coordinates.flatMap((p) => flatten({ type: 'Polygon', coordinates: p }));
    case 'GeometryCollection': return g.geometries.flatMap(flatten);
  }
}

type TreeNode = { type: 'root' | 'folder'; meta?: { name?: unknown }; children: TreeNode[] } | GeoJSON.Feature;
const isContainer = (n: TreeNode): n is Extract<TreeNode, { children: TreeNode[] }> => 'children' in n;

function collectFeatures(n: TreeNode, out: GeoJSON.Feature[]) {
  if (isContainer(n)) n.children.forEach((c) => collectFeatures(c, out)); else out.push(n);
}

export function parseKml(text: string, opts: ParseOptions): ParseResult {
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length || !doc.documentElement || !/kml$/i.test(doc.documentElement.localName)) {
    throw new KmlError('This file is not valid KML.');
  }

  const skipped: Record<string, number> = {};
  const skip = (why: string, n = 1) => { skipped[why] = (skipped[why] ?? 0) + n; };
  for (const [tag, why] of Object.entries(UNSUPPORTED_TAGS)) {
    const n = doc.getElementsByTagName(tag).length;
    if (n) skip(why, n);
  }

  const stem = opts.fileName.replace(/\.(kml|kmz)$/i, '');
  const docName = (doc.querySelector('Document > name, kml > Folder > name')?.textContent ?? '').trim() || stem;
  const tree = kmlWithFolders(doc) as unknown as TreeNode;

  // top-level containers become groups when splitting; everything else goes in one root group
  const groups: { name: string; feats: GeoJSON.Feature[] }[] = [];
  if (opts.splitFolders && isContainer(tree)) {
    const loose: GeoJSON.Feature[] = [];
    for (const c of tree.children) {
      if (isContainer(c)) {
        const feats: GeoJSON.Feature[] = []; collectFeatures(c, feats);
        groups.push({ name: String(c.meta?.name ?? '').trim() || 'Folder', feats });
      } else loose.push(c);
    }
    if (loose.length) groups.unshift({ name: docName, feats: loose });
  } else {
    const feats: GeoJSON.Feature[] = []; collectFeatures(tree, feats);
    groups.push({ name: docName, feats });
  }

  const source = { kind: 'import' as const, fileName: opts.fileName, importedAt: new Date().toISOString(), datumShiftApplied: opts.applyShift };
  const out: ParsedGroup[] = [];

  for (const g of groups) {
    const pg: ParsedGroup = { name: g.name, pois: [], features: [] };
    for (const f of g.feats) {
      const p = (f.properties ?? {}) as Record<string, unknown>;
      if (p['@geometry-type']) continue; // NetworkLink / GroundOverlay: already counted from the DOM
      if (!f.geometry) { skip('placemark without a location'); continue; }
      const geom = opts.applyShift ? shiftGeometry(f.geometry) : f.geometry;
      const parts = flatten(geom);
      const name = (typeof p.name === 'string' && p.name.trim()) || 'Unnamed';
      const notes = descriptionOf(p), extra = extraOf(p);
      parts.forEach((part, i) => {
        const label = parts.length > 1 ? `${name} (${i + 1})` : name;
        if (part.kind === 'invalid') skip('invalid coordinates');
        else if (part.kind === 'poi') pg.pois.push({ name: label, notes, lon: part.lon, lat: part.lat, origin: 'import', style: pointStyle(p), extra });
        else pg.features.push({ name: label, notes, geometry: part.geometry, style: lineStyle(p), source, extra });
      });
    }
    if (pg.pois.length || pg.features.length) out.push(pg);
  }
  return { docName, groups: out, skipped };
}

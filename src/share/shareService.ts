import { APP_DEFAULT_STYLE } from '../config';
import { db } from '../db/db';
import { makeLayer } from '../db/layersRepo';
import { bumpChangeCounter } from '../db/settingsRepo';
import type { Layer, Poi, VectorFeature } from '../types';
import { emit } from '../util/events';
import { geometryBounds, metersBetween, unionBounds, type Bounds } from '../util/geo';
import { newId, nowIso } from '../util/ids';
import { buildShare, parseShare, type ShareFile } from './shareFormat';

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d = new Date()) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'item';

const toFile = (share: ShareFile, label: string) =>
  new File([JSON.stringify(share)], `farm-mapper-share-${slug(label)}-${stamp()}.json`, { type: 'application/json' });

/** One pin (with its layer's name and style, so it lands in the right layer on the other phone). */
export async function exportPoi(poiId: string): Promise<File> {
  const poi = await db.pois.get(poiId);
  if (!poi) throw new Error('That pin no longer exists.');
  const layer = await db.layers.get(poi.layerId);
  if (!layer) throw new Error('That pin has no layer.');
  return toFile(buildShare([{ layer, pois: [poi], features: [] }]), poi.name);
}

/** A whole vector layer: every pin, line and area in it. Works even if the layer is frozen or locked. */
export async function exportLayer(layerId: string): Promise<File> {
  const layer = await db.layers.get(layerId);
  if (!layer || layer.kind !== 'vector') throw new Error('Only pin and line layers can be shared.');
  const [pois, features] = await Promise.all([db.pois.where('layerId').equals(layerId).toArray(), db.features.where('layerId').equals(layerId).toArray()]);
  if (!pois.length && !features.length) throw new Error('This layer is empty, so there is nothing to share.');
  return toFile(buildShare([{ layer, pois, features }]), layer.name);
}

export interface ShareResult {
  addedPois: number; skippedPois: number; addedFeatures: number; skippedFeatures: number; dropped: number;
  layersCreated: string[]; layersMerged: string[]; lockedSkipped: string[];
  bounds: Bounds | null; onlyPoiId: string | null;
}

const NEAR_M = 2;                       // same name within 2 m (~6 ft) counts as the same pin even if its id differs
const geomKey = (g: GeoJSON.Geometry) => JSON.stringify(g, (_k, v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v));

/**
 * Adds what is new and skips everything already here. A pin is "already here" if its id matches, or if a pin with the same
 * name is within about 6 ft. A line or area is "already here" if its id matches or the same name has the same shape.
 * Items go into your layer of the same name (created if you have none); a locked or frozen layer is left alone.
 */
export async function importShareText(raw: string): Promise<ShareResult> {
  const share = parseShare(raw);
  const res: ShareResult = { addedPois: 0, skippedPois: 0, addedFeatures: 0, skippedFeatures: 0, dropped: share.dropped,
    layersCreated: [], layersMerged: [], lockedSkipped: [], bounds: null, onlyPoiId: null };
  const boxes: Bounds[] = [];
  const t = nowIso();

  await db.transaction('rw', [db.layers, db.pois, db.features, db.settings], async () => {
    const [layers, pois, feats] = await Promise.all([db.layers.toArray(), db.pois.toArray(), db.features.toArray()]);
    const havePoiIds = new Set(pois.map((p) => p.id)), haveFeatIds = new Set(feats.map((f) => f.id));
    const poiByName = new Map<string, [number, number][]>();
    for (const p of pois) { const k = p.name.toLowerCase(); (poiByName.get(k) ?? poiByName.set(k, []).get(k)!).push([p.lon, p.lat]); }
    const featKeys = new Set(feats.map((f) => `${f.name.toLowerCase()}|${geomKey(f.geometry)}`));

    const target = new Map<string, string | null>(); // shared layer key -> local layer id (null = skip)
    for (const sl of share.layers) {
      const same = layers.filter((l) => l.kind === 'vector' && l.name.toLowerCase() === sl.name.toLowerCase());
      const editable = same.find((l) => !l.locked && !l.frozen);
      if (editable) { target.set(sl.key, editable.id); res.layersMerged.push(sl.name); continue; }
      if (same.length) { target.set(sl.key, null); res.lockedSkipped.push(sl.name); continue; } // exists but locked/frozen
      const layer: Layer = await makeLayer('vector', sl.name, { defaultStyle: { ...APP_DEFAULT_STYLE, ...sl.style } });
      await db.layers.add(layer); layers.push(layer);
      target.set(sl.key, layer.id); res.layersCreated.push(sl.name);
    }

    const newPois: Poi[] = [];
    for (const p of share.pois) {
      const layerId = target.get(p.layer);
      if (!layerId) { res.skippedPois++; continue; }
      const nearSame = (poiByName.get(p.name.toLowerCase()) ?? []).some((c) => metersBetween(c, [p.lon, p.lat]) <= NEAR_M);
      if ((p.id && havePoiIds.has(p.id)) || nearSame) { res.skippedPois++; continue; }
      const id = p.id ?? newId();
      havePoiIds.add(id); (poiByName.get(p.name.toLowerCase()) ?? poiByName.set(p.name.toLowerCase(), []).get(p.name.toLowerCase())!).push([p.lon, p.lat]);
      newPois.push({ id, layerId, name: p.name, notes: p.notes, lon: p.lon, lat: p.lat, origin: p.origin, gps: p.gps, style: p.style, extra: p.extra, createdAt: p.createdAt, updatedAt: t });
      boxes.push([p.lon, p.lat, p.lon, p.lat]);
    }
    const newFeats: VectorFeature[] = [];
    for (const f of share.features) {
      const layerId = target.get(f.layer);
      const key = `${f.name.toLowerCase()}|${geomKey(f.geometry)}`;
      if (!layerId || (f.id && haveFeatIds.has(f.id)) || featKeys.has(key)) { res.skippedFeatures++; continue; }
      const id = f.id ?? newId();
      haveFeatIds.add(id); featKeys.add(key);
      newFeats.push({ id, layerId, name: f.name, notes: f.notes, geometry: f.geometry, style: f.style, source: f.source, extra: f.extra, createdAt: f.createdAt, updatedAt: t });
      const b = geometryBounds(f.geometry); if (b) boxes.push(b);
    }
    if (newPois.length) await db.pois.bulkAdd(newPois);
    if (newFeats.length) await db.features.bulkAdd(newFeats);
    res.addedPois = newPois.length; res.addedFeatures = newFeats.length;
    if (newPois.length === 1 && !newFeats.length) res.onlyPoiId = newPois[0].id;
    // a merged layer that received nothing was not really "merged"
    if (!res.addedPois && !res.addedFeatures) res.layersMerged = [];
  });

  if (res.addedPois || res.addedFeatures || res.layersCreated.length) { await bumpChangeCounter(); emit('layers', 'pois', 'features'); }
  res.bounds = unionBounds(boxes);
  return res;
}

export function summarizeShare(r: ShareResult): string {
  const added = [r.addedPois && `${r.addedPois} pin${r.addedPois === 1 ? '' : 's'}`, r.addedFeatures && `${r.addedFeatures} line/area${r.addedFeatures === 1 ? '' : 's'}`].filter(Boolean).join(' and ');
  const skipped = r.skippedPois + r.skippedFeatures;
  const parts: string[] = [];
  if (added) parts.push(`Added ${added}${r.layersCreated.length ? ` (new layer: ${r.layersCreated.join(', ')})` : ''}.`);
  if (skipped) parts.push(added ? `${skipped} already in your app, skipped.` : `Nothing new: all ${skipped} item${skipped === 1 ? ' is' : 's are'} already in your app.`);
  if (r.lockedSkipped.length) parts.push(`Layer ${r.lockedSkipped.map((n) => `"${n}"`).join(', ')} is locked or frozen here, so its items were skipped.`);
  if (r.dropped) parts.push(`${r.dropped} invalid item${r.dropped === 1 ? '' : 's'} ignored.`);
  return parts.join(' ') || 'The file had nothing to import.';
}

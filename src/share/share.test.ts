import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { createVectorLayer, setFrozen, setLocked } from '../db/layersRepo';
import { addPoi } from '../db/poisRepo';
import { addFeatures } from '../db/featuresRepo';
import { ensureSeed } from '../db/seed';
import { seedBundledVectors } from '../data/seedBundledVectors';
import { ShareError, SHARE_FORMAT, parseShare, sanitizeStyle } from './shareFormat';
import { exportLayer, exportPoi, importShareText, summarizeShare } from './shareService';

const reset = async () => { await Promise.all(db.tables.map((t) => t.clear())); await ensureSeed(); };
const src = { kind: 'import' as const, fileName: 'a.kml', importedAt: '', datumShiftApplied: false };
const line = { type: 'LineString' as const, coordinates: [[-77.48, 42.4], [-77.479, 42.401]] };

/** Runs `fn` as "the other phone": a clean database. Returns the file text made on this phone first. */
async function viaOtherPhone(file: File, fn: () => Promise<void>) {
  const text = await file.text();
  await reset();
  await fn();
  return text;
}

beforeEach(reset);

describe('sharing a pin', () => {
  it('a pin lands on the other phone in a layer of the same name and style, with notes and symbol', async () => {
    const stands = await createVectorLayer('Tree Stands', { symbol: 'treestand', symbolColor: '#f08c00' });
    const p = await addPoi({ layerId: stands.id, lon: -77.4801, lat: 42.4012, origin: 'gps', name: 'North stand', notes: 'Oak ridge, west wind',
      style: { symbolColor: '#e03131' }, gps: { accuracyM: 4.5, fixTime: '2026-11-20T10:00:00.000Z' } });
    const file = await exportPoi(p.id);
    expect(file.name).toMatch(/^farm-mapper-share-north-stand-\d{8}-\d{4}\.json$/);
    const text = await viaOtherPhone(file, async () => {});
    const r = await importShareText(text);
    expect(r).toMatchObject({ addedPois: 1, skippedPois: 0, layersCreated: ['Tree Stands'], onlyPoiId: p.id });
    const layer = (await db.layers.toArray()).find((l) => l.name === 'Tree Stands')!;
    expect(layer.defaultStyle.symbol).toBe('treestand');
    const got = (await db.pois.toArray())[0];
    expect(got).toMatchObject({ id: p.id, name: 'North stand', notes: 'Oak ridge, west wind', lon: -77.4801, lat: 42.4012, layerId: layer.id });
    expect(got.style.symbolColor).toBe('#e03131'); expect(got.gps!.accuracyM).toBe(4.5);
  });

  it('opening the same file again does nothing: no duplicates', async () => {
    const l = await createVectorLayer('Stands');
    const p = await addPoi({ layerId: l.id, lon: -77.48, lat: 42.4, origin: 'map-tap', name: 'A' });
    const text = await (await exportPoi(p.id)).text();
    await reset();
    await importShareText(text);
    const before = await db.pois.count();
    const again = await importShareText(text);
    expect(again).toMatchObject({ addedPois: 0, skippedPois: 1, layersCreated: [] });
    expect(await db.pois.count()).toBe(before);
    expect((await db.layers.toArray()).filter((l) => l.name === 'Stands')).toHaveLength(1);
    expect(summarizeShare(again)).toBe('Nothing new: all 1 item is already in your app.');
  });

  it('a pin you already have under a different id (same name, same spot) is skipped, e.g. a bundled tree stand', async () => {
    await seedBundledVectors();
    const stands = (await db.layers.toArray()).find((l) => l.name === 'Tree Stands')!;
    const mine = (await db.pois.where('layerId').equals(stands.id).toArray())[0];
    const file = await exportPoi(mine.id);
    // the other phone has its own copy of the same stand with a different random id
    const text = await file.text();
    await db.pois.update(mine.id, { id: undefined } as never).catch(() => undefined);
    await db.pois.delete(mine.id); await db.pois.add({ ...mine, id: 'other-phones-own-id' });
    const r = await importShareText(text);
    expect(r.addedPois).toBe(0); expect(r.skippedPois).toBe(1);
    expect(await db.pois.where('layerId').equals(stands.id).count()).toBe(18);
  });

  it('a different pin with the same name at a different spot is added', async () => {
    const l = await createVectorLayer('Stands');
    const p = await addPoi({ layerId: l.id, lon: -77.48, lat: 42.4, origin: 'map-tap', name: 'Stand' });
    const text = await (await exportPoi(p.id)).text();
    await db.pois.delete(p.id); await db.pois.add({ ...p, id: 'another-id', lon: -77.47, lat: 42.41 }); // my own "Stand", somewhere else
    const r = await importShareText(text);
    expect(r.addedPois).toBe(1); expect(await db.pois.count()).toBe(2);
  });

  it('merges into your existing editable layer of the same name instead of making another', async () => {
    const theirs = await createVectorLayer('Tree Stands');
    const text = JSON.stringify({ format: SHARE_FORMAT, version: 1, layers: [{ key: 'k', name: 'tree stands', style: {} }],
      pois: [{ id: 'x1', layer: 'k', name: 'New', lon: -77.48, lat: 42.4 }] });
    const r = await importShareText(text);
    expect(r).toMatchObject({ addedPois: 1, layersMerged: ['tree stands'], layersCreated: [] });
    expect((await db.pois.get('x1'))!.layerId).toBe(theirs.id);
    expect(await db.layers.where('kind').equals('vector').count()).toBe(2); // My POIs + Tree Stands
  });

  it('a locked or frozen layer of that name is left alone and reported', async () => {
    const l = await createVectorLayer('Tree Stands'); await setLocked(l.id, true);
    const text = JSON.stringify({ format: SHARE_FORMAT, version: 1, layers: [{ key: 'k', name: 'Tree Stands', style: {} }], pois: [{ id: 'x1', layer: 'k', name: 'N', lon: -77.48, lat: 42.4 }] });
    const r = await importShareText(text);
    expect(r.addedPois).toBe(0); expect(r.lockedSkipped).toEqual(['Tree Stands']);
    expect(await db.pois.count()).toBe(0);
    expect(summarizeShare(r)).toMatch(/locked or frozen/);
    await setLocked(l.id, false); await setFrozen(l.id, true);
    expect((await importShareText(text)).lockedSkipped).toEqual(['Tree Stands']);
  });
});

describe('sharing a layer', () => {
  it('sends every pin and line, sorts out what is new, and skips what is already there', async () => {
    const l = await createVectorLayer('Hunt area', { strokeColor: '#00ff00', strokeDash: 'dashed' });
    for (const [i, n] of ['One', 'Two', 'Three'].entries()) await addPoi({ layerId: l.id, lon: -77.48 + i * 0.001, lat: 42.4, origin: 'map-tap', name: n });
    await addFeatures(l.id, [{ name: 'Trail', geometry: line, source: src }]);
    await setLocked(l.id, true); // a locked layer can still be shared
    const text = await (await exportLayer(l.id)).text();

    await reset();
    const first = await importShareText(text);
    expect(first).toMatchObject({ addedPois: 3, addedFeatures: 1, skippedPois: 0 });
    const layer = (await db.layers.toArray()).find((x) => x.name === 'Hunt area')!;
    expect(layer.defaultStyle).toMatchObject({ strokeColor: '#00ff00', strokeDash: 'dashed' });
    expect(layer.locked).toBe(false); // you receive it unlocked

    // they delete one pin and add their own, then receive the layer again: only the missing one returns
    const two = (await db.pois.toArray()).find((p) => p.name === 'Two')!;
    await db.pois.delete(two.id);
    await addPoi({ layerId: layer.id, lon: -77.4, lat: 42.4, origin: 'map-tap', name: 'Mine' });
    const second = await importShareText(text);
    expect(second).toMatchObject({ addedPois: 1, skippedPois: 2, addedFeatures: 0, skippedFeatures: 1 });
    expect((await db.pois.toArray()).map((p) => p.name).sort()).toEqual(['Mine', 'One', 'Three', 'Two']);
    expect(await db.features.count()).toBe(1);
  });

  it('a line already there under another id is recognised by name + shape', async () => {
    const l = await createVectorLayer('Trails');
    await addFeatures(l.id, [{ name: 'Trail 1', geometry: line, source: src }]);
    const text = await (await exportLayer(l.id)).text();
    const f = (await db.features.toArray())[0];
    await db.features.delete(f.id); await db.features.add({ ...f, id: 'their-id' });
    const r = await importShareText(text);
    expect(r.addedFeatures).toBe(0); expect(r.skippedFeatures).toBe(1);
  });

  it('refuses empty and raster layers', async () => {
    const l = await createVectorLayer('Empty');
    await expect(exportLayer(l.id)).rejects.toThrow(/empty/);
  });
});

describe('untrusted files', () => {
  const wrap = (o: object) => JSON.stringify({ format: SHARE_FORMAT, version: 1, layers: [{ key: 'k', name: 'L', style: {} }], ...o });
  it('rejects things that are not share files', () => {
    expect(() => parseShare('nonsense')).toThrow(ShareError);
    expect(() => parseShare('{"format":"other"}')).toThrow(ShareError);
    expect(() => parseShare(JSON.stringify({ format: SHARE_FORMAT, version: 99 }))).toThrow(/newer version/);
    expect(() => parseShare('x'.repeat(9 * 1024 * 1024))).toThrow(/too large/);
  });
  it('drops invalid items instead of importing them, and clamps/cleans the rest', () => {
    const r = parseShare(wrap({
      pois: [
        { id: 'a', layer: 'k', name: 'ok', lon: -77.4, lat: 42.4 },
        { id: 'b', layer: 'k', name: 'bad lat', lon: -77.4, lat: 999 },
        { id: 'c', layer: 'nope', name: 'unknown layer', lon: -77.4, lat: 42.4 },
        { id: 'd<script>', layer: 'k', name: '<b>x</b>\u0001y', notes: 'n'.repeat(9000), lon: -77.4, lat: 42.4, style: { symbolColor: 'red', strokeWidth: 500, symbol: 'evil', symbolSize: 9 } },
      ],
      features: [{ layer: 'k', name: 'f', geometry: { type: 'Point', coordinates: [0, 0] } }, { layer: 'k', name: 'g', geometry: { type: 'LineString', coordinates: [[1, 1]] } }],
    }));
    expect(r.pois.map((p) => p.name)).toEqual(['ok', '<b>xy</b>'.replace('<b>xy</b>', '<b>x</b>y')]);
    expect(r.dropped).toBe(2 + 2);
    const d = r.pois[1];
    expect(d.id).toBeNull(); expect(d.notes.length).toBe(5000);
    expect(d.style).toEqual({ strokeWidth: 12, symbolSize: 2.5 }); // bad colour and unknown symbol removed
    expect(r.features).toHaveLength(0);
  });
  it('sanitizeStyle keeps only valid values', () => {
    expect(sanitizeStyle({ strokeColor: '#ABC', fillOpacity: 3, strokeDash: 'dashed', showLabels: 'yes', symbol: 'treestand' })).toEqual({ strokeColor: '#aabbcc', fillOpacity: 1, strokeDash: 'dashed', symbol: 'treestand' });
    expect(sanitizeStyle(null)).toEqual({});
  });
  it('import never throws on a hostile body and adds nothing from invalid items', async () => {
    const r = await importShareText(wrap({ pois: [{ layer: 'k', lon: 'x', lat: 1 }, null, 5, { layer: 'k', name: 'p', lon: 500, lat: 0 }] }));
    expect(r.addedPois).toBe(0); expect(r.dropped).toBe(4);
  });
});

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { createVectorLayer, setLocked } from '../db/layersRepo';
import { stripNumbering } from './bundledVectors';
import { ensureSeed } from '../db/seed';
import { getSettings, patchSettings } from '../db/settingsRepo';
import { geometryBounds, metersBetween } from '../util/geo';
import { BUNDLED_VECTORS } from './bundledVectors';
import { seedBundledVectors } from './seedBundledVectors';

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())); await ensureSeed(); });

const byName = async (n: string) => (await db.layers.toArray()).find((l) => l.name === n)!;

describe('bundled data', () => {
  it('has the expected counts and everything is on the farm (WGS84)', () => {
    const [boundary, trails] = BUNDLED_VECTORS;
    const stands = BUNDLED_VECTORS.find((d) => d.key === 'tree-stands')!;
    expect(boundary.features).toHaveLength(1);
    expect(trails.features.length).toBeGreaterThan(20);
    expect(trails.style.strokeDash).toBe('dashed');
    expect(stands.stands).toHaveLength(18);
    for (const f of [...boundary.features, ...trails.features]) {
      const b = geometryBounds(f.geometry)!;
      expect(b[0]).toBeGreaterThan(-77.49); expect(b[2]).toBeLessThan(-77.47); expect(b[1]).toBeGreaterThan(42.39); expect(b[3]).toBeLessThan(42.41);
    }
  });
  it('the boundary is a closed outline about 4.6 km around', () => {
    const g = BUNDLED_VECTORS[0].features[0].geometry as GeoJSON.LineString;
    expect(g.coordinates[0]).toEqual(g.coordinates[g.coordinates.length - 1]);
    let len = 0; for (let i = 1; i < g.coordinates.length; i++) len += metersBetween(g.coordinates[i - 1] as [number, number], g.coordinates[i] as [number, number]);
    expect(len).toBeGreaterThan(4400); expect(len).toBeLessThan(4800);
  });
});

describe('seedBundledVectors', () => {
  it('creates Boundary, Trails and Tree Stands layers with their data and default styles', async () => {
    expect(await seedBundledVectors()).toEqual(['Boundary', 'Trails', 'Tracking', 'Tree Stands']);
    const [b, t, s] = [await byName('Boundary'), await byName('Trails'), await byName('Tree Stands')];
    expect((await byName('Tracking')).defaultStyle.strokeColor).toBe('#00b4d8');
    expect((await byName('Tracking')).defaultStyle.searchBandFt).toBe(60);
    expect(await db.features.where('layerId').equals((await byName('Tracking')).id).count()).toBe(0);
    expect(await db.features.where('layerId').equals(b.id).count()).toBe(1);
    expect(await db.features.where('layerId').equals(t.id).count()).toBe(BUNDLED_VECTORS[1].features.length);
    expect(await db.pois.where('layerId').equals(s.id).count()).toBe(18);
    expect(s.defaultStyle.symbol).toBe('treestand');
    expect(b.defaultStyle.strokeColor).toBe('#fe00fe');
    expect(b.order).toBeLessThan(t.order); expect(t.order).toBeLessThan(s.order); // stands drawn on top
    expect((await db.pois.where('layerId').equals(s.id).toArray()).every((p) => Object.keys(p.style).length === 0)).toBe(true);
    expect((await getSettings()).activeLayerId).not.toBe(s.id);
  });
  it('runs once per layer: deleted or edited items are not restored', async () => {
    await seedBundledVectors();
    await db.pois.delete((await db.pois.toArray())[0].id);
    await db.features.delete((await db.features.toArray())[0].id);
    expect(await seedBundledVectors()).toEqual([]);
    expect(await db.pois.count()).toBe(17);
  });
  it('adds only layers not yet seeded (e.g. a device that already has the boundary)', async () => {
    await patchSettings({ seededVectors: ['boundary'] });
    expect(await seedBundledVectors()).toEqual(['Trails', 'Tracking', 'Tree Stands']);
    expect((await db.layers.toArray()).some((l) => l.name === 'Boundary')).toBe(false);
  });
  it('uses your own editable layer of the same name, but never a locked one', async () => {
    const mine = await createVectorLayer('Trails');
    await seedBundledVectors();
    expect((await db.layers.toArray()).filter((l) => l.name === 'Trails')).toHaveLength(1);
    expect(await db.features.where('layerId').equals(mine.id).count()).toBeGreaterThan(20);
    await Promise.all(db.tables.map((t) => t.clear())); await ensureSeed();
    const locked = await createVectorLayer('Boundary'); await setLocked(locked.id, true);
    await seedBundledVectors();
    expect(await db.features.where('layerId').equals(locked.id).count()).toBe(0);
    expect((await db.layers.toArray()).filter((l) => l.name === 'Boundary')).toHaveLength(2);
  });
});

describe('stripNumbering and stand names', () => {
  it('drops trailing numbers only', () => {
    expect(stripNumbering('Single stand 3')).toBe('Single stand');
    expect(stripNumbering('single stand (2)')).toBe('single stand');
    expect(stripNumbering('Tree Stand 1')).toBe('Tree Stand');
    expect(stripNumbering('stand?')).toBe('stand?');
    expect(stripNumbering('North East facing')).toBe('North East facing');
  });
  it('no bundled stand name ends in a number', () => {
    for (const s of BUNDLED_VECTORS.find((d) => d.key === 'tree-stands')!.stands) expect(s.name).not.toMatch(/\d\s*\)?\s*$/);
  });
});

describe('migration of devices seeded by the earlier version', () => {
  async function oldInstall() {
    await patchSettings({ seededVectors: ['boundary', 'trails', 'tree-stands'] });
    const made = await createVectorLayer('Trails', { strokeColor: '#fcc419' });
    const { strokeDash: _omit, ...oldStyle } = made.defaultStyle; // layers saved before dashes existed have no such field
    void _omit;
    const trails = { ...made, defaultStyle: oldStyle as typeof made.defaultStyle };
    await db.layers.put(trails);
    await db.features.bulkAdd([1, 2, 3].map((i) => ({ id: `old${i}`, layerId: trails.id, name: `Trail ${i}`, notes: '', style: {},
      geometry: { type: 'LineString' as const, coordinates: [[-77.48, 42.4], [-77.479, 42.4]] }, extra: { cad_id: `ABC${i}` },
      source: { kind: 'import' as const, fileName: 'Farm Trails.kmz', importedAt: '', datumShiftApplied: false }, createdAt: '', updatedAt: '' })));
    const stands = await createVectorLayer('Tree Stands');
    const [a, b] = BUNDLED_VECTORS.find((d) => d.key === 'tree-stands')!.stands;
    await db.pois.bulkAdd([
      { id: 'p1', layerId: stands.id, name: `${a.name} 1`, notes: a.notes, lon: a.lon, lat: a.lat, origin: 'import', style: {}, createdAt: '', updatedAt: '' },
      { id: 'p2', layerId: stands.id, name: 'My renamed stand 2', notes: b.notes, lon: b.lon, lat: b.lat, origin: 'import', style: {}, createdAt: '', updatedAt: '' },
    ]);
    return { trails, stands };
  }
  it('swaps the two-edge trails for centerlines, dashes the layer, and renames unedited stands once', async () => {
    const { trails } = await oldInstall();
    await seedBundledVectors();
    const fs = await db.features.where('layerId').equals(trails.id).toArray();
    expect(fs.length).toBe(BUNDLED_VECTORS[1].features.length);
    expect(fs.some((f) => f.extra?.cad_id)).toBe(false);
    expect((await db.layers.get(trails.id))!.defaultStyle.strokeDash).toBe('dashed');
    expect((await db.pois.get('p1'))!.name).toBe(BUNDLED_VECTORS.find((d) => d.key === 'tree-stands')!.stands[0].name);
    expect((await db.pois.get('p2'))!.name).toBe('My renamed stand 2'); // your edit survives
    await seedBundledVectors(); // second run changes nothing
    expect(await db.features.where('layerId').equals(trails.id).count()).toBe(BUNDLED_VECTORS[1].features.length);
  });
  it('leaves locked layers alone and does not run on a fresh install', async () => {
    const { trails, stands } = await oldInstall();
    await setLocked(trails.id, true); await setLocked(stands.id, true);
    await seedBundledVectors();
    expect(await db.features.where('layerId').equals(trails.id).count()).toBe(3);
    expect((await db.pois.get('p1'))!.name).toMatch(/ 1$/);
    await Promise.all(db.tables.map((t) => t.clear())); await ensureSeed();
    await seedBundledVectors();
    expect((await getSettings()).seededVectors).toEqual(expect.arrayContaining(['m:trails-centerline', 'm:stand-names']));
  });
  it('adds the search band to a Tracking layer made before the band existed', async () => {
    const made = await createVectorLayer('Tracking', { strokeColor: '#00b4d8' });
    const { searchBandFt: _omit, ...old } = made.defaultStyle; void _omit;
    await db.layers.put({ ...made, defaultStyle: old as typeof made.defaultStyle });
    await patchSettings({ seededVectors: ['boundary', 'trails', 'tracking', 'tree-stands'] });
    await seedBundledVectors();
    expect((await db.layers.get(made.id))!.defaultStyle.searchBandFt).toBe(60);
  });
});

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { createVectorLayer, setLocked } from '../db/layersRepo';
import { ensureSeed } from '../db/seed';
import { getSettings, patchSettings } from '../db/settingsRepo';
import { BUNDLED_VECTORS } from './bundledVectors';
import { seedBundledVectors } from './seedBundledVectors';

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())); await ensureSeed(); });

const byName = async (n: string) => (await db.layers.toArray()).find((l) => l.name === n);

describe('what a fresh install contains', () => {
  it('only the empty Tracking layer: no map data, no pins, no lines (this app is public)', async () => {
    expect(BUNDLED_VECTORS.map((d) => d.key)).toEqual(['tracking']);
    expect(BUNDLED_VECTORS.every((d) => d.features.length === 0 && d.stands.length === 0)).toBe(true);
    expect(await seedBundledVectors()).toEqual(['Tracking']);
    const t = (await byName('Tracking'))!;
    expect(t.defaultStyle).toMatchObject({ strokeColor: '#00b4d8', searchBandFt: 60 });
    expect(await db.features.count()).toBe(0); expect(await db.pois.count()).toBe(0);
    expect(await db.rasterSources.count()).toBe(0);
    expect((await db.layers.toArray()).map((l) => l.name).sort()).toEqual(['My POIs', 'Tracking']);
  });
  it('is added once: a deleted Tracking layer is not forced back by seeding', async () => {
    await seedBundledVectors();
    await db.layers.delete((await byName('Tracking'))!.id);
    expect(await seedBundledVectors()).toEqual([]);
    expect(await byName('Tracking')).toBeUndefined();
  });
  it('uses your own editable layer of the same name, but never a locked one', async () => {
    const mine = await createVectorLayer('Tracking');
    await seedBundledVectors();
    expect((await db.layers.toArray()).filter((l) => l.name === 'Tracking')).toHaveLength(1);
    expect((await byName('Tracking'))!.id).toBe(mine.id);
    await Promise.all(db.tables.map((t) => t.clear())); await ensureSeed();
    const locked = await createVectorLayer('Tracking'); await setLocked(locked.id, true);
    await seedBundledVectors();
    expect((await db.layers.toArray()).filter((l) => l.name === 'Tracking')).toHaveLength(2);
  });
  it('adds the search band to a Tracking layer made before the band existed', async () => {
    const made = await createVectorLayer('Tracking', { strokeColor: '#00b4d8' });
    const { searchBandFt: _omit, ...old } = made.defaultStyle; void _omit;
    await db.layers.put({ ...made, defaultStyle: old as typeof made.defaultStyle });
    await patchSettings({ seededVectors: ['tracking'] });
    await seedBundledVectors();
    expect((await db.layers.get(made.id))!.defaultStyle.searchBandFt).toBe(60);
    expect((await getSettings()).seededVectors).toEqual(expect.arrayContaining(['m:tracking-band']));
  });
});

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/db';
import { ensureSeed } from '../db/seed';
import { getSettings, patchSettings } from '../db/settingsRepo';

vi.mock('./rasterImport', () => ({
  importMbtiles: vi.fn(async (file: File) => {
    const { addRaster } = await import('../db/rasterRepo');
    const source = { id: crypto.randomUUID(), name: file.name, fileName: file.name, byteSize: 1, format: 'png' as const,
      scheme: 'tms' as const, bounds: [0, 0, 1, 1] as [number, number, number, number], minzoom: 1, maxzoom: 2,
      tileSize: 256 as const, rasterType: 'overlay' as const, datum: 'unknown' as const, importedAt: new Date().toISOString() };
    return { layer: await addRaster(source, file), source, warnings: [] };
  }),
}));

import { BUNDLED, BUNDLE_VERSION, seedBundledRasters } from './bundledData';

const deps = (fail = false) => ({
  fetchFile: vi.fn(async (i: { fileName: string }) => { if (fail) throw new Error('offline'); return new File(['x'], i.fileName); }),
  notify: vi.fn(),
});

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())); await ensureSeed(); });

describe('seedBundledRasters', () => {
  it('imports both files once, sets the flag, applies DEM opacity', async () => {
    const d = deps();
    expect(await seedBundledRasters(d.notify, d)).toBe(true);
    expect(await db.rasterSources.count()).toBe(BUNDLED.length);
    expect((await getSettings()).bundledVersion).toBe(BUNDLE_VERSION);
    const layers = await db.layers.where('kind').equals('raster').toArray();
    expect(layers.find((l) => l.name.includes('DEM'))?.opacity).toBe(0.5);
    const d2 = deps();
    expect(await seedBundledRasters(d2.notify, d2)).toBe(false);
    expect(d2.fetchFile).not.toHaveBeenCalled();
  });
  it('does not bring back a file the user deleted after seeding', async () => {
    const d = deps(); await seedBundledRasters(d.notify, d);
    const l = (await db.layers.where('kind').equals('raster').toArray())[0];
    const { deleteLayer } = await import('../db/layersRepo');
    await deleteLayer(l.id);
    const d2 = deps(); await seedBundledRasters(d2.notify, d2);
    expect(d2.fetchFile).not.toHaveBeenCalled();
    expect(await db.rasterSources.count()).toBe(BUNDLED.length - 1);
  });
  it('on failure leaves the flag unset (retry next launch) and reports an error', async () => {
    const d = deps(true);
    expect(await seedBundledRasters(d.notify, d)).toBe(false);
    expect((await getSettings()).bundledVersion).toBeUndefined();
    expect(d.notify).toHaveBeenCalledWith(expect.stringContaining('retry next launch'), 'error');
  });
  it('only fetches files that are missing', async () => {
        const first = deps(); await seedBundledRasters(first.notify, { ...first, fetchFile: vi.fn(async (i) => { if (i.fileName.includes('DEM')) throw new Error('x'); return new File(['x'], i.fileName); }) });
    const second = deps(); await seedBundledRasters(second.notify, second);
    expect(second.fetchFile).toHaveBeenCalledTimes(1);
    expect(second.fetchFile.mock.calls[0][0].fileName).toContain('DEM');
  });
  it('v1 device: replaces the old DEM with the cropped one, keeps the ortho', async () => {
    const { addRaster } = await import('../db/rasterRepo');
    const mk = (fileName: string) => ({ id: crypto.randomUUID(), name: fileName, fileName, byteSize: 1, format: 'png' as const,
      scheme: 'tms' as const, bounds: [0, 0, 1, 1] as [number, number, number, number], minzoom: 1, maxzoom: 2,
      tileSize: 256 as const, rasterType: 'overlay' as const, datum: 'unknown' as const, importedAt: new Date().toISOString() });
    await addRaster(mk('farm_ortho_2023.mbtiles'), new Blob(['x']));
    await addRaster(mk('The_Farm_DEM.mbtiles'), new Blob(['x']));
    await patchSettings({ bundledSeeded: true });
    const d = deps(); expect(await seedBundledRasters(d.notify, d)).toBe(true);
    expect((await db.rasterSources.toArray()).map((x) => x.fileName).sort())
      .toEqual(['The_Farm_DEM_cropped.mbtiles', 'farm_ortho_2023.mbtiles']);
    expect(d.fetchFile).toHaveBeenCalledTimes(1);
  });
  it('v1 device that deleted the old DEM does not get the new one', async () => {
    const { addRaster } = await import('../db/rasterRepo');
    await addRaster({ id: 'a', name: 'o', fileName: 'farm_ortho_2023.mbtiles', byteSize: 1, format: 'png', scheme: 'tms',
      bounds: [0, 0, 1, 1], minzoom: 1, maxzoom: 2, tileSize: 256, rasterType: 'overlay', datum: 'unknown', importedAt: '' }, new Blob(['x']));
    await patchSettings({ bundledSeeded: true });
    const d = deps(); expect(await seedBundledRasters(d.notify, d)).toBe(false);
    expect(d.fetchFile).not.toHaveBeenCalled();
  });
});

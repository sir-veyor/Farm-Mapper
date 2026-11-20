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

import { BUNDLED, seedBundledRasters } from './bundledData';

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
    expect((await getSettings()).bundledSeeded).toBe(true);
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
    expect((await getSettings()).bundledSeeded).toBeFalsy();
    expect(d.notify).toHaveBeenCalledWith(expect.stringContaining('retry next launch'), 'error');
  });
  it('only fetches files that are missing', async () => {
    await patchSettings({ bundledSeeded: false });
    const first = deps(); await seedBundledRasters(first.notify, { ...first, fetchFile: vi.fn(async (i) => { if (i.fileName.includes('DEM')) throw new Error('x'); return new File(['x'], i.fileName); }) });
    const second = deps(); await seedBundledRasters(second.notify, second);
    expect(second.fetchFile).toHaveBeenCalledTimes(1);
    expect(second.fetchFile.mock.calls[0][0].fileName).toContain('DEM');
  });
});

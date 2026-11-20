import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import * as layers from '../db/layersRepo';
import * as pois from '../db/poisRepo';
import { addRaster } from '../db/rasterRepo';
import { ensureSeed } from '../db/seed';
import { getSettings, patchSettings } from '../db/settingsRepo';
import { BackupError, createBackup, readBackup, restoreBackup } from './backupService';

const src = (id: string) => ({ id, name: `R-${id}`, fileName: `${id}.mbtiles`, byteSize: 3, format: 'png' as const, scheme: 'tms' as const,
  bounds: [0, 0, 1, 1] as [number, number, number, number], minzoom: 1, maxzoom: 2, tileSize: 256 as const, rasterType: 'overlay' as const,
  datum: 'unknown' as const, importedAt: '' });

async function seedData() {
  await Promise.all(db.tables.map((t) => t.clear()));
  await ensureSeed();
  const active = (await getSettings()).activeLayerId!;
  const stands = await layers.createVectorLayer('Stands', { symbolColor: '#e03131' });
  await pois.addPoi({ layerId: active, lon: -77.48, lat: 42.4, origin: 'gps', name: 'One', notes: 'n1', gps: { accuracyM: 4, fixTime: 'x' } });
  await pois.addPoi({ layerId: stands.id, lon: -77.47, lat: 42.41, origin: 'map-tap', name: 'Two', style: { symbol: 'tree' } });
  await layers.setLocked(stands.id, true);
  return { active, stands };
}

beforeEach(async () => { await seedData(); });

describe('backup round trip', () => {
  it('replace restores everything after the data is wiped, including lock state, styles and notes', async () => {
    const before = { layers: await db.layers.toArray(), pois: await db.pois.toArray() };
    const file = await createBackup(false);
    expect((await getSettings()).changesSinceBackup).toBe(0);
    expect((await getSettings()).lastBackupAt).not.toBeNull();
    await Promise.all(db.tables.map((t) => t.clear())); await ensureSeed();
    const r = await restoreBackup(file, 'replace');
    expect(r.pois).toBe(2);
    const after = { layers: await db.layers.toArray(), pois: await db.pois.toArray() };
    expect(after.pois.sort((a, b) => a.name.localeCompare(b.name))).toEqual(before.pois.sort((a, b) => a.name.localeCompare(b.name)));
    expect(after.layers.map((l) => [l.name, l.locked]).sort()).toEqual(before.layers.map((l) => [l.name, l.locked]).sort());
    expect((await db.layers.toArray()).find((l) => l.name === 'Stands')!.defaultStyle.symbolColor).toBe('#e03131');
    expect((await getSettings()).changesSinceBackup).toBe(0);
  });
  it('merge adds only what is missing and leaves existing items alone', async () => {
    const file = await createBackup(false);
    const extraLayer = await layers.createVectorLayer('Local only');
    await pois.addPoi({ layerId: extraLayer.id, lon: 1, lat: 1, origin: 'map-tap', name: 'Local' });
    const r = await restoreBackup(file, 'merge');
    expect(r.pois).toBe(0); expect(r.layers).toBe(0);
    expect(await db.pois.count()).toBe(3);
    // delete one pin, merge brings it back (its layer exists)
    const one = (await db.pois.toArray()).find((p) => p.name === 'One')!;
    await db.pois.delete(one.id);
    expect((await restoreBackup(file, 'merge')).pois).toBe(1);
    expect(await db.pois.count()).toBe(3);
  });
  it('imagery: kept on replace when not in the backup; restored when the backup includes it', async () => {
    await addRaster(src('a'), new Blob(['tiles-a']));
    const slim = await createBackup(false);
    const full = await createBackup(true);
    expect((await readBackup(full)).manifest.includesRasters).toBe(true);
    // device still has imagery: replace keeps its raster layer
    await restoreBackup(slim, 'replace');
    expect((await db.layers.where('kind').equals('raster').toArray()).length).toBe(1);
    // fresh device without imagery: slim backup drops the raster layer with a warning; full brings it back
    await Promise.all(db.tables.map((t) => t.clear())); await ensureSeed();
    const w = await restoreBackup(slim, 'replace');
    expect(w.warnings.join(' ')).toMatch(/R-a/);
    expect(await db.layers.where('kind').equals('raster').count()).toBe(0);
    await restoreBackup(full, 'replace');
    expect(await db.layers.where('kind').equals('raster').count()).toBe(1);
    expect(await (await db.rasterBlobs.get('a'))!.data.text()).toBe('tiles-a');
  });
  it('rejects non-backups and newer schema versions', async () => {
    await expect(readBackup(new File(['nope'], 'x.zip'))).rejects.toBeInstanceOf(BackupError);
    const JSZip = (await import('jszip')).default;
    const z = new JSZip(); z.file('manifest.json', JSON.stringify({ app: 'parcel-mapper', schemaVersion: 999 }));
    await expect(readBackup(new File([await z.generateAsync({ type: 'uint8array' }) as BlobPart], 'n.zip'))).rejects.toThrow(/newer version/);
    const z2 = new JSZip(); z2.file('hello.txt', 'x');
    await expect(readBackup(new File([await z2.generateAsync({ type: 'uint8array' }) as BlobPart], 'o.zip'))).rejects.toThrow(/not a Farm Mapper backup/);
  });
  it('replace clears an active layer that does not exist in the backup', async () => {
    const file = await createBackup(false);
    await patchSettings({ activeLayerId: 'ghost' });
    await restoreBackup(file, 'replace');
    const s = await getSettings();
    expect(s.activeLayerId === null || (await db.layers.get(s.activeLayerId!)) !== undefined).toBe(true);
  });
});

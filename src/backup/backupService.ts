import JSZip from 'jszip';
import { SCHEMA_VERSION } from '../config';
import { db } from '../db/db';
import { getSettings, patchSettings } from '../db/settingsRepo';
import type { Layer, Poi, RasterSource, Settings, VectorFeature } from '../types';
import { emit } from '../util/events';

export interface BackupManifest {
  app: 'parcel-mapper';
  schemaVersion: number;
  createdAt: string;
  includesRasters: boolean;
  counts: { layers: number; pois: number; features: number; rasterSources: number };
}

export class BackupError extends Error {
  constructor(message: string) { super(message); this.name = 'BackupError'; }
}

const pad = (n: number) => String(n).padStart(2, '0');
export const backupFileName = (d = new Date()): string =>
  `farm-mapper-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.zip`;

/** Zip of every layer, pin, feature and setting. Imagery/DEM files are optional (they are large). */
export async function createBackup(includeRasters: boolean): Promise<File> {
  const [layers, pois, features, rasterSources, settings] = await Promise.all([
    db.layers.toArray(), db.pois.toArray(), db.features.toArray(), db.rasterSources.toArray(), getSettings(),
  ]);
  const manifest: BackupManifest = {
    app: 'parcel-mapper', schemaVersion: SCHEMA_VERSION, createdAt: new Date().toISOString(), includesRasters: includeRasters,
    counts: { layers: layers.length, pois: pois.length, features: features.length, rasterSources: rasterSources.length },
  };
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(manifest, null, 1));
  zip.file('layers.json', JSON.stringify(layers));
  zip.file('pois.json', JSON.stringify(pois));
  zip.file('features.json', JSON.stringify(features));
  zip.file('rasterSources.json', JSON.stringify(rasterSources));
  zip.file('settings.json', JSON.stringify(settings));
  if (includeRasters) {
    for (const s of rasterSources) {
      const b = await db.rasterBlobs.get(s.id);
      if (b) zip.file(`rasters/${s.id}.mbtiles`, await b.data.arrayBuffer());
    }
  }
  const blob = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  await patchSettings({ lastBackupAt: new Date().toISOString(), changesSinceBackup: 0 });
  return new File([blob as BlobPart], backupFileName(), { type: 'application/zip' });
}

export interface BackupInfo { manifest: BackupManifest; zip: JSZip }

/** Opens a backup zip and validates its manifest without changing anything. */
export async function readBackup(file: File): Promise<BackupInfo> {
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(await file.arrayBuffer()); } catch { throw new BackupError('This file is not a backup zip.'); }
  const m = zip.file('manifest.json');
  if (!m) throw new BackupError('This zip is not a Farm Mapper backup (no manifest).');
  let manifest: BackupManifest;
  try { manifest = JSON.parse(await m.async('string')); } catch { throw new BackupError('The backup manifest is damaged.'); }
  if (manifest.app !== 'parcel-mapper') throw new BackupError('This zip is not a Farm Mapper backup.');
  if (manifest.schemaVersion > SCHEMA_VERSION) throw new BackupError('This backup was made by a newer version of the app. Update the app first.');
  return { manifest, zip };
}

const json = async <T>(zip: JSZip, name: string): Promise<T> => {
  const f = zip.file(name);
  if (!f) throw new BackupError(`The backup is missing ${name}.`);
  return JSON.parse(await f.async('string')) as T;
};

export interface RestoreSummary { layers: number; pois: number; features: number; warnings: string[] }

/**
 * replace: vector layers, pins, features and settings become exactly the backup's; imagery already on this device is kept.
 * merge: adds anything whose id is not already here; existing items and settings are untouched.
 */
export async function restoreBackup(file: File, mode: 'replace' | 'merge'): Promise<RestoreSummary> {
  const { zip } = await readBackup(file);
  const [bLayers, bPois, bFeats, bSources, bSettings] = await Promise.all([
    json<Layer[]>(zip, 'layers.json'), json<Poi[]>(zip, 'pois.json'), json<VectorFeature[]>(zip, 'features.json'),
    json<RasterSource[]>(zip, 'rasterSources.json'), json<Settings>(zip, 'settings.json'),
  ]);
  const blobs = new Map<string, Blob>();
  for (const s of bSources) {
    const f = zip.file(`rasters/${s.id}.mbtiles`);
    if (f) blobs.set(s.id, new Blob([await f.async('arraybuffer')]));
  }
  const warnings: string[] = [];
  const summary: RestoreSummary = { layers: 0, pois: 0, features: 0, warnings };

  await db.transaction('rw', [db.layers, db.pois, db.features, db.rasterSources, db.rasterBlobs, db.settings], async () => {
    const haveSource = new Set(await db.rasterSources.toCollection().primaryKeys());
    for (const s of bSources) {
      if (haveSource.has(s.id) || !blobs.has(s.id)) continue;
      await db.rasterSources.put(s); await db.rasterBlobs.put({ id: s.id, data: blobs.get(s.id)! });
      haveSource.add(s.id);
    }
    const usable = (l: Layer) => l.kind === 'vector' || (!!l.rasterSourceId && haveSource.has(l.rasterSourceId));
    for (const l of bLayers) if (!usable(l)) warnings.push(`Imagery "${l.name}" was not in the backup. Import it again.`);

    let keepLayers: Layer[];
    if (mode === 'replace') {
      const existingRaster = (await db.layers.where('kind').equals('raster').toArray()).filter((l) => !bLayers.some((b) => b.id === l.id));
      await Promise.all([db.pois.clear(), db.features.clear(), db.layers.clear()]);
      keepLayers = [...bLayers.filter(usable), ...existingRaster.filter((l) => l.rasterSourceId && haveSource.has(l.rasterSourceId))];
      await db.layers.bulkPut(keepLayers);
      summary.layers = bLayers.filter(usable).length;
    } else {
      const have = new Set(await db.layers.toCollection().primaryKeys());
      const add = bLayers.filter((l) => !have.has(l.id) && usable(l));
      await db.layers.bulkPut(add);
      keepLayers = [...(await db.layers.toArray())];
      summary.layers = add.length;
    }
    const layerIds = new Set(keepLayers.map((l) => l.id));
    const havePoi = mode === 'merge' ? new Set(await db.pois.toCollection().primaryKeys()) : new Set<string>();
    const haveFeat = mode === 'merge' ? new Set(await db.features.toCollection().primaryKeys()) : new Set<string>();
    const poisIn = bPois.filter((p) => layerIds.has(p.layerId) && !havePoi.has(p.id));
    const featsIn = bFeats.filter((f) => layerIds.has(f.layerId) && !haveFeat.has(f.id));
    await db.pois.bulkPut(poisIn); await db.features.bulkPut(featsIn);
    summary.pois = poisIn.length; summary.features = featsIn.length;

    if (mode === 'replace') {
      const active = layerIds.has(bSettings.activeLayerId ?? '') ? bSettings.activeLayerId : null;
      await db.settings.put({ ...bSettings, id: 'settings', activeLayerId: active, schemaVersion: SCHEMA_VERSION, changesSinceBackup: 0,
        bundledVersion: Math.max(bSettings.bundledVersion ?? 0, (await getSettings()).bundledVersion ?? 0) || undefined });
    }
  });
  emit('layers', 'pois', 'features', 'rasters', 'settings');
  return summary;
}

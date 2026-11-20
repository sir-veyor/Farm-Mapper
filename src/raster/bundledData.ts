import { db } from '../db/db';
import { deleteLayer, setOpacity } from '../db/layersRepo';
import { getSettings, patchSettings } from '../db/settingsRepo';
import type { RasterSource } from '../types';
import { importMbtiles } from './rasterImport';

export interface BundledRaster {
  url: string;                 // relative to the app's base URL
  fileName: string;
  datum: RasterSource['datum'];
  opacity?: number;            // initial layer opacity
  replaces?: string[];         // older bundled files this one supersedes
}

/** Bump when BUNDLED changes. Devices below it get the new/replaced files once. */
export const BUNDLE_VERSION = 2;

/** Imagery first, then the DEM on top at half opacity so both are visible on first launch. */
export const BUNDLED: BundledRaster[] = [
  { url: 'data/farm_ortho_2023.mbtiles', fileName: 'farm_ortho_2023.mbtiles', datum: 'wgs84-corrected' },
  {
    url: 'data/The_Farm_DEM_cropped.mbtiles', fileName: 'The_Farm_DEM_cropped.mbtiles', datum: 'unknown',
    opacity: 0.5, replaces: ['The_Farm_DEM.mbtiles'],
  },
];

export interface SeedDeps {
  fetchFile: (item: BundledRaster) => Promise<File>;
  notify: (text: string, kind: 'info' | 'error' | 'success') => void;
}

const defaultDeps = (notify: SeedDeps['notify']): SeedDeps => ({
  notify,
  fetchFile: async (item) => {
    const res = await fetch(new URL(item.url, document.baseURI));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return new File([await res.blob()], item.fileName);
  },
});

let running: Promise<boolean> | null = null;

/**
 * Downloads bundled map files once and imports them as ordinary layers. Safe to call every launch.
 * - New device (version 0): imports everything missing.
 * - Older device: files the user already deleted stay deleted; a superseded file that is still
 *   present (and not locked) is replaced by its new version. Returns true if anything was imported.
 */
export function seedBundledRasters(notify: SeedDeps['notify'], deps: SeedDeps = defaultDeps(notify)): Promise<boolean> {
  return (running ??= run(deps).finally(() => { running = null; }));
}

async function run(deps: SeedDeps): Promise<boolean> {
  const s = await getSettings();
  const version = s.bundledVersion ?? (s.bundledSeeded ? 1 : 0);
  if (version >= BUNDLE_VERSION) return false;

  const sources = await db.rasterSources.toArray();
  const have = new Set(sources.map((x) => x.fileName));
  let imported = 0, failed = 0;

  for (const item of BUNDLED) {
    if (have.has(item.fileName)) continue;
    const old = sources.filter((x) => item.replaces?.includes(x.fileName));
    if (version > 0 && item.replaces && !old.length) continue; // user removed the older one: respect that
    try {
      if (!imported && !failed) deps.notify('Loading map data (about 50 MB). Keep this open...', 'info');
      const { layer, source } = await importMbtiles(await deps.fetchFile(item), item.datum);
      const opacity = item.opacity;
      if (opacity !== undefined) await setOpacity(layer.id, opacity);
      for (const o of old) {
        const l = (await db.layers.toArray()).find((x) => x.rasterSourceId === o.id);
        try { if (l) await deleteLayer(l.id); } catch { deps.notify(`Kept locked layer "${o.name}".`, 'info'); }
      }
      imported++;
      deps.notify(`Loaded "${source.name}".`, 'success');
    } catch (e) {
      failed++;
      deps.notify(`Could not load ${item.fileName}: ${(e as Error).message}. It will retry next launch (needs a connection).`, 'error');
    }
  }
  if (!failed) await patchSettings({ bundledVersion: BUNDLE_VERSION, bundledSeeded: true });
  return imported > 0;
}

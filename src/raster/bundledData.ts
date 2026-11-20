import { setOpacity } from '../db/layersRepo';
import { db } from '../db/db';
import { getSettings, patchSettings } from '../db/settingsRepo';
import type { RasterSource } from '../types';
import { importMbtiles } from './rasterImport';

export interface BundledRaster {
  url: string;                 // relative to the app's base URL
  fileName: string;
  datum: RasterSource['datum'];
  opacity?: number;            // initial layer opacity
}

/** Imagery first, then DEM on top at half opacity so both are visible on first launch. */
export const BUNDLED: BundledRaster[] = [
  { url: 'data/farm_ortho_2023.mbtiles', fileName: 'farm_ortho_2023.mbtiles', datum: 'wgs84-corrected' },
  { url: 'data/The_Farm_DEM.mbtiles', fileName: 'The_Farm_DEM.mbtiles', datum: 'unknown', opacity: 0.5 },
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
 * First launch only: download the bundled map files once and import them as ordinary layers.
 * Never re-adds a file the user deleted (flag set once all succeed). Safe to call every launch.
 * Returns true if anything was imported.
 */
export function seedBundledRasters(notify: SeedDeps['notify'], deps: SeedDeps = defaultDeps(notify)): Promise<boolean> {
  return (running ??= run(deps).finally(() => { running = null; }));
}

async function run(deps: SeedDeps): Promise<boolean> {
  if ((await getSettings()).bundledSeeded) return false;
  const have = new Set((await db.rasterSources.toArray()).map((s) => s.fileName));
  const todo = BUNDLED.filter((b) => !have.has(b.fileName));
  let imported = 0, failed = 0;

  if (todo.length) deps.notify('First launch: loading your map data (about 60 MB). Keep this open...', 'info');
  for (const item of todo) {
    try {
      const { layer, source } = await importMbtiles(await deps.fetchFile(item), item.datum);
      if (item.opacity !== undefined) await setOpacity(layer.id, item.opacity);
      imported++;
      deps.notify(`Loaded "${source.name}".`, 'success');
    } catch (e) {
      failed++;
      deps.notify(`Could not load ${item.fileName}: ${(e as Error).message}. It will retry next launch (needs a connection).`, 'error');
    }
  }
  if (!failed) await patchSettings({ bundledSeeded: true });
  return imported > 0;
}

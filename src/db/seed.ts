import { SCHEMA_VERSION } from '../config';
import { db } from './db';
import { makeLayer } from './layersRepo';
import { defaultSettings } from './settingsRepo';

/** First run only (no settings row): create settings and the "My POIs" layer. */
export async function ensureSeed(): Promise<void> {
  await db.transaction('rw', [db.layers, db.settings], async () => {
    if (await db.settings.get('settings')) return;
    const layer = await makeLayer('vector', 'My POIs');
    await db.layers.add(layer);
    await db.settings.add({ ...defaultSettings(), schemaVersion: SCHEMA_VERSION, activeLayerId: layer.id });
  });
}

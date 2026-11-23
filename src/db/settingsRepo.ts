import { DEFAULT_VIEW, SCHEMA_VERSION } from '../config';
import { emit } from '../util/events';
import type { Settings } from '../types';
import { db } from './db';

export const defaultSettings = (): Settings => ({
  id: 'settings',
  schemaVersion: SCHEMA_VERSION,
  activeLayerId: null,
  lastView: { ...DEFAULT_VIEW },
  gps: { averageSeconds: 30, maxAcceptAccuracyM: 15, timeoutS: 30 },
  units: 'imperial', // the app always shows feet; field kept for old backups
  activeTrackId: null,
  lastBackupAt: null,
  changesSinceBackup: 0,
});

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get('settings')) ?? defaultSettings();
}

export async function patchSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await db.settings.put(next);
  emit('settings');
  return next;
}

/** Called by every repo write. Does not emit (the caller already emitted its own topic). */
export async function bumpChangeCounter(): Promise<void> {
  const s = await getSettings();
  await db.settings.put({ ...s, changesSinceBackup: s.changesSinceBackup + 1 });
}

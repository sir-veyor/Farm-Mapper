import { addPoi } from '../db/poisRepo';
import { getSettings } from '../db/settingsRepo';
import { getLayer } from '../db/layersRepo';
import type { Poi } from '../types';
import { averageSamples, type Sample } from './averaging';
import { collectSamples, getFix, startWatch, stopWatch, withWakeLock } from './gpsService';

async function activeLayerId(): Promise<string> {
  const { activeLayerId: id } = await getSettings();
  if (!id) throw new Error('Choose an active layer first (open Layers and tap the dot beside a layer).');
  const l = await getLayer(id);
  if (l.frozen || l.locked) throw new Error(`"${l.name}" is frozen or locked. Choose another active layer.`);
  return id;
}

/** Pins the current location using a fix younger than 3 s, or waits for the next fix. */
export async function pinHere(): Promise<Poi> {
  const layerId = await activeLayerId();
  const { gps } = await getSettings();
  await startWatch();
  try {
    const f = await getFix(3000, gps.timeoutS * 1000);
    return await addPoi({
      layerId, lon: f.lon, lat: f.lat, origin: 'gps',
      gps: { accuracyM: f.accuracyM, altitudeM: f.altitudeM, altitudeAccuracyM: f.altitudeAccuracyM, fixTime: new Date(f.time).toISOString() },
    });
  } finally { stopWatch(); }
}

/** Collects fixes for `seconds` (screen kept awake) and pins their weighted mean. */
export async function pinAveraged(seconds: number, onProgress: (samples: Sample[]) => void, signal: AbortSignal): Promise<Poi> {
  const layerId = await activeLayerId();
  const { gps } = await getSettings();
  await startWatch();
  try {
    const samples = await withWakeLock(() => collectSamples(seconds, onProgress, signal));
    const r = averageSamples(samples, { maxAcceptAccuracyM: gps.maxAcceptAccuracyM });
    return await addPoi({
      layerId, lon: r.lon, lat: r.lat, origin: 'gps-averaged',
      gps: {
        accuracyM: r.accuracyM, fixTime: new Date().toISOString(),
        avg: { samplesUsed: r.samplesUsed, samplesRejected: r.samplesRejected, durationS: seconds, spreadM: r.spreadM },
      },
      notes: r.lowQuality ? 'Low-quality average: no fix met the accuracy threshold.' : '',
    });
  } finally { stopWatch(); }
}

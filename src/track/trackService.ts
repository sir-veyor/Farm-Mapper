import { create } from 'zustand';
import { db } from '../db/db';
import { addFeature, updateFeatureGeometry } from '../db/featuresRepo';
import { createVectorLayer } from '../db/layersRepo';
import { addPoi } from '../db/poisRepo';
import { getSettings, patchSettings } from '../db/settingsRepo';
import { getFix, onFix, startWatch, stopWatch, type Fix } from '../gps/gpsService';
import { useUi } from '../state/uiStore';
import type { Layer, Poi, VectorFeature } from '../types';
import { metersBetween } from '../util/geo';
import { fromGeometry, GAP_MS, judgeFix, segmentsLength, toGeometry, type Segments } from './trackMath';
import type { SignPreset } from './signs';

export const TRACKING_LAYER = 'Tracking';

export type TrackStatus = 'idle' | 'recording' | 'paused';
export const useTrack = create<{
  status: TrackStatus; featureId: string | null; name: string; points: number; distanceM: number; sessionStartedAt: number | null; durationBeforeS: number;
}>(() => ({ status: 'idle', featureId: null, name: '', points: 0, distanceM: 0, sessionStartedAt: null, durationBeforeS: 0 }));

// ---- recorder state (module level: one recording at a time) ----
let layerId: string | null = null;
let segs: Segments = [[]];
let startedAtIso = '';
let lastAccepted: { lon: number; lat: number; time: number } | null = null;
let lastAnyFixTime = 0;
let unsub: (() => void) | null = null;
let releaseWake: (() => void) | null = null;
let queue: Promise<unknown> = Promise.resolve();
let creating: Promise<void> | null = null;
let glitch: { count: number; lon: number; lat: number } | null = null;

const pad = (n: number) => String(n).padStart(2, '0');
const defaultTrackName = () => { const d = new Date(); return `Track ${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const toast = (t: string, k: 'info' | 'error' | 'success' = 'info') => useUi.getState().toast(t, k);

/** The Tracking layer (created if you deleted it). Throws if it exists but is locked or frozen. */
export async function ensureTrackingLayer(): Promise<Layer> {
  const all = (await db.layers.toArray()).filter((l) => l.kind === 'vector' && l.name === TRACKING_LAYER);
  const ok = all.find((l) => !l.locked && !l.frozen);
  if (ok) return ok;
  if (all.length) throw new Error('The Tracking layer is locked or frozen. Unlock or thaw it in Layers first.');
  return createVectorLayer(TRACKING_LAYER, { strokeColor: '#00b4d8', strokeWidth: 3.5, strokeOpacity: 0.95, strokeDash: 'solid' });
}

async function acquireWake(): Promise<() => void> {
  type Lock = { release(): Promise<void> };
  const wl = (navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<Lock> } }).wakeLock;
  let lock: Lock | undefined;
  let stopped = false;
  const get = async () => { try { lock = await wl?.request('screen'); } catch { /* denied or unsupported */ } };
  await get();
  const onVis = () => { if (!stopped && document.visibilityState === 'visible') { void get(); noteResume(); } };
  document.addEventListener('visibilitychange', onVis);
  return () => { stopped = true; document.removeEventListener('visibilitychange', onVis); void lock?.release().catch(() => undefined); };
}

let hiddenAt = 0;
function noteResume() {
  if (hiddenAt && Date.now() - hiddenAt > 15000 && useTrack.getState().status === 'recording') toast('The screen was off, so some of your path may be missing. Keep the screen on while tracking.', 'info');
  hiddenAt = 0;
}
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') hiddenAt = Date.now(); });

function sourceNow(distanceM: number, ended: boolean): VectorFeature['source'] {
  const st = useTrack.getState();
  const durationS = st.durationBeforeS + (st.sessionStartedAt ? (Date.now() - st.sessionStartedAt) / 1000 : 0);
  return { kind: 'track', startedAt: startedAtIso, ...(ended ? { endedAt: new Date().toISOString() } : {}), distanceM, durationS };
}

/** Writes the current segments to the track feature (creating it on the first 2 points). Serialised, so writes never overlap. */
function persist(ended = false, notes?: string): Promise<unknown> {
  queue = queue.then(async () => {
    const geometry = toGeometry(segs);
    if (!geometry || !layerId) return;
    const distanceM = segmentsLength(segs);
    const st = useTrack.getState();
    try {
      if (!st.featureId) {
        if (creating) { await creating; }
        else {
          creating = (async () => {
            const f = await addFeature(layerId!, { name: st.name, geometry, source: sourceNow(distanceM, false), notes: '' });
            useTrack.setState({ featureId: f.id });
            await patchSettings({ activeTrackId: f.id });
          })();
          await creating; creating = null;
        }
        return;
      }
      await updateFeatureGeometry(st.featureId, geometry, sourceNow(distanceM, ended), notes !== undefined ? { notes } : {});
    } catch (e) {
      toast(`Could not save the track: ${(e as Error).message}`, 'error');
      if (useTrack.getState().status === 'recording') void pauseTrack();
    }
  });
  return queue;
}

/** Feed one GPS fix to the recorder. (Exported so tests can drive it without a GPS.) */
export function handleFix(fix: Pick<Fix, 'lon' | 'lat' | 'accuracyM' | 'time'>): 'accept' | 'poor-accuracy' | 'too-close' | 'glitch' | 'ignored' {
  if (useTrack.getState().status !== 'recording') return 'ignored';
  if (lastAnyFixTime && fix.time - lastAnyFixTime > GAP_MS && segs[segs.length - 1].length) { segs.push([]); lastAccepted = null; } // GPS dropout: do not join across it
  lastAnyFixTime = fix.time;
  let verdict = judgeFix(lastAccepted, fix);
  if (verdict === 'glitch') {
    // A single jump is noise. Three consistent fixes in a row at the new spot mean the old anchor was wrong (or you really
    // are somewhere else, e.g. after a GPS dropout): accept it and start a fresh segment so the path can never get stuck.
    if (glitch && metersBetween([glitch.lon, glitch.lat], [fix.lon, fix.lat]) < 15) glitch.count++; else glitch = { count: 1, lon: fix.lon, lat: fix.lat };
    if (glitch.count >= 3) {
      glitch = null;
      if (segs[segs.length - 1].length) segs.push([]);
      lastAccepted = null;
      verdict = judgeFix(null, fix);
    }
  } else glitch = null;
  if (verdict !== 'accept') return verdict;
  segs[segs.length - 1].push([fix.lon, fix.lat]);
  lastAccepted = { lon: fix.lon, lat: fix.lat, time: fix.time };
  useTrack.setState({ points: segs.reduce((a, s) => a + s.length, 0), distanceM: segmentsLength(segs) });
  void persist();
  return 'accept';
}

async function begin(): Promise<void> {
  await startWatch();
  unsub = onFix((f) => { handleFix(f); });
  releaseWake = await acquireWake();
  const { last } = (await import('../gps/gpsService')).useGps.getState();
  if (last && Date.now() - last.time < 1500) handleFix(last); // start from where you are standing
}

function end() {
  unsub?.(); unsub = null;
  releaseWake?.(); releaseWake = null;
  stopWatch();
}

export async function startNewTrack(): Promise<void> {
  if (useTrack.getState().status !== 'idle') return;
  layerId = (await ensureTrackingLayer()).id;
  segs = [[]]; lastAccepted = null; lastAnyFixTime = 0; glitch = null; startedAtIso = new Date().toISOString();
  useTrack.setState({ status: 'recording', featureId: null, name: defaultTrackName(), points: 0, distanceM: 0, sessionStartedAt: Date.now(), durationBeforeS: 0 });
  await begin();
}

/** Continue a saved track: new points are added as a new segment (no line is drawn across the gap). */
export async function resumeTrack(featureId: string): Promise<void> {
  const st = useTrack.getState();
  if (st.status === 'recording') return;
  if (st.status === 'paused' && st.featureId === featureId) { await resumePaused(); return; }
  if (st.status === 'paused') await stopTrack();
  const f = await db.features.get(featureId);
  if (!f) throw new Error('That track no longer exists.');
  layerId = (await ensureTrackingLayer()).id;
  if (f.layerId !== layerId) layerId = f.layerId;
  segs = [...fromGeometry(f.geometry), []];
  lastAccepted = null; lastAnyFixTime = 0;
  startedAtIso = f.source.kind === 'track' ? f.source.startedAt : f.createdAt;
  useTrack.setState({ status: 'recording', featureId: f.id, name: f.name, points: segs.reduce((a, s) => a + s.length, 0), distanceM: segmentsLength(segs),
    sessionStartedAt: Date.now(), durationBeforeS: f.source.kind === 'track' ? f.source.durationS : 0 });
  await patchSettings({ activeTrackId: f.id });
  await begin();
}

async function resumePaused(): Promise<void> {
  segs.push([]); lastAccepted = null; lastAnyFixTime = 0;
  useTrack.setState({ status: 'recording', sessionStartedAt: Date.now() });
  await begin();
}

export async function pauseTrack(): Promise<void> {
  if (useTrack.getState().status !== 'recording') return;
  end();
  const st = useTrack.getState();
  useTrack.setState({ status: 'paused', durationBeforeS: st.durationBeforeS + (st.sessionStartedAt ? (Date.now() - st.sessionStartedAt) / 1000 : 0), sessionStartedAt: null });
  await persist();
}

export async function resumeCurrent(): Promise<void> {
  if (useTrack.getState().status === 'paused') await resumePaused();
}

/** Finishes the track: final write with the end time, total distance and a one-line summary in the notes. */
export async function stopTrack(): Promise<void> {
  const st = useTrack.getState();
  if (st.status === 'idle') return;
  if (st.status === 'recording') end();
  const durationS = st.durationBeforeS + (st.sessionStartedAt ? (Date.now() - st.sessionStartedAt) / 1000 : 0);
  useTrack.setState({ status: 'idle', sessionStartedAt: null, durationBeforeS: durationS });
  const hadLine = !!toGeometry(segs);
  await persist(true, hadLine ? `Walked ${Math.round(segmentsLength(segs) * 3.28084).toLocaleString('en-US')} ft in ${Math.round(durationS / 60)} min.` : undefined);
  await patchSettings({ activeTrackId: null });
  useTrack.setState({ featureId: null, points: 0, distanceM: 0, durationBeforeS: 0 });
  if (!hadLine) toast('No path was recorded (no GPS movement), so no track was saved.', 'info');
}

/** Boot-time: if the app was closed while recording, tell the user the track is safe and can be resumed. */
export async function noteInterruptedTrack(): Promise<void> {
  const { activeTrackId } = await getSettings();
  if (!activeTrackId) return;
  await patchSettings({ activeTrackId: null });
  if (await db.features.get(activeTrackId)) toast('Tracking stopped when the app closed. Your path so far is saved; open Track to resume it.', 'info');
}

export function startOfTrack(f: VectorFeature): [number, number] | null {
  const s = fromGeometry(f.geometry).find((x) => x.length);
  return s ? [s[0][0], s[0][1]] : null;
}

/** Drops a sign marker at your current GPS position on the Tracking layer. */
export async function dropSign(preset: SignPreset): Promise<Poi> {
  const layer = await ensureTrackingLayer();
  await startWatch();
  try {
    const { gps } = await getSettings();
    const f = await getFix(3000, gps.timeoutS * 1000);
    const d = new Date();
    const poi = await addPoi({
      layerId: layer.id, lon: f.lon, lat: f.lat, origin: 'gps', name: `${preset.label} ${pad(d.getHours())}:${pad(d.getMinutes())}`,
      style: { symbol: preset.symbol, symbolColor: preset.color, showLabels: true },
      gps: { accuracyM: f.accuracyM, altitudeM: f.altitudeM, altitudeAccuracyM: f.altitudeAccuracyM, fixTime: new Date(f.time).toISOString() },
    });
    return poi;
  } finally { stopWatch(); }
}

export const distanceBetween = (a: [number, number], b: [number, number]) => metersBetween(a, b);

/** Test/debug: what the recorder currently holds. */
export const _debugState = () => ({ segs, lastAccepted, lastAnyFixTime });

/** Resolves when every queued track write has finished. */
export const flushTrackWrites = (): Promise<unknown> => queue;

/** Test helper: forget all recorder state. */
export function _resetTrackerForTests() {
  end(); layerId = null; segs = [[]]; lastAccepted = null; lastAnyFixTime = 0; glitch = null; queue = Promise.resolve(); creating = null;
  useTrack.setState({ status: 'idle', featureId: null, name: '', points: 0, distanceM: 0, sessionStartedAt: null, durationBeforeS: 0 });
}

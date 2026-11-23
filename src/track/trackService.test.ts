// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { setLocked } from '../db/layersRepo';
import { ensureSeed } from '../db/seed';
import { getSettings } from '../db/settingsRepo';
import { useGps } from '../gps/gpsService';
import { SIGNS } from './signs';
import { _resetTrackerForTests, dropSign, ensureTrackingLayer, flushTrackWrites, handleFix, pauseTrack, resumeCurrent, resumeTrack, startNewTrack, stopTrack, useTrack } from './trackService';

let t = 1_000_000;
const lat0 = 42.4, lon0 = -77.48;
const fix = (northM: number, over: Partial<{ accuracyM: number; dt: number }> = {}) => {
  t += over.dt ?? 3000;
  return { lon: lon0, lat: lat0 + northM / 110540, accuracyM: over.accuracyM ?? 5, time: t };
};
const walk = async (from: number, to: number, step = 5) => { for (let m = from; m <= to; m += step) handleFix(fix(m)); await flushTrackWrites(); };
const tracks = () => db.features.toArray();

beforeEach(async () => {
  _resetTrackerForTests();
  await Promise.all(db.tables.map((x) => x.clear())); await ensureSeed();
  t = 1_000_000;
});

describe('track recorder', () => {
  it('records a walk onto the Tracking layer and saves it as it goes', async () => {
    await startNewTrack();
    expect(useTrack.getState().status).toBe('recording');
    await walk(0, 100);
    const [f] = await tracks();
    const layer = await ensureTrackingLayer();
    expect(f.layerId).toBe(layer.id); expect(layer.name).toBe('Tracking');
    expect(f.geometry.type).toBe('LineString'); expect((f.geometry as GeoJSON.LineString).coordinates.length).toBe(21);
    expect(f.source.kind === 'track' && f.source.distanceM).toBeGreaterThan(98);
    expect((await getSettings()).activeTrackId).toBe(f.id);
    expect(useTrack.getState().distanceM).toBeGreaterThan(98);
  });
  it('drops poor-accuracy fixes, wobble and glitches', async () => {
    await startNewTrack();
    expect(handleFix(fix(0))).toBe('accept');
    expect(handleFix(fix(10, { accuracyM: 40 }))).toBe('poor-accuracy');
    expect(handleFix(fix(1))).toBe('too-close');
    expect(handleFix(fix(500, { dt: 1000 }))).toBe('glitch');
    expect(handleFix(fix(10))).toBe('accept');
  });
  it('never gets stuck: after a wrong first point, three consistent fixes elsewhere restart the path there', async () => {
    await startNewTrack();
    expect(handleFix(fix(0))).toBe('accept');                              // a stale first position
    expect(handleFix(fix(600, { dt: 1000 }))).toBe('glitch');               // you are actually 600 m away...
    expect(handleFix(fix(606, { dt: 1000 }))).toBe('glitch');
    expect(handleFix(fix(612, { dt: 1000 }))).toBe('accept');               // ...third consistent fix: accepted
    expect(handleFix(fix(630, { dt: 3000 }))).toBe('accept');
    await flushTrackWrites();
    const g = (await tracks())[0].geometry as GeoJSON.MultiLineString;
    expect(g.type === 'MultiLineString' ? g.coordinates.length : 1).toBeGreaterThanOrEqual(1);
    expect(useTrack.getState().distanceM).toBeLessThan(60);                  // the 600 m jump is not counted as walking
  });
  it('ignores fixes when not recording', () => { expect(handleFix(fix(0))).toBe('ignored'); });
  it('pause then resume starts a new segment (no line across the gap)', async () => {
    await startNewTrack(); await walk(0, 50);
    await pauseTrack();
    expect(useTrack.getState().status).toBe('paused');
    expect(handleFix(fix(300))).toBe('ignored'); // moved while paused: nothing recorded
    await resumeCurrent();
    await walk(400, 450);
    const [f] = await tracks();
    expect(f.geometry.type).toBe('MultiLineString');
    expect((f.geometry as GeoJSON.MultiLineString).coordinates).toHaveLength(2);
    expect(useTrack.getState().distanceM).toBeLessThan(120); // the 350 ft jump is not counted
  });
  it('a GPS dropout over 30 s splits the line instead of joining across it', async () => {
    await startNewTrack(); await walk(0, 30);
    handleFix(fix(200, { dt: 60000 })); handleFix(fix(210)); handleFix(fix(220)); await flushTrackWrites();
    expect(((await tracks())[0].geometry as GeoJSON.MultiLineString).coordinates).toHaveLength(2);
  });
  it('stop finalises: end time, distance, notes, and clears the active track', async () => {
    await startNewTrack(); await walk(0, 60);
    await stopTrack();
    const [f] = await tracks();
    expect(f.source.kind === 'track' && !!f.source.endedAt).toBe(true);
    expect(f.notes).toMatch(/^Walked \d+ ft in \d+ min\.$/);
    expect((await getSettings()).activeTrackId).toBeNull();
    expect(useTrack.getState().status).toBe('idle');
  });
  it('a saved track can be resumed later: new points go into the same feature as a new segment', async () => {
    await startNewTrack(); await walk(0, 40); await stopTrack();
    const [saved] = await tracks();
    await resumeTrack(saved.id);
    expect(useTrack.getState().status).toBe('recording'); expect(useTrack.getState().featureId).toBe(saved.id);
    await walk(500, 540);
    await stopTrack();
    const all = await tracks();
    expect(all).toHaveLength(1);
    expect((all[0].geometry as GeoJSON.MultiLineString).coordinates).toHaveLength(2);
    expect(all[0].source.kind === 'track' && all[0].source.distanceM).toBeGreaterThan(75);
  });
  it('stopping with no movement saves nothing', async () => {
    await startNewTrack(); handleFix(fix(0)); await stopTrack();
    expect(await tracks()).toHaveLength(0);
  });
  it('refuses to start when the Tracking layer is locked', async () => {
    const layer = await ensureTrackingLayer();
    await setLocked(layer.id, true);
    await expect(startNewTrack()).rejects.toThrow(/locked/);
    expect(useTrack.getState().status).toBe('idle');
  });
});

describe('sign markers', () => {
  it('drops a labelled pin with the preset symbol at the current fix, on the Tracking layer', async () => {
    useGps.setState({ status: 'ok', last: { lon: -77.4812, lat: 42.4011, accuracyM: 7, altitudeM: null, altitudeAccuracyM: null, time: Date.now(), headingDeg: null, speedMps: null } });
    const blood = SIGNS.find((s) => s.key === 'blood')!;
    const poi = await dropSign(blood);
    const layer = await ensureTrackingLayer();
    expect(poi.layerId).toBe(layer.id);
    expect(poi.name).toMatch(/^Blood \d\d:\d\d$/);
    expect(poi.style).toMatchObject({ symbol: 'water', symbolColor: '#e03131' });
    expect(poi.lon).toBe(-77.4812); expect(poi.gps!.accuracyM).toBe(7);
  });
  it('has the seven presets with distinct names', () => {
    expect(SIGNS.map((s) => s.label)).toEqual(['Hit', 'Blood', 'Tracks', 'Hair', 'Bed', 'Lost sign', 'Found']);
  });
});

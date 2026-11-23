import { describe, expect, it } from 'vitest';
import { formatDuration, fromGeometry, judgeFix, segmentsLength, toGeometry } from './trackMath';

const base = { lon: -77.48, lat: 42.4, time: 1_000_000 };
const north = (m: number) => ({ lon: base.lon, lat: base.lat + m / 110540 });

describe('judgeFix', () => {
  it('first good fix is accepted; poor accuracy is not', () => {
    expect(judgeFix(null, { ...base, accuracyM: 5 })).toBe('accept');
    expect(judgeFix(null, { ...base, accuracyM: 40 })).toBe('poor-accuracy');
  });
  it('ignores wobble under ~10 ft, accepts a real step', () => {
    expect(judgeFix(base, { ...north(1.5), time: base.time + 1000, accuracyM: 5 })).toBe('too-close');
    expect(judgeFix(base, { ...north(4), time: base.time + 3000, accuracyM: 5 })).toBe('accept');
  });
  it('worse accuracy needs a bigger step (no scribbling while standing under canopy)', () => {
    expect(judgeFix(base, { ...north(5), time: base.time + 3000, accuracyM: 14 })).toBe('too-close');
    expect(judgeFix(base, { ...north(9), time: base.time + 3000, accuracyM: 14 })).toBe('accept');
  });
  it('rejects a teleport', () => { expect(judgeFix(base, { ...north(300), time: base.time + 2000, accuracyM: 5 })).toBe('glitch'); });
});

describe('segments', () => {
  const a = [[-77.48, 42.4], [-77.48, 42.4 + 100 / 110540]];
  it('length of 100 m', () => { expect(segmentsLength([a])).toBeGreaterThan(99.5); expect(segmentsLength([a])).toBeLessThan(101); });
  it('geometry: nothing under 2 points; one segment is a LineString; several a MultiLineString', () => {
    expect(toGeometry([[[1, 1]]])).toBeNull();
    expect(toGeometry([a, [[1, 1]]])!.type).toBe('LineString');
    expect(toGeometry([a, a])!.type).toBe('MultiLineString');
  });
  it('round trip through fromGeometry', () => {
    expect(fromGeometry(toGeometry([a, a])!)).toEqual([a, a]);
    expect(fromGeometry({ type: 'Polygon', coordinates: [] })).toEqual([]);
  });
  it('durations', () => { expect(formatDuration(75)).toBe('1:15'); expect(formatDuration(3725)).toBe('1:02:05'); });
});

import { describe, expect, it } from 'vitest';
import { metersBetween } from '../util/geo';
import { averageSamples, NotEnoughFixes, type Sample } from './averaging';

const mk = (n: number, f: (i: number) => Partial<Sample>): Sample[] =>
  Array.from({ length: n }, (_, i) => ({ lon: -77.48, lat: 42.4, accuracyM: 5, time: 1000 + i, ...f(i) }));

describe('averageSamples', () => {
  it('averages symmetric noise back to the centre', () => {
    const d = 0.00002;
    const s = mk(4, (i) => ({ lon: -77.48 + (i % 2 ? d : -d), lat: 42.4 + (i < 2 ? d : -d) }));
    const r = averageSamples(s, { maxAcceptAccuracyM: 15 });
    expect(metersBetween([r.lon, r.lat], [-77.48, 42.4])).toBeLessThan(0.05);
    expect(r.spreadM).toBeGreaterThan(1.5); expect(r.samplesUsed).toBe(4); expect(r.lowQuality).toBe(false);
  });
  it('rejects samples worse than the threshold and reports counts', () => {
    const s = mk(6, (i) => ({ accuracyM: i < 4 ? 4 : 40, lon: i < 4 ? -77.48 : -77.47 }));
    const r = averageSamples(s, { maxAcceptAccuracyM: 15 });
    expect([r.samplesUsed, r.samplesRejected]).toEqual([4, 2]);
    expect(metersBetween([r.lon, r.lat], [-77.48, 42.4])).toBeLessThan(0.01);
  });
  it('weights better fixes more', () => {
    const s = [{ lon: -77.48, lat: 42.4, accuracyM: 2, time: 1 }, { lon: -77.4799, lat: 42.4, accuracyM: 10, time: 2 }, { lon: -77.4799, lat: 42.4, accuracyM: 10, time: 3 }];
    const r = averageSamples(s, { maxAcceptAccuracyM: 15 });
    expect(r.lon).toBeLessThan(-77.47993); // pulled toward the accurate fix
  });
  it('falls back to the best half with lowQuality when nothing meets the threshold', () => {
    const r = averageSamples(mk(6, (i) => ({ accuracyM: 30 + i })), { maxAcceptAccuracyM: 15 });
    expect(r.lowQuality).toBe(true); expect(r.samplesUsed).toBe(3);
  });
  it('drops duplicate timestamps and needs at least 3 fixes', () => {
    expect(() => averageSamples(mk(5, () => ({ time: 7 })), { maxAcceptAccuracyM: 15 })).toThrow(NotEnoughFixes);
    expect(() => averageSamples(mk(2, () => ({})), { maxAcceptAccuracyM: 15 })).toThrow(NotEnoughFixes);
  });
  it('median accuracy of used samples', () => {
    const r = averageSamples(mk(5, (i) => ({ accuracyM: [3, 4, 5, 6, 7][i] })), { maxAcceptAccuracyM: 15 });
    expect(r.accuracyM).toBe(5);
  });
});

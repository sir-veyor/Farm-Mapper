import { describe, expect, it } from 'vitest';
import { navigationInfo } from './navMath';

describe('navigationInfo', () => {
  const me = { lon: -77.48, lat: 42.4, accuracyM: 5 };
  it('distance and bearing to a point 100 m north-east-ish', () => {
    const r = navigationInfo(me, { lon: -77.48 + 70.7 / 82000, lat: 42.4 + 70.7 / 111000 });
    expect(r.distanceM).toBeGreaterThan(99); expect(r.distanceM).toBeLessThan(101);
    expect(r.bearingDeg).toBeGreaterThan(44); expect(r.bearingDeg).toBeLessThan(46);
    expect(r.arrived).toBe(false);
  });
  it('arrived when inside the GPS accuracy or 15 ft', () => {
    expect(navigationInfo(me, { lon: me.lon, lat: me.lat + 4 / 111000 }).arrived).toBe(true);
    expect(navigationInfo({ ...me, accuracyM: 20 }, { lon: me.lon, lat: me.lat + 15 / 111000 }).arrived).toBe(true);
    expect(navigationInfo({ ...me, accuracyM: 3 }, { lon: me.lon, lat: me.lat + 10 / 111000 }).arrived).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { metersBetween, normalizeBounds, padBounds, unionBounds } from './geo';

describe('geo', () => {
  it('normalizeBounds swaps, clamps and rejects', () => {
    expect(normalizeBounds([10, 5, -10, -5])).toEqual([-10, -5, 10, 5]);
    expect(normalizeBounds([-180, -90, 180, 90])).toEqual([-180, -85.0511, 180, 85.0511]);
    expect(normalizeBounds([1, 1, 1, 2])).toBeNull();
    expect(normalizeBounds([NaN, 0, 1, 1])).toBeNull();
    expect(normalizeBounds(null)).toBeNull();
  });
  it('unionBounds', () => {
    expect(unionBounds([[0, 0, 1, 1], [-1, 0.5, 0.5, 3]])).toEqual([-1, 0, 1, 3]);
    expect(unionBounds([])).toBeNull();
  });
  it('padBounds adds about the requested metres', () => {
    const b = padBounds([-77.5, 42.4, -77.4, 42.5], 3000);
    expect(metersBetween([-77.5, 42.45], [b[0], 42.45])).toBeGreaterThan(2950);
    expect(metersBetween([-77.5, 42.45], [b[0], 42.45])).toBeLessThan(3050);
    expect(metersBetween([-77.45, 42.5], [-77.45, b[3]])).toBeGreaterThan(2950);
  });
  it('metersBetween: 1 degree of latitude ~ 111.2 km', () => {
    expect(metersBetween([0, 0], [0, 1])).toBeGreaterThan(111000);
    expect(metersBetween([0, 0], [0, 1])).toBeLessThan(111400);
  });
});

import { featureMeasure, fitSafe, formatDistance, geometryBounds, polygonAreaM2 } from './geo';

describe('geo measures', () => {
  it('geometryBounds across geometry types', () => {
    expect(geometryBounds({ type: 'Point', coordinates: [1, 2] })).toEqual([1, 2, 1, 2]);
    expect(geometryBounds({ type: 'LineString', coordinates: [[0, 0], [2, 3]] })).toEqual([0, 0, 2, 3]);
    expect(geometryBounds({ type: 'MultiPolygon', coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]], [[[5, 5], [6, 5], [6, 6], [5, 5]]]] })).toEqual([0, 0, 6, 6]);
  });
  it('fitSafe widens degenerate bounds', () => {
    const b = fitSafe([1, 1, 1, 1]); expect(b[2]).toBeGreaterThan(b[0]);
  });
  it('polygon area ~ 100m x 100m = 1 ha, hole subtracts', () => {
    const dLat = 100 / 110540, dLon = 100 / (111320 * Math.cos((42.4 * Math.PI) / 180));
    const sq = [[-77.48, 42.4], [-77.48 + dLon, 42.4], [-77.48 + dLon, 42.4 + dLat], [-77.48, 42.4 + dLat], [-77.48, 42.4]];
    expect(polygonAreaM2([sq])).toBeGreaterThan(9900); expect(polygonAreaM2([sq])).toBeLessThan(10100);
    const hole = sq.map(([x, y]) => [-77.48 + (x + 77.48) / 2, 42.4 + (y - 42.4) / 2]);
    expect(polygonAreaM2([sq, hole])).toBeCloseTo(polygonAreaM2([sq]) * 0.75, -1);
  });
  it('featureMeasure and formatDistance', () => {
    expect(featureMeasure({ type: 'LineString', coordinates: [[0, 0], [0, 1]] }).lengthM).toBeGreaterThan(111000);
    expect(formatDistance(1500, 'metric')).toBe('1.50 km');
    expect(formatDistance(3, 'imperial')).toBe('9.8 ft');
  });
});

import { circlePolygon } from './geo';
describe('circlePolygon', () => {
  it('is closed and every vertex is ~radius from the centre', () => {
    const p = circlePolygon(-77.48, 42.4, 25);
    const ring = p.coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    for (const v of ring) expect(metersBetween([-77.48, 42.4], [v[0], v[1]])).toBeGreaterThan(24.5), expect(metersBetween([-77.48, 42.4], [v[0], v[1]])).toBeLessThan(25.5);
  });
});

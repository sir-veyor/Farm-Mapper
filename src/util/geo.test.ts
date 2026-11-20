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

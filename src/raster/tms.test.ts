import { describe, expect, it } from 'vitest';
import { detectScheme, extentToBounds, tileLonLatBounds, xyzToTmsRow } from './tms';

describe('tms', () => {
  it('flips rows (your DEM: z12 y=1514 <-> stored row 2581)', () => {
    expect(xyzToTmsRow(12, 1514)).toBe(2581);
    expect(xyzToTmsRow(12, 2581)).toBe(1514);
    expect(xyzToTmsRow(0, 0)).toBe(0);
  });
  const demBounds: [number, number, number, number] = [-77.5008, 42.3805, -77.4618, 42.4177];
  it('detects TMS for the DEM sample tile', () => {
    expect(detectScheme(12, 1166, 2581, demBounds)).toBe('tms');
  });
  it('detects XYZ when rows are stored unflipped', () => {
    expect(detectScheme(12, 1166, 1514, demBounds)).toBe('xyz');
  });
  it('tile bounds of DEM z12 tile contain the farm centre', () => {
    const [w, s, e, n] = tileLonLatBounds(12, 1166, 1514);
    expect(-77.481).toBeGreaterThan(w); expect(-77.481).toBeLessThan(e);
    expect(42.399).toBeGreaterThan(s); expect(42.399).toBeLessThan(n);
  });
  it('extentToBounds matches tile bounds for a single tms tile', () => {
    expect(extentToBounds(12, 1166, 1166, 2581, 2581, 'tms')).toEqual(tileLonLatBounds(12, 1166, 1514));
  });
});

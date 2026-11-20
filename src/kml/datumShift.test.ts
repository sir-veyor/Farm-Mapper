import { describe, expect, it } from 'vitest';
import { shiftGeometry, shiftPosition } from './datumShift';

describe('datumShift', () => {
  it('matches the PROJ-computed shift at the parcel', () => {
    const [lon, lat] = shiftPosition([-77.4813, 42.3991]);
    expect(lon).toBeCloseTo(-77.481309, 6);
    expect(lat).toBeCloseTo(42.39911, 6);
  });
  it('shifts nested geometry and keeps altitude', () => {
    const g = shiftGeometry({ type: 'LineString', coordinates: [[-77.4813, 42.3991, 5], [-77.48, 42.4]] });
    expect(g.coordinates[0][2]).toBe(5);
    expect(g.coordinates[1][0]).toBeLessThan(-77.48);
  });
});

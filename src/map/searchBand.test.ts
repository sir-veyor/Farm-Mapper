import { describe, expect, it } from 'vitest';
import { APP_DEFAULT_STYLE } from '../config';
import type { VectorFeature } from '../types';
import { bandPixelWidth, bandSpec, vectorLayerSpecs } from './styleExpressions';
import { isInteractiveId, vectorLayerIds } from './layerIds';
import { layerToGeoJSON } from './toGeoJSON';

describe('search band', () => {
  it('stays the same size on the ground: 60 ft is ~83 px at zoom 18, doubling with each zoom', () => {
    expect(bandPixelWidth(60, 18)).toBeGreaterThan(80); expect(bandPixelWidth(60, 18)).toBeLessThan(86);
    expect(bandPixelWidth(60, 19) / bandPixelWidth(60, 18)).toBeCloseTo(2, 6);
    expect(bandPixelWidth(100, 18) / bandPixelWidth(30, 18)).toBeCloseTo(100 / 30, 6);
  });
  it('is only built when a width is set, and sits first so lines draw over it', () => {
    expect(vectorLayerSpecs('L', 's', 1, true, false, 0).some((x) => x.id.endsWith(':band'))).toBe(false);
    const specs = vectorLayerSpecs('L', 's', 1, true, false, 60);
    expect(specs[0].id).toBe('v:L:band');
    expect(bandSpec(vectorLayerIds('L'), 's', 60, 1, 'visible').type).toBe('line');
  });
  it('taps pass through the band', () => { expect(isInteractiveId('v:L:band')).toBe(false); expect(isInteractiveId('v:L:line')).toBe(true); });
  it('only recorded tracks are flagged for the band', () => {
    const base = { layerId: 'L', notes: '', style: {}, createdAt: '', updatedAt: '' } as const;
    const track: VectorFeature = { ...base, id: 't', name: 'Track', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, source: { kind: 'track', startedAt: '', distanceM: 1, durationS: 1 } };
    const trail: VectorFeature = { ...track, id: 'r', source: { kind: 'import', fileName: 'a', importedAt: '', datumShiftApplied: false } };
    const fc = layerToGeoJSON({ defaultStyle: APP_DEFAULT_STYLE }, [], [track, trail]);
    expect(fc.features.map((f) => f.properties?._track)).toEqual([1, 0]);
  });
});

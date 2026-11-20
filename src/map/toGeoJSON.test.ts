import { describe, expect, it } from 'vitest';
import { APP_DEFAULT_STYLE } from '../config';
import type { Poi, VectorFeature } from '../types';
import { layerToGeoJSON } from './toGeoJSON';

const layer = { defaultStyle: { ...APP_DEFAULT_STYLE, symbolColor: '#112233' as const, symbol: 'tree' as const } };
const poi = (over: Partial<Poi> = {}): Poi => ({ id: 'p1', layerId: 'L', name: 'Stand 1', notes: '', lon: -77.48, lat: 42.4,
  origin: 'map-tap', style: {}, createdAt: '', updatedAt: '', ...over });
const feat: VectorFeature = { id: 'f1', layerId: 'L', name: 'Trail', notes: '', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
  style: { strokeColor: '#00ff00', showLabels: false }, source: { kind: 'import', fileName: 'a.kml', importedAt: '', datumShiftApplied: false },
  createdAt: '', updatedAt: '' };

describe('layerToGeoJSON', () => {
  it('resolves layer default and item override into props', () => {
    const fc = layerToGeoJSON(layer, [poi(), poi({ id: 'p2', style: { symbolColor: '#ffffff', showLabels: false } })], [feat]);
    expect(fc.features).toHaveLength(3);
    const [t, a, b] = fc.features;
    expect(t.properties).toMatchObject({ _kind: 'feature', _stroke: '#00ff00', _label: '' });
    expect(a.properties).toMatchObject({ _kind: 'poi', _icon: 'poi|tree|#112233', _label: 'Stand 1' });
    expect(b.properties).toMatchObject({ _icon: 'poi|tree|#ffffff', _label: '' });
    expect(a.geometry).toEqual({ type: 'Point', coordinates: [-77.48, 42.4] });
  });
  it('recolours non-overridden items when the layer default changes', () => {
    const l2 = { defaultStyle: { ...layer.defaultStyle, symbolColor: '#00ff00' as const } };
    expect(layerToGeoJSON(l2, [poi()], []).features[0].properties?._icon).toBe('poi|tree|#00ff00');
  });
});

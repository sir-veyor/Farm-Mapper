// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { APP_DEFAULT_STYLE } from '../config';
import { parseKml } from '../kml/kmlParse';
import type { Layer, Poi, VectorFeature } from '../types';
import type { ExportLayer } from './buildExportModel';
import { exportFileName } from './exportService';
import { toGeoJsonString } from './geojsonExport';
import { cdata, esc, writeKml } from './kmlWriter';

const layer: Layer = { id: 'L', name: 'Tree <Stands> & more', kind: 'vector', order: 0, visible: true, frozen: true, locked: true, opacity: 1,
  defaultStyle: { ...APP_DEFAULT_STYLE, symbolColor: '#112233' }, createdAt: '', updatedAt: '' };
const poi: Poi = { id: 'p', layerId: 'L', name: 'Stand "A"', notes: 'Oak ridge ]]> west', lon: -77.4805, lat: 42.3995, origin: 'gps-averaged',
  gps: { accuracyM: 4.26, fixTime: '' }, style: { symbol: 'treestand', symbolColor: '#e03131' }, extra: { species: 'deer' }, createdAt: '2026-01-02T03:04:05Z', updatedAt: '' };
const trail: VectorFeature = { id: 'f', layerId: 'L', name: 'Trail', notes: 'north loop', geometry: { type: 'LineString', coordinates: [[-77.481, 42.399], [-77.48, 42.4]] },
  style: { strokeColor: '#ff8000', strokeWidth: 4, strokeOpacity: 0.5 }, source: { kind: 'import', fileName: 'a.kml', importedAt: '', datumShiftApplied: false }, createdAt: '', updatedAt: '' };
const area: VectorFeature = { ...trail, id: 'a', name: 'Field', notes: '', geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] }, style: { fillOpacity: 0 } };
const model: ExportLayer[] = [{ layer, pois: [poi], features: [trail, area] }];
const kml = (notes = true) => writeKml(model, { docName: 'Test', includeNotes: notes, iconHref: (s, c) => `files/icon-${s}-${c.slice(1)}.png` });

describe('kmlWriter', () => {
  it('escapes names, splits CDATA terminators, closes rings, and uses aabbggrr colours', () => {
    const x = kml();
    expect(x).toContain('Tree &lt;Stands&gt; &amp; more');
    expect(x).toContain('Stand &quot;A&quot;');
    expect(x).toContain(cdata('Oak ridge ]]> west'));
    expect(x).toContain('<color>800080ff</color>'); // #ff8000 at 50% => 80 00 80 ff
    expect(x).toContain('<fill>0</fill>');
    expect(x).toContain('0.0000000,0.0000000,0'); // ring closed back to the first vertex
    expect(x.match(/0\.0000000,0\.0000000,0/g)!.length).toBe(2);
    expect(esc('a\u0001b')).toBe('ab');
  });
  it('is well-formed XML and omits notes when asked', () => {
    const doc = new DOMParser().parseFromString(kml(false), 'text/xml');
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    expect(kml(false)).not.toContain('<description>');
    expect(kml(true)).toContain('<description>');
  });
  it('plain KML falls back to a tinted pushpin', () => {
    const x = writeKml(model, { docName: 'T', includeNotes: true, iconHref: () => null });
    expect(x).toContain('wht-pushpin.png'); expect(x).toContain('<color>ff3131e0</color>'); // #e03131
  });
  it('round-trips through our own importer: geometry, notes, colours, points', () => {
    const r = parseKml(kml(), { fileName: 'x.kml', splitFolders: false, applyShift: false });
    const g = r.groups[0];
    // Known limitation: a note containing the literal text "]]>" is written as valid split CDATA, but togeojson
    // only reads the first fragment on re-import, so only the prefix survives a round trip.
    expect(g.pois[0]).toMatchObject({ name: 'Stand "A"', notes: expect.stringContaining('Oak ridge') });
    expect(g.pois[0].lon).toBeCloseTo(-77.4805, 6);
    const t = g.features.find((f) => f.name === 'Trail')!;
    expect(t.style).toMatchObject({ strokeColor: '#ff8000', strokeWidth: 4 });
    expect(t.style!.strokeOpacity).toBeCloseTo(0.5, 1);
    expect(t.notes).toBe('north loop');
    const a = g.features.find((f) => f.name === 'Field')!;
    expect(a.style!.fillOpacity).toBe(0);
    expect((a.geometry as GeoJSON.Polygon).coordinates[0]).toHaveLength(5);
  });
});

describe('geojson export', () => {
  it('has simplestyle keys, accuracy, notes toggle', () => {
    const fc = JSON.parse(toGeoJsonString(model, { includeNotes: true }));
    expect(fc.features).toHaveLength(3);
    const p = fc.features.find((f: GeoJSON.Feature) => f.geometry.type === 'Point');
    expect(p.properties).toMatchObject({ name: 'Stand "A"', layer: layer.name, origin: 'gps-averaged', accuracy_m: 4.3, 'marker-color': '#e03131', 'marker-symbol': 'treestand', x_species: 'deer', notes: 'Oak ridge ]]> west' });
    const l = fc.features.find((f: GeoJSON.Feature) => f.geometry.type === 'LineString');
    expect(l.properties).toMatchObject({ stroke: '#ff8000', 'stroke-width': 4, 'stroke-opacity': 0.5 });
    expect(JSON.parse(toGeoJsonString(model, { includeNotes: false })).features[0].properties.notes).toBeUndefined();
  });
});

describe('file names', () => {
  it('parcel-export-YYYYMMDD-HHmm.ext', () => {
    expect(exportFileName('kmz', new Date(2026, 10, 20, 14, 5))).toBe('parcel-export-20261120-1405.kmz');
  });
});

// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { ensureSeed } from '../db/seed';
import { importKml, summarize } from './kmlImport';
import { parseKml } from './kmlParse';
import { KmlError, unpackKmz } from './kmzUnpack';

const sample = readFileSync(path.join(import.meta.dirname, '__fixtures__/sample.kml'), 'utf8');
const opts = { fileName: 'farm.kml', splitFolders: false, applyShift: false };

describe('parseKml', () => {
  it('maps lines, polygons (with hole), points, multigeometry; reports unsupported items', () => {
    const r = parseKml(sample, opts);
    expect(r.groups).toHaveLength(1);
    const g = r.groups[0];
    expect(g.name).toBe('Farm test');
    expect(g.pois.map((p) => p.name).sort()).toEqual(['Loose point', 'Multi (1)', 'Stand 1']);
    expect(g.features.map((f) => f.name).sort()).toEqual(['Boundary', 'Multi (2)', 'North loop']);
    expect(r.skipped).toMatchObject({ 'NetworkLink (needs internet)': 1, 'GroundOverlay (image overlay)': 1, 'placemark without a location': 1 });
    const boundary = g.features.find((f) => f.name === 'Boundary')!;
    expect((boundary.geometry as GeoJSON.Polygon).coordinates).toHaveLength(2); // outer + hole
  });
  it('converts styles: colours, widths, opacity; strips altitude; cleans HTML notes', () => {
    const g = parseKml(sample, opts).groups[0];
    const trail = g.features.find((f) => f.name === 'North loop')!;
    expect(trail.style).toMatchObject({ strokeColor: '#ff8000', strokeWidth: 4, strokeOpacity: 1 });
    expect((trail.geometry as GeoJSON.LineString).coordinates[0]).toHaveLength(2);
    expect(trail.notes).toBe('Easy walk\n2 km & flat');
    const b = g.features.find((f) => f.name === 'Boundary')!;
    expect(b.style).toMatchObject({ strokeColor: '#ff0000', fillColor: '#00ff00' });
    expect(b.style!.fillOpacity).toBeCloseTo(0.25, 1);
    const stand = g.pois.find((p) => p.name === 'Stand 1')!;
    expect(stand.style!.symbolColor).toBe('#0000ff');
    expect(stand.extra).toEqual({ species: 'deer' });
  });
  it('splits top-level folders into groups', () => {
    const r = parseKml(sample, { ...opts, splitFolders: true });
    expect(r.groups.map((g) => g.name).sort()).toEqual(['Farm test', 'Stands', 'Trails']);
  });
  it('applies the NAD83 shift only when asked', () => {
    const plain = parseKml(sample, opts).groups[0].pois.find((p) => p.name === 'Stand 1')!;
    const shifted = parseKml(sample, { ...opts, applyShift: true }).groups[0].pois.find((p) => p.name === 'Stand 1')!;
    expect(plain.lon).toBe(-77.4805);
    expect(shifted.lon).toBeLessThan(plain.lon); expect(shifted.lat).toBeGreaterThan(plain.lat);
  });
  it('rejects non-KML and skips invalid coordinates', () => {
    expect(() => parseKml('this is not xml <<', opts)).toThrow(KmlError);
    expect(() => parseKml('<html><body/></html>', opts)).toThrow(KmlError);
    const bad = `<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>x</name><Point><coordinates>-77,95</coordinates></Point></Placemark>
      <Placemark><name>ring</name><Polygon><outerBoundaryIs><LinearRing><coordinates>0,0 1,1</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>`;
    const r = parseKml(bad, opts);
    expect(r.groups).toHaveLength(0); expect(r.skipped['invalid coordinates']).toBe(1); expect(Object.values(r.skipped).reduce((a, b) => a + b, 0)).toBe(2); // the bad ring is dropped by the parser itself
  });
  it('keeps fill 0 (outline-only polygons)', () => {
    const k = `<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Style id="s"><PolyStyle><color>00ffffff</color></PolyStyle></Style><Placemark><styleUrl>#s</styleUrl><Polygon><outerBoundaryIs><LinearRing><coordinates>0,0 1,0 1,1 0,1 0,0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>`;
    expect(parseKml(k, opts).groups[0].features[0].style!.fillOpacity).toBe(0);
  });
});

async function kmz(files: Record<string, string>): Promise<ArrayBuffer> {
  const z = new JSZip(); for (const [n, c] of Object.entries(files)) z.file(n, c);
  return (await z.generateAsync({ type: 'arraybuffer' }));
}

describe('unpackKmz', () => {
  it('prefers doc.kml, warns about extras and images', async () => {
    const u = await unpackKmz(await kmz({ 'doc.kml': sample, 'other.kml': sample, 'files/icon.png': 'x' }));
    expect(u.kmlText).toContain('Farm test');
    expect(u.warnings.join(' ')).toMatch(/other .kml/); expect(u.warnings.join(' ')).toMatch(/image/);
  });
  it('finds a differently named, uppercase or nested kml', async () => {
    expect((await unpackKmz(await kmz({ 'sub/DEEP.KML': 'deep', 'TOP.KML': 'top' }))).kmlText).toBe('top');
  });
  it('rejects zips without kml and non-zips', async () => {
    await expect(unpackKmz(await kmz({ 'readme.txt': 'hi' }))).rejects.toBeInstanceOf(KmlError);
    await expect(unpackKmz(new TextEncoder().encode('not a zip').buffer as ArrayBuffer)).rejects.toBeInstanceOf(KmlError);
  });
});

describe('importKml', () => {
  beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())); await ensureSeed(); });
  it('creates layers and items, returns a readable summary', async () => {
    const file = new File([await kmz({ 'doc.kml': sample })], 'farm.kmz');
    const s = await importKml(file, { splitFolders: true, applyShift: false });
    expect(s.layers.sort()).toEqual(['Farm test', 'farm: Stands', 'farm: Trails'].sort());
    expect(await db.pois.count()).toBe(3); expect(await db.features.count()).toBe(3);
    expect(summarize(s)).toMatch(/Imported 3 points, 2 lines, 1 polygon/);
    expect(summarize(s)).toMatch(/NetworkLink/);
    expect(s.bounds![0]).toBeLessThan(-77.48);
  });
  it('errors (and creates no layer) when nothing is importable', async () => {
    const before = await db.layers.count();
    await expect(importKml(new File(['<kml xmlns="http://www.opengis.net/kml/2.2"><Document/></kml>'], 'e.kml'), { splitFolders: false, applyShift: false })).rejects.toBeInstanceOf(KmlError);
    expect(await db.layers.count()).toBe(before);
  });
});

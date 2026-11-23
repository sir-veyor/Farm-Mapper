import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import initSqlJs from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildRasterFields, MbtilesError, pngTileSize, sniffFormat } from './mbtilesMeta';
import { MbtilesReader, setSqlLocator } from './mbtilesReader';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0]); // width 256
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const dist = path.dirname(createRequire(import.meta.url).resolve('sql.js'));

async function makeMbtiles(rows: [number, number, number, Uint8Array][], meta: Record<string, string>): Promise<Blob> {
  const SQL = await initSqlJs({ locateFile: (f) => path.join(dist, f), useOldExtensionFunctions: false });
  const db = new SQL.Database();
  db.run('CREATE TABLE metadata (name text, value text); CREATE TABLE tiles (zoom_level int, tile_column int, tile_row int, tile_data blob);');
  for (const [k, v] of Object.entries(meta)) db.run('INSERT INTO metadata VALUES (?,?)', [k, v]);
  for (const r of rows) db.run('INSERT INTO tiles VALUES (?,?,?,?)', r);
  const bytes = db.export();
  db.close();
  return new Blob([bytes as BlobPart]);
}

beforeAll(() => { setSqlLocator((f) => path.join(dist, f)); });

describe('format helpers', () => {
  it('sniffs formats', () => {
    expect(sniffFormat(PNG)).toBe('png');
    expect(sniffFormat(WEBP)).toBe('webp');
    expect(sniffFormat(Uint8Array.from([0xff, 0xd8, 0xff]))).toBe('jpg');
    expect(sniffFormat(Uint8Array.from([1, 2, 3, 4]))).toBeNull();
    expect(pngTileSize(PNG)).toBe(256);
  });
});

describe('MbtilesReader', () => {
  it('applies the TMS flip: XYZ request y=1514 finds stored row 2581', async () => {
    const blob = await makeMbtiles([[12, 1166, 2581, PNG]], {
      format: 'png', bounds: '-77.5008,42.3805,-77.4618,42.4177', minzoom: '12', maxzoom: '12' });
    const r = await MbtilesReader.open(blob);
    expect(r.getTile(12, 1166, 1514)).toEqual(PNG);
    expect(r.getTile(12, 1166, 2581)).toBeNull(); // un-flipped request must miss
    expect(r.getTile(12, 0, 0)).toBeNull();
    r.close();
  });
  it('detects an XYZ-stored file and still serves it', async () => {
    const blob = await makeMbtiles([[12, 1166, 1514, PNG]], { format: 'png', bounds: '-77.5008,42.3805,-77.4618,42.4177' });
    const r = await MbtilesReader.open(blob);
    const meta = r.metadata();
    const probe = r.probe(meta);
    expect(probe.scheme).toBe('xyz');
    r.close();
    const r2 = await MbtilesReader.open(blob, probe.scheme);
    expect(r2.getTile(12, 1166, 1514)).toEqual(PNG);
    r2.close();
  });
  it('falls back to probed zooms, bounds and sniffed format when metadata is missing', async () => {
    const blob = await makeMbtiles([[12, 1166, 2581, WEBP], [13, 2332, 5163, WEBP]], { format: 'png' });
    const r = await MbtilesReader.open(blob);
    const f = buildRasterFields(r.metadata(), r.probe(r.metadata()), 'x.mbtiles', 10);
    r.close();
    expect(f.format).toBe('webp'); // bytes beat the label
    expect([f.minzoom, f.maxzoom]).toEqual([12, 13]);
    expect(f.bounds[0]).toBeLessThan(-77.4); expect(f.bounds[1]).toBeGreaterThan(42.3);
    expect(f.rasterType).toBe('baselayer');
    expect(f.name).toBe('x');
  });
  it('rejects non-SQLite files, files without tiles, empty tiles, and vector tiles', async () => {
    await expect(MbtilesReader.open(new Blob(['hello world, definitely not sqlite']))).rejects.toBeInstanceOf(MbtilesError);
    const SQL = await initSqlJs({ locateFile: (f) => path.join(dist, f), useOldExtensionFunctions: false });
    const d = new SQL.Database(); d.run('CREATE TABLE foo (a int)');
    await expect(MbtilesReader.open(new Blob([d.export() as BlobPart]))).rejects.toBeInstanceOf(MbtilesError);
    const empty = await MbtilesReader.open(await makeMbtiles([], {}));
    expect(() => empty.probe({})).toThrow(MbtilesError);
    empty.close();
    const pbf = await MbtilesReader.open(await makeMbtiles([[1, 0, 0, Uint8Array.from([0x1f, 0x8b, 8])]], { format: 'pbf' }));
    expect(() => buildRasterFields(pbf.metadata(), pbf.probe(pbf.metadata()), 'v.mbtiles', 1)).toThrow(/vector/i);
    pbf.close();
  });
  it('swaps reversed metadata bounds and zooms', async () => {
    const blob = await makeMbtiles([[12, 1166, 2581, PNG]], { format: 'png', bounds: '-77.46,42.41,-77.50,42.38', minzoom: '14', maxzoom: '12' });
    const r = await MbtilesReader.open(blob);
    const f = buildRasterFields(r.metadata(), r.probe(r.metadata()), 'a.mbtiles', 1);
    r.close();
    expect(f.bounds).toEqual([-77.5, 42.38, -77.46, 42.41]);
    expect([f.minzoom, f.maxzoom]).toEqual([12, 14]);
  });
  it('reads the real DEM sample when present', async () => {
    const p = process.env.DEM_PATH;
    if (!p) return;
    const r = await MbtilesReader.open(new Blob([readFileSync(p)]));
    const meta = r.metadata(); const probe = r.probe(meta);
    expect(probe.scheme).toBe('tms');
    expect(r.getTile(12, 1166, 1514)?.length).toBeGreaterThan(100);
    r.close();
  });
});

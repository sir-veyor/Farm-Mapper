import initSqlJs, { type Database, type SqlJsStatic, type Statement } from 'sql.js';
import { normalizeBounds } from '../util/geo';
import { MbtilesError, type MbtilesProbe } from './mbtilesMeta';
import { detectScheme, extentToBounds, xyzToTmsRow, type Scheme } from './tms';

let locate: (file: string) => string = (f) => `${import.meta.env.BASE_URL}${f}`;
/** Tests (node) point this at node_modules/sql.js/dist. */
export const setSqlLocator = (fn: (file: string) => string): void => { locate = fn; sqlPromise = null; };

let sqlPromise: Promise<SqlJsStatic> | null = null;
const getSql = () => (sqlPromise ??= initSqlJs({ locateFile: locate, useOldExtensionFunctions: false }));

const TILE_SQL = 'SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?';

export class MbtilesReader {
  private stmt: Statement | null;

  private constructor(private db: Database, public scheme: Scheme) {
    this.stmt = db.prepare(TILE_SQL);
  }

  /** Loads the whole file into memory (fine for tens of MB). Throws MbtilesError for non-MBTiles files. */
  static async open(blob: Blob, scheme: Scheme = 'tms'): Promise<MbtilesReader> {
    const header = await blob.slice(0, 16).text();
    if (!header.startsWith('SQLite format 3')) throw new MbtilesError('Not an MBTiles (SQLite) file.');
    const SQL = await getSql();
    const db = new SQL.Database(new Uint8Array(await blob.arrayBuffer()));
    try {
      const found = db.exec("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name='tiles'");
      if (!found.length) throw new MbtilesError('Not an MBTiles file: it has no "tiles" table.');
      return new MbtilesReader(db, scheme);
    } catch (e) {
      db.close();
      throw e instanceof MbtilesError ? e : new MbtilesError('Could not read this file as MBTiles.');
    }
  }

  metadata(): Record<string, string> {
    const out: Record<string, string> = {};
    try {
      const r = this.db.exec('SELECT name, value FROM metadata');
      for (const [k, v] of r[0]?.values ?? []) out[String(k)] = String(v ?? '');
    } catch { /* no metadata table: fall back to probing */ }
    return out;
  }

  /** Reads zoom range, tile extent, a sample tile, and detects TMS vs XYZ using declared bounds if any. */
  probe(meta: Record<string, string>): MbtilesProbe {
    const zr = this.db.exec('SELECT MIN(zoom_level), MAX(zoom_level) FROM tiles')[0]?.values[0];
    if (!zr || zr[0] === null) throw new MbtilesError('The file contains no tiles.');
    const [minzoom, maxzoom] = [Number(zr[0]), Number(zr[1])];

    const declared = normalizeBounds((meta.bounds ?? '').split(',').map((s) => Number(s.trim())));
    let scheme: Scheme = 'tms';
    const lo = this.db.exec(`SELECT tile_column, tile_row FROM tiles WHERE zoom_level=${minzoom} LIMIT 1`)[0]?.values[0];
    if (declared && lo) scheme = detectScheme(minzoom, Number(lo[0]), Number(lo[1]), declared);

    const ex = this.db.exec(
      `SELECT MIN(tile_column), MAX(tile_column), MIN(tile_row), MAX(tile_row) FROM tiles WHERE zoom_level=${maxzoom}`,
    )[0]?.values[0];
    const extentBounds = ex
      ? extentToBounds(maxzoom, Number(ex[0]), Number(ex[1]), Number(ex[2]), Number(ex[3]), scheme)
      : null;

    const sample = this.db.exec(`SELECT tile_data FROM tiles WHERE zoom_level=${maxzoom} LIMIT 1`)[0]?.values[0]?.[0];
    return { minzoom, maxzoom, sampleTile: sample instanceof Uint8Array ? sample : null, extentBounds, scheme };
  }

  /** Request in XYZ coordinates (what the map asks for); the stored row is flipped when scheme is 'tms'. */
  getTile(z: number, x: number, y: number): Uint8Array | null {
    const stmt = this.stmt;
    if (!stmt) return null;
    stmt.bind([z, x, this.scheme === 'tms' ? xyzToTmsRow(z, y) : y]);
    try {
      if (!stmt.step()) return null;
      const data = stmt.get()[0];
      return data instanceof Uint8Array ? data : null;
    } finally {
      stmt.reset();
    }
  }

  close(): void {
    this.stmt?.free();
    this.stmt = null;
    this.db.close();
  }
}

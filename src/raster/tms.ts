import type { Bounds } from '../util/geo';

export type Scheme = 'tms' | 'xyz';

/** MBTiles stores TMS rows (origin bottom-left); web maps request XYZ rows (origin top-left). Self-inverse. */
export const xyzToTmsRow = (z: number, y: number): number => 2 ** z - 1 - y;
export const tmsRowToXyz = xyzToTmsRow;

const lonAt = (z: number, x: number) => (x / 2 ** z) * 360 - 180;
const latAt = (z: number, y: number) =>
  (Math.atan(Math.sinh(Math.PI - (2 * Math.PI * y) / 2 ** z)) * 180) / Math.PI;

/** WGS84 bounds of an XYZ tile. */
export const tileLonLatBounds = (z: number, x: number, y: number): Bounds =>
  [lonAt(z, x), latAt(z, y + 1), lonAt(z, x + 1), latAt(z, y)];

const intersects = (a: Bounds, b: Bounds) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

/** Which interpretation of a stored row lands inside the declared bounds? TMS wins ties (the spec). */
export function detectScheme(z: number, x: number, storedRow: number, bounds: Bounds): Scheme {
  if (intersects(tileLonLatBounds(z, x, tmsRowToXyz(z, storedRow)), bounds)) return 'tms';
  if (intersects(tileLonLatBounds(z, x, storedRow), bounds)) return 'xyz';
  return 'tms';
}

/** WGS84 bounds covering a stored tile extent at one zoom. */
export function extentToBounds(
  z: number, xMin: number, xMax: number, rowMin: number, rowMax: number, scheme: Scheme,
): Bounds {
  const yTop = scheme === 'tms' ? tmsRowToXyz(z, rowMax) : rowMin;
  const yBottom = scheme === 'tms' ? tmsRowToXyz(z, rowMin) : rowMax;
  return [lonAt(z, xMin), latAt(z, yBottom + 1), lonAt(z, xMax + 1), latAt(z, yTop)];
}

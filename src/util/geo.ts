export type Bounds = [west: number, south: number, east: number, north: number];

const MAX_LAT = 85.0511;

/** Swaps reversed corners, clamps to the Web-Mercator world, returns null if still degenerate. */
export function normalizeBounds(b: readonly number[] | null | undefined): Bounds | null {
  if (!b || b.length !== 4 || b.some((v) => !Number.isFinite(v))) return null;
  let [w, s, e, n] = b as [number, number, number, number];
  if (w > e) [w, e] = [e, w];
  if (s > n) [s, n] = [n, s];
  w = Math.max(-180, w); e = Math.min(180, e);
  s = Math.max(-MAX_LAT, s); n = Math.min(MAX_LAT, n);
  return w < e && s < n ? [w, s, e, n] : null;
}

export function unionBounds(list: Bounds[]): Bounds | null {
  if (!list.length) return null;
  return list.reduce<Bounds>(
    (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])],
    [...list[0]],
  );
}

export function padBounds(b: Bounds, meters: number): Bounds {
  const dLat = meters / 111320;
  const midLat = (b[1] + b[3]) / 2;
  const dLon = meters / (111320 * Math.cos((midLat * Math.PI) / 180));
  return normalizeBounds([b[0] - dLon, b[1] - dLat, b[2] + dLon, b[3] + dLat]) ?? b;
}

/** Haversine distance in metres between [lon,lat] points. */
export function metersBetween(a: readonly [number, number], b: readonly [number, number]): number {
  const R = 6371008.8, rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

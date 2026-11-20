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

type Pos = number[];

function eachPosition(g: GeoJSON.Geometry, fn: (p: Pos) => void): void {
  switch (g.type) {
    case 'Point': fn(g.coordinates); break;
    case 'MultiPoint': case 'LineString': g.coordinates.forEach(fn); break;
    case 'MultiLineString': case 'Polygon': g.coordinates.forEach((r) => r.forEach(fn)); break;
    case 'MultiPolygon': g.coordinates.forEach((p) => p.forEach((r) => r.forEach(fn))); break;
    case 'GeometryCollection': g.geometries.forEach((x) => eachPosition(x, fn)); break;
  }
}

export function geometryBounds(g: GeoJSON.Geometry): Bounds | null {
  let b: Bounds | null = null;
  eachPosition(g, (p) => {
    b = b
      ? [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])]
      : [p[0], p[1], p[0], p[1]];
  });
  return b;
}

/** Bounds of a set that may be a single point (widened slightly so fitBounds still works). */
export function fitSafe(b: Bounds): Bounds {
  return b[0] === b[2] || b[1] === b[3] ? [b[0] - 0.0005, b[1] - 0.0004, b[2] + 0.0005, b[3] + 0.0004] : b;
}

export function lineLengthM(coords: Pos[]): number {
  let t = 0;
  for (let i = 1; i < coords.length; i++) t += metersBetween([coords[i - 1][0], coords[i - 1][1]], [coords[i][0], coords[i][1]]);
  return t;
}

/** Planar area (m2) of a polygon ring set using a local equirectangular projection. Holes subtract. */
export function polygonAreaM2(rings: Pos[][]): number {
  if (!rings.length || !rings[0].length) return 0;
  const [lon0, lat0] = rings[0][0];
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110540;
  const area = (r: Pos[]) => {
    let a = 0;
    for (let i = 0; i < r.length; i++) {
      const [x1, y1] = [(r[i][0] - lon0) * kx, (r[i][1] - lat0) * ky];
      const j = (i + 1) % r.length;
      const [x2, y2] = [(r[j][0] - lon0) * kx, (r[j][1] - lat0) * ky];
      a += x1 * y2 - x2 * y1;
    }
    return Math.abs(a) / 2;
  };
  return rings.reduce((s, r, i) => s + (i === 0 ? area(r) : -area(r)), 0);
}

export function featureMeasure(g: GeoJSON.Geometry): { lengthM?: number; areaM2?: number } {
  if (g.type === 'LineString') return { lengthM: lineLengthM(g.coordinates) };
  if (g.type === 'MultiLineString') return { lengthM: g.coordinates.reduce((s, l) => s + lineLengthM(l), 0) };
  if (g.type === 'Polygon') return { areaM2: polygonAreaM2(g.coordinates), lengthM: lineLengthM(g.coordinates[0] ?? []) };
  if (g.type === 'MultiPolygon') {
    return { areaM2: g.coordinates.reduce((s, p) => s + polygonAreaM2(p), 0),
      lengthM: g.coordinates.reduce((s, p) => s + lineLengthM(p[0] ?? []), 0) };
  }
  return {};
}

export function formatDistance(m: number, units: 'metric' | 'imperial'): string {
  if (units === 'imperial') {
    const ft = m * 3.28084;
    return ft >= 1000 ? `${(ft / 5280).toFixed(2)} mi` : `${ft.toFixed(ft < 10 ? 1 : 0)} ft`;
  }
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m.toFixed(m < 10 ? 1 : 0)} m`;
}

export const formatAcres = (m2: number): string => `${(m2 / 4046.8564224).toFixed(2)} ac / ${(m2 / 10000).toFixed(2)} ha`;

/** Closed ring approximating a circle of `radiusM` metres around a point. */
export function circlePolygon(lon: number, lat: number, radiusM: number, steps = 64): GeoJSON.Polygon {
  const ring: number[][] = [];
  const dLat = radiusM / 110540, dLon = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i < steps; i++) {
    const a = (2 * Math.PI * i) / steps;
    ring.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  ring.push(ring[0]);
  return { type: 'Polygon', coordinates: [ring] };
}

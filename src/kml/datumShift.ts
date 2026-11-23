import { NAD83_TO_WGS84_SHIFT } from '../config';

/** Shifts a NAD83(2011) lon/lat to WGS84 (G2139) using the parcel constant. Valid near the parcel only. */
export function shiftPosition(p: number[]): number[] {
  const [lon, lat] = p;
  return [
    lon + NAD83_TO_WGS84_SHIFT.dEastM / (111320 * Math.cos((lat * Math.PI) / 180)),
    lat + NAD83_TO_WGS84_SHIFT.dNorthM / 110540,
    ...p.slice(2),
  ];
}

export function shiftGeometry<G extends GeoJSON.Geometry>(g: G): G {
  const map = (c: unknown): unknown => (Array.isArray(c) && typeof c[0] === 'number' ? shiftPosition(c as number[]) : (c as unknown[]).map(map));
  if (g.type === 'GeometryCollection') return { ...g, geometries: g.geometries.map(shiftGeometry) };
  return { ...g, coordinates: map((g as { coordinates: unknown }).coordinates) } as G;
}

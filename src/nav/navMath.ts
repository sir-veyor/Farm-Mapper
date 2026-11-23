import { bearingDeg, metersBetween } from '../util/geo';

export interface NavInfo { distanceM: number; bearingDeg: number; arrived: boolean }

/** Distance and bearing to a target. "Arrived" once within the GPS accuracy (and at least ~15 ft). */
export function navigationInfo(from: { lon: number; lat: number; accuracyM: number }, to: { lon: number; lat: number }): NavInfo {
  const distanceM = metersBetween([from.lon, from.lat], [to.lon, to.lat]);
  return {
    distanceM, bearingDeg: bearingDeg([from.lon, from.lat], [to.lon, to.lat]),
    arrived: distanceM <= Math.max(4.5, from.accuracyM),
  };
}

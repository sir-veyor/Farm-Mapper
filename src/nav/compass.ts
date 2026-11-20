const RAD = Math.PI / 180;

/**
 * Heading (degrees clockwise from the sensor's north) of the direction the user is facing, from W3C device orientation
 * angles. Flat phone: the top edge points the way. Upright phone: the back (camera side) does. Uses whichever is more
 * horizontal, so it works at any tilt.
 */
export function compassHeading(alpha: number, beta: number, gamma: number): number {
  const [ca, sa] = [Math.cos(alpha * RAD), Math.sin(alpha * RAD)];
  const [cb, sb] = [Math.cos(beta * RAD), Math.sin(beta * RAD)];
  const [cg, sg] = [Math.cos(gamma * RAD), Math.sin(gamma * RAD)];
  // R = Rz(alpha) * Rx(beta) * Ry(gamma)
  const m1 = [cg, 0, sg], m2 = [sb * sg, cb, -sb * cg], m3 = [-cb * sg, sb, cb * cg];
  const row = (a: number, b: number, c: number) => [a, b, c];
  const R = [
    row(ca * m1[0] - sa * m2[0], ca * m1[1] - sa * m2[1], ca * m1[2] - sa * m2[2]),
    row(sa * m1[0] + ca * m2[0], sa * m1[1] + ca * m2[1], sa * m1[2] + ca * m2[2]),
    m3,
  ];
  const top: [number, number] = [R[0][1], R[1][1]];     // device +y in world (east, north)
  const back: [number, number] = [-R[0][2], -R[1][2]];  // device -z in world
  const v = Math.hypot(...back) > Math.hypot(...top) ? back : top;
  return (Math.atan2(v[0], v[1]) / RAD + 360) % 360;
}

/** Low-pass filter on a circular quantity (averages on the unit circle, so 359 -> 1 does not swing through 180). */
export function smoothAngle(prev: number | null, next: number, k = 0.25): number {
  if (prev === null) return next;
  const x = (1 - k) * Math.cos(prev * RAD) + k * Math.cos(next * RAD);
  const y = (1 - k) * Math.sin(prev * RAD) + k * Math.sin(next * RAD);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

export const trueFromMagnetic = (magnetic: number, declination: number): number => (((magnetic + declination) % 360) + 360) % 360;

export type HeadingSource = 'gps' | 'compass' | 'none';
const WALKING_MPS = 1.0; // GPS course is only trusted above a slow walk

/** Prefer GPS course while moving (true north, no calibration); otherwise the compass (magnetic, corrected). */
export function pickHeading(
  o: { speedMps: number | null; gpsHeadingDeg: number | null; compassMagneticDeg: number | null }, declination: number,
): { deg: number | null; source: HeadingSource } {
  if (o.gpsHeadingDeg !== null && o.speedMps !== null && o.speedMps >= WALKING_MPS) return { deg: o.gpsHeadingDeg, source: 'gps' };
  if (o.compassMagneticDeg !== null) return { deg: trueFromMagnetic(o.compassMagneticDeg, declination), source: 'compass' };
  return { deg: null, source: 'none' };
}

/** Degrees to rotate an arrow that points up so it points at the target (0 = straight ahead, 90 = to the right). */
export const arrowRotation = (bearingToTarget: number, heading: number): number => (((bearingToTarget - heading) % 360) + 360) % 360;

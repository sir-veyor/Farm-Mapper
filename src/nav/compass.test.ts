import { describe, expect, it } from 'vitest';
import { arrowRotation, compassHeading, pickHeading, smoothAngle, trueFromMagnetic } from './compass';

const close = (a: number, b: number, tol = 0.01) => expect(Math.abs(((a - b + 540) % 360) - 180)).toBeLessThan(tol);

describe('compassHeading', () => {
  it('flat phone: heading = 360 - alpha (alpha is counter-clockwise)', () => {
    close(compassHeading(0, 0, 0), 0); close(compassHeading(90, 0, 0), 270); close(compassHeading(180, 0, 0), 180); close(compassHeading(270, 0, 0), 90);
  });
  it('upright phone (beta 90): the back of the phone is the pointer', () => {
    close(compassHeading(0, 90, 0), 0); close(compassHeading(90, 90, 0), 270); close(compassHeading(270, 90, 0), 90);
  });
  it('tilted halfway gives a sensible heading, and works with some roll', () => {
    close(compassHeading(0, 60, 0), 0, 1); close(compassHeading(90, 20, 10), 270, 15);
  });
});

describe('smoothAngle', () => {
  it('first value passes through; crossing north does not swing through south', () => {
    expect(smoothAngle(null, 120)).toBe(120);
    const v = smoothAngle(358, 4, 0.5);
    expect(v > 350 || v < 10).toBe(true);
  });
  it('converges toward the new value', () => {
    let v: number | null = 0; for (let i = 0; i < 40; i++) v = smoothAngle(v, 90); close(v!, 90, 0.5);
  });
});

describe('true heading and arrow', () => {
  it('applies declination (-11 west): facing magnetic north is 349 true', () => {
    close(trueFromMagnetic(0, -11), 349); close(trueFromMagnetic(100, -11), 89); close(trueFromMagnetic(5, -11), 354);
  });
  it('prefers GPS course when walking, compass when still, none when neither', () => {
    expect(pickHeading({ speedMps: 1.4, gpsHeadingDeg: 80, compassMagneticDeg: 100 }, -11)).toEqual({ deg: 80, source: 'gps' });
    expect(pickHeading({ speedMps: 0.2, gpsHeadingDeg: 80, compassMagneticDeg: 100 }, -11)).toEqual({ deg: 89, source: 'compass' });
    expect(pickHeading({ speedMps: null, gpsHeadingDeg: null, compassMagneticDeg: null }, -11)).toEqual({ deg: null, source: 'none' });
  });
  it('arrow rotation: target to the right, behind, left', () => {
    expect(arrowRotation(90, 0)).toBe(90); expect(arrowRotation(0, 180)).toBe(180); expect(arrowRotation(350, 10)).toBe(340);
    expect(arrowRotation(10, 350)).toBe(20);
  });
});

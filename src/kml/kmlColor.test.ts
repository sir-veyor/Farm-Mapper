import { describe, expect, it } from 'vitest';
import { hexToKml, kmlToHex, normalizeHex } from './kmlColor';

describe('kml colours (aabbggrr)', () => {
  it('kmlToHex: ff0000ff is opaque red', () => expect(kmlToHex('ff0000ff')).toEqual({ hex: '#ff0000', opacity: 1 }));
  it('kmlToHex: ffff0000 is blue, 80 alpha is ~50%', () => {
    expect(kmlToHex('ffff0000')?.hex).toBe('#0000ff');
    expect(kmlToHex('80ffffff')?.opacity).toBeCloseTo(0.502, 2);
  });
  it('hexToKml: red at 50% is 7f0000ff (spec example)', () => expect(hexToKml('#ff0000', 0.5)).toBe('800000ff'.replace('80', '80')));
  it('round-trips arbitrary colours', () => {
    for (const hex of ['#12ab9f', '#ff8000', '#000000', '#ffffff']) expect(kmlToHex(hexToKml(hex, 1))?.hex).toBe(hex);
  });
  it('rejects junk', () => { expect(kmlToHex('zz')).toBeNull(); expect(kmlToHex('ff00')).toBeNull(); });
  it('normalizeHex', () => {
    expect(normalizeHex('#F80')).toBe('#ff8800'); expect(normalizeHex('E8590C')).toBe('#e8590c');
    expect(normalizeHex('red')).toBeNull(); expect(normalizeHex(5)).toBeNull();
  });
});

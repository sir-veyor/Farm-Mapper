import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { transparentPng } from './emptyTile';

describe('empty tile PNG', () => {
  it('is a 1x1 RGBA PNG whose only pixel is fully transparent', () => {
    const b = Buffer.from(transparentPng());
    expect(b.subarray(1, 4).toString()).toBe('PNG');
    expect(b.readUInt32BE(16)).toBe(1); expect(b.readUInt32BE(20)).toBe(1);
    expect(b[25]).toBe(6); // colour type RGBA
    const len = b.readUInt32BE(33); // IDAT chunk length
    const raw = inflateSync(b.subarray(41, 41 + len));
    expect([...raw]).toEqual([0, 0, 0, 0, 0]); // filter byte + RGBA all zero
  });
});

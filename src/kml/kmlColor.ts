import type { HexColor } from '../types';

const h2 = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');

/** KML colours are aabbggrr (alpha first, red last). */
export function kmlToHex(kml: string): { hex: HexColor; opacity: number } | null {
  const m = /^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(kml.trim());
  if (!m) return null;
  return { hex: `#${m[4]}${m[3]}${m[2]}`.toLowerCase() as HexColor, opacity: parseInt(m[1], 16) / 255 };
}

export function hexToKml(hex: string, opacity = 1): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const rgb = (m ? m[1] : '000000').toLowerCase();
  return `${h2(opacity * 255)}${rgb.slice(4, 6)}${rgb.slice(2, 4)}${rgb.slice(0, 2)}`;
}

/** Accepts '#rgb', '#rrggbb', 'rrggbb' (any case); returns '#rrggbb' lowercase or null. */
export function normalizeHex(c: unknown): HexColor | null {
  if (typeof c !== 'string') return null;
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return null;
  const v = m[1].length === 3 ? m[1].split('').map((x) => x + x).join('') : m[1];
  return `#${v.toLowerCase()}` as HexColor;
}

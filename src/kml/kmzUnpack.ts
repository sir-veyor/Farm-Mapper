import JSZip from 'jszip';

export class KmlError extends Error {
  constructor(message: string) { super(message); this.name = 'KmlError'; }
}

const MAX_ARCHIVE = 100 * 1024 * 1024;
const MAX_ENTRY = 200 * 1024 * 1024;

export interface Unpacked { kmlText: string; warnings: string[] }

export const isZip = (b: Uint8Array): boolean => b.length > 3 && b[0] === 0x50 && b[1] === 0x4b;

/** Finds doc.kml (or the shallowest .kml) in a KMZ. Never fetches anything; images are ignored with a warning. */
export async function unpackKmz(data: ArrayBuffer): Promise<Unpacked> {
  if (data.byteLength > MAX_ARCHIVE) throw new KmlError('This KMZ is over 100 MB, which is too large to import safely.');
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(data); } catch { throw new KmlError('This KMZ could not be opened as a zip archive.'); }

  const entries = Object.values(zip.files).filter((f) => !f.dir);
  for (const e of entries) {
    const size = (e as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0; // jszip internals: zip-bomb guard
    if (size > MAX_ENTRY) throw new KmlError('This KMZ contains a file over 200 MB, so it was rejected.');
  }
  const kmls = entries.filter((e) => /\.kml$/i.test(e.name));
  if (!kmls.length) throw new KmlError('No .kml file found inside this KMZ.');
  const depth = (n: string) => n.split('/').length;
  const main = kmls.find((e) => e.name.toLowerCase() === 'doc.kml')
    ?? [...kmls].sort((a, b) => depth(a.name) - depth(b.name) || a.name.localeCompare(b.name))[0];

  const warnings: string[] = [];
  if (kmls.length > 1) warnings.push(`${kmls.length - 1} other .kml file(s) inside the KMZ were not imported.`);
  const images = entries.filter((e) => /\.(png|jpe?g|gif|tiff?|webp)$/i.test(e.name)).length;
  if (images) warnings.push(`${images} embedded image(s) were ignored (custom icons and overlays are not supported).`);
  return { kmlText: await main.async('string'), warnings };
}

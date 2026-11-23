import JSZip from 'jszip';
import { symbolPngBytes } from '../map/iconRender';
import type { HexColor, SymbolId } from '../types';
import { resolveStyle } from '../util/style';
import type { ExportLayer } from './buildExportModel';
import { writeKml } from './kmlWriter';

const iconPath = (s: SymbolId, c: HexColor) => `files/icon-${s}-${c.slice(1)}.png`;

/** doc.kml plus a rendered PNG for every symbol/colour pair that is used. */
export async function buildKmz(model: ExportLayer[], opts: { docName: string; includeNotes: boolean }): Promise<Blob> {
  const used = new Map<string, [SymbolId, HexColor]>();
  for (const { layer, pois } of model) for (const p of pois) {
    const s = resolveStyle(layer, p.style);
    used.set(iconPath(s.symbol, s.symbolColor), [s.symbol, s.symbolColor]);
  }
  const zip = new JSZip();
  zip.file('doc.kml', writeKml(model, { ...opts, iconHref: iconPath }));
  for (const [path, [sym, col]] of used) zip.file(path, await symbolPngBytes(sym, col, 64));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.google-earth.kmz' });
}

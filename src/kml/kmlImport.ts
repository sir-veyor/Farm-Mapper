import { addFeatures } from '../db/featuresRepo';
import { createVectorLayer } from '../db/layersRepo';
import { addPois } from '../db/poisRepo';
import { geometryBounds, unionBounds, type Bounds } from '../util/geo';
import { parseKml } from './kmlParse';
import { isZip, KmlError, unpackKmz } from './kmzUnpack';

export interface KmlImportOptions { splitFolders: boolean; applyShift: boolean }
export interface KmlImportSummary {
  layers: string[];
  points: number;
  lines: number;
  polygons: number;
  skipped: Record<string, number>;
  warnings: string[];
  bounds: Bounds | null;
}

export async function importKml(file: File, opts: KmlImportOptions): Promise<KmlImportSummary> {
  const buf = await file.arrayBuffer();
  const warnings: string[] = [];
  let text: string;
  if (isZip(new Uint8Array(buf, 0, 4))) {
    const u = await unpackKmz(buf);
    text = u.kmlText; warnings.push(...u.warnings);
  } else text = new TextDecoder('utf-8').decode(buf);

  const parsed = parseKml(text, { fileName: file.name, ...opts });
  if (!parsed.groups.length) {
    const why = Object.entries(parsed.skipped).map(([k, v]) => `${v} ${k}`).join(', ');
    throw new KmlError(`Nothing importable in this file${why ? ` (skipped: ${why})` : ''}.`);
  }

  const multi = parsed.groups.length > 1;
  const stem = file.name.replace(/\.(kml|kmz)$/i, '');
  const sum: KmlImportSummary = { layers: [], points: 0, lines: 0, polygons: 0, skipped: parsed.skipped, warnings, bounds: null };
  const boxes: Bounds[] = [];

  for (const g of parsed.groups) {
    const layer = await createVectorLayer(multi && g.name !== parsed.docName ? `${stem}: ${g.name}` : g.name);
    sum.layers.push(layer.name);
    if (g.pois.length) { await addPois(layer.id, g.pois); sum.points += g.pois.length; for (const p of g.pois) boxes.push([p.lon, p.lat, p.lon, p.lat]); }
    if (g.features.length) {
      await addFeatures(layer.id, g.features);
      for (const f of g.features) {
        if (f.geometry.type.endsWith('Polygon')) sum.polygons++; else sum.lines++;
        const b = geometryBounds(f.geometry); if (b) boxes.push(b);
      }
    }
  }
  sum.bounds = unionBounds(boxes);
  return sum;
}

export function summarize(s: KmlImportSummary): string {
  const parts = [s.points && `${s.points} point${s.points === 1 ? '' : 's'}`, s.lines && `${s.lines} line${s.lines === 1 ? '' : 's'}`,
    s.polygons && `${s.polygons} polygon${s.polygons === 1 ? '' : 's'}`].filter(Boolean).join(', ');
  const skipped = Object.entries(s.skipped).map(([k, v]) => `${v} ${k}`).join(', ');
  return `Imported ${parts} into ${s.layers.length} layer${s.layers.length === 1 ? '' : 's'}.${skipped ? ` Skipped: ${skipped}.` : ''}`;
}

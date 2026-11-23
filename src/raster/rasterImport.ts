import { addRaster } from '../db/rasterRepo';
import type { Layer, RasterSource } from '../types';
import { newId, nowIso } from '../util/ids';
import { buildRasterFields } from './mbtilesMeta';
import { MbtilesReader } from './mbtilesReader';

const WARN_BYTES = 300 * 1024 * 1024;

export interface RasterImportResult {
  layer: Layer;
  source: RasterSource;
  warnings: string[];
}

/** Validate an .mbtiles file, store it locally, and create its raster layer. Throws MbtilesError on bad files. */
export async function importMbtiles(file: File, datum: RasterSource['datum']): Promise<RasterImportResult> {
  const warnings: string[] = [];
  if (file.size > WARN_BYTES) {
    warnings.push('Large file (over 300 MB): it may crash on phones. Consider re-exporting at a lower max zoom.');
  }
  const reader = await MbtilesReader.open(file);
  let fields;
  try {
    const meta = reader.metadata();
    fields = buildRasterFields(meta, reader.probe(meta), file.name, file.size);
  } finally {
    reader.close();
  }
  const source: RasterSource = { ...fields, id: newId(), datum, importedAt: nowIso() };
  const layer = await addRaster(source, file);
  return { layer, source, warnings };
}

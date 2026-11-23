import { buildExportModel } from './buildExportModel';
import { toGeoJsonString } from './geojsonExport';
import { buildKmz } from './kmzExport';
import { writeKml } from './kmlWriter';

export type ExportFormat = 'kmz' | 'kml' | 'geojson';

const pad = (n: number) => String(n).padStart(2, '0');
export const exportFileName = (fmt: ExportFormat, d = new Date()): string =>
  `parcel-export-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.${fmt}`;

const MIME: Record<ExportFormat, string> = {
  kmz: 'application/vnd.google-earth.kmz', kml: 'application/vnd.google-earth.kml+xml', geojson: 'application/geo+json',
};

export async function exportLayers(layerIds: string[], format: ExportFormat, includeNotes: boolean): Promise<File> {
  const model = await buildExportModel(layerIds);
  if (!model.length) throw new Error('Select at least one layer to export.');
  if (model.every((m) => !m.pois.length && !m.features.length)) throw new Error('The selected layers are empty.');
  const name = exportFileName(format);
  const docName = model.length === 1 ? model[0].layer.name : 'Farm Mapper export';
  const body: BlobPart = format === 'kmz' ? await buildKmz(model, { docName, includeNotes })
    : format === 'kml' ? writeKml(model, { docName, includeNotes, iconHref: () => null })
    : toGeoJsonString(model, { includeNotes });
  return new File([body], name, { type: MIME[format] });
}

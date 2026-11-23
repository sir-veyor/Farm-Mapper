import { hexToKml } from '../kml/kmlColor';
import type { HexColor, Style, SymbolId } from '../types';
import { resolveStyle } from '../util/style';
import type { ExportLayer } from './buildExportModel';

export interface KmlOptions {
  docName: string;
  includeNotes: boolean;
  /** href for a point symbol icon (KMZ: a bundled PNG). Return null to use a tinted Google pushpin (plain KML). */
  iconHref: (symbol: SymbolId, color: HexColor) => string | null;
}

const PUSHPIN = 'http://maps.google.com/mapfiles/kml/pushpin/wht-pushpin.png'; // only referenced by the file, never fetched by this app

// XML 1.0 forbids most control characters
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');
export const esc = (s: string): string => clean(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const cdata = (s: string): string => `<![CDATA[${clean(s).replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;
const pos = (p: number[]) => `${p[0].toFixed(7)},${p[1].toFixed(7)},0`;
const closed = (r: number[][]) => (r.length && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1]) ? [...r, r[0]] : r);

function geometryXml(g: GeoJSON.Geometry): string {
  switch (g.type) {
    case 'Point': return `<Point><coordinates>${pos(g.coordinates)}</coordinates></Point>`;
    case 'LineString': return `<LineString><tessellate>1</tessellate><coordinates>${g.coordinates.map(pos).join(' ')}</coordinates></LineString>`;
    case 'Polygon': {
      const [outer, ...holes] = g.coordinates;
      return `<Polygon><tessellate>1</tessellate><outerBoundaryIs><LinearRing><coordinates>${closed(outer).map(pos).join(' ')}</coordinates></LinearRing></outerBoundaryIs>${
        holes.map((h) => `<innerBoundaryIs><LinearRing><coordinates>${closed(h).map(pos).join(' ')}</coordinates></LinearRing></innerBoundaryIs>`).join('')}</Polygon>`;
    }
    case 'MultiLineString': return `<MultiGeometry>${g.coordinates.map((c) => geometryXml({ type: 'LineString', coordinates: c })).join('')}</MultiGeometry>`;
    case 'MultiPolygon': return `<MultiGeometry>${g.coordinates.map((c) => geometryXml({ type: 'Polygon', coordinates: c })).join('')}</MultiGeometry>`;
    case 'MultiPoint': return `<MultiGeometry>${g.coordinates.map((c) => geometryXml({ type: 'Point', coordinates: c })).join('')}</MultiGeometry>`;
    case 'GeometryCollection': return `<MultiGeometry>${g.geometries.map(geometryXml).join('')}</MultiGeometry>`;
  }
}

const data = (k: string, v: string | number | null | undefined) =>
  v === null || v === undefined || v === '' ? '' : `<Data name="${esc(k)}"><value>${esc(String(v))}</value></Data>`;

/** Hand-written KML 2.2: one Folder per layer, shared Style per unique resolved style. */
export function writeKml(model: ExportLayer[], o: KmlOptions): string {
  const styles = new Map<string, string>(); // key -> id
  const styleXml: string[] = [];
  const styleFor = (key: string, body: string): string => {
    let id = styles.get(key);
    if (!id) { id = `s${styles.size + 1}`; styles.set(key, id); styleXml.push(`<Style id="${id}">${body}</Style>`); }
    return id;
  };
  const lineBody = (s: Style) => `<LineStyle><color>${hexToKml(s.strokeColor, s.strokeOpacity)}</color><width>${s.strokeWidth}</width></LineStyle>`;
  const labelBody = (s: Style) => `<LabelStyle><scale>${s.showLabels ? 0.8 : 0}</scale></LabelStyle>`;

  const folders = model.map(({ layer, pois, features }) => {
    const marks: string[] = [];
    for (const f of features) {
      const s = resolveStyle(layer, f.style);
      const isArea = f.geometry.type.endsWith('Polygon');
      const body = lineBody(s) + (isArea
        ? `<PolyStyle><color>${hexToKml(s.fillColor, s.fillOpacity)}</color><fill>${s.fillOpacity > 0 ? 1 : 0}</fill><outline>1</outline></PolyStyle>` : '') + labelBody(s);
      const id = styleFor(`${isArea ? 'a' : 'l'}|${body}`, body);
      marks.push(`<Placemark><name>${esc(f.name)}</name>${o.includeNotes && f.notes ? `<description>${cdata(f.notes)}</description>` : ''}<styleUrl>#${id}</styleUrl>${geometryXml(f.geometry)}<ExtendedData>${
        data('layer', layer.name)}${data('created', f.createdAt)}${Object.entries(f.extra ?? {}).map(([k, v]) => data(k, v)).join('')}</ExtendedData></Placemark>`);
    }
    for (const p of pois) {
      const s = resolveStyle(layer, p.style);
      const href = o.iconHref(s.symbol, s.symbolColor);
      const icon = href
        ? `<IconStyle><scale>${s.symbolSize}</scale><Icon><href>${esc(href)}</href></Icon></IconStyle>`
        : `<IconStyle><color>${hexToKml(s.symbolColor, 1)}</color><scale>${s.symbolSize}</scale><Icon><href>${PUSHPIN}</href></Icon></IconStyle>`;
      const body = icon + labelBody(s);
      const id = styleFor(`p|${body}`, body);
      marks.push(`<Placemark><name>${esc(p.name)}</name>${o.includeNotes && p.notes ? `<description>${cdata(p.notes)}</description>` : ''}<styleUrl>#${id}</styleUrl>${
        geometryXml({ type: 'Point', coordinates: [p.lon, p.lat] })}<ExtendedData>${data('layer', layer.name)}${data('origin', p.origin)}${
        data('accuracy_m', p.gps ? Math.round(p.gps.accuracyM * 10) / 10 : null)}${data('symbol', s.symbol)}${data('created', p.createdAt)}${
        Object.entries(p.extra ?? {}).map(([k, v]) => data(k, v)).join('')}</ExtendedData></Placemark>`);
    }
    return `<Folder><name>${esc(layer.name)}</name>${marks.join('')}</Folder>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(o.docName)}</name>${styleXml.join('')}${folders.join('')}</Document></kml>\n`;
}

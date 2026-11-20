import maplibregl, { type Map as MlMap, type StyleSpecification } from 'maplibre-gl';
import { MAP_MAX_ZOOM } from '../config';
import type { Settings } from '../types';

/** Offline base style: no network sources. Glyphs (for labels) are bundled under public/glyphs. */
const glyphBase = () => `${new URL('.', document.baseURI).href}glyphs/{fontstack}/{range}.pbf`;

function offlineStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: glyphBase(),
    sources: {},
    layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#e9e6df' } }],
  };
}

/** Labels need the bundled font files; if they are missing we skip label layers instead of erroring. */
export async function glyphsAvailable(): Promise<boolean> {
  try {
    const r = await fetch(glyphBase().replace('{fontstack}', 'Noto%20Sans%20Regular').replace('{range}', '0-255'));
    return r.ok;
  } catch { return false; }
}

export function createMap(container: HTMLElement, view: Settings['lastView']): MlMap {
  const map = new maplibregl.Map({
    container,
    style: offlineStyle(),
    center: [view.lon, view.lat],
    zoom: view.zoom,
    bearing: view.bearing,
    maxZoom: MAP_MAX_ZOOM,
    attributionControl: false,
    dragRotate: false,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'bottom-left');
  return map;
}

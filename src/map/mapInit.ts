import maplibregl, { type Map as MlMap, type StyleSpecification } from 'maplibre-gl';
import { MAP_MAX_ZOOM } from '../config';
import type { Settings } from '../types';

// Offline base style: no sources, no glyphs, no sprites, just a background colour.
const OFFLINE_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#e9e6df' } }],
};

export function createMap(container: HTMLElement, view: Settings['lastView']): MlMap {
  const map = new maplibregl.Map({
    container,
    style: OFFLINE_STYLE,
    center: [view.lon, view.lat],
    zoom: view.zoom,
    bearing: view.bearing,
    maxZoom: MAP_MAX_ZOOM,
    attributionControl: false,
    dragRotate: false,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
  return map;
}

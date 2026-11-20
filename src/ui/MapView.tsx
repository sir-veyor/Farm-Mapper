import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import type { Map as MlMap } from 'maplibre-gl';
import { patchSettings, getSettings } from '../db/settingsRepo';
import { startGpsMarker } from '../map/gpsMarker';
import { installIconLoader } from '../map/iconImages';
import { startInteraction } from '../map/interaction';
import { startLayerSync } from '../map/layerSync';
import { startMeasureLayer } from '../map/measureLayer';
import { startNavLayer } from '../map/navLayer';
import { setMap } from '../map/mapHandle';
import { createMap, glyphsAvailable } from '../map/mapInit';
import { startSelectionLayer } from '../map/selectionLayer';
import { registerMbtilesProtocol } from '../raster/mbtilesProtocol';

export function MapView({ onReady }: { onReady?: (map: MlMap) => void }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: MlMap | undefined;
    let cancelled = false;
    const stops: (() => void)[] = [];
    (async () => {
      const s = await getSettings();
      if (cancelled || !el.current) return;
      registerMbtilesProtocol();
      map = createMap(el.current, s.lastView);
      setMap(map);
      if (new URLSearchParams(location.search).has('debugTiles')) (window as unknown as { __map: MlMap }).__map = map; // test hook
      installIconLoader(map);
      const labels = await glyphsAvailable();
      if (cancelled) return;
      // Overlays first so their map layers exist before vector layers are stacked beneath them.
      stops.push(startSelectionLayer(map), startGpsMarker(map), startNavLayer(map), startMeasureLayer(map, { labels }), startLayerSync(map, { labels }), startInteraction(map));
      map.on('moveend', () => {
        const c = map!.getCenter();
        void patchSettings({ lastView: { lon: c.lng, lat: c.lat, zoom: map!.getZoom(), bearing: map!.getBearing() } });
      });
      onReady?.(map);
    })();
    return () => { cancelled = true; stops.forEach((f) => f()); setMap(null); map?.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={el} style={{ position: 'absolute', inset: 0 }} />;
}

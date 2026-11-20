import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import type { Map as MlMap } from 'maplibre-gl';
import { patchSettings, getSettings } from '../db/settingsRepo';
import { startLayerSync } from '../map/layerSync';
import { setMap } from '../map/mapHandle';
import { createMap } from '../map/mapInit';
import { registerMbtilesProtocol } from '../raster/mbtilesProtocol';

export function MapView({ onReady }: { onReady?: (map: MlMap) => void }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: MlMap | undefined;
    let cancelled = false;
    let stopSync: (() => void) | undefined;
    (async () => {
      const s = await getSettings();
      if (cancelled || !el.current) return;
      registerMbtilesProtocol();
      map = createMap(el.current, s.lastView);
      setMap(map);
      stopSync = startLayerSync(map);
      map.on('moveend', () => {
        const c = map!.getCenter();
        void patchSettings({ lastView: { lon: c.lng, lat: c.lat, zoom: map!.getZoom(), bearing: map!.getBearing() } });
      });
      onReady?.(map);
    })();
    return () => { cancelled = true; stopSync?.(); setMap(null); map?.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={el} style={{ position: 'absolute', inset: 0 }} />;
}

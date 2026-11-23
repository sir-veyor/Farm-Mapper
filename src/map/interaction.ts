import type { Map as MlMap, MapMouseEvent, MapTouchEvent, Point } from 'maplibre-gl';
import { addPoi, movePoi } from '../db/poisRepo';
import { getSettings } from '../db/settingsRepo';
import { useMeasure } from '../state/measureStore';
import { act, useUi } from '../state/uiStore';
import { isInteractiveId } from './layerIds';

const LONG_PRESS_MS = 600;
const MOVE_TOLERANCE_PX = 8;
const HIT_RADIUS_PX = 12;

export const interactiveLayerIds = (map: MlMap): string[] =>
  map.getStyle().layers
    .filter((l) => isInteractiveId(l.id) && (l.layout as { visibility?: string } | undefined)?.visibility !== 'none')
    .map((l) => l.id);

/** Adds a POI at a map position in the active layer, then opens its editor. */
export async function addPoiAt(lon: number, lat: number): Promise<void> {
  const ui = useUi.getState();
  const { activeLayerId } = await getSettings();
  if (!activeLayerId) {
    ui.toast('Choose an active layer first (a layer that is not frozen or locked).', 'error');
    ui.setPanel('layers');
    return;
  }
  const poi = await act(addPoi({ layerId: activeLayerId, lon, lat, origin: 'map-tap' }));
  if (poi) ui.select({ kind: 'poi', id: poi.id });
}

const rank = (type: string) => (type === 'Point' ? 0 : type.includes('Line') ? 1 : 2);

export function startInteraction(map: MlMap): () => void {
  let suppressClickUntil = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let down: Point | null = null;

  const cancel = () => { clearTimeout(timer); timer = undefined; down = null; };

  async function onClick(e: MapMouseEvent) {
    if (Date.now() < suppressClickUntil) return;
    const ui = useUi.getState();
    const tool = ui.tool;
    if (tool.type === 'addPoi') { ui.setTool({ type: 'none' }); await addPoiAt(e.lngLat.lng, e.lngLat.lat); return; }
    if (tool.type === 'movePoi') {
      ui.setTool({ type: 'none' });
      await act(movePoi(tool.id, e.lngLat.lng, e.lngLat.lat));
      return;
    }
    const ids = interactiveLayerIds(map);
    const r = HIT_RADIUS_PX;
    if (tool.type === 'measure') { // snap to a nearby pin so you can measure stand to stand
      const near = ids.length ? map.queryRenderedFeatures([[e.point.x - 14, e.point.y - 14], [e.point.x + 14, e.point.y + 14]], { layers: ids }).find((f) => f.geometry.type === 'Point') : undefined;
      const c = near ? (near.geometry as GeoJSON.Point).coordinates : [e.lngLat.lng, e.lngLat.lat];
      useMeasure.getState().add([c[0], c[1]]);
      return;
    }
    const hits = ids.length
      ? map.queryRenderedFeatures([[e.point.x - r, e.point.y - r], [e.point.x + r, e.point.y + r]], { layers: ids })
      : [];
    const best = [...hits].sort((a, b) => rank(a.geometry.type) - rank(b.geometry.type))[0];
    const kind = best?.properties?._kind as 'poi' | 'feature' | undefined;
    const id = best?.properties?._id as string | undefined;
    if (kind && id) ui.select({ kind, id });
    else if (ui.selection) ui.select(null);
  }

  function onDown(e: MapMouseEvent | MapTouchEvent) {
    if ('points' in e && e.points.length > 1) return cancel();
    if (useUi.getState().tool.type !== 'none') return;
    down = e.point;
    const { lng, lat } = e.lngLat;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined; down = null;
      suppressClickUntil = Date.now() + 800;
      navigator.vibrate?.(30);
      void addPoiAt(lng, lat);
    }, LONG_PRESS_MS);
  }

  function onMove(e: MapMouseEvent | MapTouchEvent) {
    if (down && Math.hypot(e.point.x - down.x, e.point.y - down.y) > MOVE_TOLERANCE_PX) cancel();
  }

  const onContext = (e: MapMouseEvent) => {
    e.preventDefault?.();
    if (useUi.getState().tool.type !== 'none') return;
    cancel();
    suppressClickUntil = Date.now() + 500;
    void addPoiAt(e.lngLat.lng, e.lngLat.lat);
  };

  map.on('click', onClick);
  map.on('mousedown', onDown); map.on('touchstart', onDown);
  map.on('mousemove', onMove); map.on('touchmove', onMove);
  for (const ev of ['mouseup', 'touchend', 'touchcancel', 'dragstart', 'zoomstart', 'rotatestart', 'pitchstart'] as const) map.on(ev, cancel);
  map.on('contextmenu', onContext);
  return () => {
    cancel();
    map.off('click', onClick);
    map.off('mousedown', onDown); map.off('touchstart', onDown);
    map.off('mousemove', onMove); map.off('touchmove', onMove);
    for (const ev of ['mouseup', 'touchend', 'touchcancel', 'dragstart', 'zoomstart', 'rotatestart', 'pitchstart'] as const) map.off(ev, cancel);
    map.off('contextmenu', onContext);
  };
}

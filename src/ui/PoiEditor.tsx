import { useCallback } from 'react';
import { db } from '../db/db';
import { getLayer, listLayers } from '../db/layersRepo';
import { clearPoiStyle, movePoiToLayer, removePoi, updatePoi, updatePoiStyle } from '../db/poisRepo';
import { getSettings } from '../db/settingsRepo';
import { act, useUi } from '../state/uiStore';
import { formatDistance } from '../util/geo';
import { resolveStyle } from '../util/style';
import { Sheet } from './Sheet';
import { StyleEditor } from './StyleEditor';
import { btn, btnDanger, input, label } from './styles';
import { useAutoSaved } from './useAutoSaved';
import { useLive } from './useLive';

export function PoiEditor({ id }: { id: string }) {
  const select = useUi((s) => s.select);
  const setTool = useUi((s) => s.setTool);
  const confirm = useUi((s) => s.confirm);
  const toast = useUi((s) => s.toast);

  const data = useLive(async () => {
    const poi = await db.pois.get(id);
    if (!poi) return null;
    const [layer, layers, settings] = await Promise.all([getLayer(poi.layerId), listLayers(), getSettings()]);
    return { poi, layer, targets: layers.filter((l) => l.kind === 'vector' && !l.frozen && !l.locked), units: settings.units };
  }, ['pois', 'layers', 'settings'], [id]);

  const readOnly = !!data?.layer.locked;
  const save = useCallback((d: { name?: string; notes?: string }) => act(updatePoi(id, d)), [id]);
  const f = useAutoSaved(data ? { name: data.poi.name, notes: data.poi.notes } : undefined, save, !readOnly);

  if (data === null) { queueMicrotask(() => select(null)); return null; }
  if (!data) return null;
  const { poi, layer, targets, units } = data;
  const style = resolveStyle(layer, poi.style);
  const close = () => { f.flush(); select(null); };

  async function remove() {
    if (!(await confirm(`Delete "${poi.name}"?`))) return;
    f.discard();
    await act(removePoi(id));
    select(null);
  }

  return (
    <Sheet title={<span>{readOnly && '🔒 '}Pin</span>} onClose={close}>
      {readOnly && <div style={{ background: '#fff3cd', padding: 6, borderRadius: 8, marginBottom: 6 }}>Layer "{layer.name}" is locked: read-only. Unlock it in Layers to edit.</div>}
      <span style={label}>Name</span>
      <input style={input} value={f.name} disabled={readOnly} aria-label="Name" onChange={(e) => f.setName(e.target.value)} onBlur={f.flush} />
      <span style={label}>Notes</span>
      <textarea style={{ ...input, minHeight: 70 }} value={f.notes} disabled={readOnly} aria-label="Notes" onChange={(e) => f.setNotes(e.target.value)} onBlur={f.flush} />

      <span style={label}>Symbol and colour</span>
      <StyleEditor value={style} parts={{ point: true }} disabled={readOnly}
        onChange={(p) => void act(updatePoiStyle(id, p))} />

      <span style={label}>Location</span>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <code>{poi.lat.toFixed(6)}, {poi.lon.toFixed(6)}</code>
        <button style={btn} onClick={() => { void navigator.clipboard?.writeText(`${poi.lat.toFixed(6)}, ${poi.lon.toFixed(6)}`); toast('Coordinates copied.', 'success'); }}>Copy</button>
      </div>
      {poi.gps && (
        <div style={{ font: '13px system-ui', color: '#444', marginTop: 4 }}>
          GPS accuracy ±{formatDistance(poi.gps.accuracyM, units)}
          {poi.gps.altitudeM != null && <> · altitude {formatDistance(poi.gps.altitudeM, units)}</>}
          {poi.gps.avg && <><br />Averaged {poi.gps.avg.samplesUsed} fixes over {poi.gps.avg.durationS}s ({poi.gps.avg.samplesRejected} rejected), spread {formatDistance(poi.gps.avg.spreadM, units)}</>}
          {poi.gps.movedManually && <><br />Moved by hand after capture</>}
          <br />{new Date(poi.createdAt).toLocaleString()}
        </div>
      )}

      <span style={label}>Layer</span>
      <select style={input} value={poi.layerId} disabled={readOnly} aria-label="Layer"
        onChange={(e) => void act(movePoiToLayer(id, e.target.value))}>
        {!targets.some((t) => t.id === layer.id) && <option value={layer.id}>{layer.name}</option>}
        {targets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
        <button style={btn} disabled={readOnly} onClick={() => { setTool({ type: 'movePoi', id }); toast('Tap the new location on the map.', 'info'); }}>Move</button>
        <button style={btn} disabled={readOnly || !Object.keys(poi.style).length} onClick={() => void act(clearPoiStyle(id))}>Reset to layer style</button>
        <button style={btnDanger} disabled={readOnly} onClick={() => void remove()}>Delete</button>
        <button style={btn} onClick={close}>Done</button>
      </div>
    </Sheet>
  );
}

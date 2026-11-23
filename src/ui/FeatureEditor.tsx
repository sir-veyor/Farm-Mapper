import { useCallback } from 'react';
import { db } from '../db/db';
import { getLayer, listLayers } from '../db/layersRepo';
import { moveFeatureToLayer, removeFeature, updateFeature, updateFeatureStyle } from '../db/featuresRepo';
import { getSettings } from '../db/settingsRepo';
import { act, useUi } from '../state/uiStore';
import { featureMeasure, formatAcres, formatDistance } from '../util/geo';
import { resolveStyle } from '../util/style';
import { Sheet } from './Sheet';
import { StyleEditor } from './StyleEditor';
import { btn, btnDanger, input, label } from './styles';
import { useAutoSaved } from './useAutoSaved';
import { useLive } from './useLive';

export function FeatureEditor({ id }: { id: string }) {
  const select = useUi((s) => s.select);
  const confirm = useUi((s) => s.confirm);

  const data = useLive(async () => {
    const feat = await db.features.get(id);
    if (!feat) return null;
    const [layer, layers, settings] = await Promise.all([getLayer(feat.layerId), listLayers(), getSettings()]);
    return { feat, layer, targets: layers.filter((l) => l.kind === 'vector' && !l.frozen && !l.locked), units: settings.units };
  }, ['features', 'layers', 'settings'], [id]);

  const readOnly = !!data?.layer.locked;
  const save = useCallback((d: { name?: string; notes?: string }) => act(updateFeature(id, d)), [id]);
  const f = useAutoSaved(data ? { name: data.feat.name, notes: data.feat.notes } : undefined, save, !readOnly);

  if (data === null) { queueMicrotask(() => select(null)); return null; }
  if (!data) return null;
  const { feat, layer, targets, units } = data;
  const style = resolveStyle(layer, feat.style);
  const isArea = feat.geometry.type === 'Polygon' || feat.geometry.type === 'MultiPolygon';
  const m = featureMeasure(feat.geometry);
  const close = () => { f.flush(); select(null); };

  async function remove() {
    if (!(await confirm(`Delete "${feat.name}"?`))) return;
    f.discard();
    await act(removeFeature(id));
    select(null);
  }

  return (
    <Sheet title={<span>{readOnly && '🔒 '}{isArea ? 'Area' : 'Line'}</span>} onClose={close}>
      {readOnly && <div style={{ background: '#fff3cd', padding: 6, borderRadius: 8, marginBottom: 6 }}>Layer "{layer.name}" is locked: read-only. Unlock it in Layers to edit.</div>}
      <span style={label}>Name</span>
      <input style={input} value={f.name} disabled={readOnly} aria-label="Name" onChange={(e) => f.setName(e.target.value)} onBlur={f.flush} />
      <span style={label}>Notes</span>
      <textarea style={{ ...input, minHeight: 70 }} value={f.notes} disabled={readOnly} aria-label="Notes" onChange={(e) => f.setNotes(e.target.value)} onBlur={f.flush} />
      <div style={{ font: '13px system-ui', color: '#444', margin: '6px 0' }}>
        {m.areaM2 !== undefined && <>Area {formatAcres(m.areaM2)} · </>}
        {m.lengthM !== undefined && <>{isArea ? 'Perimeter' : 'Length'} {formatDistance(m.lengthM, units)}</>}
        <br />{feat.source.kind === 'track'
          ? `Walked ${formatDistance(feat.source.distanceM)} in ${Math.floor(feat.source.durationS / 3600)}h ${Math.floor((feat.source.durationS % 3600) / 60)}m, started ${new Date(feat.source.startedAt).toLocaleString()}`
          : `From ${feat.source.fileName}`}
      </div>
      <StyleEditor value={style} parts={{ line: true, fill: isArea }} disabled={readOnly} onChange={(p) => void act(updateFeatureStyle(id, p))} />
      <span style={label}>Layer</span>
      <select style={input} value={feat.layerId} disabled={readOnly} aria-label="Layer" onChange={(e) => void act(moveFeatureToLayer(id, e.target.value))}>
        {!targets.some((t) => t.id === layer.id) && <option value={layer.id}>{layer.name}</option>}
        {targets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
        <button style={btn} disabled={readOnly || !Object.keys(feat.style).length} onClick={() => void act(updateFeature(id, { style: {} }))}>Reset to layer style</button>
        <button style={btnDanger} disabled={readOnly} onClick={() => void remove()}>Delete</button>
        <button style={btn} onClick={close}>Done</button>
      </div>
    </Sheet>
  );
}

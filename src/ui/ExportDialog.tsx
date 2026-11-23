import { useEffect, useState } from 'react';
import { listLayers } from '../db/layersRepo';
import { db } from '../db/db';
import { canShareFiles, downloadFile, shareFile } from '../export/deliver';
import { exportLayers, type ExportFormat } from '../export/exportService';
import { act, useUi } from '../state/uiStore';
import { btn, btnOn, modal, modalBack } from './styles';
import { useLive } from './useLive';

export function ExportDialog() {
  const open = useUi((s) => s.exportOpen);
  const setOpen = useUi((s) => s.setExportOpen);
  const toast = useUi((s) => s.toast);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [format, setFormat] = useState<ExportFormat>('kmz');
  const [notes, setNotes] = useState(true);
  const [busy, setBusy] = useState(false);

  const data = useLive(async () => {
    const layers = (await listLayers()).filter((l) => l.kind === 'vector').sort((a, b) => b.order - a.order);
    const counts = new Map<string, number>();
    for (const k of [...(await db.pois.orderBy('layerId').keys()), ...(await db.features.orderBy('layerId').keys())]) counts.set(String(k), (counts.get(String(k)) ?? 0) + 1);
    return { layers, counts };
  }, ['layers', 'pois', 'features'], [open]);

  useEffect(() => { if (open) setPicked(new Set()); }, [open]);
  if (!open) return null;

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function run(how: 'share' | 'download') {
    setBusy(true);
    const file = await act(exportLayers([...picked], format, notes));
    setBusy(false);
    if (!file) return;
    if (how === 'share' && canShareFiles(file)) { if (!(await act(shareFile(file)))) return; } else downloadFile(file);
    toast(`Exported ${file.name}`, 'success');
  }

  const canShare = typeof navigator.canShare === 'function';
  return (
    <div style={modalBack}>
      <div style={modal}>
        <h3 style={{ margin: '0 0 8px' }}>Export layers</h3>
        <div style={{ font: '13px system-ui', color: '#555' }}>Choose the layers to send. Frozen, locked and hidden layers can be exported too.</div>
        <div style={{ margin: '8px 0' }}>
          {(data?.layers ?? []).map((l) => (
            <label key={l.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0' }}>
              <input type="checkbox" checked={picked.has(l.id)} onChange={() => toggle(l.id)} aria-label={`Export ${l.name}`} />
              <span>{l.name} <span style={{ color: '#777' }}>({data?.counts.get(l.id) ?? 0})</span>{l.frozen ? ' ❄' : ''}{l.locked ? ' 🔒' : ''}</span>
            </label>
          ))}
          <button style={{ ...btn, marginTop: 4 }} onClick={() => setPicked(new Set((data?.layers ?? []).map((l) => l.id)))}>Select all</button>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '6px 0' }}>
          {(['kmz', 'kml', 'geojson'] as const).map((f) => (
            <label key={f}><input type="radio" name="fmt" checked={format === f} onChange={() => setFormat(f)} /> {f === 'geojson' ? 'GeoJSON' : f.toUpperCase()}</label>
          ))}
        </div>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={notes} onChange={(e) => setNotes(e.target.checked)} /> Include notes
        </label>
        <div style={{ font: '12px system-ui', color: '#666', margin: '6px 0' }}>
          KMZ keeps your symbols and colours for Google Earth. KML uses simple pins. GeoJSON suits QGIS and geojson.io.
        </div>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button style={btn} onClick={() => setOpen(false)}>Close</button>
          {canShare && <button style={btnOn} disabled={busy || !picked.size} onClick={() => void run('share')}>Share...</button>}
          <button style={canShare ? btn : btnOn} disabled={busy || !picked.size} data-testid="export-download" onClick={() => void run('download')}>Download</button>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { importKml, summarize } from '../kml/kmlImport';
import { KmlError } from '../kml/kmzUnpack';
import { getMap } from '../map/mapHandle';
import { MbtilesError } from '../raster/mbtilesMeta';
import { importMbtiles } from '../raster/rasterImport';
import { useUi } from '../state/uiStore';
import type { RasterSource } from '../types';
import { fitSafe } from '../util/geo';
import { modal, modalBack, btn } from './styles';

export function ImportDialog() {
  const open = useUi((s) => s.importOpen);
  const setOpen = useUi((s) => s.setImportOpen);
  const toast = useUi((s) => s.toast);
  const [datum, setDatum] = useState<RasterSource['datum']>('unknown');
  const [split, setSplit] = useState(false);
  const [shift, setShift] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  async function onFile(file: File | undefined) {
    if (!file) return;
    const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1].toLowerCase();
    setBusy(true);
    try {
      if (ext === 'mbtiles') {
        const { source, warnings } = await importMbtiles(file, datum);
        warnings.forEach((w) => toast(w, 'info'));
        toast(`Imported "${source.name}" (zoom ${source.minzoom}-${source.maxzoom}).`, 'success');
        getMap()?.fitBounds([[source.bounds[0], source.bounds[1]], [source.bounds[2], source.bounds[3]]], { padding: 40, maxZoom: 19, duration: 600 });
      } else if (ext === 'kml' || ext === 'kmz') {
        const s = await importKml(file, { splitFolders: split, applyShift: shift });
        s.warnings.forEach((w) => toast(w, 'info'));
        toast(summarize(s), 'success');
        if (s.bounds) { const b = fitSafe(s.bounds); getMap()?.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 50, maxZoom: 19, duration: 600 }); }
        useUi.getState().setPanel('layers');
      } else {
        toast('Choose a .mbtiles, .kml or .kmz file. (Backups are restored from the Backup button.)', 'error');
        return;
      }
      setOpen(false);
    } catch (e) {
      toast(e instanceof MbtilesError || e instanceof KmlError ? e.message : `Import failed: ${(e as Error).message}`, 'error');
    } finally { setBusy(false); }
  }

  return (
    <div style={modalBack}>
      <div style={modal}>
        <h3 style={{ margin: '0 0 8px' }}>Import</h3>
        <fieldset style={{ border: '1px solid #ccc', borderRadius: 8, margin: '0 0 10px' }} disabled={busy}>
          <legend>Map tiles (.mbtiles): datum-corrected to WGS84?</legend>
          <label style={{ display: 'block' }}><input type="radio" checked={datum === 'wgs84-corrected'} onChange={() => setDatum('wgs84-corrected')} /> Yes</label>
          <label style={{ display: 'block' }}><input type="radio" checked={datum === 'unknown'} onChange={() => setDatum('unknown')} /> Not sure</label>
        </fieldset>
        <fieldset style={{ border: '1px solid #ccc', borderRadius: 8, margin: '0 0 10px' }} disabled={busy}>
          <legend>KML / KMZ options</legend>
          <label style={{ display: 'block' }}><input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} /> Put each top-level folder in its own layer</label>
          <label style={{ display: 'block' }}><input type="checkbox" checked={shift} onChange={(e) => setShift(e.target.checked)} /> Coordinates are NAD83 (county/state GIS): apply datum shift</label>
          <div style={{ font: '12px system-ui', color: '#666' }}>Leave the shift off for files from Google Earth, phones, or this app.</div>
        </fieldset>
        <input type="file" accept=".mbtiles,.kml,.kmz" disabled={busy} data-testid="import-file"
          onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
        {busy && <p>Reading file...</p>}
        <div style={{ marginTop: 12, textAlign: 'right' }}><button style={btn} onClick={() => setOpen(false)} disabled={busy}>Close</button></div>
      </div>
    </div>
  );
}

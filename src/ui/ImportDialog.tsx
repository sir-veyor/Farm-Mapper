import { useState } from 'react';
import { getMap } from '../map/mapHandle';
import { MbtilesError } from '../raster/mbtilesMeta';
import { importMbtiles } from '../raster/rasterImport';
import { useUi } from '../state/uiStore';
import type { RasterSource } from '../types';

export function ImportDialog() {
  const open = useUi((s) => s.importOpen);
  const setOpen = useUi((s) => s.setImportOpen);
  const toast = useUi((s) => s.toast);
  const [datum, setDatum] = useState<RasterSource['datum']>('unknown');
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!/\.mbtiles$/i.test(file.name)) {
      toast('Only .mbtiles files can be imported right now (KML/KMZ comes in a later step).', 'error');
      return;
    }
    setBusy(true);
    try {
      const { source, warnings } = await importMbtiles(file, datum);
      warnings.forEach((w) => toast(w, 'info'));
      toast(`Imported "${source.name}" (zoom ${source.minzoom}-${source.maxzoom}).`, 'success');
      getMap()?.fitBounds(
        [[source.bounds[0], source.bounds[1]], [source.bounds[2], source.bounds[3]]],
        { padding: 40, maxZoom: 19, duration: 600 },
      );
      setOpen(false);
    } catch (e) {
      toast(e instanceof MbtilesError ? e.message : `Import failed: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(0,0,0,.4)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 16, width: 'min(420px, 100%)', font: '15px system-ui' }}>
        <h3 style={{ margin: '0 0 8px' }}>Import map tiles (.mbtiles)</h3>
        <fieldset style={{ border: '1px solid #ccc', borderRadius: 8, margin: '0 0 12px' }} disabled={busy}>
          <legend>Was this file datum-corrected to WGS84?</legend>
          <label style={{ display: 'block' }}>
            <input type="radio" checked={datum === 'wgs84-corrected'} onChange={() => setDatum('wgs84-corrected')} /> Yes
          </label>
          <label style={{ display: 'block' }}>
            <input type="radio" checked={datum === 'unknown'} onChange={() => setDatum('unknown')} /> Not sure
          </label>
        </fieldset>
        <input type="file" accept=".mbtiles" disabled={busy} data-testid="import-file"
          onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
        {busy && <p>Reading file...</p>}
        <div style={{ marginTop: 12, textAlign: 'right' }}>
          <button onClick={() => setOpen(false)} disabled={busy}>Close</button>
        </div>
      </div>
    </div>
  );
}

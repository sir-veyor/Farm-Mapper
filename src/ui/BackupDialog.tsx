import { useState } from 'react';
import { backupFileName, createBackup, readBackup, restoreBackup, type BackupManifest } from '../backup/backupService';
import { canShareFiles, downloadFile, shareFile } from '../export/deliver';
import { act, useUi } from '../state/uiStore';
import { btn, btnDanger, btnOn, modal, modalBack } from './styles';

export function BackupDialog() {
  const open = useUi((s) => s.backupOpen);
  const setOpen = useUi((s) => s.setBackupOpen);
  const toast = useUi((s) => s.toast);
  const confirm = useUi((s) => s.confirm);
  const [withRasters, setWithRasters] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ file: File; manifest: BackupManifest } | null>(null);

  if (!open) return null;

  async function backup(how: 'share' | 'download') {
    setBusy(true);
    const file = await act(createBackup(withRasters));
    setBusy(false);
    if (!file) return;
    if (how === 'share' && canShareFiles(file)) { if (!(await act(shareFile(file)))) return; } else downloadFile(file);
    toast(`Backup saved: ${file.name}`, 'success');
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    const info = await act(readBackup(file));
    if (info) setPending({ file, manifest: info.manifest });
  }

  async function restore(mode: 'replace' | 'merge') {
    if (!pending) return;
    if (mode === 'replace' && !(await confirm('Replace all pins, features and layer settings on this device with the backup? Anything newer than the backup (including locked layers) is lost.', 'Replace all'))) return;
    setBusy(true);
    const r = await act(restoreBackup(pending.file, mode));
    setBusy(false);
    if (!r) return;
    r.warnings.forEach((w) => toast(w, 'info'));
    toast(`Restored ${r.layers} layer(s), ${r.pois} pin(s), ${r.features} feature(s).`, 'success');
    setPending(null); setOpen(false);
  }

  const canShare = typeof navigator.canShare === 'function';
  return (
    <div style={modalBack}>
      <div style={modal}>
        <h3 style={{ margin: '0 0 8px' }}>Backup and restore</h3>
        <div style={{ font: '13px system-ui', color: '#555', marginBottom: 8 }}>
          Your data lives only on this device. Back up before long trips, and save the file somewhere else (email it to yourself, cloud drive).
        </div>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={withRasters} onChange={(e) => setWithRasters(e.target.checked)} />
          Include imagery and DEM (large, usually not needed)
        </label>
        <div style={{ display: 'flex', gap: 6, margin: '8px 0 14px', flexWrap: 'wrap' }}>
          {canShare && <button style={btnOn} disabled={busy} onClick={() => void backup('share')}>Share backup...</button>}
          <button style={canShare ? btn : btnOn} disabled={busy} onClick={() => void backup('download')}>Download backup</button>
        </div>
        <hr />
        <b>Restore from a backup file</b>
        <div style={{ margin: '6px 0' }}>
          <input type="file" accept=".zip" disabled={busy} data-testid="restore-file" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        {pending && (
          <div style={{ background: '#f6f6f2', padding: 8, borderRadius: 8 }} data-testid="restore-info">
            <div>Backup from <b>{new Date(pending.manifest.createdAt).toLocaleString()}</b>: {pending.manifest.counts.pois} pins, {pending.manifest.counts.features} features, {pending.manifest.counts.layers} layers{pending.manifest.includesRasters ? ', includes imagery' : ''}.</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <button style={btn} disabled={busy} onClick={() => void restore('merge')}>Merge (add missing)</button>
              <button style={btnDanger} disabled={busy} onClick={() => void restore('replace')}>Replace all</button>
            </div>
          </div>
        )}
        <div style={{ textAlign: 'right', marginTop: 12 }}>
          <button style={btn} onClick={() => { setPending(null); setOpen(false); }}>Close</button>
        </div>
        <div style={{ display: 'none' }}>{backupFileName()}</div>
      </div>
    </div>
  );
}

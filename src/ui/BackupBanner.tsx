import { useState } from 'react';
import { getSettings } from '../db/settingsRepo';
import { useUi } from '../state/uiStore';
import { btn, btnOn } from './styles';
import { useLive } from './useLive';

const DAY = 86400000;

/** Reminder: 25+ changes since the last backup, or the last backup is over a week old and something changed. */
export function BackupBanner() {
  const s = useLive(getSettings, ['settings']);
  const [dismissed, setDismissed] = useState(false);
  const setBackupOpen = useUi((st) => st.setBackupOpen);
  if (!s || dismissed) return null;
  const stale = s.lastBackupAt !== null && Date.now() - Date.parse(s.lastBackupAt) > 7 * DAY && s.changesSinceBackup >= 1;
  if (s.changesSinceBackup < 25 && !stale) return null;
  return (
    <div style={{ position: 'absolute', top: 44, left: 8, right: 8, maxWidth: 520, marginInline: 'auto', zIndex: 12, background: '#fff3cd',
      border: '1px solid #e0c36a', borderRadius: 10, padding: '6px 10px', font: '13px system-ui', display: 'flex', gap: 8, alignItems: 'center' }} role="status">
      <span style={{ flex: 1 }}>{s.changesSinceBackup} changes since your last backup.</span>
      <button style={btnOn} onClick={() => setBackupOpen(true)}>Back up</button>
      <button style={btn} onClick={() => setDismissed(true)} aria-label="Dismiss">✕</button>
    </div>
  );
}

import { useUi } from '../state/uiStore';

export function Toolbar() {
  const setImportOpen = useUi((s) => s.setImportOpen);
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 10, display: 'flex', gap: 8,
      padding: 8, justifyContent: 'center', background: 'rgba(255,255,255,.92)', boxShadow: '0 -1px 4px rgba(0,0,0,.25)' }}>
      <button onClick={() => setImportOpen(true)} style={{ font: '15px system-ui', padding: '6px 14px' }}>Import</button>
    </div>
  );
}

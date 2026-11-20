import { useEffect, useState } from 'react';

interface Info { persisted: boolean | null; usedMb: number; quotaMb: number }

export function AboutPanel() {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<Info | null>(null);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const up = () => setOnline(true), down = () => setOnline(false);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const persisted = (await navigator.storage?.persisted?.()) ?? null;
      const est = (await navigator.storage?.estimate?.()) ?? {};
      setInfo({ persisted, usedMb: (est.usage ?? 0) / 1e6, quotaMb: (est.quota ?? 0) / 1e6 });
    })();
  }, [open]);

  const box: React.CSSProperties = {
    position: 'absolute', left: 8, top: 8, zIndex: 5, background: 'rgba(255,255,255,.95)',
    borderRadius: 8, padding: '6px 10px', font: '13px system-ui', boxShadow: '0 1px 4px rgba(0,0,0,.3)',
  };
  return (
    <div style={box}>
      <button onClick={() => setOpen(!open)} style={{ font: 'inherit' }}>
        ℹ️ {online ? 'Online' : 'Offline'}
      </button>
      {open && info && (
        <div style={{ marginTop: 6 }}>
          <div>Storage persistent: <b>{info.persisted === null ? 'unknown' : info.persisted ? 'yes' : 'NO'}</b></div>
          <div>Used {info.usedMb.toFixed(1)} MB of {info.quotaMb.toFixed(0)} MB</div>
          {info.persisted === false && <div style={{ color: '#a33' }}>Install the app to the home screen to protect your data.</div>}
        </div>
      )}
    </div>
  );
}

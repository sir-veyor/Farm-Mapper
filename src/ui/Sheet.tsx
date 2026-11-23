import type { ReactNode } from 'react';
import { btn } from './styles';

export function Sheet({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  return (
    <div style={{ position: 'absolute', left: 8, right: 8, bottom: 56, maxWidth: 560, marginInline: 'auto', zIndex: 15,
      maxHeight: '58%', overflowY: 'auto', background: 'rgba(255,255,255,.97)', borderRadius: 12, padding: 10,
      boxShadow: '0 2px 10px rgba(0,0,0,.35)', font: '14px system-ui' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ flex: 1, fontWeight: 600, fontSize: 16 }}>{title}</div>
        <button style={btn} onClick={onClose} aria-label="Close">✕</button>
      </div>
      {children}
    </div>
  );
}

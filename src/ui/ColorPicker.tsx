import { useEffect, useRef, useState } from 'react';
import type { HexColor } from '../types';

export const PRESET_COLORS: HexColor[] = [
  '#e03131', '#e8590c', '#f59f00', '#fcc419', '#74b816', '#2f9e44',
  '#0b7285', '#1971c2', '#6741d9', '#d6336c', '#ffffff', '#212529',
];

export function ColorPicker({ value, onChange, disabled }: { value: HexColor; onChange: (c: HexColor) => void; disabled?: boolean }) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => setLocal(value), [value]);
  const commit = (c: HexColor, now = false) => {
    setLocal(c);
    clearTimeout(timer.current);
    if (now) onChange(c); else timer.current = setTimeout(() => onChange(c), 150);
  };
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
      {PRESET_COLORS.map((c) => (
        <button key={c} disabled={disabled} aria-label={`Colour ${c}`} onClick={() => commit(c, true)}
          style={{ width: 26, height: 26, borderRadius: 13, background: c, cursor: 'pointer',
            border: local.toLowerCase() === c ? '3px solid #000' : '1px solid #888', padding: 0 }} />
      ))}
      <input type="color" value={local} disabled={disabled} aria-label="Custom colour"
        onChange={(e) => commit(e.target.value.toLowerCase() as HexColor)} style={{ width: 34, height: 30, padding: 0 }} />
    </div>
  );
}

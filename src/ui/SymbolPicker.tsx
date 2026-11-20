import { SYMBOLS } from '../config';
import { SYMBOL_PATHS } from '../map/symbols';
import type { HexColor, SymbolId } from '../types';

export function SymbolPicker({ value, color, onChange, disabled }:
  { value: SymbolId; color: HexColor; onChange: (s: SymbolId) => void; disabled?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4 }}>
      {SYMBOLS.map((s) => (
        <button key={s} disabled={disabled} title={s} aria-label={`Symbol ${s}`} aria-pressed={value === s} onClick={() => onChange(s)}
          style={{ padding: 3, borderRadius: 8, cursor: 'pointer', background: value === s ? '#dfeee3' : '#fff',
            border: value === s ? '2px solid #2f5d3a' : '1px solid #bbb' }}>
          <svg viewBox="0 0 24 24" width="26" height="26">
            <path d={SYMBOL_PATHS[s]} fill={color} fillRule="evenodd" stroke="#fff" strokeWidth="1" paintOrder="stroke" />
          </svg>
        </button>
      ))}
    </div>
  );
}

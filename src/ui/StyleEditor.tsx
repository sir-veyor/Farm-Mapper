import type { Style } from '../types';
import { ColorPicker } from './ColorPicker';
import { SymbolPicker } from './SymbolPicker';
import { label } from './styles';

export interface StyleParts { line?: boolean; fill?: boolean; point?: boolean }

/** `value` is the fully resolved style being shown; `onChange` receives only what the user touched. */
export function StyleEditor({ value, onChange, parts, disabled }:
  { value: Style; onChange: (patch: Partial<Style>) => void; parts: StyleParts; disabled?: boolean }) {
  return (
    <div>
      {parts.point && (
        <>
          <span style={label}>Symbol</span>
          <SymbolPicker value={value.symbol} color={value.symbolColor} disabled={disabled} onChange={(symbol) => onChange({ symbol })} />
          <span style={label}>Symbol colour</span>
          <ColorPicker value={value.symbolColor} disabled={disabled} onChange={(symbolColor) => onChange({ symbolColor })} />
          <span style={label}>Size ({value.symbolSize.toFixed(1)}x)</span>
          <input type="range" min={0.5} max={2.5} step={0.1} value={value.symbolSize} disabled={disabled} style={{ width: '100%' }}
            onChange={(e) => onChange({ symbolSize: Number(e.target.value) })} />
        </>
      )}
      {parts.line && (
        <>
          <span style={label}>Line colour</span>
          <ColorPicker value={value.strokeColor} disabled={disabled} onChange={(strokeColor) => onChange({ strokeColor })} />
          <span style={label}>Line width ({value.strokeWidth.toFixed(1)} px)</span>
          <input type="range" min={0.5} max={12} step={0.5} value={value.strokeWidth} disabled={disabled} style={{ width: '100%' }}
            onChange={(e) => onChange({ strokeWidth: Number(e.target.value) })} />
          <span style={label}>Line opacity ({Math.round(value.strokeOpacity * 100)}%)</span>
          <input type="range" min={0} max={1} step={0.05} value={value.strokeOpacity} disabled={disabled} style={{ width: '100%' }}
            onChange={(e) => onChange({ strokeOpacity: Number(e.target.value) })} />
        </>
      )}
      {parts.fill && (
        <>
          <span style={label}>Fill colour</span>
          <ColorPicker value={value.fillColor} disabled={disabled} onChange={(fillColor) => onChange({ fillColor })} />
          <span style={label}>Fill opacity ({Math.round(value.fillOpacity * 100)}%)</span>
          <input type="range" min={0} max={1} step={0.05} value={value.fillOpacity} disabled={disabled} style={{ width: '100%' }}
            onChange={(e) => onChange({ fillOpacity: Number(e.target.value) })} />
        </>
      )}
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
        <input type="checkbox" checked={value.showLabels} disabled={disabled} onChange={(e) => onChange({ showLabels: e.target.checked })} />
        Show names on map
      </label>
    </div>
  );
}

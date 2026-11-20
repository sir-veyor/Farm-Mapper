import { useState } from 'react';
import { deleteLayer, moveLayer, renameLayer, setActiveLayer, setDefaultStyle, setFrozen, setLocked, setOpacity, setVisible } from '../db/layersRepo';
import { layerBounds } from '../db/layerBounds';
import { getMap } from '../map/mapHandle';
import { act, useUi } from '../state/uiStore';
import type { Layer } from '../types';
import { fitSafe } from '../util/geo';
import { resolveStyle } from '../util/style';
import { StyleEditor } from './StyleEditor';
import { btn, btnDanger, btnOn, input } from './styles';

interface Props { layer: Layer; active: boolean; canUp: boolean; canDown: boolean; datumUnknown: boolean; count: number }

export function LayerRow({ layer, active, canUp, canDown, datumUnknown, count }: Props) {
  const [open, setOpen] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const [name, setName] = useState(layer.name);
  const confirm = useUi((s) => s.confirm);
  const toast = useUi((s) => s.toast);
  const isVector = layer.kind === 'vector';
  const dim = layer.frozen;

  async function zoomTo() {
    const b = await layerBounds(layer);
    if (!b) return toast('This layer is empty.', 'info');
    const f = fitSafe(b);
    getMap()?.fitBounds([[f[0], f[1]], [f[2], f[3]]], { padding: 50, maxZoom: 19, duration: 600 });
  }

  async function remove() {
    const what = count ? ` and its ${count} item${count === 1 ? '' : 's'}` : '';
    if (await confirm(`Delete layer "${layer.name}"${what}? This cannot be undone.`)) await act(deleteLayer(layer.id));
  }

  return (
    <div style={{ borderBottom: '1px solid #e2e2e2', padding: '6px 0', opacity: dim ? 0.6 : 1 }} data-testid={`layer-${layer.name}`}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {isVector && (
          <input type="radio" name="active-layer" checked={active} disabled={layer.frozen || layer.locked}
            title={layer.frozen || layer.locked ? 'Frozen/locked layers cannot receive new pins' : 'New pins go in this layer'}
            aria-label={`Make ${layer.name} the active layer`} onChange={() => void act(setActiveLayer(layer.id))} />
        )}
        <div style={{ flex: 1, minWidth: 0, fontStyle: dim ? 'italic' : 'normal', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <b>{layer.name}</b>{isVector && <span style={{ color: '#777' }}> ({count})</span>}
          {datumUnknown && <span title="Alignment with GPS not confirmed (datum unknown)"> ⚠</span>}
        </div>
        <button style={layer.visible && !layer.frozen ? btnOn : btn} aria-pressed={layer.visible} disabled={layer.frozen}
          title={layer.frozen ? 'Frozen layers cannot be shown or hidden' : layer.visible ? 'Hide' : 'Show'} aria-label="Show/hide"
          onClick={() => void act(setVisible(layer.id, !layer.visible))}>{layer.visible ? '👁' : '—'}</button>
        <button style={layer.frozen ? btnOn : btn} aria-pressed={layer.frozen} title={layer.frozen ? 'Thaw' : 'Freeze (remove from map and lock out)'}
          aria-label="Freeze" onClick={() => void act(setFrozen(layer.id, !layer.frozen))}>❄</button>
        <button style={layer.locked ? btnOn : btn} aria-pressed={layer.locked} title={layer.locked ? 'Unlock' : 'Lock (visible, but protected)'}
          aria-label="Lock" onClick={() => void act(setLocked(layer.id, !layer.locked))}>{layer.locked ? '🔒' : '🔓'}</button>
        <button style={btn} aria-label="More" aria-expanded={open} onClick={() => setOpen(!open)}>⋯</button>
      </div>
      {open && (
        <div style={{ padding: '8px 4px 4px 22px' }}>
          <label style={{ font: '12px system-ui', color: '#555' }}>Opacity {Math.round(layer.opacity * 100)}%</label>
          <input type="range" min={0} max={1} step={0.05} value={layer.opacity} style={{ width: '100%' }} aria-label="Opacity"
            onChange={(e) => void act(setOpacity(layer.id, Number(e.target.value)))} />
          <div style={{ display: 'flex', gap: 6, margin: '6px 0' }}>
            <input style={input} value={name} disabled={layer.locked} aria-label="Layer name" onChange={(e) => setName(e.target.value)}
              onBlur={() => { if (name.trim() && name !== layer.name) void act(renameLayer(layer.id, name.trim())); }} />
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button style={btn} disabled={!canUp} onClick={() => void act(moveLayer(layer.id, 'up'))}>Up</button>
            <button style={btn} disabled={!canDown} onClick={() => void act(moveLayer(layer.id, 'down'))}>Down</button>
            <button style={btn} onClick={() => void zoomTo()}>Zoom to</button>
            {isVector && <button style={btn} aria-pressed={styleOpen} onClick={() => setStyleOpen(!styleOpen)}>Layer style</button>}
            <button style={btnDanger} disabled={layer.locked} title={layer.locked ? 'Unlock first' : 'Delete layer'} onClick={() => void remove()}>Delete</button>
          </div>
          {isVector && styleOpen && (
            <div style={{ marginTop: 8, padding: 8, background: '#f6f6f2', borderRadius: 8 }}>
              <div style={{ font: '12px system-ui', color: '#555', marginBottom: 4 }}>
                Default style for items in this layer (items with their own style keep it).
              </div>
              <StyleEditor value={resolveStyle(layer)} parts={{ line: true, fill: true, point: true }} disabled={layer.locked}
                onChange={(p) => void act(setDefaultStyle(layer.id, p))} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

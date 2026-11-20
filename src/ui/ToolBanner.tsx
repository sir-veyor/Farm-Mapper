import { useUi } from '../state/uiStore';
import { btn } from './styles';

export function ToolBanner() {
  const tool = useUi((s) => s.tool);
  const setTool = useUi((s) => s.setTool);
  if (tool.type === 'none') return null;
  return (
    <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 25, background: '#2f5d3a', color: '#fff',
      padding: '8px 12px', borderRadius: 10, font: '14px system-ui', display: 'flex', gap: 10, alignItems: 'center', boxShadow: '0 2px 6px rgba(0,0,0,.35)' }}>
      {tool.type === 'addPoi' ? 'Tap the map to drop a pin' : 'Tap the new location'}
      <button style={btn} onClick={() => setTool({ type: 'none' })}>Cancel</button>
    </div>
  );
}

import { useUi } from '../state/uiStore';

const COLORS = { info: '#333', error: '#b42318', success: '#1f6f3f' } as const;

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismissToast);
  return (
    <div style={{ position: 'absolute', left: 8, right: 8, bottom: 56, zIndex: 20, display: 'flex',
      flexDirection: 'column', gap: 6, alignItems: 'center', pointerEvents: 'none' }}>
      {toasts.map((t) => (
        <div key={t.id} onClick={() => dismiss(t.id)} role="status"
          style={{ background: COLORS[t.kind], color: '#fff', padding: '8px 12px', borderRadius: 8,
            font: '14px system-ui', maxWidth: 520, pointerEvents: 'auto', boxShadow: '0 2px 6px rgba(0,0,0,.3)' }}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

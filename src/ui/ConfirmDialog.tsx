import { useUi } from '../state/uiStore';
import { btn, btnDanger, modal, modalBack } from './styles';

export function ConfirmDialog() {
  const req = useUi((s) => s.confirmReq);
  const resolve = useUi((s) => s.resolveConfirm);
  if (!req) return null;
  return (
    <div style={{ ...modalBack, zIndex: 60 }} role="alertdialog">
      <div style={modal}>
        <p style={{ marginTop: 0 }}>{req.message}</p>
        <div style={{ textAlign: 'right', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button style={btn} onClick={() => resolve(false)}>Cancel</button>
          <button style={btnDanger} onClick={() => resolve(true)}>{req.okLabel}</button>
        </div>
      </div>
    </div>
  );
}

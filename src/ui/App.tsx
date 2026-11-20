import { AboutPanel } from './AboutPanel';
import { ImportDialog } from './ImportDialog';
import { MapView } from './MapView';
import { Toasts } from './Toasts';
import { Toolbar } from './Toolbar';

export function App() {
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <MapView />
      <AboutPanel />
      <Toolbar />
      <Toasts />
      <ImportDialog />
    </div>
  );
}

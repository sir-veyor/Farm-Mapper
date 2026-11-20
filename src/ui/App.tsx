import { AboutPanel } from './AboutPanel';
import { BackupBanner } from './BackupBanner';
import { BackupDialog } from './BackupDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { ExportDialog } from './ExportDialog';
import { ImportDialog } from './ImportDialog';
import { MapView } from './MapView';
import { SheetHost } from './SheetHost';
import { ToolBanner } from './ToolBanner';
import { Toasts } from './Toasts';
import { Toolbar } from './Toolbar';

export function App() {
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <MapView />
      <AboutPanel />
      <BackupBanner />
      <SheetHost />
      <ToolBanner />
      <Toolbar />
      <Toasts />
      <ImportDialog />
      <ExportDialog />
      <BackupDialog />
      <ConfirmDialog />
    </div>
  );
}

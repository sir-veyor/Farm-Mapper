import { AboutPanel } from './AboutPanel';
import { BackupDialog } from './BackupDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { EmptyState } from './EmptyState';
import { ExportDialog } from './ExportDialog';
import { ImportDialog } from './ImportDialog';
import { MeasureBanner } from './MeasureBanner';
import { NavPanel } from './NavPanel';
import { MapView } from './MapView';
import { SheetHost } from './SheetHost';
import { ToolBanner } from './ToolBanner';
import { TrackChip } from './TrackChip';
import { Toasts } from './Toasts';
import { Toolbar } from './Toolbar';

export function App() {
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <MapView />
      <AboutPanel />
      <EmptyState />
      <SheetHost />
      <ToolBanner />
      <MeasureBanner />
      <NavPanel />
      <TrackChip />
      <Toolbar />
      <Toasts />
      <ImportDialog />
      <ExportDialog />
      <BackupDialog />
      <ConfirmDialog />
    </div>
  );
}

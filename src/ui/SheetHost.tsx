import { useUi } from '../state/uiStore';
import { FeatureEditor } from './FeatureEditor';
import { GpsPanel } from './GpsPanel';
import { LayerTree } from './LayerTree';
import { PoiEditor } from './PoiEditor';

/** One bottom sheet at a time: a selected item's editor wins over panels. */
export function SheetHost() {
  const sel = useUi((s) => s.selection);
  const panel = useUi((s) => s.panel);
  if (sel) return sel.kind === 'poi' ? <PoiEditor key={sel.id} id={sel.id} /> : <FeatureEditor key={sel.id} id={sel.id} />;
  if (panel === 'layers') return <LayerTree />;
  if (panel === 'gps') return <GpsPanel />;
  return null;
}

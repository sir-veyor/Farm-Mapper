import { useUi, type NavTarget } from '../state/uiStore';
import { startCompass, stopCompass } from './compassService';

/** Call from a tap handler: on iPhone the compass permission prompt only appears from a user gesture. */
export function startNavigation(target: NavTarget): void {
  const ui = useUi.getState();
  if (!ui.nav) void startCompass();
  ui.setNav(target);
}

export function stopNavigation(): void {
  const ui = useUi.getState();
  if (!ui.nav) return;
  ui.setNav(null);
  stopCompass();
}

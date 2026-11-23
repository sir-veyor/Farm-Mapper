import { APP_DEFAULT_STYLE } from '../config';
import type { Layer, Style, StyleOverride } from '../types';

/** App default < layer default < per-item override. Undefined override values are ignored. */
export function resolveStyle(layer: Pick<Layer, 'defaultStyle'>, itemStyle: StyleOverride = {}): Style {
  const out: Style = { ...APP_DEFAULT_STYLE, ...layer.defaultStyle };
  for (const [k, v] of Object.entries(itemStyle)) {
    if (v !== undefined) (out as unknown as Record<string, unknown>)[k] = v;
  }
  return out;
}

import { describe, expect, it } from 'vitest';
import { APP_DEFAULT_STYLE } from '../config';
import { resolveStyle } from './style';

const layer = { defaultStyle: { ...APP_DEFAULT_STYLE, symbolColor: '#112233' as const } };

describe('resolveStyle', () => {
  it('uses layer default when no override', () => {
    expect(resolveStyle(layer, {}).symbolColor).toBe('#112233');
  });
  it('item override wins', () => {
    expect(resolveStyle(layer, { symbolColor: '#ffffff' }).symbolColor).toBe('#ffffff');
  });
  it('ignores undefined override values', () => {
    expect(resolveStyle(layer, { symbolColor: undefined }).symbolColor).toBe('#112233');
  });
  it('layer change recolors non-overridden items only', () => {
    const l2 = { defaultStyle: { ...layer.defaultStyle, symbolColor: '#00ff00' as const } };
    expect(resolveStyle(l2, {}).symbolColor).toBe('#00ff00');
    expect(resolveStyle(l2, { symbolColor: '#ffffff' }).symbolColor).toBe('#ffffff');
  });
});

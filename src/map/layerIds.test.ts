import { describe, expect, it } from 'vitest';
import { firstAboveRasters } from './layerIds';

describe('firstAboveRasters', () => {
  it('returning visit: overlays exist, no vector layers yet -> rasters go below the overlays (the bug: they went on top)', () => {
    expect(firstAboveRasters(['bg', 'sel:fill', 'sel:line', 'gps:dot', 'nav:line', 'meas:line'])).toBe('sel:fill');
  });
  it('vectors present: below the first vector layer', () => {
    expect(firstAboveRasters(['bg', 'r:a', 'v:L:fill', 'v:L:line', 'sel:fill'])).toBe('v:L:fill');
  });
  it('nothing above yet: undefined (rasters just go on top for now)', () => {
    expect(firstAboveRasters(['bg', 'r:a'])).toBeUndefined();
  });
  it('ignores rasters and the background', () => { expect(firstAboveRasters(['bg', 'r:a', 'r:b'])).toBeUndefined(); });
});

import type { SymbolId } from '../types';

/** 24x24 viewBox path data, filled with the evenodd rule. */
export const SYMBOL_PATHS: Record<SymbolId, string> = {
  pin: 'M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 4.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z',
  circle: 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18z',
  square: 'M4 4h16v16H4z',
  triangle: 'M12 3l10 18H2z',
  star: 'M12 2l3 6.9 7.5.7-5.7 5 1.7 7.4L12 18l-6.5 4 1.7-7.4-5.7-5 7.5-.7z',
  flag: 'M5 2h2v20H5zM7 3h13l-3.5 4.5L20 12H7z',
  tree: 'M12 2L5 12h3l-4 6h7v4h2v-4h7l-4-6h3z',
  treestand: 'M6 2h12v4H6zM8 6h2v16H8zM14 6h2v16h-2zM8 10h8v2H8zM8 15h8v2H8z',
  camera: 'M4 7h4l1.5-2h5L16 7h4v13H4zM12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  feeder: 'M11 2h2v5h-2zM5 7h14l-2 6H7zM9 13h6l1 9H8z',
  water: 'M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13z',
  gate: 'M3 4h2v16H3zM19 4h2v16h-2zM5 7h14v2H5zM5 12h14v2H5zM5 17h14v2H5z',
  parking: 'M4 3h16v18H4zM9 7v10h2v-3h2.5a3.5 3.5 0 0 0 0-7zM11 9h2.5a1.5 1.5 0 0 1 0 3H11z',
  hazard: 'M12 2l11 19H1zM11 9h2v6h-2zM11 16.5h2v2h-2z',
  tracks: 'M8 3c1.7 0 2.5 2 2.5 4S9.7 11 8 11 5.5 9 5.5 7 6.3 3 8 3zM16 8c1.7 0 2.5 2 2.5 4s-.8 4-2.5 4-2.5-2-2.5-4 .8-4 2.5-4zM8 14c1.7 0 2.5 2 2.5 4s-.8 3-2.5 3S5.5 20 5.5 18 6.3 14 8 14z',
  x: 'M5 3l7 7 7-7 2 2-7 7 7 7-2 2-7-7-7 7-2-2 7-7-7-7z',
};

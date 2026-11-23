import type { Map as MlMap } from 'maplibre-gl';
import type { SymbolId } from '../types';
import { symbolImageData } from './iconRender';
import { SYMBOL_PATHS } from './symbols';

/** Draws `poi|{symbol}|{#rrggbb}` icons on demand the first time MapLibre asks for them. */
export function installIconLoader(map: MlMap): void {
  map.on('styleimagemissing', (e) => {
    if (!e.id.startsWith('poi|') || map.hasImage(e.id)) return;
    const [, symbol, color] = e.id.split('|');
    if (!(symbol in SYMBOL_PATHS)) return;
    map.addImage(e.id, symbolImageData(symbol as SymbolId, color, 64), { pixelRatio: 2 });
  });
}

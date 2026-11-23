import type { Map as MlMap } from 'maplibre-gl';

let current: MlMap | null = null;
export const setMap = (m: MlMap | null): void => { current = m; };
export const getMap = (): MlMap | null => current;

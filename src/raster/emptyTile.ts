/** 1x1 fully transparent RGBA PNG (base64): returned for every missing tile so MapLibre never sees an error. */
export const TRANSPARENT_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=';

export const transparentPng = (): ArrayBuffer =>
  Uint8Array.from(atob(TRANSPARENT_PNG_B64), (c) => c.charCodeAt(0)).buffer;

import type { SymbolId } from '../types';
import { SYMBOL_PATHS } from './symbols';

/** Draws a symbol into a `px` x `px` area: dark halo, white outline, then the colour fill. */
export function drawSymbol(ctx: CanvasRenderingContext2D, symbol: SymbolId, color: string, px: number): void {
  const p = new Path2D(SYMBOL_PATHS[symbol]);
  ctx.save();
  ctx.scale(px / 24, px / 24);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 3.4; ctx.stroke(p);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.8; ctx.stroke(p);
  ctx.fillStyle = color; ctx.fill(p, 'evenodd');
  ctx.restore();
}

function canvas(px: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  return [c, c.getContext('2d')!];
}

export function symbolImageData(symbol: SymbolId, color: string, px = 64): ImageData {
  const [, ctx] = canvas(px);
  drawSymbol(ctx, symbol, color, px);
  return ctx.getImageData(0, 0, px, px);
}

export async function symbolPngBytes(symbol: SymbolId, color: string, px = 64): Promise<Uint8Array> {
  const [c, ctx] = canvas(px);
  drawSymbol(ctx, symbol, color, px);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
  if (!blob) throw new Error('Could not render icon.');
  return new Uint8Array(await blob.arrayBuffer());
}

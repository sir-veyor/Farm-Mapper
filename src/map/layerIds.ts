export const rasterLayerId = (layerId: string): string => `r:${layerId}`;
export const rasterSourceKey = (layerId: string): string => `rs:${layerId}`;
export const isVectorMapLayer = (id: string): boolean => id.startsWith('v:');
export const vectorSourceKey = (layerId: string): string => `vs:${layerId}`;
export const vectorLayerIds = (layerId: string) => ({
  fill: `v:${layerId}:fill`, line: `v:${layerId}:line`, dash: `v:${layerId}:dash`, dot: `v:${layerId}:dot`,
  point: `v:${layerId}:point`, label: `v:${layerId}:label`,
});
/** Map layers a tap may hit: vector fill/line/point layers that are currently visible. */
export const isInteractiveId = (id: string): boolean => isVectorMapLayer(id) && !id.endsWith(':label');
export const isOverlayAnchor = (id: string): boolean => ['sel:', 'gps:', 'nav:', 'meas:'].some((p) => id.startsWith(p));

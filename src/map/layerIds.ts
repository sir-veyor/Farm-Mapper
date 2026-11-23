export const rasterLayerId = (layerId: string): string => `r:${layerId}`;
export const rasterSourceKey = (layerId: string): string => `rs:${layerId}`;
export const isVectorMapLayer = (id: string): boolean => id.startsWith('v:');
export const vectorSourceKey = (layerId: string): string => `vs:${layerId}`;
export const vectorLayerIds = (layerId: string) => ({
  fill: `v:${layerId}:fill`, band: `v:${layerId}:band`, line: `v:${layerId}:line`, dash: `v:${layerId}:dash`, dot: `v:${layerId}:dot`,
  point: `v:${layerId}:point`, label: `v:${layerId}:label`,
});
/**
 * Rasters (imagery, DEM) must sit below every vector layer AND every overlay (selection, GPS, navigation, measure).
 * Returns the id to insert rasters before: the first vector or overlay layer, or undefined if there is none yet.
 * (Using only the first *vector* layer put rasters above the overlays on a returning visit, hiding all vector layers.)
 */
export const firstAboveRasters = (ids: readonly string[]): string | undefined =>
  ids.find((id) => isVectorMapLayer(id) || isOverlayAnchor(id));

/** Map layers a tap may hit: vector fill/line/point layers that are currently visible. */
export const isInteractiveId = (id: string): boolean => isVectorMapLayer(id) && !id.endsWith(':label') && !id.endsWith(':band');
export const isOverlayAnchor = (id: string): boolean => ['sel:', 'gps:', 'nav:', 'meas:'].some((p) => id.startsWith(p));

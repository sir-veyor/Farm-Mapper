export const rasterLayerId = (layerId: string): string => `r:${layerId}`;
export const rasterSourceKey = (layerId: string): string => `rs:${layerId}`;
export const isVectorMapLayer = (id: string): boolean => id.startsWith('v:');

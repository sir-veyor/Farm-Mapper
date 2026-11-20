import Dexie, { type Table } from 'dexie';
import type { Layer, Poi, RasterBlob, RasterSource, Settings, VectorFeature } from '../types';

export class ParcelDb extends Dexie {
  layers!: Table<Layer, string>;
  pois!: Table<Poi, string>;
  features!: Table<VectorFeature, string>;
  rasterSources!: Table<RasterSource, string>;
  rasterBlobs!: Table<RasterBlob, string>;
  settings!: Table<Settings, string>;

  constructor(name = 'parcel-mapper') {
    super(name);
    // Never edit an existing version; add db.version(n+1).upgrade(...) instead.
    this.version(1).stores({
      layers: 'id, kind, order',
      pois: 'id, layerId, updatedAt',
      features: 'id, layerId, updatedAt',
      rasterSources: 'id',
      rasterBlobs: 'id',
      settings: 'id',
    });
  }
}

export const db = new ParcelDb();

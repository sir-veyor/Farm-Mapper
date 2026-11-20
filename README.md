# Farm Mapper

Offline-first parcel field-mapping PWA: pin points of interest (GPS, averaged GPS, or by tap), import MBTiles
imagery/DEM and KML/KMZ, organise features in layers with **Show/Hide**, **Freeze** and **Lock**, restyle anything,
and export selected layers as KMZ, KML or GeoJSON. Maps and pins stay on the device; nothing is uploaded.

- Specification and build plan: [PLAN.md](PLAN.md)
- Develop: `npm install`, `npm run dev`
- Test: `npm test` (unit tests run in Node/jsdom with an in-memory IndexedDB)
- Build: `npm run build` (output in `dist/`); pushes to `main` deploy to GitHub Pages

## Layer states

| | Drawn | Editable | Layer deletable |
|---|---|---|---|
| Normal | yes | yes | yes |
| Hidden (eye off) | no (stays loaded) | no | yes |
| Frozen (snowflake) | **no** (removed from the map, reader closed) | no | yes |
| Locked (padlock) | yes | **no** (read-only details on tap) | **no** |

## Bundled data

`public/data/` holds the orthoimagery and the DEM (cropped to the imagery footprint). On first launch the app downloads
them once and stores them in the browser as ordinary raster layers. They are not part of the offline cache that installs
with the app. Bump `BUNDLE_VERSION` in `src/raster/bundledData.ts` when the files change.

The parcel **Boundary**, **Trails** and **Tree Stands** layers are compiled into the app (`src/data/`), so they
appear on first launch with no network. Each is added once per device (remembered by key in settings), so anything you
delete, move or restyle is never put back. To add more, extend `BUNDLED_VECTORS` in `src/data/bundledVectors.ts`.
The **Trails** layer is the surveyed centerline set (`CL_Trails.dxf`, 26 polylines, 6.95 km): converted from NAD83(2011)
New York Central state plane (EPSG:6535, US survey feet) to lon/lat and shifted to WGS84 with the same constant used for the
imagery (`NAD83_TO_WGS84_SHIFT` in `src/config.ts`), so lines, imagery and GPS agree. It is drawn dashed; line style
(solid / dashed / dotted) is a per-layer default that any item can override.

One-time migrations in `src/data/seedBundledVectors.ts` upgrade devices seeded by earlier versions (old two-edge trails ->
centerlines, numbered stand names -> unnumbered) without touching locked layers or names you edited.

## Deviations from the plan

- Moving a pin is **tap-to-place** (Move, then tap the new spot) instead of dragging, which avoids accidental drags on touch screens.
- Backups are restored from the **Backup** dialog; the Import dialog takes `.mbtiles`, `.kml` and `.kmz`.
- `sql-wasm-browser.wasm` (not `sql-wasm.wasm`) is shipped, because the bundler uses sql.js's browser build.
- Known limitation: a note containing the literal text `]]>` is exported as valid KML but only its first part survives re-import.
- Added dev-only packages: `fake-indexeddb` and `jsdom` (tests), `@types/sql.js`.

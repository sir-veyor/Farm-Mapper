# Parcel Field Mapper: Phase 1 Architecture & Build Plan

> Paste this whole document into the Phase 2 prompt. The implementer builds **one Step (§7) at a time** and stops for verification after each one.

---

## 0. Facts verified from your uploaded data

| Asset | Finding | Consequence for the build |
|---|---|---|
| `The_Farm_DEM.mbtiles` (28 MB) | Tables `metadata` + `tiles`. `format=png`, `type=overlay`, `minzoom=12`, `maxzoom=18`, `bounds=-77.50083,42.38049,-77.46177,42.41775`. 515 tiles total (z12: 1 → z18: 384). | Raster overlay source. Tiles are PNGs (they can have transparency). |
| DEM row scheme | z12 tile is stored as `tile_column=1166, tile_row=2581`. For this latitude the XYZ row is **1514**, and 2^12 − 1 − 1514 = **2581**. | Rows are stored in **TMS** order, which is the MBTiles standard. The y-flip is required, and §8.1 gives the formula. |
| 4 × `c_0576/0579_0874/0876_12_24000_4bd_2023.zip` | Each holds a JPEG2000 (`.jp2`) with `.j2w`/`.aux.xml`/`.tab`. CRS **EPSG:6535**, NAD83(2011) / New York Central (US survey ft). Pixel size 1 ft. Each tile is 3000 × 2000 px. The data has **4 bands (R, G, B, NIR)**. | Browsers can't display JP2 and can't reproject. Convert the imagery to an RGB, Web-Mercator `.mbtiles` **once on a desktop** (§6). This is not an app feature. |
| Ortho extent | State-plane 576000–582000 E, 874000–878000 N (ft), which is about −77.4874…−77.4654 lon and 42.3953…42.4064 lat. That is **inside** the DEM bounds. | The ortho covers the center of the DEM area, not the whole thing. That's expected. |
| Datum shift | Ortho coordinates are NAD83(2011). Phone GPS reports WGS84 (G2139), which matches ITRF2014. At this parcel, epoch 2026.9, the same ground point is **0.74 m west and 1.08 m north** in WGS84 compared with its NAD83(2011) numbers. That is **1.30 m total**, uniform to within 2 mm across the ortho (computed with PROJ 9.8 using EPSG's "ITRF2014 to NAD83(2011)" + "WGS 84 (G2139) to ITRF2014" Helmert). A default GDAL warp to EPSG:3857 does **not** apply this shift. | Fix it once during desktop tile prep (§6, §8.8), so the app itself stays all-WGS84. |

---

## 1. Platform & tech stack decision

**Decision (approved): an installable PWA (Progressive Web App), written in TypeScript, built with Vite.**

Why:
- One codebase runs on iPhone, Android, and laptop. You install it to the home screen once. After that it runs with **no network at all**: a service worker serves the app shell, and your data lives in IndexedDB.
- MapLibre GL JS renders raster tiles and GeoJSON offline. It has a documented `addProtocol` hook, which lets us serve tiles straight out of an `.mbtiles` file.
- `sql.js` (SQLite compiled to WASM) reads `.mbtiles` in the browser. No server is needed.
- Every dependency is mainstream and well documented, so a smaller model is unlikely to misuse it.

**One-time network requirement:** the app has to be *opened once* from an HTTPS origin, or from `localhost` during development, to install. Any free static host works (GitHub Pages, Netlify, Cloudflare Pages). Your map data never goes to that host. You load it from the device's files.

> Later option, not in v1: wrap the same build with Capacitor if you ever need background GPS or native file storage. Nothing in this plan blocks that.

### Dependencies (complete list; nothing else may be added)

| Package | Purpose |
|---|---|
| `maplibre-gl` (v5.x) | Map rendering, raster and GeoJSON layers, custom protocol |
| `sql.js` (v1.x) | Read `.mbtiles` (SQLite). Its `sql-wasm-browser.wasm` file (the one Vite's browser build requests) is served locally from `/public`. |
| `dexie` (v4.x) | IndexedDB wrapper for all app data and raster blobs |
| `jszip` (v3.x) | Unpack KMZ, build KMZ, build backup zips |
| `@tmcw/togeojson` (latest major) | KML → GeoJSON, including styles and folders |
| `react`, `react-dom` (v18/19) | UI panels |
| `zustand` (v5.x) | Small UI state store |
| `vite`, `typescript`, `@vitejs/plugin-react`, `vite-plugin-pwa` | Build and offline service worker |
| `vitest` (dev) | Unit tests for the pure functions (color conversion, TMS flip, averaging, KML writer) |

The implementer **writes its own** KML exporter (§5.4), because `tokml` is unmaintained. It does **not** use `react-map-gl`; the code holds the MapLibre `Map` in a ref. **No CDN URLs** may appear anywhere in the app.

---

## 2. High-level architecture

```
┌──────────── UI (React) ───────────────────────────────────────────┐
│ LayerTree │ PoiEditor │ StyleEditor │ GpsPanel │ Import/Export     │
└─────┬─────────────────────────────────────────────────────────────┘
      │ calls services / reads zustand store
┌─────▼──────────── Services ───────────────────────────────────────┐
│ rasterImport  kmlImport  gpsService  exportService  backupService │
└─────┬───────────────────────────────┬─────────────────────────────┘
      │ repos (only path to IndexedDB)│ map sync
┌─────▼───────────┐            ┌──────▼──────────────────────────────┐
│ db/ (Dexie)      │──changes──▶ map/layerSync: DB state → MapLibre   │
│ layers, pois,    │            │ sources/layers; mbtiles:// protocol │
│ features, raster │            │ reads blobs via mbtilesReader       │
└──────────────────┘            └─────────────────────────────────────┘
```

**Golden rule:** the DB is the source of truth. UI actions call repo functions. Each repo write emits a change event. `layerSync` then rebuilds the affected map source. Map code never mutates data directly.

---

## 3. Data models (`src/types.ts`)

All IDs are `crypto.randomUUID()`. All timestamps are ISO-8601 UTC strings. All coordinates are **WGS84 `[lon, lat]`** (GeoJSON order), with an optional 3rd value for altitude.

```ts
export type HexColor = `#${string}`;            // always '#rrggbb', lowercase

export type SymbolId =
  | 'pin' | 'circle' | 'square' | 'triangle' | 'star' | 'flag'
  | 'tree' | 'treestand' | 'camera' | 'feeder' | 'water' | 'gate'
  | 'parking' | 'hazard' | 'tracks' | 'x';      // fixed set, bundled SVG paths

export interface Style {
  strokeColor: HexColor;     // lines and polygon outlines
  strokeWidth: number;       // CSS px, 0.5–12
  strokeOpacity: number;     // 0–1
  fillColor: HexColor;       // polygons
  fillOpacity: number;       // 0–1 (0 = outline only)
  symbol: SymbolId;          // points
  symbolColor: HexColor;     // points
  symbolSize: number;        // icon scale 0.5–2.5 (1 = 32 px)
  showLabels: boolean;       // draw feature name next to it
}
export type StyleOverride = Partial<Style>;

// ---------- Layers ----------
export type LayerKind = 'vector' | 'raster';

export interface Layer {
  id: string;
  name: string;
  kind: LayerKind;
  order: number;             // sort within its group; higher = drawn on top
  visible: boolean;          // Show/Hide: quick toggle (see §4)
  frozen: boolean;           // Freeze: not drawn, not loaded, not editable (see §4)
  locked: boolean;           // Lock: drawn, but its data can't be edited or deleted (see §4)
  opacity: number;           // 0–1 (rasters: layer opacity; vectors: multiplier)
  defaultStyle: Style;       // vector layers; ignored for raster
  rasterSourceId?: string;   // required when kind === 'raster'
  createdAt: string;
  updatedAt: string;
}

// ---------- POIs (every point feature, whether GPS, tapped, or imported) ----------
export type PoiOrigin = 'gps' | 'gps-averaged' | 'map-tap' | 'import';

export interface GpsFix {
  accuracyM: number;               // horizontal accuracy (m). Averaged: median accuracy of used samples
  altitudeM?: number | null;
  altitudeAccuracyM?: number | null;
  fixTime: string;                 // time of the fix (end of the averaging window)
  avg?: {                          // only if averaged
    samplesUsed: number;
    samplesRejected: number;
    durationS: number;
    spreadM: number;               // RMS distance of the used samples from the mean
  };
  movedManually?: boolean;         // set when the user drags the pin after capture
}

export interface Poi {
  id: string;
  layerId: string;
  name: string;                    // default: "POI 2026-11-20 14:03"
  notes: string;                   // free text, multi-line
  lon: number;
  lat: number;
  origin: PoiOrigin;
  gps?: GpsFix;                    // present for origin gps / gps-averaged
  style: StyleOverride;            // only symbol/symbolColor/symbolSize/showLabels are used
  extra?: Record<string, string>;  // ExtendedData kept from imports
  createdAt: string;
  updatedAt: string;
}

// ---------- Vector features (lines and polygons only; points become Poi) ----------
export type LineOrPolygon =
  | GeoJSON.LineString | GeoJSON.MultiLineString
  | GeoJSON.Polygon | GeoJSON.MultiPolygon;

export interface VectorFeature {
  id: string;
  layerId: string;
  name: string;
  notes: string;                   // KML <description>, stored as plain text (HTML stripped)
  geometry: LineOrPolygon;
  style: StyleOverride;            // strokeColor/Width/Opacity, fillColor/Opacity, showLabels
  source: { kind: 'import'; fileName: string; importedAt: string; datumShiftApplied: boolean };
  extra?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

// ---------- Raster tile sources ----------
export interface RasterSource {
  id: string;
  name: string;                    // from metadata.name, else file name
  fileName: string;
  byteSize: number;
  format: 'png' | 'jpg' | 'webp';  // metadata.format, checked against magic bytes of the first tile
  scheme: 'tms' | 'xyz';           // 'tms' unless the user overrides (see §8.1)
  bounds: [number, number, number, number]; // [w,s,e,n] WGS84
  center?: [number, number, number];        // [lon,lat,zoom]
  minzoom: number;
  maxzoom: number;
  tileSize: 256 | 512;             // default 256
  attribution?: string;
  rasterType: 'baselayer' | 'overlay';
  datum: 'wgs84-corrected' | 'unknown';  // user-declared at import; 'unknown' shows a ⚠ alignment hint
  importedAt: string;
}
export interface RasterBlob { id: string /* = RasterSource.id */; data: Blob; }

// ---------- App settings (single row, id = 'settings') ----------
export interface Settings {
  id: 'settings';
  schemaVersion: number;           // starts at 1
  activeLayerId: string | null;    // where new POIs go (must be vector, not frozen, not locked)
  lastView: { lon: number; lat: number; zoom: number; bearing: number };
  gps: { averageSeconds: 5 | 10 | 30 | 60; maxAcceptAccuracyM: number /*default 15*/; timeoutS: number /*default 30*/ };
  units: 'metric' | 'imperial';    // accuracy shown as m or ft
  lastBackupAt: string | null;
  changesSinceBackup: number;
}
```

**Style resolution** (one pure function, `resolveStyle(layer, item)`): `{...APP_DEFAULT_STYLE, ...layer.defaultStyle, ...item.style}`. Changing a layer's default style recolors every item that doesn't override that property. A per-item **"Reset to layer style"** button clears `item.style`.

### Dexie schema (`src/db/db.ts`)
```ts
db.version(1).stores({
  layers:   'id, kind, order',
  pois:     'id, layerId, updatedAt',
  features: 'id, layerId, updatedAt',
  rasterSources: 'id',
  rasterBlobs:   'id',
  settings: 'id',
});
```
Future schema changes go in `db.version(n).upgrade(...)`. Existing versions are never edited.

---

## 4. Layer semantics (exact behavior)

Layers fall into **two groups** in the tree. **Vector layers are always drawn above raster layers.** You can reorder layers within a group (up/down buttons; no drag-and-drop in v1).

Each layer has three **independent** flags. They follow the CAD convention, so their meanings don't overlap:

- **Show/Hide** (eye icon) is a quick visual toggle. A hidden layer stays loaded so it can come back instantly.
- **Freeze** (snowflake icon) puts a layer **out of play**. The map draws a layer only when `visible && !frozen`, so freezing leaves `visible` untouched. A frozen layer is not drawn, its map source/layers are removed, its `.mbtiles` reader is closed, and nothing in it can be edited. Use it to declutter and speed things up. **Thaw** restores the layer's previous Show/Hide state.
- **Lock** (padlock icon) **protects data**. The layer is still drawn (if shown), but nothing in it can be changed, moved, or deleted, and the layer itself can't be deleted. Example: lock "Tree Stands" so they stay on screen as a reference while you work in another layer.

| Action | Normal | Hidden | Frozen | Locked |
|---|---|---|---|---|
| Rendered on map | yes | no | **no** | yes (if shown) |
| Source loaded (GeoJSON/mbtiles) | yes | yes | **no** | yes |
| Eye toggle | yes | yes | disabled (greyed) | yes |
| Tap an item | opens editor | n/a (not drawn) | n/a (not drawn) | opens **read-only** details (name, notes, coords, accuracy) |
| Drag a POI / edit item name, notes, style | yes | no | no | **no** |
| Delete an item / move it to another layer | yes | no | no | **no** |
| Move items **into** this layer, add new POIs | yes | yes (layer auto-shows) | **no** | **no** |
| Rename layer / edit default style | yes | yes | yes | **no** |
| Opacity / reorder (display only) | yes | yes | yes | yes |
| **Delete layer** | yes | yes | yes | **no**: "Unlock first" |
| Include in export | yes | yes | yes | yes |

Frozen and Locked can both be on. If they are, the rules of both apply.

**Enforcement happens in two places:**
1. **UI/map:** `layerSync` creates no map layers for frozen layers. The interactive layer-ID list (used by `queryRenderedFeatures`) holds shown, non-frozen vector layers, and taps on a locked layer open a read-only view. Disabled controls display the reason as a tooltip.
2. **Repos:** every function that changes items calls `assertItemsEditable(layerId)`, which throws `LayerLockedError` or `LayerFrozenError`. `deleteLayer` calls `assertLayerDeletable(layerId)`, which throws if the layer is locked. `renameLayer`/`setDefaultStyle` throw if it is locked. This catches anything the UI misses.

**Raster layers:** Freeze closes the sql.js database and frees its memory. Lock prevents deleting the layer. Rasters are never selectable.

The **active layer** is shown with a highlighted row in the tree. If the active layer gets frozen, locked, or deleted, `activeLayerId` becomes `null`, and the next "Pin" action asks you to pick a layer.

**Delete layer:** requires a confirm dialog and is blocked while the layer is locked. It deletes the layer's items, plus its RasterSource and blob if it's a raster layer.

---

## 5. Module / file structure

Each file has a single job and should stay under about 200 lines. Pure modules (marked ★) have no DOM or DB access and get vitest tests.

```
parcel-mapper/
├─ index.html
├─ vite.config.ts                 # react + vite-plugin-pwa (precache: js, css, wasm, glyphs, icons)
├─ public/
│  ├─ sql-wasm-browser.wasm       # copied from node_modules/sql.js/dist (NOT sql-wasm.wasm)
│  ├─ glyphs/Noto Sans Regular/0-255.pbf, 256-511.pbf   # for labels (see §8.6)
│  └─ icons/ (PWA icons)
└─ src/
   ├─ main.tsx                    # bootstraps db, registers protocol, renders <App/>
   ├─ config.ts                   # APP_DEFAULT_STYLE, MAP_MAX_ZOOM=22, limits, symbol list,
   │                              #   NAD83_TO_WGS84_SHIFT = { dEastM: -0.740, dNorthM: 1.078 } (§8.8)
   ├─ types.ts                    # §3
   ├─ util/
   │  ├─ ids.ts                   # newId(), nowIso()
   │  ├─ events.ts                # tiny typed emitter: 'layers'|'pois'|'features'|'rasters'|'settings'
   │  └─ geo.ts ★                 # bbox of geometries, metersBetween, unionBounds, padBounds
   ├─ db/
   │  ├─ db.ts                    # Dexie instance + schema
   │  ├─ errors.ts                # LayerFrozenError, LayerLockedError, NotFoundError
   │  ├─ layersRepo.ts            # CRUD, reorder, setVisible, setFrozen, setLocked,
   │  │                           #   assertItemsEditable, assertLayerDeletable
   │  ├─ poisRepo.ts              # CRUD, move(lon,lat), byLayer
   │  ├─ featuresRepo.ts          # CRUD, bulkAdd, byLayer
   │  ├─ rasterRepo.ts            # add source+blob, get blob, delete
   │  └─ settingsRepo.ts          # get/patch settings, bumpChangeCounter
   ├─ raster/
   │  ├─ tms.ts ★                 # xyzToTmsRow(z,y), tile bounds math
   │  ├─ mbtilesMeta.ts ★         # parse metadata rows → RasterSource fields + validation
   │  ├─ mbtilesReader.ts         # open Blob with sql.js, cached prepared stmt, getTile(z,x,y)
   │  ├─ mbtilesProtocol.ts       # maplibregl.addProtocol('mbtiles', ...) + reader registry
   │  └─ rasterImport.ts          # File → validate → store → create raster Layer
   ├─ map/
   │  ├─ mapInit.ts               # create Map, offline base style, controls
   │  ├─ layerIds.ts ★            # naming: `v:{layerId}:fill|line|point|label`, `r:{layerId}`
   │  ├─ styleExpressions.ts ★    # MapLibre paint/layout using resolved per-feature props
   │  ├─ toGeoJSON.ts ★           # (layer, pois, features) → FeatureCollection w/ resolved style props
   │  ├─ layerSync.ts             # subscribe to events → add/update/remove sources & layers, order
   │  ├─ symbols.ts ★             # SymbolId → SVG path data
   │  ├─ iconImages.ts            # 'styleimagemissing' → draw `poi|{symbol}|{color}` on canvas
   │  ├─ interaction.ts           # tap-select (interactive layers only), POI drag, selection highlight
   │  └─ gpsMarker.ts             # blue dot + accuracy circle source/layers
   ├─ gps/
   │  ├─ gpsService.ts            # watchPosition lifecycle, status, error mapping, wake lock
   │  └─ averaging.ts ★           # filter + weighted mean + spread (see §8.4)
   ├─ kml/
   │  ├─ kmlColor.ts ★            # aabbggrr ⇄ {hex, opacity}
   │  ├─ datumShift.ts ★          # applyNad83ToWgs84(geometry) using the constant in config.ts
   │  ├─ kmzUnpack.ts             # JSZip: find main .kml, return text + list of skipped items
   │  ├─ kmlParse.ts              # togeojson → normalized {pois, features, warnings}
   │  └─ kmlImport.ts             # orchestrates: unpack → parse → create layer(s) → bulk insert
   ├─ export/
   │  ├─ buildExportModel.ts      # selected layer IDs → resolved items
   │  ├─ geojsonExport.ts ★
   │  ├─ kmlWriter.ts ★           # hand-written KML 2.2 (§8.5)
   │  ├─ kmzExport.ts             # doc.kml + files/icon-*.png via JSZip
   │  └─ deliver.ts               # Web Share API w/ files, fallback <a download>
   ├─ backup/
   │  └─ backupService.ts         # full project zip export / restore (§8.7)
   ├─ state/
   │  └─ uiStore.ts               # zustand: selection, open panel, gps live state, toasts
   └─ ui/
      ├─ App.tsx                  # layout: map full-screen + bottom sheet/side panel
      ├─ MapView.tsx              # mounts map once (ref), wires layerSync & interaction
      ├─ Toolbar.tsx              # Pin GPS, Pin Avg, Layers, Import, Export, Locate
      ├─ LayerTree.tsx            # two groups, eye toggle, lock toggle, active radio, menu
      ├─ LayerRow.tsx
      ├─ StyleEditor.tsx          # shared for layer default & item override
      ├─ ColorPicker.tsx          # native <input type=color> + 12 preset swatches
      ├─ SymbolPicker.tsx
      ├─ PoiEditor.tsx            # name, notes, symbol/color, coords, accuracy, move/delete
      ├─ FeatureEditor.tsx        # name, notes, style, move-to-layer, delete
      ├─ GpsPanel.tsx             # live accuracy, averaging countdown/progress
      ├─ ImportDialog.tsx         # .mbtiles / .kml / .kmz / backup .zip routing
      ├─ ExportDialog.tsx         # checkbox per layer, format choice
      ├─ ConfirmDialog.tsx
      └─ Toasts.tsx
```

---

## 6. One-time desktop prep: ortho imagery → `.mbtiles` (not app code)

Use QGIS's OSGeo4W Shell (Windows) or any GDAL ≥ 3.4. Run these in the folder holding the 4 unzipped `.jp2` sets:

```bash
gdalbuildvrt -b 1 -b 2 -b 3 farm_rgb.vrt c_*_2023.jp2
```
Datum fix (§8.8): move the mosaic's corners by the NAD83(2011) → WGS84 shift, which is −2.395 ft east and +3.561 ft north. The original corners are 576000/878000 and 582000/874000.
```bash
gdal_translate -of VRT -a_srs EPSG:6535 -a_ullr 575997.605 878003.561 581997.605 874003.561 farm_rgb.vrt farm_rgb_wgs84.vrt
```
```bash
gdalwarp -s_srs EPSG:6535 -t_srs EPSG:3857 -r bilinear -dstalpha -co TILED=YES -co COMPRESS=DEFLATE farm_rgb_wgs84.vrt farm_rgb_3857.tif
```
Why this works: the warp in the second command does the normal (no-shift) NAD83 → Mercator math. The `-a_ullr` step adds the true WGS84 offset first. The offset is uniform to within 2 mm over this 6000 × 4000 ft area, so a corner shift is exact enough. Run `gdalinfo farm_rgb.vrt` first and confirm the corners read 576000, 878000 and 582000, 874000. If they don't, add −2.395 / +3.561 to whatever they read.
```bash
gdal_translate -of MBTILES -co TILE_FORMAT=WEBP -co QUALITY=85 -co ZOOM_LEVEL_STRATEGY=UPPER -co NAME="The Farm Ortho 2023" farm_rgb_3857.tif farm_ortho_2023.mbtiles
```
```bash
gdaladdo -r average farm_ortho_2023.mbtiles 2 4 8 16 32 64 128
```

Notes:
- `-b 1 -b 2 -b 3` is **required**. Without it, GDAL can read the 4th band (NIR) as alpha, which leaves patchy transparent holes in the imagery.
- 1 ft pixels give **z19** at this latitude. The finished file should be roughly 15–50 MB. (Already built and verified: `farm_ortho_2023.mbtiles`, 33 MB, WebP, z13–19, TMS rows, 1,052 tiles, metadata `type=baselayer`. Measured shift vs an uncorrected warp: 0.66 m W, 1.11 m N, within one 0.3 m pixel of the target.)
- If your GDAL has no WEBP support, use `TILE_FORMAT=PNG`. Avoid JPEG, because it turns the edges outside the imagery black instead of transparent.
- **Optional color-infrared layer**, which is very useful for spotting tree types and vegetation health: repeat the steps with `-b 4 -b 1 -b 2` and name it "The Farm CIR 2023".
- **DEM: fix it only if it's offset.** Its source and how it was made are unknown. If it was made from NAD83 LiDAR with a plain GDAL or QGIS export, it carries the same 1.30 m error. Test it in Step 2, check 4. If the DEM is offset, re-tile it with its Mercator corners shifted by **dx = −1.003 m, dy = +1.462 m** (EPSG:3857 metres differ from ground metres at this latitude):
  1. Run `gdalinfo The_Farm_DEM.mbtiles` and note the *Upper Left* and *Lower Right* coordinates.
  2. Run `gdal_translate -a_ullr <ULx−1.003> <ULy+1.462> <LRx−1.003> <LRy+1.462> The_Farm_DEM.mbtiles dem_shifted.tif`.
  3. Run `gdal_translate -of MBTILES -co TILE_FORMAT=PNG -co ZOOM_LEVEL_STRATEGY=UPPER dem_shifted.tif The_Farm_DEM_wgs84.mbtiles`.
  4. Run `gdaladdo -r average The_Farm_DEM_wgs84.mbtiles 2 4 8 16 32 64`.
  If you still have the original LiDAR GeoTIFF, it's better to rebuild from that with the same `-a_ullr` trick used for the ortho.
- GUI alternative: QGIS → Processing → *Generate XYZ tiles (MBTiles)*.
- GDAL writes MBTiles in TMS order, so the app handles both of your files the same way.

---

## 7. Step-by-step build sequence

Each step ends with **Done when** criteria and **Manual checks on your data**. The implementer must not start step N+1 until step N passes.

### Step 0: Project scaffold & offline shell
- Create the project with Vite (react-ts). Add the dependencies from §1. Set up `vite-plugin-pwa` with `registerType: 'autoUpdate'` and precaching for js/css/html/wasm/pbf/png/svg. Copy `sql-wasm.wasm` into `public/`.
- `App.tsx` shows a full-screen empty map: background color `#e9e6df`, `style.sources = {}`, no `glyphs` yet, `maxZoom: 22`.
- Call `navigator.storage.persist()` on first launch. Show the result in a settings or about panel, along with `navigator.storage.estimate()`.

**Done when:** `npm run build && npm run preview` serves the app; after one load, DevTools → Network → *Offline* and a reload still renders the map; Lighthouse/DevTools shows the app as installable.
**Manual check:** install it on your phone from the hosted URL, turn on airplane mode, and open it from the home screen. It should load.

### Step 1: Types, DB, repos, events
- Write `types.ts`, `db.ts`, every repo, `errors.ts`, and `events.ts`. On first run, seed one vector layer named "My POIs" and set it as active.
- Every repo write updates `updatedAt`, increments `changesSinceBackup`, and emits its event.
- Write vitest tests for `resolveStyle`, for `assertItemsEditable` throwing on frozen and on locked layers, and `assertLayerDeletable` throwing only on locked layers.

**Done when:** the tests pass, and in DevTools → Application → IndexedDB the seeded layer and settings rows appear and survive a reload.

### Step 2: MBTiles reader + protocol + raster layers (DEM first)
- `mbtilesMeta.ts`: parses metadata. Fallbacks: missing `minzoom`/`maxzoom` → `SELECT MIN/MAX(zoom_level) FROM tiles`; missing `bounds` → compute from the tile extent at maxzoom (convert TMS rows first); missing `format` → sniff magic bytes (`89 50 4E 47` = png, `FF D8` = jpg, `RIFF....WEBP` = webp). Reject the file if a `tiles` table/view is missing or the format is `pbf` (vector tiles are unsupported in v1 → clear error message).
- `mbtilesReader.ts`: loads the Blob into sql.js (`new SQL.Database(new Uint8Array(await blob.arrayBuffer()))`). Keeps one open DB per source in a `Map<sourceId, Reader>`, opened lazily and kept open. Uses one reused prepared statement: `SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?`.
- `mbtilesProtocol.ts`: `addProtocol('mbtiles', async (params, abort) => …)`. URL format: `mbtiles://{sourceId}/{z}/{x}/{y}`. Flip y when `scheme==='tms'`. If no row is found, return a **cached 1×1 transparent PNG**, never an error.
- `layerSync.ts` (raster part): for each raster layer, add a source `{type:'raster', tiles:[`mbtiles://${id}/{z}/{x}/{y}`], tileSize, minzoom, maxzoom, bounds}` and a layer `r:{id}` with `raster-opacity`. `visibility` follows `visible`. Order follows `order`, and rasters stay below every `v:*` layer.
- `rasterImport.ts` + a minimal `ImportDialog` (`<input type=file accept=".mbtiles">`): validate → ask "Was this file datum-corrected to WGS84? (Yes / Not sure)" → store the blob → create a raster layer → zoom to its bounds. "Not sure" sets `datum: 'unknown'`, and the layer row shows a small ⚠ with a tooltip linking to the §8.8 check.
- Frozen raster layers: no source or layer on the map, and the reader is closed (`db.close()`, removed from the registry). Default order: imagery (`baselayer` or jpg/webp) below `overlay`/png.
- Map `maxBounds` = union of all raster bounds padded by 3 km. If there are no rasters, there is no clamp.

**Done when:** importing a file shows tiles; the map can zoom to 22 and the source overzooms past its maxzoom with no 404 spam in the console; data survives a reload with no re-import.
**Manual checks on your data:**
1. Import `The_Farm_DEM.mbtiles`. The map should fly to about −77.481, 42.399. Hillshade/colour should appear from z12 to z22, upscaled beyond z18.
2. Pan outside the bounds rectangle. DevTools should show **no tile requests** there, and you can't pan more than about 3 km past the edge.
3. Temporary debug check: log z12 → the request should be x=1166, y=1514 → DB row 2581, with a tile found.
4. Import `farm_ortho_2023.mbtiles` from §6, which is datum-corrected. Zoom to z20–21 on a sharp feature that shows in both layers, such as a road cut, ditch, or building pad. Toggle the DEM on and off over it. If the DEM sits about **1.3 m to the south-east** of the ortho, it needs the §6 DEM fix. If the two coincide, the DEM is already fine.
5. Turn on airplane mode, reload, and both layers should still render.

### Step 3: Layer tree (show/hide, freeze, lock, order, opacity)
- Build `LayerTree` and `LayerRow`. The tree has two groups, "Overlays & Features" (vector) and "Imagery & Rasters". Each row shows an eye toggle, a snowflake (freeze) toggle, a padlock (lock) toggle, an active-layer radio (vector only), an opacity slider (raster), and a "⋯" menu (rename, move up/down, layer style [vector], zoom to layer, delete).
- Frozen rows are rendered dimmed/italic with the eye greyed out. Locked rows show a padlock, and the controls listed in §4 are disabled.
- Add a "New vector layer" button.

**Done when:** toggling the eye hides or shows the layer instantly; freezing removes the layer from the map (the MapLibre style has no `r:`/`v:` entries for it) and thawing restores its previous show/hide state; a locked layer's Delete is disabled and `layersRepo.deleteLayer(id)` throws from the console; order and opacity persist after reload.
**Manual checks:**
1. Hide the DEM so only the ortho shows.
2. Set DEM opacity to 50% over the ortho.
3. Freeze the DEM. It disappears and its eye is greyed. Thaw it and it returns at 50%.
4. Lock the DEM and confirm Delete is blocked, while the eye and opacity still work.

### Step 4: Vector rendering pipeline + POI icons (no GPS yet)
- `toGeoJSON.ts`: builds one FeatureCollection per vector layer. Each feature's properties carry **resolved** style values (`_stroke`, `_strokeW`, `_strokeO`, `_fill`, `_fillO`, `_icon` = `poi|{symbol}|{color}`, `_size`, `_label`), plus `_kind` (`poi`/`feature`) and `_id`.
- Each vector layer gets 4 map layers: `v:{id}:fill` (Polygon fill), `v:{id}:line` (lines and polygon outlines), `v:{id}:point` (symbol, `icon-image: ['get','_icon']`, `icon-allow-overlap: true`), and `v:{id}:label` (added only once glyphs exist; see §8.6). `fill-opacity` and the others are multiplied by `layer.opacity`.
- `iconImages.ts`: on `styleimagemissing`, parse the id → draw a 64 px canvas (a white-outlined symbol in that color at pixelRatio 2) → `map.addImage(id, imageData, {pixelRatio: 2})`.
- Long-press (about 600 ms) or the "+" mode on the map adds a POI at that spot (`origin: 'map-tap'`) in the active layer.

**Done when:** you can add POIs by long-press, they appear with the right symbol and color, changing a layer's default symbol/color recolors its non-overridden POIs, and hidden layers vanish.
**Manual check:** with the app offline, add 3 POIs on the ortho at recognizable spots (a field corner, a building corner) and reload. They should stay put.

### Step 5: Selection, POI editor, dragging, lock/freeze enforcement
- `interaction.ts`: on tap, `queryRenderedFeatures(point ± 10 px box, {layers: interactiveLayerIds})`, where interactive means a vector layer that is shown and not frozen. The topmost hit wins. A hit in a locked layer opens the editor in read-only mode: all inputs are disabled, a "🔒 Layer locked" banner shows, and there are no Move/Delete buttons. A highlight ring/outline is drawn from a `selection` source on top.
- `PoiEditor.tsx`: name, notes (textarea), SymbolPicker, ColorPicker, size, show label, coordinates (decimal degrees, copy button), the gps block (accuracy, averaged stats), a "Move to layer" dropdown (only layers that are vector, not frozen, and not locked), Delete (with confirm), and "Reset to layer style". Saves on blur or change.
- POI drag: only after the POI is selected. Use the "Move" button in the editor → drag mode (`mousedown`/`touchstart` on the selected point → move → `poisRepo.move`). This avoids accidental drags while panning. The origin stays the same, and `gps.movedManually` is set to `true`.

**Done when:** you can edit a POI and the change persists; POIs in a locked layer open read-only and cannot be moved or deleted (and the repo throws if forced from the console); frozen layers show nothing and catch no taps.
**Manual check:**
1. Create a layer called "Tree Stands" with 2 pins and lock it.
2. Work in "My POIs". The stands stay visible, tapping one shows its notes read-only, and you can't delete or drag them.
3. Freeze "Tree Stands". They vanish. Thaw it and they come back.

### Step 6: GPS (live position, pin current location, averaging)
- `gpsService.ts`: `watchPosition({enableHighAccuracy: true, maximumAge: 0, timeout: settings.gps.timeoutS*1000})` runs while the GPS panel is open or the "follow" toggle is on. It exposes `{status: 'off'|'acquiring'|'ok'|'denied'|'unavailable'|'timeout', last: {lon,lat,accuracyM,altitudeM,time}}` through the zustand store.
- `gpsMarker.ts`: a blue dot plus an accuracy circle (a polygon with 64 vertices computed in meters).
- `GpsPanel`: shows live accuracy (color: green ≤ 5 m, amber ≤ 15 m, red above that), the age of the last fix, and two buttons:
  - **Pin here**: uses the most recent fix if it is < 3 s old. Otherwise it waits up to `timeoutS` for the next fix. Creates a POI with `origin: 'gps'`.
  - **Pin (average Ns)**: collects samples for N seconds with a progress bar and Cancel button, holding a Screen Wake Lock (if supported) during the window. It runs `averaging.ts` (§8.4) and creates a POI with `origin: 'gps-averaged'`.
- After pinning, the PoiEditor opens immediately so you can type notes.

**Done when:** pins land at the device location; averaged pins show samples/spread in the editor; denied permission shows a clear message with steps to re-enable; airplane mode **still gets GPS** (GPS doesn't need a network, but the first fix can be slow).
**Manual checks:** stand on a visible ortho feature (a driveway corner) and do a 30 s average. The pin should land within the reported accuracy. Repeat under canopy and compare the spread values.

### Step 7: KML/KMZ import + style editor
- `kmzUnpack.ts`: JSZip. The main file is `doc.kml` at the root; otherwise the first `.kml` at the shallowest depth. Other `.kml` files are listed as warnings and not imported. Embedded images are ignored in v1 (they generate a warning).
- `kmlParse.ts`: `DOMParser` (`text/xml`; if `parsererror` is present, report "Not valid KML"). Use togeojson's `kml()`.
  - Point / MultiPoint → one `Poi` per point (`origin: 'import'`).
  - LineString/Polygon (and Multi*) → `VectorFeature`.
  - GeometryCollection (from MultiGeometry) → split into its parts; each part keeps the placemark name with suffix ` (1)`, ` (2)`, and so on.
  - Drop altitude.
  - Style mapping from togeojson props: `stroke`→strokeColor, `stroke-width`→strokeWidth, `stroke-opacity`, `fill`, `fill-opacity`; points: `icon-color`/`marker-color`→symbolColor, symbol = `pin`. Normalize every color to `#rrggbb` lowercase.
  - `description` → strip HTML to text. `ExtendedData` → `extra`.
  - **Count unsupported elements and report them**: `NetworkLink`, `GroundOverlay`, `ScreenOverlay`, `PhotoOverlay`, `Model`, and placemarks with no geometry. Never fetch any `href`.
- Import options: layer name (default: file name without extension); "Split top-level folders into separate layers" (uses togeojson `kmlWithFolders`); **"Coordinates are NAD83 (from county/state GIS): apply datum shift"** (default **off**). Files made in Google Earth, a phone app, or this app are already WGS84, so they need no shift. When the option is checked, `datumShift.ts` adds the §8.8 constant to every vertex and sets `datumShiftApplied: true`.
- After import, show a summary toast (e.g. "Imported 12 points, 4 lines, 2 polygons. Skipped: 1 NetworkLink (requires internet)"), then zoom to the imported extent.
- `StyleEditor.tsx` (reused for layer defaults and per-item overrides): stroke color, width (slider), opacity; fill color and opacity; symbol, symbol color, size; show labels. It previews live on the map.
- `FeatureEditor.tsx`: the same as PoiEditor minus GPS and coordinates, plus a feature length (lines) or area (polygons, in acres and ha) readout via `geo.ts`.

**Done when:** a KMZ exported from Google Earth (with a folder, line, polygon, placemark, and a NetworkLink) imports with the correct colors, the NetworkLink is reported but doesn't break the import, and line color/width can be changed at both the layer and item level.
**Manual checks:** import a property-boundary or trail KMZ you already have. Then change the trail to orange at 4 px and set the boundary to 20% fill. Reload, and the changes should persist.

### Step 8: Export selected layers
- `ExportDialog`: a checkbox list of vector layers (all, including frozen, locked, and hidden) plus a format choice: **KMZ** (default), **KML**, or **GeoJSON**. Also an "Include notes" checkbox (default on).
- File name: `parcel-export-YYYYMMDD-HHmm.{kmz|kml|geojson}`.
- GeoJSON: one FeatureCollection. Properties: `name`, `notes`, `layer`, `origin`, `accuracy_m`, `created`, plus simplestyle-spec keys (`stroke`, `stroke-width`, `stroke-opacity`, `fill`, `fill-opacity`, `marker-color`, `marker-symbol`).
- KML/KMZ: follows §8.5. KMZ includes rendered PNG icons.
- `deliver.ts`: if `navigator.canShare?.({files:[file]})` is true, use `navigator.share` (this gives AirDrop, Messages, Drive, etc. on phones). Otherwise download via a Blob URL `<a download>`.

**Done when:** exported files open in Google Earth (KMZ/KML) and QGIS/geojson.io (GeoJSON) with correct positions, colors, folders, names, and notes; frozen and hidden layers export too.
**Manual checks:** export "Tree Stands" + "My POIs" as KMZ, AirDrop/email it to a computer, and open it in Google Earth Pro. The pins should match the ortho locations and the colors should match the app. Then re-import that KMZ into the app as a round-trip test.

### Step 9: Backup / restore & guardrails polish
- Backup and restore (§8.7), a backup reminder banner (§8.7), a storage usage readout, and labels/glyphs (§8.6).
- A "Locate me" button that centers on GPS, and a "Zoom to parcel" button that zooms to the union of raster bounds.

**Done when:** you can back up, clear the site data, restore, and get every layer, POI, feature, and style back. The rasters come back too if they were included in the backup.
**Manual check:** run the full backup → clear → restore cycle on your phone before the first real field day.

---

## 8. Edge cases & offline guardrails

### 8.1 MBTiles TMS vs XYZ
- MBTiles spec = TMS: `tmsRow = (1 << z) - 1 - y`. Implement it in `tms.ts` with tests: `xyzToTmsRow(12, 1514) === 2581`.
- Some tools write XYZ rows into MBTiles anyway. The first tile you look at decides: when importing, try a lookup of the center tile at minzoom under both schemes. If only the XYZ lookup hits, set `scheme: 'xyz'`. Also give the layer menu a **"Flip Y (TMS/XYZ)"** toggle as a manual escape hatch. (Your DEM has been verified as TMS.)
- `tile_data` may be gzip only for vector tiles. Raster tiles are used as-is.

### 8.2 Bounds & zoom clamping
- Always pass `bounds`, `minzoom`, and `maxzoom` to the MapLibre raster source. This stops requests outside the data and enables **overzoom** above maxzoom (MapLibre upsamples z18 for z19–22, so no empty lookups happen).
- Below minzoom, the layer just isn't drawn. That's fine.
- Validate the bounds: `w<e`, `s<n`, inside ±180/±85.05. If they're invalid, fall back to the computed tile extent. Bounds given in the wrong order are swapped.
- The map's `maxBounds` gets 3 km of padding so you can't get lost in blank space. There is no clamp before the first raster exists.

### 8.3 KMZ / KML
- **KML colors are `aabbggrr`**, not `rrggbb`. `kmlColor.ts`: `kmlToHex('ff0000ff') → {hex:'#ff0000', opacity:1}` (red); `hexToKml('#ff0000', 0.5) → '7f0000ff'`. Unit-test both directions. togeojson already converts colors on import; the writer must convert back.
- Zips with folders, uppercase `.KML`, or non-UTF-8 names: match case-insensitively. Reject zips over 100 MB, or any entry whose uncompressed size is over 200 MB (zip bomb guard; read `_data.uncompressedSize`).
- `<NetworkLink>`, `<GroundOverlay>` etc. are counted and reported, **never fetched**.
- Empty result (0 importable features) → error toast, and no empty layer gets created.
- Invalid coordinates (NaN, |lat|>90, or a polygon ring with < 4 positions) → skip that feature and count it as a warning.
- `<fill>0</fill>` / `<outline>0</outline>` in PolyStyle → togeojson emits `fill-opacity: 0` / `stroke-opacity: 0`. Keep those values.

### 8.4 GPS accuracy, timeouts, averaging
- Geolocation requires HTTPS or localhost (the PWA satisfies this).
- Error mapping: `code 1` → denied (show instructions: iOS Settings → Privacy → Location → Safari Websites / app; Android site settings); `code 2` → unavailable ("Move to open sky"); `code 3` → timeout (retry automatically, keep the panel open).
- iOS/Android stop GPS when the screen locks or the app is backgrounded (a PWA limitation). Hold a Wake Lock during averaging, and show "Keep the screen on" text.
- **Averaging algorithm (`averaging.ts`, pure):**
  1. Input: samples `{lon, lat, accuracyM, time}` collected over N seconds. Drop duplicate timestamps.
  2. Accept samples with `accuracyM ≤ maxAcceptAccuracyM`. If none pass, use the best 50% by accuracy and flag `lowQuality: true`. Fewer than 3 samples total → error "Not enough fixes".
  3. Convert to local meters around the first sample (equirectangular: `x = Δlon·cos(lat0)·111320`, `y = Δlat·110540`).
  4. Weighted mean with weight `1/accuracyM²` → convert back to lon/lat.
  5. `spreadM` = RMS distance of the used samples from the mean. `accuracyM` = median accuracy of the used samples. Don't claim √n improvement, because GPS errors are correlated.
- Show accuracy in the chosen units (m or ft, rounded to 0.1).

### 8.5 KML writer (export)
- One `<Document>` with `<name>`. One `<Folder>` per exported layer, in tree order.
- Use a shared `<Style id>` per unique resolved style (dedupe by a hash of the style values). Line: `<LineStyle><color>` aabbggrr + `<width>`. Poly: `<PolyStyle><color>` (fill + fillOpacity) plus outline color via LineStyle. Point: `<IconStyle><Icon><href>files/icon-{symbol}-{rrggbb}.png</href></Icon><scale>`. For plain `.kml` export, use `<IconStyle><color>` with the bundled default pushpin `http://maps.google.com/mapfiles/kml/pushpin/wht-pushpin.png` instead. The app itself never fetches this URL; it only matters for whoever opens the file.
- `<description>` uses a CDATA notes block. Add `<ExtendedData>` with accuracy, origin, created, and `extra`.
- Coordinates are `lon,lat` with 7 decimals. Polygon rings get closed if they aren't already.
- XML-escape names. CDATA must split any `]]>`.

### 8.6 Labels without a network
- MapLibre needs glyph PBFs to draw text. Bundle **only** `Noto Sans Regular` ranges `0-255` and `256-511` into `public/glyphs/` (taken once, at dev time, from the openmaptiles/fonts GitHub release). Set `glyphs: '/glyphs/{fontstack}/{range}.pbf'` and `text-font: ['Noto Sans Regular']`.
- If the glyph files are missing, skip creating every `:label` layer and log one warning. The app must not break.

### 8.7 Local persistence & backup
- Persistence: every change is written to IndexedDB immediately (no "save" button). Call `navigator.storage.persist()` at startup.
- **iOS caveat:** Safari may evict data from sites that aren't installed. Always run the app from its home-screen install.
- **Backup** (`backupService.ts`): a zip containing `manifest.json` (`{app:'parcel-mapper', schemaVersion, createdAt, counts}`), `layers.json`, `pois.json`, `features.json`, `rasterSources.json`, `settings.json`, and, when the user ticks "Include imagery/DEM" (default off because of size), `rasters/{id}.mbtiles`. Delivered via `deliver.ts`.
- **Restore:** validate the manifest. Then offer **Replace all** (clear + import in one Dexie transaction) or **Merge** (skip IDs that already exist). A schemaVersion newer than the app → refuse.
- Reminder: when `changesSinceBackup ≥ 25` or the last backup is older than 7 days with ≥ 1 change, show a dismissible banner.
- The importer accepts files from the device file picker only. Nothing is ever uploaded.

### 8.8 Datum alignment (NAD83(2011) ↔ WGS84): fixed
- **Policy: everything inside the app is WGS84 (G2139)**. That means GPS fixes, stored coordinates, and exports (KML requires WGS84, and Google Earth expects it). GPS readings are never altered.
- **Imagery and DEM are corrected once, at tile-prep time** (§6), so they line up with the GPS. The app doesn't shift rasters at runtime, because MapLibre can't offset raster tiles.
- The shift is computed for this parcel at epoch 2026.9 with PROJ: **ΔE = −0.740 m, ΔN = +1.078 m** (WGS84 position minus NAD83(2011) position). In state-plane feet that is ΔE −2.395, ΔN +3.561. In EPSG:3857 metres it is dx −1.003, dy +1.462. It varies by under 2 mm across the parcel and drifts about 1.5 cm per year, so a fixed constant is fine for years.
- `datumShift.ts` (pure): `lon += dEastM / (111320·cos(lat))`, `lat += dNorthM / 110540`. Used only by the opt-in KML import option. Unit test: (−77.4813, 42.3991) → (−77.481309, 42.399110) ± 1e-6.
- The constant is only valid near this parcel (within about 50 km). `config.ts` has a comment saying so. For another region, recompute it with pyproj (`EPSG:6318 → EPSG:9755` at the current epoch).
- Expectation: phone GPS error (3–10 m, mostly random) is still larger than 1.3 m. Removing the *systematic* 1.3 m bias still pays off: averaged pins, re-visits, and any future sub-meter receiver land on the right pixel.

### 8.9 Performance limits
- sql.js loads the whole `.mbtiles` into memory. Your files (28 MB DEM, ~15–50 MB ortho) are fine. Warn on any import over 300 MB ("may crash on phones; re-export at lower max zoom").
- Open rasters lazily (only when the layer is visible), and keep them open afterwards.
- `layerSync` rebuilds only the GeoJSON source of the layer that changed (`source.setData`), never the whole style.
- The parcel scale is expected to stay under about 5,000 vector items in total, which needs no clustering.

### 8.10 Other guardrails
- At most one dialog is open at a time. Every destructive action needs confirmation.
- All user text (names, notes) is rendered as text, never as HTML (XSS from KML descriptions).
- Service worker updates show a "New version available, reload" toast. A new version never auto-reloads in the middle of a task.

---

## 9. Out of scope for v1 (explicitly)
Line/polygon geometry editing and drawing; in-app contours; vector `.mbtiles`/PMTiles; GeoTIFF loading in-app; background GPS tracking; photo attachments; multi-device sync; online basemaps.
(Good v2 candidates: photo attachments on POIs, a GPS track recorder, and drawing lines/polygons via `terra-draw`.)

---

## 10. Rules for the Phase 2 implementer
1. Implement **only the requested Step**, touching only the files listed for it. If a file from a later step is needed, create a minimal stub and say so.
2. Use only the dependencies in §1. No network calls, no CDN links, no analytics.
3. TypeScript `strict: true`. No `any` except at the togeojson/sql.js boundaries, with a comment.
4. Pure modules (★) get vitest tests in the same step.
5. Every user-facing failure shows a toast with a plain-English cause and a next action. Nothing fails silently.
6. End each step with: files changed, assumptions made, and the step's manual checks from §7 copied verbatim.

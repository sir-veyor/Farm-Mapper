# Farm Mapper

Offline-first field-mapping PWA: pin points of interest (GPS, averaged GPS, or by tap), import MBTiles imagery/DEM and
KML/KMZ, organise features in layers with Show/Hide, Freeze and Lock, restyle anything, navigate to a pin, measure,
record your path, and send pins or layers to other people. Everything stays on the device; nothing is uploaded.

- Develop: `npm install`, `npm run dev`
- Test: `npm test` (unit tests run in Node/jsdom with an in-memory IndexedDB)
- Build: `npm run build` (output in `dist/`); pushes to `main` deploy to GitHub Pages

## No map data in this app

This app is public, so it deliberately carries **no** imagery, DEM, boundary, trails or stand locations. A fresh install shows
a welcome card. The private data arrives as a **starter pack**: a Backup zip made with *More > Backup > include imagery and DEM*,
which you send to friends yourself. They install the app, then use **More > Backup > Restore** (or the card's button) once.
After that everything works with no signal. Individual pins and layers travel as Share files (see below).

Every install starts with one empty **Tracking** layer (added once, remembered by key in settings).

## Field tools

- **Navigate**: open a pin and tap Navigate for distance (feet) and an arrow to it, plus a dashed guide line on the map.
  The arrow uses your walking direction (GPS) when moving and the phone compass when still. Compasses report magnetic
  north, so `MAGNETIC_DECLINATION_DEG` (src/config.ts) is applied. iPhones ask for motion permission.
- **Measure**: tap two or more points; taps near a pin snap to it. Shows feet and bearing for each leg and in total.
- **Track**: records your path (a point every ~10 ft, poor fixes and GPS jumps filtered) onto the **Tracking** layer, saved
  continuously. A translucent **search band** (Off / 30 / 60 / 100 ft wide, default 60) shades the ground you have covered, at
  true ground width at every zoom. Pause/resume, stop, or resume any saved track later (a new segment, never a line across the
  gap). The screen is kept awake while recording because phones stop GPS when it turns off. One-tap sign markers (Hit, Blood,
  Tracks, Hair, Bed, Lost sign, Found) drop at your position on the same layer.
- Distances are always feet.

## Sharing pins and layers (no server)

**Share** (in a pin's menu, or **Share layer** under a layer's ⋯ menu) makes a small `.json` file and opens the phone's share
sheet (text, email, AirDrop), or downloads it if the browser cannot share files. The other person opens the app and uses
**More > Import** to pick that file. Nothing is stored online.

Duplicates are never reloaded: a pin is skipped if its id matches, or if a pin of the same name is within about 6 ft (so a
stand both phones already have is not doubled); a line or area is skipped if the same name has the same shape. Items go into
the receiver's layer of the same name (created with the sender's style if they have none); a locked or frozen layer is left
alone. Share files are validated and cleaned on import (bad coordinates dropped, colours and sizes checked).

## Keeping it going

- Deploys: every push to `main` runs the tests and publishes to GitHub Pages (`.github/workflows/deploy.yml`).
- Phones update themselves on their next online visit; the service worker caches the app so it runs with no signal.
- Your pins, tracks and settings live only in the phone's browser storage. Use **More > Backup** regularly and keep the file elsewhere.
- Map data is never committed here. To give someone new data, make a fresh starter pack (Backup with imagery) or a Share file.

## Layer states

| | Drawn | Editable | Layer deletable |
|---|---|---|---|
| Normal | yes | yes | yes |
| Hidden (eye off) | no (stays loaded) | no | yes |
| Frozen (snowflake) | **no** (removed from the map, reader closed) | no | yes |
| Locked (padlock) | yes | **no** (read-only details on tap) | **no** |

Line style (solid / dashed / dotted) is a per-layer default that any item can override.

## Notes

- Moving a pin is **tap-to-place** (Move, then tap the new spot) instead of dragging, which avoids accidental drags on touch screens.
- `sql-wasm-browser.wasm` (not `sql-wasm.wasm`) is shipped, because the bundler uses sql.js's browser build.
- A note containing the literal text `]]>` is exported as valid KML but only its first part survives re-import.
- `NAD83_TO_WGS84_SHIFT` and `MAGNETIC_DECLINATION_DEG` in `src/config.ts` are regional constants; update them for another area.

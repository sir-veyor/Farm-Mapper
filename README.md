# Farm Mapper

Offline-first parcel field-mapping PWA: pin points of interest, import MBTiles imagery/DEM and KML/KMZ,
organise features in layers with Show/Hide, Freeze and Lock, and export selected layers.

- Plan and specification: [PLAN.md](PLAN.md)
- Develop: `npm install`, `npm run dev`
- Test: `npm test`
- Build: `npm run build` (output in `dist/`)

Maps and pins stay on the device. Nothing is uploaded; map files are loaded from the phone's storage.

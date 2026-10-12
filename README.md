# AlgaWatch Frontend — BloomWatch Toba

A 3D frontend prototype for forecasting harmful algal blooms at the floating-cage fish farms of Lake Toba, North Sumatra. It shows where algae is now, where currents and wind will carry it over the next five days, and what that means for each farm.

All farm, sensor and forecast data is simulated. The terrain is real.

## Tech stack

| Layer | Tool | Version | Used for |
|---|---|---|---|
| Build / dev server | [Vite](https://vite.dev) | 8 | Dev server, production bundle, ES-module Web Worker |
| Language | [TypeScript](https://www.typescriptlang.org) | 7 | Strict mode across `src/` and `scripts/*.ts` |
| UI framework | [React](https://react.dev) | 19 | HUD components and the scene tree |
| 3D engine | [three.js](https://threejs.org) | r186 | Meshes, custom GLSL shaders, 3D data textures |
| React ↔ three | [React Three Fiber](https://r3f.docs.pmnd.rs) | 9 | Declarative scene graph (`<Canvas>`, `useFrame`) |
| 3D helpers | [drei](https://drei.docs.pmnd.rs) | 10 | `<Html>` labels, `CameraControls`, `PerformanceMonitor` |
| Post-processing | [@react-three/postprocessing](https://github.com/pmndrs/react-postprocessing) + postprocessing | 3 / 6 | Bloom glow, turned off automatically on slow devices |
| State | [zustand](https://zustand.docs.pmnd.rs) | 5 | One app store (`src/state/store.ts`) |
| Styling | [Tailwind CSS](https://tailwindcss.com) | 4 | Via `@tailwindcss/vite`; design tokens in `src/index.css` |
| Font | Atkinson Hyperlegible Next | 5 | Self-hosted through `@fontsource-variable` |
| Scripts | [tsx](https://tsx.is), [pngjs](https://github.com/pngjs/pngjs) | 4 / 7 | Run TS scripts in Node; read terrain tiles and write preview PNGs |

There is no backend. The bloom simulation runs in the browser in a Web Worker.

## Getting started

Requires Node.js 22 or newer (developed on Node 24, npm 11).

```bash
git clone https://github.com/KUL08-AlgaWatch/frontend.git
cd frontend
npm install
npm run dev        # http://localhost:5173
```

`public/data/toba/` is already built and committed. To rebuild it from source tiles, run `npm run terrain`. This downloads about 36 elevation tiles into `.cache/`.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Type-check and production build into `dist/` |
| `npm run preview` | Serve the `dist/` build locally |
| `npm run typecheck` | Type-check only |
| `npm run terrain` | Rebuild the Lake Toba relief (`--preview out.png` writes a check image) |
| `npm run sim:preview -- out.png [--wind 180 5]` | Run the bloom simulation in Node and write a snapshot sheet. Use it to tune the scenario without a browser |

Keyboard: Space plays or pauses. Left and right arrows step one hour (hold Shift for six). Escape closes a farm.

## Folder structure

```
frontend/
├── index.html                  Vite entry HTML (title, favicon, #root)
├── package.json                Scripts and dependencies
├── vite.config.ts              React + Tailwind plugins; workers built as ES modules
├── tsconfig.json               Strict TS config for src/ and scripts/*.ts
│
├── public/
│   └── data/toba/              Pre-built terrain, served as static files
│       ├── terrain.bin         Int16 heights (decimetres vs. lake level) + Uint8 lake mask
│       └── meta.json           Grid size, geographic bounds, lake level, attribution
│
├── scripts/                    Node-only tools (not bundled into the app)
│   ├── build-terrain.mjs       Downloads elevation tiles → writes public/data/toba/
│   └── preview-sim.ts          Runs the simulation headless → writes a PNG contact sheet
│
└── src/
    ├── main.tsx                React root (no StrictMode, see the comment in the file)
    ├── App.tsx                 Top-level layout: <Canvas> + HUD panels; calls the store's init()
    ├── index.css               Tailwind import, colour tokens, frosted-panel styles
    ├── config.ts               Shared settings: timeline span, thresholds, grid size, exaggeration
    │
    ├── data/                   Static inputs
    │   ├── terrain.ts          Loads terrain.bin; converts lon/lat ↔ pixel ↔ world coordinates
    │   └── sites.ts            Farm and buoy definitions (real names, mock numbers); snaps them into the lake
    │
    ├── sim/                    Bloom simulation (no React, no three.js; also runs in Node)
    │   ├── model.ts            Currents, advection, algae growth, oxygen; the core model
    │   ├── grid.ts             Simulation grid over the lake (coarser than the terrain)
    │   ├── scenario.ts         Demo scenario: initial bloom, river inputs, default forecast wind
    │   ├── risk.ts             Ensemble → per-farm outlook (bloom chance, arrival time, oxygen, status)
    │   ├── worker.ts           Web Worker entry; runs the 8-member ensemble off the main thread
    │   └── client.ts           Main-thread wrapper around the worker (swap this for a real API)
    │
    ├── scene/                  3D view (React Three Fiber)
    │   ├── Scene.tsx           <Canvas> contents; drives the timeline clock and shared uniforms
    │   ├── CameraRig.tsx       Opening fly-in, whole-lake view, zoom to a farm
    │   ├── Terrain.tsx         Relief, contour lines, block sides showing tuff strata
    │   ├── Water.tsx           Lake surface: depth tint, algae colour, forecast bloom edges
    │   ├── AlgaeLayer.tsx      Translucent sheet raised by algae density
    │   ├── Currents.tsx        Drifting streaks along the simulated current field
    │   ├── Farms.tsx           Cage clusters, status halos, clickable labels
    │   ├── Buoys.tsx           Sensor buoys with hover/focus read-outs
    │   ├── shaders.ts          GLSL shared by Water and AlgaeLayer
    │   ├── textures.ts         Terrain texture, per-hour 3D field textures, backdrop
    │   ├── resources.ts        Scene-wide textures and uniforms (React context)
    │   ├── palette.ts          3D colours: relief, algae ramp, status colours
    │   ├── labelLayer.ts       Fixed DOM container for drei <Html> labels
    │   └── usePrefersReducedMotion.ts
    │
    ├── ui/                     2D HUD laid over the canvas
    │   ├── Header.tsx          Logo and app name
    │   ├── FarmList.tsx        Left panel: farms sorted by risk
    │   ├── FarmPanel.tsx       Right panel: one farm's forecast and charts
    │   ├── TimeChart.tsx       Small time-series chart aligned with the timeline
    │   ├── Timeline.tsx        Bottom scrubber: play/pause, hour, algae strip
    │   ├── WindControl.tsx     "What if" wind direction/speed; reruns the forecast
    │   ├── MapKey.tsx          Legend for colours, symbols and layers
    │   ├── StatusIcon.tsx      Risk-level icon (shape + colour, never colour alone)
    │   ├── LoadingOverlay.tsx  Progress while terrain loads and the sim runs
    │   ├── format.ts           Time, date and duration formatting
    │   ├── color.ts            Algae colour scale for light UI surfaces
    │   ├── useKeyboardShortcuts.ts
    │   └── useMediaQuery.ts
    │
    ├── state/
    │   └── store.ts            zustand store: loads terrain, owns the SimClient, holds time,
    │                           selection, layers, wind, sim results and camera requests
    │
    └── lib/
        └── edt.ts              Euclidean distance transform (distance to shore)
```

### How the folders depend on each other

Arrows point from a module to the modules that import it.

```
config.ts ─┬─> data/ ──> sim/ ──> state/store.ts ──┬─> scene/
           │                                       └─> ui/
           └─────────────────────────────────────────> scene/, ui/
```

- `sim/` and `data/` don't import React or three.js, which is why `scripts/preview-sim.ts` can run the same model in Node.
- `scene/` and `ui/` read from the store and never call the worker directly. `state/store.ts` is the only place that talks to `SimClient`.
- `scene/` and `ui/` share a few files: `ui/` takes its colours from `scene/palette.ts`, and `scene/Farms.tsx` reuses `ui/format.ts` and `ui/StatusIcon.tsx` for its labels.

### Where to change things

| You want to… | Edit |
|---|---|
| Change bloom/oxygen thresholds, timeline length, grid size | `src/config.ts` |
| Add or move a farm or buoy | `src/data/sites.ts` |
| Change the starting bloom, rivers or default wind | `src/sim/scenario.ts` |
| Change the physics or algae growth | `src/sim/model.ts` |
| Change how a farm's risk level is decided | `src/sim/risk.ts` |
| Connect a real backend | `src/sim/client.ts` (see [Plugging in real data](#plugging-in-real-data)) |
| Change colours | `src/scene/palette.ts` and the matching tokens in `src/index.css` |
| Add a HUD panel | New component in `src/ui/`, mount it in `src/App.tsx` |
| Add a 3D layer | New component in `src/scene/`, mount it in `src/scene/Scene.tsx`. To make it toggleable, add a `LayerKey` in `src/state/store.ts` and an entry in `LAYERS` in `src/ui/MapKey.tsx` |

## What's real and what isn't

| Part | Source |
|---|---|
| Land relief, shoreline, Samosir | Real: AWS Open Data Terrain Tiles (SRTM / GMTED / ETOPO1), zoom 11, about 90 m |
| Lake floor | Modelled from distance to shore and scaled to Toba's ~505 m maximum depth. No public survey grid is used |
| Farm and buoy locations | Real place names, approximate positions, snapped into the water |
| Cage counts, algae, oxygen, currents, wind | Simulated (see below) |
| Bloom and oxygen thresholds | Demo values in `src/config.ts` |

## How it works

```
scripts/build-terrain.mjs   tiles → terrain.bin (heights + lake mask) + meta.json
        │
src/sim/  (Web Worker)      8-run ensemble on a 256² grid, hourly, −72 h … +120 h
        │                    → chlorophyll (control run) and P(bloom) as 3D textures
        │                    → per-farm series → risk level, arrival time, oxygen
src/scene/  (React Three Fiber)
        Terrain      relief + contour lines + tuff-strata block sides
        Water        depth tint, algae colour, forecast bloom edges (P = 0.5 isolines at +24/48/72 h)
        AlgaeLayer   translucent sheet raised by algae density
        Currents     streaks advected by the same current field the simulation uses
        Farms/Buoys  cage clusters, status halos, labels, sensor read-outs
src/ui/                     farm list, farm forecast panel, timeline, map key, wind what-if
```

**The simulation (`src/sim/model.ts`) is plausible but not calibrated.** Surface currents combine three parts:
- shore-following gyres
- slow eddies
- wind drift, turned along the shore so scum piles up on downwind coasts

Algae grows with light, temperature and nutrients, and wind mixing damps it. Nutrients come from the cage farms and river mouths. The forecast ensemble perturbs wind direction, wind speed and growth rate. Changing the wind in the timeline's wind control reruns the five-day forecast; the observed days stay fixed.

The whole timeline is computed up front, about 1–1.5 s in a worker. That lets scrubbing run forwards and backwards instantly, and gives the farm panels exact numbers. Hours are stored as 3D textures, so the GPU interpolates between them while playing.

## Plugging in real data

The scene only consumes these shapes, so a backend can replace `SimClient.run()` (`src/sim/client.ts`) with a fetch:

- **Gridded fields:** `conc` and `prob` as `Uint8Array[frame][row][col]` on a square grid placed by `uvRect`. The scene does not care whether the fields come from a model, satellite retrievals or both.
  - `conc` holds chlorophyll-a, encoded as `sqrt(chl / 400) × 255`.
  - `prob` holds the share of ensemble members above the bloom level, × 255.
- **Point series:**
  - `farmSeries[farm][member][frame]` (µg/L)
  - `sensorSeries[sensor][frame]`
  - `windFrom`, `windSpeed`, `tempC`, `light` per frame
- **Relief:** any lake works if you produce `terrain.bin` + `meta.json` in the same format.

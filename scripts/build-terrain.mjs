// Builds the 3D relief for one region from public/regions/<id>/region.json.
//
// Elevation: AWS Open Data "Terrain Tiles" (Terrarium encoding; SRTM/GMTED on land, ETOPO1 at sea).
// "water": "sea" uses the tiles' bathymetry (scripts/terrain/sea.mjs); "water": "lake" finds the
// flat lake surface and models the floor (scripts/terrain/lake.mjs).
//
// Output, next to region.json:
//   terrain.bin  Int16 heights (× heightsScale m, relative to the water surface, row-major, north row first)
//                followed by Uint8 water mask (1 = water)
//   meta.json    grid size, bounds, depth, offsets, attribution
// Also adds the region to public/regions/index.json.
//
// Usage: node scripts/build-terrain.mjs <region id> [--preview <png path>]

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sampleElevation, updateIndex, writePreview, writeTerrain } from './terrain/common.mjs';
import { buildLake } from './terrain/lake.mjs';
import { buildSea } from './terrain/sea.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.cache', 'terrarium');
const REGIONS = path.join(ROOT, 'public', 'regions');

const args = process.argv.slice(2);
const previewArg = args.indexOf('--preview');
const PREVIEW_PATH = previewArg > -1 ? path.resolve(args[previewArg + 1]) : null;
const regionId = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--preview');

async function main() {
  if (!regionId) throw new Error('Usage: node scripts/build-terrain.mjs <region id> [--preview out.png]');
  const dir = path.join(REGIONS, regionId);
  const region = JSON.parse(await fs.readFile(path.join(dir, 'region.json'), 'utf8'));
  const { bounds, terrain: cfg } = region;
  const { west, east, south, north } = bounds;
  const w = cfg.size;
  const h = cfg.size;
  console.log(`${region.name} (${region.water})`);

  const lat0 = (north + south) / 2;
  const scale = {
    mPerPxX: ((east - west) / w) * 111320 * Math.cos((lat0 * Math.PI) / 180),
    mPerPxY: ((north - south) / h) * 110574,
  };

  const elev = await sampleElevation(CACHE, bounds, cfg.zoom, w);
  const built = region.water === 'lake' ? buildLake(elev, w, h, cfg, scale) : buildSea(elev, w, h, cfg);
  const { heightsM, mask } = built;

  let waterPx = 0;
  let maxDepth = 0;
  let landMin = Infinity;
  let landMax = -Infinity;
  for (let k = 0; k < heightsM.length; k++) {
    const hm = heightsM[k];
    if (mask[k]) {
      waterPx++;
      maxDepth = Math.max(maxDepth, -hm);
    } else {
      landMin = Math.min(landMin, hm);
      landMax = Math.max(landMax, hm);
    }
  }
  const areaKm2 = (waterPx * scale.mPerPxX * scale.mPerPxY) / 1e6;
  console.log(`Water: ${waterPx} px, ${areaKm2.toFixed(0)} km², max depth ${maxDepth.toFixed(0)} m; land ${landMin.toFixed(0)} to +${landMax.toFixed(0)} m`);

  // Int16 decimetres reach ±3276 m; regions with higher ground (Kinabalu, 4095 m) store 0.2 m steps.
  const heightsScale = Math.max(maxDepth, landMax) > 3270 ? 0.2 : 0.1;
  const heights = new Int16Array(heightsM.length);
  for (let k = 0; k < heights.length; k++) heights[k] = Math.round(heightsM[k] / heightsScale);

  const meta = {
    width: w,
    height: h,
    bounds,
    surfaceLevelM: built.surfaceLevelM,
    maxDepthM: Math.round(maxDepth),
    metersPerPixel: { x: Math.round(scale.mPerPxX * 10) / 10, y: Math.round(scale.mPerPxY * 10) / 10 },
    waterAreaKm2: Math.round(areaKm2),
    landRangeM: [Math.round(landMin), Math.round(landMax)],
    heightsOffset: 0,
    heightsScale,
    maskOffset: heights.byteLength,
    rowOrder: 'north-to-south',
    attribution: `Elevation: AWS Open Data Terrain Tiles (Mapzen/Tilezen; SRTM, GMTED, ETOPO1). ${built.floorNote}`,
  };
  const bytes = await writeTerrain(dir, heights, mask, meta);
  await updateIndex(REGIONS, region);
  console.log(`Wrote ${path.relative(ROOT, dir)}/terrain.bin (${(bytes / 1e6).toFixed(1)} MB), meta.json; updated index.json`);

  if (PREVIEW_PATH) await writePreview(heightsM, mask, w, h, maxDepth, PREVIEW_PATH);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

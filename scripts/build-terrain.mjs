// Builds the Lake Toba relief used by the diorama.
//
// Land: real elevation from the AWS Open Data "Terrain Tiles" (Terrarium encoding;
// SRTM/GMTED/ETOPO sources, compiled by Mapzen/Tilezen).
// Lake floor: those tiles only contain the flat lake surface, so depth is modelled
// from distance-to-shore and calibrated to Toba's published maximum depth (~505 m).
// That is the same distance-to-shore approach global lake-bathymetry products use
// where no survey grid is public. Swap in a surveyed grid when one is available.
//
// Output (public/data/toba/):
//   terrain.bin  Int16 heights (decimetres relative to lake level, row-major, north row first)
//                followed by Uint8 water mask (1 = lake)
//   meta.json    grid size, bounds, lake level, offsets, attribution
//
// Usage: node scripts/build-terrain.mjs [--preview <png path>]

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.cache', 'terrarium');
const OUT_DIR = path.join(ROOT, 'public', 'data', 'toba');

const CONFIG = {
  zoom: 11,
  west: 98.4,
  east: 99.25,
  south: 2.175,
  north: 3.025,
  size: 1024,
  maxDepthM: 505,
  levelToleranceM: 1.0,
  minLakePiecePx: 600,
  minIslandPx: 40,
};

const previewArg = process.argv.indexOf('--preview');
const PREVIEW_PATH = previewArg > -1 ? path.resolve(process.argv[previewArg + 1]) : null;

// ---------- tile math ----------
const lonToTileX = (lon, z) => ((lon + 180) / 360) * 2 ** z;
const latToTileY = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
};

async function loadTile(z, x, y) {
  const file = path.join(CACHE, String(z), String(x), `${y}.png`);
  let buf;
  try {
    buf = await fs.readFile(file);
  } catch {
    const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Tile ${z}/${x}/${y} failed: HTTP ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, buf);
  }
  const png = PNG.sync.read(buf);
  const elev = new Float32Array(png.width * png.height);
  for (let i = 0; i < elev.length; i++) {
    const r = png.data[i * 4];
    const g = png.data[i * 4 + 1];
    const b = png.data[i * 4 + 2];
    elev[i] = r * 256 + g + b / 256 - 32768;
  }
  return elev;
}

// ---------- exact Euclidean distance transform (Felzenszwalb & Huttenlocher) ----------
function edt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s;
    do {
      const p = v[k];
      s = (f[q] + q * q - (f[p] + p * p)) / (2 * q - 2 * p);
      if (s <= z[k]) k--;
      else break;
    } while (k >= 0);
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const p = v[k];
    d[q] = (q - p) * (q - p) + f[p];
  }
}

function distanceToLand(mask, w, h) {
  const INF = 1e20;
  const grid = new Float64Array(w * h);
  for (let i = 0; i < grid.length; i++) grid[i] = mask[i] ? INF : 0;
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) grid[y * w + x] = Math.sqrt(d[x]);
  }
  return grid;
}

// ---------- connected components (4-neighbour) ----------
function components(test, w, h) {
  const label = new Int32Array(w * h).fill(-1);
  const sizes = [];
  const touchesBorder = [];
  const stack = new Int32Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (label[start] !== -1 || !test(start)) continue;
    const id = sizes.length;
    let top = 0;
    let size = 0;
    let border = false;
    stack[top++] = start;
    label[start] = id;
    while (top > 0) {
      const i = stack[--top];
      size++;
      const x = i % w;
      const y = (i - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true;
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (const j of nb) {
        if (j >= 0 && label[j] === -1 && test(j)) {
          label[j] = id;
          stack[top++] = j;
        }
      }
    }
    sizes.push(size);
    touchesBorder.push(border);
  }
  return { label, sizes, touchesBorder };
}

// Narrow straits come through the 76 m source grid as broken, noisy channels. Join each
// secondary lake piece to the main lake along the least-cost path over near-lake-level ground.
function connectPieces(mask, cc, kept, elev, level, w, h) {
  let mainId = -1;
  cc.sizes.forEach((s, id) => {
    if (kept[id] && (mainId < 0 || s > cc.sizes[mainId])) mainId = id;
  });
  const maxRise = 15;
  for (let id = 0; id < cc.sizes.length; id++) {
    if (!kept[id] || id === mainId) continue;
    const dist = new Float64Array(w * h).fill(Infinity);
    const prev = new Int32Array(w * h).fill(-1);
    const heap = new MinHeap();
    for (let i = 0; i < w * h; i++) {
      if (cc.label[i] === mainId) {
        dist[i] = 0;
        heap.push(i, 0);
      }
    }
    let hit = -1;
    while (heap.size) {
      const [i, d] = heap.pop();
      if (d > dist[i]) continue;
      if (cc.label[i] === id) {
        hit = i;
        break;
      }
      const x = i % w;
      const nbs = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w];
      for (const j of nbs) {
        if (j < 0 || j >= w * h) continue;
        const rise = elev[j] - level;
        if (rise > maxRise) continue;
        const nd = d + 1 + Math.max(0, rise) * 2;
        if (nd < dist[j]) {
          dist[j] = nd;
          prev[j] = i;
          heap.push(j, nd);
        }
      }
    }
    if (hit < 0) {
      console.log(`Piece ${cc.sizes[id]} px: no low channel to the main lake, left separate`);
      continue;
    }
    let len = 0;
    for (let i = hit; i >= 0 && cc.label[i] !== mainId; i = prev[i]) {
      const x = i % w;
      for (const j of [i, x > 0 ? i - 1 : i, x < w - 1 ? i + 1 : i, i - w, i + w]) {
        if (j >= 0 && j < w * h) mask[j] = 1;
      }
      len++;
    }
    console.log(`Piece ${cc.sizes[id]} px joined to the main lake by a ${len} px channel`);
  }
}

class MinHeap {
  constructor() {
    this.items = [];
    this.keys = [];
  }
  get size() {
    return this.items.length;
  }
  push(item, key) {
    const a = this.items;
    const k = this.keys;
    a.push(item);
    k.push(key);
    let n = a.length - 1;
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (k[p] <= k[n]) break;
      [a[p], a[n]] = [a[n], a[p]];
      [k[p], k[n]] = [k[n], k[p]];
      n = p;
    }
  }
  pop() {
    const a = this.items;
    const k = this.keys;
    const top = [a[0], k[0]];
    const lastI = a.pop();
    const lastK = k.pop();
    if (a.length) {
      a[0] = lastI;
      k[0] = lastK;
      let n = 0;
      for (;;) {
        const l = 2 * n + 1;
        const r = l + 1;
        let m = n;
        if (l < a.length && k[l] < k[m]) m = l;
        if (r < a.length && k[r] < k[m]) m = r;
        if (m === n) break;
        [a[m], a[n]] = [a[n], a[m]];
        [k[m], k[n]] = [k[n], k[m]];
        n = m;
      }
    }
    return top;
  }
}

// Smooth value noise, deterministic, for natural variation of the modelled lake floor.
function valueNoise(seed) {
  const hash = (x, y) => {
    let n = x * 374761393 + y * 668265263 + seed * 2147483647;
    n = (n ^ (n >>> 13)) * 1274126177;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const tx = smooth(x - xi);
    const ty = smooth(y - yi);
    const a = hash(xi, yi);
    const b = hash(xi + 1, yi);
    const c = hash(xi, yi + 1);
    const d = hash(xi + 1, yi + 1);
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
}

async function main() {
  const { zoom: z, west, east, south, north, size } = CONFIG;
  const x0 = Math.floor(lonToTileX(west, z));
  const x1 = Math.floor(lonToTileX(east, z));
  const y0 = Math.floor(latToTileY(north, z));
  const y1 = Math.floor(latToTileY(south, z));
  console.log(`Tiles x ${x0}-${x1}, y ${y0}-${y1} (${(x1 - x0 + 1) * (y1 - y0 + 1)} tiles at z${z})`);

  const tiles = new Map();
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) tiles.set(`${tx},${ty}`, await loadTile(z, tx, ty));
  }

  const px = (gx, gy) => {
    const tx = Math.floor(gx / 256);
    const ty = Math.floor(gy / 256);
    const t = tiles.get(`${tx},${ty}`);
    return t[(gy - ty * 256) * 256 + (gx - tx * 256)];
  };
  const sample = (lon, lat) => {
    const gx = lonToTileX(lon, z) * 256 - 0.5;
    const gy = latToTileY(lat, z) * 256 - 0.5;
    const ix = Math.floor(gx);
    const iy = Math.floor(gy);
    const fx = gx - ix;
    const fy = gy - iy;
    const a = px(ix, iy);
    const b = px(ix + 1, iy);
    const c = px(ix, iy + 1);
    const d = px(ix + 1, iy + 1);
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  };

  const w = size;
  const h = size;
  const elev = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    const lat = north - ((j + 0.5) / h) * (north - south);
    for (let i = 0; i < w; i++) {
      const lon = west + ((i + 0.5) / w) * (east - west);
      elev[j * w + i] = sample(lon, lat);
    }
  }

  // Lake level = the dominant elevation in the central part of the grid (the flat lake surface).
  const hist = new Map();
  for (let j = Math.floor(h * 0.2); j < h * 0.8; j++) {
    for (let i = Math.floor(w * 0.2); i < w * 0.8; i++) {
      const k = Math.round(elev[j * w + i]);
      hist.set(k, (hist.get(k) ?? 0) + 1);
    }
  }
  const [levelRounded] = [...hist.entries()].sort((a, b) => b[1] - a[1])[0];
  // Refine to the mean of pixels at that level.
  let sum = 0;
  let count = 0;
  for (const e of elev) {
    if (Math.abs(e - levelRounded) <= 0.5) {
      sum += e;
      count++;
    }
  }
  const level = sum / count;
  console.log(`Lake level ${level.toFixed(2)} m (mode ${levelRounded} m)`);

  // The lake = large flat regions at lake level (resampling noise can split narrow straits
  // into separate pieces, so keep every big one), plus enclosed patches below the surface
  // (a few source tiles carry partial lake-floor values).
  const flat = (i) => Math.abs(elev[i] - level) <= CONFIG.levelToleranceM;
  const flatCC = components(flat, w, h);
  const mask = new Uint8Array(w * h);
  const keptFlat = flatCC.sizes.map((s, id) => s >= CONFIG.minLakePiecePx && !flatCC.touchesBorder[id]);
  for (let i = 0; i < mask.length; i++) {
    const id = flatCC.label[i];
    if (id >= 0 && keptFlat[id]) mask[i] = 1;
  }
  console.log(`Flat pieces kept: ${flatCC.sizes.filter((s, id) => keptFlat[id]).join(', ')} px`);
  connectPieces(mask, flatCC, keptFlat, elev, level, w, h);
  const below = (i) => elev[i] < level - CONFIG.levelToleranceM;
  const belowCC = components(below, w, h);
  const belowTouchesLake = new Uint8Array(belowCC.sizes.length);
  for (let i = 0; i < mask.length; i++) {
    const id = belowCC.label[i];
    if (id < 0) continue;
    const x = i % w;
    if ((x > 0 && mask[i - 1]) || (x < w - 1 && mask[i + 1]) || mask[i - w] || mask[i + w]) belowTouchesLake[id] = 1;
  }
  let belowAdded = 0;
  for (let i = 0; i < mask.length; i++) {
    const id = belowCC.label[i];
    if (id >= 0 && belowTouchesLake[id] && !belowCC.touchesBorder[id]) {
      mask[i] = 1;
      belowAdded++;
    }
  }
  console.log(`Below-surface pixels absorbed into the lake: ${belowAdded}`);

  // Fill tiny enclosed "islands" that are resampling noise; keep real islands.
  const landCC = components((i) => mask[i] === 0, w, h);
  let filled = 0;
  const islands = [];
  for (let i = 0; i < mask.length; i++) {
    const id = landCC.label[i];
    if (id < 0 || landCC.touchesBorder[id]) continue;
    if (landCC.sizes[id] < CONFIG.minIslandPx) {
      mask[i] = 1;
      filled++;
    }
  }
  landCC.sizes.forEach((s, id) => {
    if (!landCC.touchesBorder[id] && s >= CONFIG.minIslandPx) islands.push(s);
  });

  let minX = w, maxX = 0, minY = h, maxY = 0, lakePx = 0;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (!mask[j * w + i]) continue;
      lakePx++;
      minX = Math.min(minX, i);
      maxX = Math.max(maxX, i);
      minY = Math.min(minY, j);
      maxY = Math.max(maxY, j);
    }
  }

  const lat0 = (north + south) / 2;
  const mPerPxX = ((east - west) / w) * 111320 * Math.cos((lat0 * Math.PI) / 180);
  const mPerPxY = ((north - south) / h) * 110574;
  const mPerPx = (mPerPxX + mPerPxY) / 2;
  const areaKm2 = (lakePx * mPerPxX * mPerPxY) / 1e6;
  console.log(
    `Lake: ${lakePx} px, ${areaKm2.toFixed(0)} km², bbox px x ${minX}-${maxX}, y ${minY}-${maxY}; ` +
      `${islands.length} islands kept (largest ${Math.max(...islands)} px), ${filled} noise px filled`,
  );
  if (minX === 0 || minY === 0 || maxX === w - 1 || maxY === h - 1) {
    throw new Error('Lake touches the grid border; widen the bounds.');
  }

  // Modelled bathymetry: steep caldera walls, broad sediment floor, gentle variation.
  const dist = distanceToLand(mask, w, h);
  const noise = valueNoise(7);
  const depth = new Float32Array(w * h);
  let rawMax = 0;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      if (!mask[k]) continue;
      const dM = dist[k] * mPerPx;
      const n1 = noise(i / 90, j / 90);
      const n2 = noise(i / 23 + 40, j / 23 + 40);
      const falloff = 900 + 1600 * n1; // metres to reach ~63% of full depth
      const wall = 1 - Math.exp(-dM / falloff);
      const bowl = 0.82 + 0.18 * Math.min(1, dM / 7000);
      const d = wall * bowl * (0.94 + 0.12 * n2);
      depth[k] = d;
      rawMax = Math.max(rawMax, d);
    }
  }
  // Two light smoothing passes inside the lake.
  for (let pass = 0; pass < 2; pass++) {
    const src = depth.slice();
    for (let j = 1; j < h - 1; j++) {
      for (let i = 1; i < w - 1; i++) {
        const k = j * w + i;
        if (!mask[k]) continue;
        let s = 0;
        let c = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const kk = k + dy * w + dx;
            s += mask[kk] ? src[kk] : 0;
            c++;
          }
        }
        depth[k] = s / c;
      }
    }
  }
  rawMax = 0;
  for (let k = 0; k < depth.length; k++) if (mask[k]) rawMax = Math.max(rawMax, depth[k]);

  const heights = new Int16Array(w * h);
  let landMax = -Infinity;
  let landMin = Infinity;
  for (let k = 0; k < heights.length; k++) {
    let hm;
    if (mask[k]) {
      hm = -Math.max(0.5, (depth[k] / rawMax) * CONFIG.maxDepthM);
    } else {
      hm = elev[k] - level;
      landMax = Math.max(landMax, hm);
      landMin = Math.min(landMin, hm);
    }
    heights[k] = Math.round(Math.max(-3276, Math.min(3276, hm)) * 10);
  }
  console.log(`Land relative to lake: ${landMin.toFixed(0)} to +${landMax.toFixed(0)} m`);

  await fs.mkdir(OUT_DIR, { recursive: true });
  const bin = Buffer.alloc(heights.byteLength + mask.byteLength);
  Buffer.from(heights.buffer).copy(bin, 0);
  Buffer.from(mask.buffer).copy(bin, heights.byteLength);
  await fs.writeFile(path.join(OUT_DIR, 'terrain.bin'), bin);

  const meta = {
    width: w,
    height: h,
    bounds: { west, east, south, north },
    lakeLevelM: Math.round(level * 10) / 10,
    maxDepthM: CONFIG.maxDepthM,
    metersPerPixel: { x: Math.round(mPerPxX * 10) / 10, y: Math.round(mPerPxY * 10) / 10 },
    lakeAreaKm2: Math.round(areaKm2),
    landRangeM: [Math.round(landMin), Math.round(landMax)],
    heightsOffset: 0,
    heightsScale: 0.1,
    maskOffset: heights.byteLength,
    rowOrder: 'north-to-south',
    attribution:
      'Land elevation: AWS Open Data Terrain Tiles (Mapzen/Tilezen; SRTM, GMTED, ETOPO1). ' +
      'Lake floor: modelled from distance to shore, scaled to a 505 m maximum depth.',
  };
  await fs.writeFile(path.join(OUT_DIR, 'meta.json'), JSON.stringify(meta, null, 2));
  console.log(`Wrote ${path.relative(ROOT, OUT_DIR)}/terrain.bin (${(bin.byteLength / 1e6).toFixed(1)} MB) and meta.json`);

  if (PREVIEW_PATH) await writePreview(heights, mask, w, h, PREVIEW_PATH);
}

async function writePreview(heights, mask, w, h, file) {
  const png = new PNG({ width: w, height: h });
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      const hm = heights[k] / 10;
      const hx = heights[Math.min(k + 1, k - i + w - 1)] / 10 - hm;
      const hy = heights[Math.min(k + w, w * h - 1)] / 10 - hm;
      const shade = Math.max(0, Math.min(1, 0.6 - (hx * 0.7 + hy * 0.7) / 90));
      let r, g, b;
      if (mask[k]) {
        const t = Math.min(1, -hm / 505);
        r = 120 - 100 * t;
        g = 190 - 140 * t;
        b = 230 - 130 * t;
        const iso = Math.abs(((-hm + 25) % 100) - 25) < 2.5;
        if (iso) (r += 30), (g += 30), (b += 30);
      } else {
        const t = Math.min(1, Math.max(0, hm / 1300));
        r = (90 + 120 * t) * (0.5 + shade);
        g = (130 + 60 * t) * (0.5 + shade);
        b = (80 + 60 * t) * (0.5 + shade);
      }
      png.data[k * 4] = Math.max(0, Math.min(255, r));
      png.data[k * 4 + 1] = Math.max(0, Math.min(255, g));
      png.data[k * 4 + 2] = Math.max(0, Math.min(255, b));
      png.data[k * 4 + 3] = 255;
    }
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, PNG.sync.write(png));
  console.log(`Preview: ${file}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

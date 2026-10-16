// Shared pieces of the terrain build: elevation tiles, connected components, outputs.

import fs from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';

// ---------- tile math ----------
const lonToTileX = (lon, z) => ((lon + 180) / 360) * 2 ** z;
const latToTileY = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
};

async function loadTile(cacheDir, z, x, y) {
  const file = path.join(cacheDir, String(z), String(x), `${y}.png`);
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

// ---------- connected components (4-neighbour) ----------
export function components(test, w, h) {
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

/** Elevation (m above sea level) on a size × size grid over the region's bounds, row 0 = north. */
export async function sampleElevation(cacheDir, bounds, zoom, size) {
  const { west, east, south, north } = bounds;
  const z = zoom;
  const x0 = Math.floor(lonToTileX(west, z));
  const x1 = Math.floor(lonToTileX(east, z));
  const y0 = Math.floor(latToTileY(north, z));
  const y1 = Math.floor(latToTileY(south, z));
  console.log(`Tiles x ${x0}-${x1}, y ${y0}-${y1} (${(x1 - x0 + 1) * (y1 - y0 + 1)} tiles at z${z})`);

  const tiles = new Map();
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) tiles.set(`${tx},${ty}`, await loadTile(cacheDir, z, tx, ty));
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

  const elev = new Float32Array(size * size);
  for (let j = 0; j < size; j++) {
    const lat = north - ((j + 0.5) / size) * (north - south);
    for (let i = 0; i < size; i++) {
      const lon = west + ((i + 0.5) / size) * (east - west);
      elev[j * size + i] = sample(lon, lat);
    }
  }
  return elev;
}

/** Fill enclosed land specks smaller than minIslandPx (resampling noise); returns islands kept. */
export function fillNoiseIslands(mask, w, h, minIslandPx) {
  const landCC = components((i) => mask[i] === 0, w, h);
  let filled = 0;
  const islands = [];
  for (let i = 0; i < mask.length; i++) {
    const id = landCC.label[i];
    if (id >= 0 && !landCC.touchesBorder[id] && landCC.sizes[id] < minIslandPx) {
      mask[i] = 1;
      filled++;
    }
  }
  landCC.sizes.forEach((s, id) => {
    if (!landCC.touchesBorder[id] && s >= minIslandPx) islands.push(s);
  });
  return { filled, islands };
}

export async function writeTerrain(outDir, heights, mask, meta) {
  await fs.mkdir(outDir, { recursive: true });
  const bin = Buffer.alloc(heights.byteLength + mask.byteLength);
  Buffer.from(heights.buffer).copy(bin, 0);
  Buffer.from(mask.buffer).copy(bin, heights.byteLength);
  await fs.writeFile(path.join(outDir, 'terrain.bin'), bin);
  await fs.writeFile(path.join(outDir, 'meta.json'), JSON.stringify(meta, null, 2));
  return bin.byteLength;
}

/** Add or refresh the region's entry in public/regions/index.json. */
export async function updateIndex(regionsDir, region) {
  const file = path.join(regionsDir, 'index.json');
  let index = { defaultRegion: region.id, regions: [] };
  try {
    index = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    // First region: start a new index.
  }
  const entry = { id: region.id, name: region.name, area: region.area };
  const at = index.regions.findIndex((r) => r.id === region.id);
  if (at >= 0) index.regions[at] = entry;
  else index.regions.push(entry);
  await fs.writeFile(file, JSON.stringify(index, null, 2) + '\n');
}

export async function writePreview(heightsM, mask, w, h, maxDepth, file) {
  const png = new PNG({ width: w, height: h });
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      const hm = heightsM[k];
      const hx = heightsM[Math.min(k + 1, k - i + w - 1)] - hm;
      const hy = heightsM[Math.min(k + w, w * h - 1)] - hm;
      const shade = Math.max(0, Math.min(1, 0.6 - (hx * 0.7 + hy * 0.7) / 90));
      let r, g, b;
      if (mask[k]) {
        const t = Math.min(1, Math.sqrt(-hm / maxDepth));
        r = 120 - 100 * t;
        g = 190 - 140 * t;
        b = 230 - 130 * t;
        const iso = Math.abs(((-hm + 5) % 20) - 5) < 0.6 && -hm < 200;
        if (iso) (r += 30), (g += 30), (b += 30);
      } else {
        const t = Math.min(1, Math.max(0, hm / 2500));
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


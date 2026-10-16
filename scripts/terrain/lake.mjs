// Lakes: water is the flat surface at lake level; the tiles only hold that surface, so depth is
// modelled from distance to shore and scaled to the lake's published maximum depth (cfg.maxDepthM).

import { components, fillNoiseIslands } from './common.mjs';

// Exact Euclidean distance transform (Felzenszwalb & Huttenlocher)
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

export function buildLake(elev, w, h, cfg, scale) {
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
  const flat = (i) => Math.abs(elev[i] - level) <= cfg.levelToleranceM;
  const flatCC = components(flat, w, h);
  const mask = new Uint8Array(w * h);
  const keptFlat = flatCC.sizes.map((s, id) => s >= cfg.minLakePiecePx && !flatCC.touchesBorder[id]);
  for (let i = 0; i < mask.length; i++) {
    const id = flatCC.label[i];
    if (id >= 0 && keptFlat[id]) mask[i] = 1;
  }
  console.log(`Flat pieces kept: ${flatCC.sizes.filter((s, id) => keptFlat[id]).join(', ')} px`);
  connectPieces(mask, flatCC, keptFlat, elev, level, w, h);
  const below = (i) => elev[i] < level - cfg.levelToleranceM;
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

  const { filled, islands } = fillNoiseIslands(mask, w, h, cfg.minIslandPx);

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

  const mPerPx = (scale.mPerPxX + scale.mPerPxY) / 2;
  console.log(`Lake: ${lakePx} px; ${islands.length} islands kept (largest ${Math.max(...islands)} px), ${filled} noise px filled`);
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

  const heightsM = new Float32Array(w * h);
  for (let k = 0; k < heightsM.length; k++) {
    heightsM[k] = mask[k] ? -Math.max(0.5, (depth[k] / rawMax) * cfg.maxDepthM) : elev[k] - level;
  }
  return {
    heightsM,
    mask,
    surfaceLevelM: Math.round(level * 10) / 10,
    floorNote: `Lake floor: modelled from distance to shore, scaled to a ${cfg.maxDepthM} m maximum depth.`,
  };
}

// The simulation grid: a square window over the lake, coarser than the terrain.

import { SIM_SIZE } from '../config';
import type { Terrain } from '../data/terrain';
import { distanceTransform } from '../lib/edt';

export interface SimGrid {
  n: number;
  /** Terrain pixels per simulation cell. */
  cellPx: number;
  /** Terrain pixel coordinate of the grid's north-west corner. */
  originPx: [number, number];
  cellM: number;
  water: Uint8Array;
  waterIdx: Int32Array;
  /** Distance from cell centre to the shore, metres (0 on land). */
  shoreM: Float32Array;
  /** Unit vector pointing away from the nearest shore (x = east, z = south). */
  normalX: Float32Array;
  normalZ: Float32Array;
  depthM: Float32Array;
  /** Grid window in terrain UV space: u0, v0, uSize, vSize (v = 0 at the north edge). */
  uvRect: [number, number, number, number];
  /** Land cells touching water, used to pad output fields so coastlines sample cleanly. */
  coastLand: Int32Array;
}

export function buildSimGrid(t: Terrain, n = SIM_SIZE): SimGrid {
  const { x0, y0, x1, y1 } = t.lakeBox;
  const span = Math.max(x1 - x0 + 1, y1 - y0 + 1) + 2;
  const cellPx = Math.ceil(span / n);
  const domain = cellPx * n;
  const ox = Math.round((x0 + x1 + 1) / 2 - domain / 2);
  const oy = Math.round((y0 + y1 + 1) / 2 - domain / 2);

  const water = new Uint8Array(n * n);
  const depthM = new Float32Array(n * n);
  for (let cj = 0; cj < n; cj++) {
    for (let ci = 0; ci < n; ci++) {
      let wet = 0;
      let total = 0;
      let depth = 0;
      for (let dy = 0; dy < cellPx; dy++) {
        const y = oy + cj * cellPx + dy;
        if (y < 0 || y >= t.height) continue;
        for (let dx = 0; dx < cellPx; dx++) {
          const x = ox + ci * cellPx + dx;
          if (x < 0 || x >= t.width) continue;
          const k = y * t.width + x;
          total++;
          if (t.mask[k]) {
            wet++;
            depth += -t.heightsM[k];
          }
        }
      }
      const c = cj * n + ci;
      const border = ci === 0 || cj === 0 || ci === n - 1 || cj === n - 1;
      if (!border && total > 0 && wet / total >= 0.4) {
        water[c] = 1;
        depthM[c] = depth / wet;
      }
    }
  }

  const cellM = (cellPx * (t.meta.metersPerPixel.x + t.meta.metersPerPixel.y)) / 2;
  const dist = distanceTransform(water, n, n);
  const shoreM = new Float32Array(n * n);
  const waterList: number[] = [];
  for (let c = 0; c < n * n; c++) {
    if (!water[c]) continue;
    waterList.push(c);
    shoreM[c] = Math.max(0.5, dist[c] - 0.5) * cellM;
  }

  const normalX = new Float32Array(n * n);
  const normalZ = new Float32Array(n * n);
  const coast: number[] = [];
  for (let cj = 0; cj < n; cj++) {
    for (let ci = 0; ci < n; ci++) {
      const c = cj * n + ci;
      const at = (i: number, j: number) => (i < 0 || j < 0 || i >= n || j >= n ? 0 : shoreM[j * n + i]);
      if (water[c]) {
        const gx = at(ci + 1, cj) - at(ci - 1, cj);
        const gz = at(ci, cj + 1) - at(ci, cj - 1);
        const len = Math.hypot(gx, gz);
        if (len > 0) {
          normalX[c] = gx / len;
          normalZ[c] = gz / len;
        }
      } else {
        let touches = false;
        for (let dj = -1; dj <= 1 && !touches; dj++) {
          for (let di = -1; di <= 1; di++) {
            const i = ci + di;
            const j = cj + dj;
            if (i >= 0 && j >= 0 && i < n && j < n && water[j * n + i]) {
              touches = true;
              break;
            }
          }
        }
        if (touches) coast.push(c);
      }
    }
  }

  return {
    n,
    cellPx,
    originPx: [ox, oy],
    cellM,
    water,
    waterIdx: Int32Array.from(waterList),
    shoreM,
    normalX,
    normalZ,
    depthM,
    uvRect: [ox / t.width, oy / t.height, domain / t.width, domain / t.height],
    coastLand: Int32Array.from(coast),
  };
}

/** Terrain pixel coordinates to continuous simulation-cell coordinates (cell i spans [i, i+1)). */
export function pxToCell(g: SimGrid, px: [number, number]): [number, number] {
  return [(px[0] - g.originPx[0]) / g.cellPx, (px[1] - g.originPx[1]) / g.cellPx];
}

// Places a region's farms and sampling points on the terrain, snapping each into the water.

import { distanceTransform } from '../lib/edt';
import type { FarmSpec, Region } from './region';
import { lonLatToPx, pxToWorld, type Terrain } from './terrain';

export interface Site {
  id: string;
  name: string;
  /** Continuous terrain pixel coordinates after snapping into the lake. */
  px: [number, number];
  world: [number, number];
}

export interface Farm extends Site, Omit<FarmSpec, 'lon' | 'lat'> {}
export type Sensor = Site;

/** Snap a point into the water, preferring water `minShore`–`maxShore` pixels from land. */
function snapToLake(
  t: Terrain,
  shoreDist: Float32Array,
  lon: number,
  lat: number,
  minShore: number,
  maxShore: number,
): [number, number] {
  const [tx, ty] = lonLatToPx(t, lon, lat);
  const radius = 110;
  let best: [number, number] | null = null;
  let bestD = Infinity;
  let fallback: [number, number] | null = null;
  let fallbackD = Infinity;
  for (let y = Math.max(0, Math.floor(ty - radius)); y < Math.min(t.height, ty + radius); y++) {
    for (let x = Math.max(0, Math.floor(tx - radius)); x < Math.min(t.width, tx + radius); x++) {
      const k = y * t.width + x;
      if (!t.mask[k]) continue;
      const d = (x + 0.5 - tx) ** 2 + (y + 0.5 - ty) ** 2;
      if (d < fallbackD) {
        fallbackD = d;
        fallback = [x + 0.5, y + 0.5];
      }
      const s = shoreDist[k];
      if (s >= minShore && s <= maxShore && d < bestD) {
        bestD = d;
        best = [x + 0.5, y + 0.5];
      }
    }
  }
  const p = best ?? fallback;
  if (!p) throw new Error(`No water near ${lon}, ${lat}`);
  return p;
}

export function placeSites(t: Terrain, region: Region): { farms: Farm[]; sensors: Sensor[] } {
  const shoreDist = distanceTransform(t.mask, t.width, t.height);
  const farms = region.farms.map(({ lon, lat, ...rest }) => {
    const px = snapToLake(t, shoreDist, lon, lat, 3, 7);
    return { ...rest, px, world: pxToWorld(t, px[0], px[1]) };
  });
  const sensors = region.samplePoints.map(({ lon, lat, ...rest }) => {
    const px = snapToLake(t, shoreDist, lon, lat, 14, 400);
    return { ...rest, px, world: pxToWorld(t, px[0], px[1]) };
  });
  return { farms, sensors };
}

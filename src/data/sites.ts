// Demo floating-cage (keramba jaring apung) farms and monitoring buoys around Lake Toba.
// Place names are real; positions are approximate and every number here is mock data.

import { distanceTransform } from '../lib/edt';
import { lonLatToPx, pxToWorld, type Terrain } from './terrain';

export interface FarmSpec {
  id: string;
  name: string;
  shore: string;
  lon: number;
  lat: number;
  cages: number;
  /** Relative nutrient loading from feed and waste, used by the bloom simulation. */
  load: number;
}

export interface SensorSpec {
  id: string;
  name: string;
  lon: number;
  lat: number;
}

export interface Site {
  id: string;
  name: string;
  /** Continuous terrain pixel coordinates after snapping into the lake. */
  px: [number, number];
  world: [number, number];
}

export interface Farm extends Site, Omit<FarmSpec, 'lon' | 'lat'> {}
export type Sensor = Site;

export const FARM_SPECS: FarmSpec[] = [
  { id: 'haranggaol', name: 'Haranggaol', shore: 'North shore', lon: 98.672, lat: 2.878, cages: 420, load: 34 },
  { id: 'tongging', name: 'Tongging', shore: 'Northern tip', lon: 98.525, lat: 2.905, cages: 60, load: 8 },
  { id: 'silalahi', name: 'Silalahi', shore: 'West shore', lon: 98.555, lat: 2.805, cages: 140, load: 12 },
  { id: 'tigaras', name: 'Tigaras', shore: 'North-east shore', lon: 98.8, lat: 2.795, cages: 90, load: 10 },
  { id: 'pangururan', name: 'Pangururan', shore: 'Samosir, west', lon: 98.7, lat: 2.61, cages: 160, load: 14 },
  { id: 'tomok', name: 'Tomok', shore: 'Samosir, east', lon: 98.858, lat: 2.652, cages: 70, load: 8 },
  { id: 'ajibata', name: 'Ajibata', shore: 'East shore', lon: 98.937, lat: 2.655, cages: 220, load: 14 },
  { id: 'onanrunggu', name: 'Onan Runggu', shore: 'Samosir, south', lon: 98.9, lat: 2.465, cages: 50, load: 7 },
  { id: 'balige', name: 'Balige', shore: 'South shore', lon: 99.065, lat: 2.335, cages: 110, load: 12 },
];

export const SENSOR_SPECS: SensorSpec[] = [
  { id: 'b-north', name: 'North basin buoy', lon: 98.66, lat: 2.8 },
  { id: 'b-haranggaol', name: 'Haranggaol bay buoy', lon: 98.69, lat: 2.86 },
  { id: 'b-parapat', name: 'Parapat strait buoy', lon: 98.9, lat: 2.69 },
  { id: 'b-south', name: 'South basin buoy', lon: 98.95, lat: 2.42 },
  { id: 'b-balige', name: 'Balige bay buoy', lon: 99.06, lat: 2.36 },
];

/** Snap a point into the lake, preferring water `minShore`–`maxShore` pixels from land. */
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
  if (!p) throw new Error(`No lake water near ${lon}, ${lat}`);
  return p;
}

export function placeSites(t: Terrain): { farms: Farm[]; sensors: Sensor[] } {
  const shoreDist = distanceTransform(t.mask, t.width, t.height);
  const farms = FARM_SPECS.map(({ lon, lat, ...rest }) => {
    const px = snapToLake(t, shoreDist, lon, lat, 3, 7);
    return { ...rest, px, world: pxToWorld(t, px[0], px[1]) };
  });
  const sensors = SENSOR_SPECS.map(({ lon, lat, ...rest }) => {
    const px = snapToLake(t, shoreDist, lon, lat, 14, 400);
    return { ...rest, px, world: pxToWorld(t, px[0], px[1]) };
  });
  return { farms, sensors };
}

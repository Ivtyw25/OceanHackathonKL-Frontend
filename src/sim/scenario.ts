// The demo scenario: where the bloom starts, which rivers feed the lake, the default forecast wind.

import type { Farm, Sensor } from '../data/sites';
import { lonLatToPx, type Terrain } from '../data/terrain';
import { buildSimGrid, pxToCell } from './grid';
import type { SimSetup, WindSetting } from './model';

/** Forecast wind before anyone changes it: a steady east-north-easterly. */
export const DEFAULT_FORECAST_WIND: WindSetting = { fromDeg: 65, speed: 4.5 };

const RIVERS = [
  { lon: 98.53, lat: 2.9, load: 6 },
  { lon: 99.05, lat: 2.34, load: 8 },
  { lon: 98.72, lat: 2.6, load: 4 },
];

/** Bloom already present three days ago (start of the observed period). */
const SEEDS = [
  { farmId: 'haranggaol', amp: 26, sigmaM: 2200 },
  { farmId: 'balige', amp: 10, sigmaM: 2000 },
  { farmId: 'ajibata', amp: 3, sigmaM: 1500 },
];

export function buildSetup(terrain: Terrain, farms: Farm[], sensors: Sensor[]): SimSetup {
  const grid = buildSimGrid(terrain);
  const byId = new Map(farms.map((f) => [f.id, f]));
  return {
    grid,
    farms: farms.map((f) => ({ cell: pxToCell(grid, f.px), load: f.load })),
    sensors: sensors.map((s) => ({ cell: pxToCell(grid, s.px) })),
    rivers: RIVERS.map((r) => ({ cell: pxToCell(grid, lonLatToPx(terrain, r.lon, r.lat)), load: r.load })),
    seeds: SEEDS.flatMap((s) => {
      const farm = byId.get(s.farmId);
      return farm ? [{ cell: pxToCell(grid, farm.px), amp: s.amp, sigmaM: s.sigmaM }] : [];
    }),
  };
}

// Turns a region's simulation settings (rivers, starting bloom) into simulation-grid inputs.

import type { Farm, Sensor } from '../data/sites';
import type { Region } from '../data/region';
import { lonLatToPx, type Terrain } from '../data/terrain';
import { buildSimGrid, pxToCell } from './grid';
import type { SimSetup } from './model';

export function buildSetup(terrain: Terrain, farms: Farm[], sensors: Sensor[], region: Region): SimSetup {
  const grid = buildSimGrid(terrain);
  const byId = new Map(farms.map((f) => [f.id, f]));
  const sim = region.simulation;
  return {
    grid,
    params: { ...sim, bloomChl: region.bloomChl },
    farms: farms.map((f) => ({ cell: pxToCell(grid, f.px), load: f.load })),
    sensors: sensors.map((s) => ({ cell: pxToCell(grid, s.px) })),
    rivers: sim.rivers.map((r) => ({ cell: pxToCell(grid, lonLatToPx(terrain, r.lon, r.lat)), load: r.load })),
    seeds: sim.seeds.flatMap((s) => {
      const farm = byId.get(s.farmId);
      return farm ? [{ cell: pxToCell(grid, farm.px), amp: s.amp, sigmaM: s.sigmaM }] : [];
    }),
  };
}

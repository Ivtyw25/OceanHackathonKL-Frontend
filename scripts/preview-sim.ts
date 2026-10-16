// Runs the bloom simulation in Node and writes a contact sheet of snapshots, so the scenario
// can be tuned without a browser.
// Usage: npm run sim:preview -- [out.png] [--region <id>] [--wind <fromDeg> <speed>]

import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { CHL_ENCODE_MAX, ENSEMBLE_MEMBERS, FRAME_COUNT } from '../src/config';
import { placeSites } from '../src/data/sites';
import type { Region, RegionIndex } from '../src/data/region';
import { parseTerrain, type TerrainMeta } from '../src/data/terrain';
import { pxToCell } from '../src/sim/grid';
import { BloomModel } from '../src/sim/model';
import { farmOutlook, frameOfHour } from '../src/sim/risk';
import { buildSetup } from '../src/sim/scenario';

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const readJson = <T>(file: string) => JSON.parse(fs.readFileSync(path.join(root, 'public/regions', file), 'utf8')) as T;
const regionIdx = args.indexOf('--region');
const regionId = regionIdx > -1 ? args[regionIdx + 1] : readJson<RegionIndex>('index.json').defaultRegion;
const region = readJson<Region>(`${regionId}/region.json`);
const meta = readJson<TerrainMeta>(`${regionId}/meta.json`);
const bin = fs.readFileSync(path.join(root, 'public/regions', regionId, 'terrain.bin'));
const terrain = parseTerrain(meta, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer);
const { farms, sensors } = placeSites(terrain, region);
const setup = buildSetup(terrain, farms, sensors, region);
const model = new BloomModel(setup);

const windIdx = args.indexOf('--wind');
const wind =
  windIdx > -1 ? { fromDeg: Number(args[windIdx + 1]), speed: Number(args[windIdx + 2]) } : region.simulation.forecastWind;
const outFile = args.find((a) => a.endsWith('.png')) ?? path.join(root, '.cache/sim-preview.png');

const out = model.run({ nowLocalHour: 8, forecastWind: wind, members: ENSEMBLE_MEMBERS });
console.log(`${region.name}: grid ${setup.grid.n}² (${setup.grid.waterIdx.length} water cells, ${setup.grid.cellM.toFixed(0)} m), ` +
  `${FRAME_COUNT} frames x ${out.members} members in ${out.elapsedMs.toFixed(0)} ms, wind from ${wind.fromDeg}° at ${wind.speed} m/s`);

farms.forEach((f, i) => {
  const o = farmOutlook(out, i);
  console.log(
    `${f.name.padEnd(12)} ${o.level.padEnd(7)} chance ${(o.chance * 100).toFixed(0).padStart(3)}%  ` +
      `eta ${o.etaHours === null ? '  -' : String(o.etaHours).padStart(3)} h  now ${o.nowChl.toFixed(1).padStart(5)}  ` +
      `peak ${o.peakChl.toFixed(1).padStart(5)}  minDO ${o.minOxygen.toFixed(1)} @${o.minOxygenHour}h`,
  );
});

const hours = [-72, -36, 0, 24, 48, 72, 96, 120];
const n = setup.grid.n;
const cols = 4;
const png = new PNG({ width: n * cols, height: n * Math.ceil(hours.length / cols) });
const farmCells = new Set(
  farms.flatMap((f) => {
    const [x, y] = pxToCell(setup.grid, f.px);
    const out: number[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) out.push((Math.floor(y) + dy) * n + Math.floor(x) + dx);
    return out;
  }),
);
hours.forEach((h, p) => {
  const f = frameOfHour(h);
  const ox = (p % cols) * n;
  const oy = Math.floor(p / cols) * n;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const c = j * n + i;
      const k = ((oy + j) * png.width + ox + i) * 4;
      let rgb: [number, number, number];
      if (!setup.grid.water[c]) rgb = [205, 200, 188];
      else {
        const e = out.conc[f * n * n + c] / 255;
        const chl = e * e * CHL_ENCODE_MAX;
        const t = Math.min(1, Math.log1p(chl / 3) / Math.log1p(150 / 3));
        rgb = [30 + 150 * t * t, 70 + 150 * t, 110 - 60 * t];
        const pr = out.prob[f * n * n + c] / 255;
        const prr = out.prob[f * n * n + c + 1] / 255;
        const prd = out.prob[f * n * n + c + n] / 255;
        if ((pr >= 0.5) !== (prr >= 0.5) || (pr >= 0.5) !== (prd >= 0.5)) rgb = [255, 255, 255];
      }
      if (farmCells.has(c)) rgb = [220, 40, 40];
      png.data[k] = rgb[0];
      png.data[k + 1] = rgb[1];
      png.data[k + 2] = rgb[2];
      png.data[k + 3] = 255;
    }
  }
});
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, PNG.sync.write(png));
console.log(`Hours ${hours.join(', ')} -> ${outFile}`);

// A small surface-bloom model for the prototype. It is plausible, not calibrated:
//   - currents = shore-following gyres + slow eddies (both divergence-free) + wind drift
//     that is turned along the shore, so scum piles up on downwind coasts
//   - transport = semi-Lagrangian advection, convergence build-up, horizontal diffusion
//   - growth = light x temperature x nutrients (fed by cage farms and rivers), damped by wind mixing
// The forecast is an ensemble: each member perturbs wind direction, wind speed and growth.

import { CHL_ENCODE_MAX, FRAME_COUNT, TIMELINE_END_H, TIMELINE_START_H } from '../config';
import type { SimulationParams, WindSetting } from '../data/region';
import type { SimGrid } from './grid';

export type { WindSetting };

export type SimParams = SimulationParams & { bloomChl: number };

export interface SimInput {
  /** Local (MYT) hour of day at "now". */
  nowLocalHour: number;
  /** Mean wind for the forecast period. */
  forecastWind: WindSetting;
  members: number;
}

export interface SimPoint {
  /** Continuous cell coordinates. */
  cell: [number, number];
}

export interface SimSetup {
  grid: SimGrid;
  farms: (SimPoint & { load: number })[];
  sensors: SimPoint[];
  rivers: (SimPoint & { load: number })[];
  seeds: (SimPoint & { amp: number; sigmaM: number })[];
  params: SimParams;
}

/** Daily current fields from real data, one per day from the timeline start (backend runs only). */
export interface DailyCurrents {
  /** m/s on the simulation grid, x = east, z = south. [day][cell] */
  u: Float32Array[];
  v: Float32Array[];
  /** Where each day came from: forecast, analysis, reanalysis, held or none. */
  sources: string[];
}

export interface SimOutput {
  frames: number;
  members: number;
  /** Control run, chlorophyll-a encoded as sqrt(chl / max) * 255. [frame][cell] */
  conc: Uint8Array;
  /** Share of ensemble members above the bloom threshold * 255. [frame][cell] */
  prob: Uint8Array;
  /** Chlorophyll-a at each farm, µg/L. [farm][member][frame] */
  farmSeries: Float32Array;
  /** Chlorophyll-a at each sensor (control run). [sensor][frame] */
  sensorSeries: Float32Array;
  windFrom: Float32Array;
  windSpeed: Float32Array;
  tempC: Float32Array;
  light: Float32Array;
  /** Bloom level (µg/L) the `prob` field and farm outlooks are measured against. */
  bloomChl: number;
  /** Real currents for the streaks; absent for the in-browser simulation, which computes its own. */
  currents?: DailyCurrents;
  elapsedMs: number;
}

interface Member {
  dirOffset: number;
  speedFactor: number;
  growth: number;
}

const DT = 3600;
const LOSS = 0.0105;
const DRIFT = 0.022;
const DIFFUSIVITY = 3;
const NUTRIENT_HALF = 14;

const EDDY_MODES = [
  { lambda: 9000, dir: 0.6, period: 40, phase: 0.3, amp: 34 },
  { lambda: 13000, dir: 2.1, period: 63, phase: 1.7, amp: 42 },
  { lambda: 17000, dir: 4.0, period: 90, phase: 4.1, amp: 50 },
].map((m) => ({
  kx: ((2 * Math.PI) / m.lambda) * Math.cos(m.dir),
  kz: ((2 * Math.PI) / m.lambda) * Math.sin(m.dir),
  w: (2 * Math.PI) / m.period,
  phase: m.phase,
  amp: m.amp,
}));

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number) {
  const u = Math.max(1e-9, rng());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

export function makeMembers(count: number, seed = 20261011): Member[] {
  const rng = mulberry32(seed);
  const members: Member[] = [{ dirOffset: 0, speedFactor: 1, growth: 1 }];
  for (let m = 1; m < count; m++) {
    members.push({
      dirOffset: 30 * gaussian(rng),
      speedFactor: clamp(1 + 0.3 * gaussian(rng), 0.5, 1.6),
      growth: clamp(1 + 0.12 * gaussian(rng), 0.75, 1.25),
    });
  }
  return members;
}

export const localHourAt = (input: Pick<SimInput, 'nowLocalHour'>, hour: number) =>
  (((input.nowLocalHour + hour) % 24) + 24) % 24;

export const daylight = (local: number) => Math.max(0, Math.sin((Math.PI * (local - 6)) / 12));

const diurnalWind = (local: number) => 0.7 + 0.6 * Math.max(0, Math.sin((Math.PI * (local - 10)) / 12));

export function surfaceTemp(input: Pick<SimInput, 'nowLocalHour'>, hour: number, p: SimParams) {
  const local = localHourAt(input, hour);
  const warmSpell = 0.6 * Math.exp(-(((hour - 40) / 30) ** 2));
  return p.waterTempC + p.dailyTempSwingC * Math.sin((2 * Math.PI * (local - 9)) / 24) + warmSpell;
}

function toVector(fromDeg: number, speed: number) {
  const toward = ((fromDeg + 180) * Math.PI) / 180;
  return { x: speed * Math.sin(toward), z: -speed * Math.cos(toward) };
}

export function windAt(input: SimInput, hour: number, member: Member, p: SimParams) {
  const di = diurnalWind(localHourAt(input, hour));
  const past = toVector(p.pastWindFromDeg + 25 * Math.sin((2 * Math.PI * hour) / 31), p.pastWindSpeed * di);
  const lead = Math.max(0, hour);
  const fc = toVector(
    input.forecastWind.fromDeg + member.dirOffset * Math.sqrt(lead / TIMELINE_END_H),
    input.forecastWind.speed * member.speedFactor * di,
  );
  const b = clamp(hour / 6, 0, 1);
  const x = past.x * (1 - b) + fc.x * b;
  const z = past.z * (1 - b) + fc.z * b;
  const speed = Math.hypot(x, z);
  const toward = (Math.atan2(x, -z) * 180) / Math.PI;
  return { x, z, speed, fromDeg: (toward + 180 + 360) % 360 };
}

export class BloomModel {
  readonly grid: SimGrid;
  readonly nutrient: Float32Array;
  private readonly setup: SimSetup;
  private readonly gyreU: Float32Array;
  private readonly gyreV: Float32Array;
  private readonly eddyS: Float32Array;
  private readonly psi: Float32Array;
  private readonly driftU: Float32Array;
  private readonly driftV: Float32Array;
  private readonly div: Float32Array;

  constructor(setup: SimSetup) {
    this.setup = setup;
    const g = setup.grid;
    this.grid = g;
    const nn = g.n * g.n;
    this.nutrient = new Float32Array(nn);
    this.gyreU = new Float32Array(nn);
    this.gyreV = new Float32Array(nn);
    this.eddyS = new Float32Array(nn);
    this.psi = new Float32Array(nn);
    this.driftU = new Float32Array(nn);
    this.driftV = new Float32Array(nn);
    this.div = new Float32Array(nn);

    for (const c of g.waterIdx) {
      const ci = c % g.n;
      const cj = (c - ci) / g.n;
      let p = 6;
      for (const s of [...setup.farms, ...setup.rivers]) {
        const d = Math.hypot(ci + 0.5 - s.cell[0], cj + 0.5 - s.cell[1]) * g.cellM;
        p += s.load * Math.exp(-d / 3200);
      }
      this.nutrient[c] = p;
      this.psi[c] = 150 * (1 - Math.exp(-g.shoreM[c] / 3000));
      this.eddyS[c] = 1 - Math.exp(-g.shoreM[c] / 1200);
    }
    this.psiToVelocity(this.gyreU, this.gyreV);
  }

  /** u = dpsi/dz, v = -dpsi/dx (x east, z south): divergence-free and parallel to the shore. */
  private psiToVelocity(outU: Float32Array, outV: Float32Array) {
    const { n, cellM, waterIdx } = this.grid;
    const psi = this.psi;
    const inv = 1 / (2 * cellM);
    for (const c of waterIdx) {
      outU[c] = (psi[c + n] - psi[c - n]) * inv;
      outV[c] = -(psi[c + 1] - psi[c - 1]) * inv;
    }
  }

  /** Slow eddies at a given hour; shared by all ensemble members. */
  eddyField(hour: number, outU: Float32Array, outV: Float32Array) {
    const { n, cellM, waterIdx } = this.grid;
    const psi = this.psi;
    psi.fill(0);
    for (const c of waterIdx) {
      const ci = c % n;
      const cj = (c - ci) / n;
      const x = (ci + 0.5) * cellM;
      const z = (cj + 0.5) * cellM;
      let s = 0;
      for (const m of EDDY_MODES) s += m.amp * Math.sin(m.kx * x + m.kz * z + m.w * hour + m.phase);
      psi[c] = this.eddyS[c] * s;
    }
    this.psiToVelocity(outU, outV);
  }

  /** Total surface current for one member (m/s), plus the divergence of the wind drift. */
  velocity(
    input: SimInput,
    hour: number,
    member: Member,
    eddyU: Float32Array,
    eddyV: Float32Array,
    outU: Float32Array,
    outV: Float32Array,
  ) {
    const g = this.grid;
    const { n, waterIdx, water, normalX, normalZ, shoreM } = g;
    const wind = windAt(input, hour, member, this.setup.params);
    const gs = 0.35 + 0.12 * wind.speed;
    const dx = DRIFT * wind.x;
    const dz = DRIFT * wind.z;
    const du = this.driftU;
    const dv = this.driftV;
    for (const c of waterIdx) {
      let ux = dx;
      let uz = dz;
      const nx = normalX[c];
      const nz = normalZ[c];
      const dn = ux * nx + uz * nz;
      if (dn < 0) {
        const k = Math.exp(-shoreM[c] / 700);
        ux -= k * dn * nx;
        uz -= k * dn * nz;
      }
      du[c] = ux;
      dv[c] = uz;
      outU[c] = gs * this.gyreU[c] + eddyU[c] + ux;
      outV[c] = gs * this.gyreV[c] + eddyV[c] + uz;
    }
    const inv = 1 / (2 * g.cellM);
    for (const c of waterIdx) {
      const e = water[c + 1] ? du[c + 1] : du[c];
      const w = water[c - 1] ? du[c - 1] : du[c];
      const s = water[c + n] ? dv[c + n] : dv[c];
      const no = water[c - n] ? dv[c - n] : dv[c];
      this.div[c] = (e - w + s - no) * inv;
    }
    return wind;
  }

  /** Advance one member by one hour. `tmp` is scratch space of the same size. */
  private step(
    input: SimInput,
    hour: number,
    member: Member,
    b: Float32Array,
    tmp: Float32Array,
    u: Float32Array,
    v: Float32Array,
    wind: { speed: number },
  ) {
    const g = this.grid;
    const { n, waterIdx, water } = g;
    const f = DT / g.cellM;
    const div = this.div;

    for (const c of waterIdx) {
      const ci = c % n;
      const cj = (c - ci) / n;
      const x = clamp(ci - u[c] * f, 0, n - 2);
      const z = clamp(cj - v[c] * f, 0, n - 2);
      const i0 = x | 0;
      const j0 = z | 0;
      const ax = x - i0;
      const az = z - j0;
      const k = j0 * n + i0;
      const w00 = (1 - ax) * (1 - az) * water[k];
      const w10 = ax * (1 - az) * water[k + 1];
      const w01 = (1 - ax) * az * water[k + n];
      const w11 = ax * az * water[k + n + 1];
      const sw = w00 + w10 + w01 + w11;
      const val = sw > 1e-6 ? (w00 * b[k] + w10 * b[k + 1] + w01 * b[k + n] + w11 * b[k + n + 1]) / sw : b[c];
      tmp[c] = val * clamp(1 - div[c] * DT, 0.85, 1.08);
    }

    const dk = (DIFFUSIVITY * DT) / (g.cellM * g.cellM);
    const local = localHourAt(input, hour);
    const light = daylight(local);
    const p = this.setup.params;
    const fT = Math.exp(0.07 * (surfaceTemp(input, hour, p) - p.waterTempC));
    const fW = 1 / (1 + (wind.speed / 5.5) ** 2);
    const mu0 = p.growthRate * member.growth * light * fT * fW;
    const loss = LOSS + 0.006 * Math.max(0, wind.speed - 3.5);
    const nut = this.nutrient;
    for (const c of waterIdx) {
      const bc = tmp[c];
      let lap = 0;
      if (water[c - 1]) lap += tmp[c - 1] - bc;
      if (water[c + 1]) lap += tmp[c + 1] - bc;
      if (water[c - n]) lap += tmp[c - n] - bc;
      if (water[c + n]) lap += tmp[c + n] - bc;
      const d = bc + dk * lap;
      const fN = nut[c] / (nut[c] + NUTRIENT_HALF);
      let next = d + d * (mu0 * fN * (1 - d / p.carryingCapacity) - loss);
      if (next < p.minChl) next = p.minChl;
      else if (next > CHL_ENCODE_MAX) next = CHL_ENCODE_MAX;
      b[c] = next;
    }
  }

  /** Bilinear, water-only sample at continuous cell coordinates. */
  sample(b: Float32Array, cell: [number, number]): number {
    const { n, water } = this.grid;
    const x = clamp(cell[0] - 0.5, 0, n - 2);
    const z = clamp(cell[1] - 0.5, 0, n - 2);
    const i0 = x | 0;
    const j0 = z | 0;
    const ax = x - i0;
    const az = z - j0;
    const k = j0 * n + i0;
    const w00 = (1 - ax) * (1 - az) * water[k];
    const w10 = ax * (1 - az) * water[k + 1];
    const w01 = (1 - ax) * az * water[k + n];
    const w11 = ax * az * water[k + n + 1];
    const sw = w00 + w10 + w01 + w11;
    if (sw < 1e-6) return this.setup.params.minChl;
    return (w00 * b[k] + w10 * b[k + 1] + w01 * b[k + n] + w11 * b[k + n + 1]) / sw;
  }

  private initialState(): Float32Array {
    const g = this.grid;
    const b = new Float32Array(g.n * g.n);
    const rng = mulberry32(7);
    const patch = new Float32Array(16 * 16).map(() => rng());
    for (const c of g.waterIdx) {
      const ci = c % g.n;
      const cj = (c - ci) / g.n;
      const px = (ci / g.n) * 15;
      const pz = (cj / g.n) * 15;
      const i0 = Math.floor(px);
      const j0 = Math.floor(pz);
      const ax = px - i0;
      const az = pz - j0;
      const nz =
        (patch[j0 * 16 + i0] * (1 - ax) + patch[j0 * 16 + i0 + 1] * ax) * (1 - az) +
        (patch[(j0 + 1) * 16 + i0] * (1 - ax) + patch[(j0 + 1) * 16 + i0 + 1] * ax) * az;
      let v = 2 * (0.75 + 0.5 * nz);
      for (const s of this.setup.seeds) {
        const d = Math.hypot(ci + 0.5 - s.cell[0], cj + 0.5 - s.cell[1]) * g.cellM;
        v += s.amp * Math.exp(-0.5 * (d / s.sigmaM) ** 2);
      }
      b[c] = v;
    }
    return b;
  }

  run(input: SimInput, onProgress?: (fraction: number) => void): SimOutput {
    const t0 = performance.now();
    const g = this.grid;
    const { n, waterIdx, coastLand, water } = g;
    const nn = n * n;
    const M = Math.max(1, input.members);
    const members = makeMembers(M);
    const frames = FRAME_COUNT;
    const farms = this.setup.farms;
    const sensors = this.setup.sensors;

    const conc = new Uint8Array(nn * frames);
    const prob = new Uint8Array(nn * frames);
    const farmSeries = new Float32Array(farms.length * M * frames);
    const sensorSeries = new Float32Array(sensors.length * frames);
    const windFrom = new Float32Array(frames);
    const windSpeed = new Float32Array(frames);
    const tempC = new Float32Array(frames);
    const light = new Float32Array(frames);

    const states: Float32Array[] = [this.initialState()];
    const tmp = new Float32Array(nn);
    const eddyU = new Float32Array(nn);
    const eddyV = new Float32Array(nn);
    const u = new Float32Array(nn);
    const v = new Float32Array(nn);
    const enc = 255 / Math.sqrt(CHL_ENCODE_MAX);
    const bloom = this.setup.params.bloomChl;

    const record = (f: number, hour: number) => {
      const off = f * nn;
      const control = states[0];
      const active = states.length;
      for (const c of waterIdx) {
        conc[off + c] = Math.round(Math.sqrt(control[c]) * enc);
        let above = 0;
        for (let m = 0; m < active; m++) if (states[m][c] > bloom) above++;
        prob[off + c] = Math.round((above / active) * 255);
      }
      // Pad coastal land cells with their water neighbours so texture filtering stays clean.
      for (const c of coastLand) {
        let sc = 0;
        let sp = 0;
        let cnt = 0;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const k = c + dj * n + di;
            if (k >= 0 && k < nn && water[k]) {
              sc += conc[off + k];
              sp += prob[off + k];
              cnt++;
            }
          }
        }
        conc[off + c] = Math.round(sc / cnt);
        prob[off + c] = Math.round(sp / cnt);
      }
      farms.forEach((farm, fi) => {
        for (let m = 0; m < M; m++) {
          const s = states[Math.min(m, active - 1)];
          farmSeries[(fi * M + m) * frames + f] = this.sample(s, farm.cell);
        }
      });
      sensors.forEach((s, si) => {
        sensorSeries[si * frames + f] = this.sample(control, s.cell);
      });
      const w = windAt(input, hour, members[0], this.setup.params);
      windFrom[f] = w.fromDeg;
      windSpeed[f] = w.speed;
      tempC[f] = surfaceTemp(input, hour, this.setup.params);
      light[f] = daylight(localHourAt(input, hour));
    };

    for (let hour = TIMELINE_START_H, f = 0; hour <= TIMELINE_END_H; hour++, f++) {
      if (hour === 0) {
        for (let m = 1; m < M; m++) states.push(states[0].slice());
      }
      record(f, hour);
      if (hour === TIMELINE_END_H) break;
      this.eddyField(hour + 0.5, eddyU, eddyV);
      for (let m = 0; m < states.length; m++) {
        const wind = this.velocity(input, hour + 0.5, members[m], eddyU, eddyV, u, v);
        this.step(input, hour + 0.5, members[m], states[m], tmp, u, v, wind);
      }
      if (onProgress && f % 8 === 0) onProgress(f / (frames - 1));
    }

    return {
      frames,
      members: M,
      conc,
      prob,
      farmSeries,
      sensorSeries,
      windFrom,
      windSpeed,
      tempC,
      light,
      bloomChl: bloom,
      elapsedMs: performance.now() - t0,
    };
  }

  /** Control-run surface current at an hour, for drawing current particles. */
  currentsAt(input: SimInput, hour: number, outU: Float32Array, outV: Float32Array) {
    const nn = this.grid.n * this.grid.n;
    const eu = new Float32Array(nn);
    const ev = new Float32Array(nn);
    this.eddyField(hour, eu, ev);
    return this.velocity(input, hour, makeMembers(1)[0], eu, ev, outU, outV);
  }
}

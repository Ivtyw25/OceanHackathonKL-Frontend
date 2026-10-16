// Real data from the AlgaWatch backend, reshaped into what the scene already draws (SimOutput + FarmOutlook).
// The backend gives daily values per 4 km cell; the scene wants hourly frames on its own grid, so values are
// spread onto the grid by inverse-distance weighting and blended between days (each day sits at local noon).

import { CHL_ENCODE_MAX, DO_DANGER, DO_STRESS, FRAME_COUNT, OUTLOOK_HOURS, TIMELINE_START_H } from '../config';
import { daylight, localHourAt, type DailyCurrents, type SimOutput } from '../sim/model';
import { NOW_FRAME, type FarmOutlook, type RiskLevel } from '../sim/risk';
import type { World } from '../state/store';
import { getRegion } from './region';
import { lonLatToPx } from './terrain';

export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

const OBSERVED_DAYS = -TIMELINE_START_H / 24 + 1;

type Num = number | null;
interface Horizon { days: number; chl_p10: number; chl_p50: number; chl_p90: number; p_bloom: number }
interface CellRef { cell_id: string; lat: number; lon: number }
interface Conditions {
  dates: string[];
  cells: CellRef[];
  values: { chl_map: Num[][]; chl_seen: (boolean | null)[][]; o2_mg_l: Num[][]; sst: Num[][]; chl_clim_p97: Num[][]; spm: Num[][] };
  area: { date: string; windFromDeg: Num; windSpeed: Num; sst: Num }[];
}
interface Forecast {
  issue_date: string;
  model_version: string;
  synthetic: boolean;
  bloom_rule: string;
  bloom_chl_mg_m3: number;
  cells: (CellRef & { horizons: Horizon[] })[];
  farms: { id: string; cell_id: string | null; horizons: Horizon[] }[];
}

interface CurrentDays {
  days: { date: string; source: string; points: { lat: number; lon: number; u: number; v: number }[] }[];
}

export interface BackendRun {
  sim: SimOutput;
  outlooks: FarmOutlook[];
  issueDate: string;
  modelVersion: string;
  synthetic: boolean;
  bloomRule: string;
}

async function get<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`);
  } catch {
    throw new Error(`Can't reach the AlgaWatch backend at ${API_URL}.`);
  }
  if (!res.ok) {
    const detail = await res.json().then((b) => b.detail, () => res.statusText);
    throw new Error(String(detail));
  }
  return res.json() as Promise<T>;
}

/** Latest day with data, unless `?date=YYYY-MM-DD` asks for a replay day. */
export async function backendIssueDate(regionId: string): Promise<string> {
  const asked = new URLSearchParams(location.search).get('date');
  if (asked) return asked;
  return (await get<{ last: string }>(`/regions/${regionId}/dates`)).last;
}

/** The instant of local noon on `day` in the region's time zone: the timeline's "now" for that issue date. */
export function noonOf(day: string, timeZone: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 12);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
    .formatToParts(new Date(guess))
    .reduce<Record<string, number>>((a, p) => (p.type === 'literal' ? a : { ...a, [p.type]: Number(p.value) }), {});
  const shown = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return new Date(guess - (shown - guess));
}

/** For every scene-grid cell, the backend cells around it and their weights (nearest 4, 1/d²). */
function weightsFor(world: World, cells: { lat: number; lon: number }[]) {
  const { grid } = world.setup;
  const pts = cells.map((c) => lonLatToPx(world.terrain, c.lon, c.lat));
  const targets = [...grid.waterIdx, ...grid.coastLand];
  const idx = new Int32Array(targets.length * 4);
  const w = new Float32Array(targets.length * 4);
  targets.forEach((c, t) => {
    const x = grid.originPx[0] + ((c % grid.n) + 0.5) * grid.cellPx;
    const y = grid.originPx[1] + (Math.floor(c / grid.n) + 0.5) * grid.cellPx;
    const near = pts
      .map((p, k) => ({ k, d2: (p[0] - x) ** 2 + (p[1] - y) ** 2 }))
      .sort((a, b) => a.d2 - b.d2)
      .slice(0, 4);
    const total = near.reduce((s, n) => s + 1 / (n.d2 + 1), 0);
    near.forEach((n, j) => {
      idx[t * 4 + j] = n.k;
      w[t * 4 + j] = 1 / (n.d2 + 1) / total;
    });
  });
  return { targets, idx, w };
}

/** Daily values (index 0 = issue day - 3 … 8 = issue day + 5) to an hourly series blended between noons. */
function hourly(daily: Num[], fallback: number): Float32Array {
  const filled = daily.map((v) => v ?? NaN);
  for (let i = 0; i < filled.length; i++) if (Number.isNaN(filled[i])) filled[i] = i > 0 ? filled[i - 1] : NaN;
  for (let i = filled.length - 1; i >= 0; i--) if (Number.isNaN(filled[i])) filled[i] = filled[i + 1] ?? fallback;
  const out = new Float32Array(FRAME_COUNT);
  for (let f = 0; f < FRAME_COUNT; f++) {
    const pos = (f + TIMELINE_START_H) / 24 + OBSERVED_DAYS - 1;
    const i = Math.min(Math.floor(pos), filled.length - 2);
    const a = pos - i;
    out[f] = (filled[i] ?? fallback) * (1 - a) + (filled[i + 1] ?? fallback) * a;
  }
  return out;
}

/** Standard normal CDF (Abramowitz-Stegun 26.2.17, error below 1e-7). */
function normalCdf(z: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

/** Chance chlorophyll exceeds `level`, treating the model's p10/p50/p90 as a log-normal spread. */
function chanceAbove(h: Horizon, level: number) {
  const sigma = Math.max(0.02, (Math.log10(h.chl_p90) - Math.log10(h.chl_p10)) / (2 * 1.2816));
  return 1 - normalCdf((Math.log10(level) - Math.log10(h.chl_p50)) / sigma);
}

function outlookFrom(chl: Float32Array, lo: Float32Array, hi: Float32Array, prob: Float32Array, oxygen: Float32Array, bloom: number): FarmOutlook {
  const nowChl = chl[NOW_FRAME];
  const presentNow = nowChl > bloom;
  let chance = 0;
  let etaHours: number | null = presentNow ? 0 : null;
  let peakChl = 0;
  let minOxygen = Infinity;
  let minOxygenHour = 0;
  for (let f = NOW_FRAME; f <= NOW_FRAME + OUTLOOK_HOURS; f++) {
    chance = Math.max(chance, prob[f]);
    peakChl = Math.max(peakChl, chl[f]);
    if (oxygen[f] < minOxygen) {
      minOxygen = oxygen[f];
      minOxygenHour = f - NOW_FRAME;
    }
  }
  if (etaHours === null) {
    for (let f = NOW_FRAME; f < FRAME_COUNT; f++) {
      if (prob[f] >= 0.5) {
        etaHours = f - NOW_FRAME;
        break;
      }
    }
  }
  if (presentNow) chance = 1;
  let level: RiskLevel = 'low';
  if (chance >= 0.8 || minOxygen < DO_DANGER) level = 'severe';
  else if (chance >= 0.5 || minOxygen < DO_STRESS) level = 'high';
  else if (chance >= 0.2 || peakChl >= bloom * 0.6) level = 'watch';
  return { level, chance, etaHours, presentNow, nowChl, peakChl, minOxygen, minOxygenHour, series: { median: chl, p10: lo, p90: hi, prob, oxygen }, bloomChl: bloom };
}

/**
 * Observed days around `issueDate`, plus the model's forecast when `withForecast` is set. Without it no
 * prediction is requested: the frames after the issue day just hold the last observation and stay off screen.
 */
export async function runBackendForecast(
  world: World,
  issueDate: string,
  onProgress: (p: number) => void,
  withForecast = true,
): Promise<BackendRun> {
  const region = getRegion();
  const t0 = performance.now();
  const q = `date=${issueDate}`;
  const [cond, fc] = await Promise.all([
    get<Conditions>(`/regions/${region.id}/conditions?${q}&days=${OBSERVED_DAYS}`),
    withForecast ? get<Forecast>(`/regions/${region.id}/forecast?${q}`) : Promise.resolve(null),
  ]);
  // Streaks still work if currents fail; they fall back to the simulated flow.
  const currentDays = await get<CurrentDays>(`/regions/${region.id}/currents?${q}&before=${OBSERVED_DAYS - 1}&after=5`).catch(() => null);
  onProgress(0.6);

  const bloom = fc?.bloom_chl_mg_m3 ?? region.bloomChl;
  const fcByCell = new Map((fc?.cells ?? []).map((c) => [c.cell_id, c.horizons]));
  const horizon = (hs: Horizon[] | undefined, d: number) => hs?.find((h) => h.days === d);

  // The region's rule decides what a bloom is. Relative: over k x the cell's 97th percentile for the date,
  // not in muddy water; forecast chances then come from the model's spread against that same level.
  const rule = region.bloom?.rule === 'relative' ? region.bloom : null;
  const v = cond.values;
  const issueDay = v.chl_map.length - 1;
  const levelOn = (d: number, k: number) => (rule && v.chl_clim_p97[d][k] != null ? rule.timesClimP97 * v.chl_clim_p97[d][k]! : bloom);
  const cellLevel = cond.cells.map((_, k) => levelOn(issueDay, k));
  const muddy = (d: number, k: number) => !!rule?.maxSpm && v.spm[d][k] != null && v.spm[d][k]! > rule.maxSpm;

  // Per backend cell: daily chlorophyll (observed then forecast median) and daily bloom chance.
  const cellChl: Num[][] = [];
  const cellProb: Num[][] = [];
  cond.cells.forEach((c, k) => {
    const hs = fcByCell.get(c.cell_id);
    const obs = v.chl_map.map((day) => day[k]);
    cellChl.push([...obs, ...[1, 2, 3, 4, 5].map((d) => horizon(hs, d)?.chl_p50 ?? null)]);
    const seen = obs.map((x, d) => (x !== null && x > levelOn(d, k) && !muddy(d, k) ? 1 : 0));
    const ahead = [1, 2, 3, 4, 5].map((d) => {
      const h = horizon(hs, d);
      return !h ? 0 : rule ? chanceAbove(h, cellLevel[k]) : h.p_bloom;
    });
    cellProb.push([...seen, ...ahead]);
  });
  const chlSeries = cellChl.map((d) => hourly(d, 0.5));
  const probSeries = cellProb.map((d) => hourly(d, 0));

  const { grid } = world.setup;
  const nn = grid.n * grid.n;
  const conc = new Uint8Array(nn * FRAME_COUNT);
  const prob = new Uint8Array(nn * FRAME_COUNT);
  const enc = 255 / Math.sqrt(CHL_ENCODE_MAX);
  const { targets, idx, w } = weightsFor(world, cond.cells);
  for (let f = 0; f < FRAME_COUNT; f++) {
    const off = f * nn;
    for (let t = 0; t < targets.length; t++) {
      let c = 0;
      let p = 0;
      for (let j = 0; j < 4; j++) {
        const k = idx[t * 4 + j];
        c += w[t * 4 + j] * chlSeries[k][f];
        p += w[t * 4 + j] * probSeries[k][f];
      }
      conc[off + targets[t]] = Math.min(255, Math.round(Math.sqrt(Math.max(c, 0)) * enc));
      prob[off + targets[t]] = Math.round(Math.min(1, p) * 255);
    }
  }
  onProgress(0.85);

  const cellIndex = new Map(cond.cells.map((c, k) => [c.cell_id, k]));
  const nearestCell = (lon: number, lat: number) => {
    let best = 0;
    let bestD = Infinity;
    cond.cells.forEach((c, k) => {
      const d = (c.lon - lon) ** 2 + (c.lat - lat) ** 2;
      if (d < bestD) [best, bestD] = [k, d];
    });
    return best;
  };

  const km = (aLat: number, aLon: number, bLat: number, bLon: number) =>
    6371 * Math.hypot(((bLon - aLon) * Math.PI) / 180 * Math.cos((((aLat + bLat) / 2) * Math.PI) / 180), ((bLat - aLat) * Math.PI) / 180);
  const farmTimes = rule?.farmTimesClimP97 ?? rule?.timesClimP97;
  const nearbyKm = rule?.nearbyKm ?? 0;

  const farmSeries = new Float32Array(world.farms.length * FRAME_COUNT);
  const outlooks = world.farms.map((farm, i) => {
    const spec = region.farms.find((s) => s.id === farm.id)!;
    const fcFarm = fc?.farms.find((f) => f.id === farm.id);
    const k = fcFarm?.cell_id ? cellIndex.get(fcFarm.cell_id)! : nearestCell(spec.lon, spec.lat);
    const obs = cond.values.chl_map.map((day) => day[k]);
    const pick = (key: 'chl_p10' | 'chl_p90') => hourly([...obs, ...[1, 2, 3, 4, 5].map((d) => horizon(fcFarm?.horizons, d)?.[key] ?? null)], 0.5);
    const o2 = hourly(cond.values.o2_mg_l.map((day) => day[k]), 6.3);
    farmSeries.set(chlSeries[k], i * FRAME_COUNT);
    if (!rule) return outlookFrom(chlSeries[k], pick('chl_p10'), pick('chl_p90'), probSeries[k], o2, cellLevel[k]);

    // Farm risk: the farm's own cell at the lower farm multiplier, or bloom water nearby, whichever is higher.
    const level = farmTimes! * (v.chl_clim_p97[issueDay][k] ?? cellLevel[k] / rule.timesClimP97);
    const levelDay = (d: number) => farmTimes! * (v.chl_clim_p97[d][k] ?? v.chl_clim_p97[issueDay][k] ?? 1);
    const own = hourly(
      [
        ...obs.map((x, d) => (x !== null && x > levelDay(d) && !muddy(d, k) ? 1 : 0)),
        ...[1, 2, 3, 4, 5].map((d) => {
          const h = horizon(fcFarm?.horizons, d);
          return h ? chanceAbove(h, level) : 0;
        }),
      ],
      0,
    );
    const near = cond.cells
      .map((c, j) => ({ j, d: km(spec.lat, spec.lon, c.lat, c.lon) }))
      .filter((n) => n.d <= nearbyKm && n.j !== k);
    const prob = new Float32Array(FRAME_COUNT);
    let driverKm: number | null = null;
    let driverP = 0;
    for (let f = 0; f < FRAME_COUNT; f++) {
      prob[f] = own[f];
      for (const n of near) {
        const p = probSeries[n.j][f] * (1 - n.d / nearbyKm);
        if (p > prob[f]) prob[f] = p;
        if (f >= NOW_FRAME && f <= NOW_FRAME + OUTLOOK_HOURS && p > own[f] && p > driverP) [driverP, driverKm] = [p, n.d];
      }
    }
    const outlook = outlookFrom(chlSeries[k], pick('chl_p10'), pick('chl_p90'), prob, o2, level);
    return { ...outlook, nearbyKm: driverP >= 0.2 && driverKm !== null ? Math.round(driverKm) : null };
  });

  const sensorSeries = new Float32Array(world.sensors.length * FRAME_COUNT);
  world.sensors.forEach((s, i) => {
    const spec = region.samplePoints.find((p) => p.id === s.id)!;
    sensorSeries.set(chlSeries[nearestCell(spec.lon, spec.lat)], i * FRAME_COUNT);
  });

  // Area weather: observed days from the backend; the forecast days hold the last observed value.
  const area = (key: 'windFromDeg' | 'windSpeed' | 'sst', fallback: number) =>
    hourly([...cond.area.map((a) => a[key]), ...Array<Num>(5).fill(null)], fallback);
  const nowLocalHour = 12;
  const light = new Float32Array(FRAME_COUNT);
  for (let f = 0; f < FRAME_COUNT; f++) light[f] = daylight(localHourAt({ nowLocalHour }, f + TIMELINE_START_H));

  onProgress(1);
  return {
    sim: {
      frames: FRAME_COUNT,
      members: 1,
      conc,
      prob,
      farmSeries,
      sensorSeries,
      windFrom: area('windFromDeg', region.simulation.forecastWind.fromDeg),
      windSpeed: area('windSpeed', region.simulation.forecastWind.speed),
      tempC: area('sst', region.simulation.waterTempC),
      light,
      bloomChl: bloom,
      currents: currentDays ? currentsOnGrid(world, currentDays) : undefined,
      elapsedMs: performance.now() - t0,
    },
    outlooks,
    issueDate: fc?.issue_date ?? issueDate,
    modelVersion: fc?.model_version ?? '',
    synthetic: fc?.synthetic ?? true,
    bloomRule: rule
      ? `over ${rule.timesClimP97}x the usual level for the spot and season${rule.maxSpm ? `, outside muddy water` : ''}`
      : fc?.bloom_rule ?? '',
  };
}

/** Spread each day's current points onto the grid, then stop flow running into the coast. */
function currentsOnGrid(world: World, data: CurrentDays): DailyCurrents {
  const { grid } = world.setup;
  const nn = grid.n * grid.n;
  // The onshore part of the flow is removed within SHORE_CLEAR_M of land and fades back in by SHORE_BAND_M.
  const SHORE_CLEAR_M = 500;
  const SHORE_BAND_M = 3000;
  const cache = new Map<string, ReturnType<typeof weightsFor>>();
  const u: Float32Array[] = [];
  const v: Float32Array[] = [];
  for (const day of data.days) {
    const fu = new Float32Array(nn);
    const fz = new Float32Array(nn);
    if (day.points.length > 0) {
      const key = day.points.map((p) => `${p.lat},${p.lon}`).join(';');
      let wts = cache.get(key);
      if (!wts) cache.set(key, (wts = weightsFor(world, day.points)));
      const { targets, idx, w } = wts;
      for (let t = 0; t < targets.length; t++) {
        const c = targets[t];
        if (!grid.water[c]) continue;
        let x = 0;
        let z = 0;
        for (let j = 0; j < 4; j++) {
          const p = day.points[idx[t * 4 + j]];
          x += w[t * 4 + j] * p.u;
          z -= w[t * 4 + j] * p.v; // Copernicus v is northward; the grid's z points south
        }
        const onshore = x * grid.normalX[c] + z * grid.normalZ[c];
        if (onshore < 0) {
          const keep = Math.min(1, Math.max(0, (grid.shoreM[c] - SHORE_CLEAR_M) / (SHORE_BAND_M - SHORE_CLEAR_M)));
          x -= onshore * grid.normalX[c] * (1 - keep);
          z -= onshore * grid.normalZ[c] * (1 - keep);
        }
        fu[c] = x;
        fz[c] = z;
      }
    }
    u.push(fu);
    v.push(fz);
  }
  return { u, v, sources: data.days.map((d) => d.source) };
}

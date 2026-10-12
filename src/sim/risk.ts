// Turns ensemble output at each farm into what a farmer needs: chance of a bloom,
// when it arrives, how low oxygen may fall, and a status level.

import {
  CHL_BLOOM,
  DO_DANGER,
  DO_STRESS,
  FRAME_COUNT,
  OUTLOOK_HOURS,
  TIMELINE_END_H,
  TIMELINE_START_H,
} from '../config';
import type { SimOutput } from './model';

export type RiskLevel = 'low' | 'watch' | 'high' | 'severe';

export interface FarmSeries {
  median: Float32Array;
  p10: Float32Array;
  p90: Float32Array;
  /** Share of members above the bloom threshold, 0–1. */
  prob: Float32Array;
  oxygen: Float32Array;
}

export interface FarmOutlook {
  level: RiskLevel;
  /** Chance of bloom conditions at the cages within the outlook window, 0–1. */
  chance: number;
  /** Hours from now until a bloom is more likely than not; 0 when already present. */
  etaHours: number | null;
  presentNow: boolean;
  nowChl: number;
  peakChl: number;
  minOxygen: number;
  minOxygenHour: number;
  series: FarmSeries;
}

export const frameOfHour = (hour: number) => Math.round(hour) - TIMELINE_START_H;
export const NOW_FRAME = frameOfHour(0);

/** Dissolved oxygen (mg/L) near the cages: photosynthesis by day, algal and fish respiration always. */
export function oxygenAt(chl: number, light: number, tempC: number) {
  const v = 7.6 - 0.2 * (tempC - 26) + 0.07 * chl * light - 0.05 * chl - 0.8;
  return Math.min(14, Math.max(0.5, v));
}

function quantile(sorted: number[], q: number) {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function farmOutlook(out: SimOutput, farmIndex: number): FarmOutlook {
  const M = out.members;
  const F = FRAME_COUNT;
  const base = farmIndex * M * F;
  const series: FarmSeries = {
    median: new Float32Array(F),
    p10: new Float32Array(F),
    p90: new Float32Array(F),
    prob: new Float32Array(F),
    oxygen: new Float32Array(F),
  };
  const values: number[] = new Array(M);
  const oxy: number[] = new Array(M);
  for (let f = 0; f < F; f++) {
    let above = 0;
    for (let m = 0; m < M; m++) {
      const chl = out.farmSeries[base + m * F + f];
      values[m] = chl;
      oxy[m] = oxygenAt(chl, out.light[f], out.tempC[f]);
      if (chl > CHL_BLOOM) above++;
    }
    values.sort((a, b) => a - b);
    oxy.sort((a, b) => a - b);
    series.median[f] = quantile(values, 0.5);
    series.p10[f] = quantile(values, 0.1);
    series.p90[f] = quantile(values, 0.9);
    series.prob[f] = above / M;
    series.oxygen[f] = quantile(oxy, 0.5);
  }

  const nowChl = out.farmSeries[base + NOW_FRAME];
  const presentNow = nowChl > CHL_BLOOM;
  const outlookEnd = NOW_FRAME + OUTLOOK_HOURS;

  const firstHit: number[] = [];
  let hitWithin = 0;
  for (let m = 0; m < M; m++) {
    let first = Infinity;
    for (let f = NOW_FRAME; f <= frameOfHour(TIMELINE_END_H); f++) {
      if (out.farmSeries[base + m * F + f] > CHL_BLOOM) {
        first = f - NOW_FRAME;
        break;
      }
    }
    firstHit.push(first);
    if (first <= OUTLOOK_HOURS) hitWithin++;
  }
  firstHit.sort((a, b) => a - b);
  const medianHit = firstHit[Math.floor((M - 1) / 2)];
  const etaHours = presentNow ? 0 : Number.isFinite(medianHit) ? medianHit : null;
  const chance = presentNow ? 1 : hitWithin / M;

  let peakChl = 0;
  let minOxygen = Infinity;
  let minOxygenHour = 0;
  for (let f = NOW_FRAME; f <= outlookEnd; f++) {
    peakChl = Math.max(peakChl, series.median[f]);
    if (series.oxygen[f] < minOxygen) {
      minOxygen = series.oxygen[f];
      minOxygenHour = f - NOW_FRAME;
    }
  }

  let level: RiskLevel = 'low';
  if (chance >= 0.8 || minOxygen < DO_DANGER) level = 'severe';
  else if (chance >= 0.5 || minOxygen < DO_STRESS) level = 'high';
  else if (chance >= 0.2 || peakChl >= CHL_BLOOM * 0.6) level = 'watch';

  return { level, chance, etaHours, presentNow, nowChl, peakChl, minOxygen, minOxygenHour, series };
}

export const RISK_ORDER: Record<RiskLevel, number> = { severe: 0, high: 1, watch: 2, low: 3 };

import { algaeRef } from '../data/region';
import { ALGAE_COLORS, algaeStops } from '../scene/palette';

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const BASE = rgb('#dfe7ea');
const STOPS = ALGAE_COLORS.map(rgb);

/** The algae colour scale as drawn over water, for use on light UI surfaces. */
export function algaeCss(chl: number) {
  const [s0, s1, s2, s3] = algaeStops(algaeRef()).map(Math.log);
  const t = Math.log(Math.max(chl, 1e-3));
  let c = mix(BASE, STOPS[0], smooth(s0 - Math.log(1.5), s0, t));
  c = mix(c, STOPS[1], smooth(s0, s1, t));
  c = mix(c, STOPS[2], smooth(s1, s2, t));
  c = mix(c, STOPS[3], smooth(s2, s3, t));
  return `rgb(${c.join(' ')})`;
}

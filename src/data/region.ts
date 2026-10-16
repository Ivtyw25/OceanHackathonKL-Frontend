// A region is one place the app can show: map box, farms, climate and display settings,
// all read from public/regions/<id>/region.json. The backend and ML read the same files.

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

export interface WindSetting {
  /** Direction the wind blows from, degrees clockwise from north. */
  fromDeg: number;
  /** m/s */
  speed: number;
}

/** Inputs for the in-browser demo simulation, tuned per place. */
export interface SimulationParams {
  waterTempC: number;
  dailyTempSwingC: number;
  pastWindFromDeg: number;
  pastWindSpeed: number;
  forecastWind: WindSetting;
  growthRate: number;
  carryingCapacity: number;
  minChl: number;
  rivers: { name: string; lon: number; lat: number; load: number }[];
  /** Bloom already present at the start of the observed period. */
  seeds: { farmId: string; amp: number; sigmaM: number }[];
}

export interface RegionSummary {
  id: string;
  name: string;
  area: string;
}

export interface Region extends RegionSummary {
  water: 'sea' | 'lake';
  bounds: { west: number; east: number; south: number; north: number };
  timeZone: string;
  timeZoneLabel: string;
  /** Who farmers report a severe bloom to, as it reads mid-sentence. */
  fisheriesOffice: string;
  /** Chlorophyll-a (µg/L) treated as a bloom by the in-browser simulation, and by real data without `bloom`. */
  bloomChl: number;
  /** Real-data bloom rule: chlorophyll above `timesClimP97` × the cell's 97th percentile for the date, ignoring muddy water. */
  bloom?: {
    rule: 'relative';
    timesClimP97: number;
    maxSpm?: number;
    /** Multiplier for a farm's own cell, lower than the map's: farms want an earlier warning. */
    farmTimesClimP97?: number;
    /** Bloom water within this distance of a farm raises its risk, fading to nothing at the edge. */
    nearbyKm?: number;
  };
  /** Chlorophyll-a (µg/L) the map's colour scale is drawn around; defaults to bloomChl. */
  algaeRefChl?: number;
  view: { verticalExaggeration: number; baseY: number; portraitAzimuth: number; portraitDistance: number };
  simulation: SimulationParams;
  farms: FarmSpec[];
  samplePoints: SensorSpec[];
}

export interface RegionIndex {
  defaultRegion: string;
  regions: RegionSummary[];
}

let active: Region | null = null;
let index: RegionIndex | null = null;

/** The region on screen. Set once at startup; switching regions reloads the page. */
export function getRegion(): Region {
  if (!active) throw new Error('Region not loaded yet.');
  return active;
}

export function getRegionIndex(): RegionIndex {
  if (!index) throw new Error('Region list not loaded yet.');
  return index;
}

/** Reference level for algae colours: stops at 0.3, 1, 3 and 10 times it. */
export const algaeRef = () => getRegion().algaeRefChl ?? getRegion().bloomChl;

export const regionBase = (id: string) => `${import.meta.env.BASE_URL}regions/${id}`;

async function fetchJson<T>(url: string, what: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${what} is missing (${url}).`);
  return (await res.json()) as T;
}

/** Load the region named in `?region=`, or the default one. */
export async function loadActiveRegion(): Promise<Region> {
  index = await fetchJson<RegionIndex>(`${import.meta.env.BASE_URL}regions/index.json`, 'The region list');
  const asked = new URLSearchParams(window.location.search).get('region');
  const id = index.regions.some((r) => r.id === asked) ? asked! : index.defaultRegion;
  active = await fetchJson<Region>(`${regionBase(id)}/region.json`, `Region "${id}"`);
  return active;
}

export function switchRegion(id: string) {
  const url = new URL(window.location.href);
  url.searchParams.set('region', id);
  window.location.assign(url);
}

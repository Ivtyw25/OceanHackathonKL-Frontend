import { create } from 'zustand';
import { ENSEMBLE_MEMBERS, TIMELINE_END_H, TIMELINE_START_H } from '../config';
import { backendIssueDate, noonOf, runBackendForecast } from '../data/backend';
import { getRegion, regionBase, type Region } from '../data/region';
import { placeSites, type Farm, type Sensor } from '../data/sites';
import { loadTerrain, type Terrain } from '../data/terrain';
import { SimClient } from '../sim/client';
import { BloomModel, type SimInput, type SimOutput, type WindSetting } from '../sim/model';
import { farmOutlook, type FarmOutlook } from '../sim/risk';
import { buildSetup } from '../sim/scenario';
import type { SimSetup } from '../sim/model';

export type LayerKey = 'algaeColour' | 'algaeHeight' | 'currents' | 'fronts' | 'uncertainty' | 'buoys' | 'contours';

export interface World {
  region: Region;
  terrain: Terrain;
  farms: Farm[];
  sensors: Sensor[];
  setup: SimSetup;
  /** Main-thread copy of the model, used to draw currents for the hour on screen. */
  model: BloomModel;
}

/** `backend` reads real data from the API; `sim` runs the in-browser demo simulation (`?source=sim`). */
export type DataSource = 'backend' | 'sim';
export const DATA_SOURCE: DataSource = new URLSearchParams(location.search).get('source') === 'sim' ? 'sim' : 'backend';

export interface ForecastInfo {
  issueDate: string;
  modelVersion: string;
  synthetic: boolean;
  bloomRule: string;
}

export type CameraRequest = { kind: 'home' } | { kind: 'farm'; id: string };

interface AppState {
  world: World | null;
  loadError: string | null;
  sim: SimOutput | null;
  outlooks: FarmOutlook[];
  simRunning: boolean;
  simProgress: number;
  simError: string | null;
  /** Backend runs only: which model and day the forecast on screen came from. */
  forecastInfo: ForecastInfo | null;
  /** Backend runs only: the day the timeline is centred on. */
  issueDate: string | null;
  /** False while only observed days are loaded: the timeline stops at hour 0 and the farm list offers the forecast. */
  hasForecast: boolean;
  /** True while the observed days load at startup, before any forecast. */
  observedLoading: boolean;
  /** Wind used by the forecast currently on screen. */
  forecastWind: WindSetting;
  /** "Now", floored to the hour. */
  now: Date;
  nowLocalHour: number;
  hour: number;
  playing: boolean;
  speed: number;
  selectedFarmId: string | null;
  hoveredSensorId: string | null;
  layers: Record<LayerKey, boolean>;
  camera: CameraRequest;
  cameraNonce: number;

  init: () => Promise<void>;
  runForecast: (wind: WindSetting) => Promise<void>;
  setHour: (hour: number) => void;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: number) => void;
  selectFarm: (id: string | null) => void;
  setHoveredSensor: (id: string | null) => void;
  toggleLayer: (key: LayerKey) => void;
  resetView: () => void;
}

const startOfHour = () => {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  return d;
};

const localHourOf = (d: Date, timeZone: string) =>
  Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(d));

let client: SimClient | null = null;
let initPromise: Promise<void> | null = null;
let runToken = 0;

/** Last hour on the timeline: the forecast's end once there is one, otherwise the latest observation. */
export const timelineEnd = (s: Pick<AppState, 'hasForecast'>) => (s.hasForecast ? TIMELINE_END_H : 0);

export const useApp = create<AppState>((set, get) => ({
  world: null,
  loadError: null,
  sim: null,
  outlooks: [],
  simRunning: false,
  simProgress: 0,
  simError: null,
  forecastInfo: null,
  issueDate: null,
  hasForecast: false,
  observedLoading: DATA_SOURCE === 'backend',
  // Both are set from the region in init(); the region isn't known when the store is created.
  forecastWind: { fromDeg: 0, speed: 0 },
  now: startOfHour(),
  nowLocalHour: 0,
  hour: 0,
  playing: false,
  speed: 6,
  selectedFarmId: null,
  hoveredSensorId: null,
  layers: {
    algaeColour: true,
    algaeHeight: true,
    currents: true,
    fronts: true,
    uncertainty: false,
    buoys: true,
    contours: true,
  },
  camera: { kind: 'home' },
  cameraNonce: 0,

  init: () => {
    initPromise ??= (async () => {
      try {
        const region = getRegion();
        const terrain = await loadTerrain(regionBase(region.id));
        const { farms, sensors } = placeSites(terrain, region);
        const setup = buildSetup(terrain, farms, sensors, region);
        const model = new BloomModel(setup);
        client = new SimClient(setup);
        set({
          world: { region, terrain, farms, sensors, setup, model },
          forecastWind: region.simulation.forecastWind,
          nowLocalHour: localHourOf(get().now, region.timeZone),
        });
        // The forecast runs only when asked (FarmList's button), so the map shows straight away.
        if (DATA_SOURCE === 'backend') {
          // Remember the data's latest day for the forecast button; the timeline moves there only once a
          // forecast exists. If the backend is down, the button shows why.
          try {
            const issueDate = await backendIssueDate(region.id);
            set({ issueDate });
            // Observed days only, no prediction: the timeline and map show the recent past straight away.
            const { sim } = await runBackendForecast(get().world!, issueDate, () => {}, false);
            set({ sim, now: noonOf(issueDate, region.timeZone), nowLocalHour: 12, hour: 0, observedLoading: false });
          } catch (err) {
            set({ simError: err instanceof Error ? err.message : String(err), observedLoading: false });
          }
        }
      } catch (err) {
        set({ loadError: err instanceof Error ? err.message : String(err) });
      }
    })();
    return initPromise;
  },

  runForecast: async (wind) => {
    const { world, nowLocalHour } = get();
    if (!world || !client) return;
    const token = ++runToken;
    set({ simRunning: true, simProgress: 0, simError: null });
    if (DATA_SOURCE === 'backend') {
      try {
        const region = getRegion();
        const issueDate = get().issueDate ?? (await backendIssueDate(region.id));
        const run = await runBackendForecast(world, issueDate, (p) => token === runToken && set({ simProgress: p }));
        if (token !== runToken) return;
        const { sim, outlooks, ...info } = run;
        set({
          sim,
          outlooks,
          forecastInfo: info,
          issueDate,
          hasForecast: true,
          now: noonOf(issueDate, region.timeZone),
          nowLocalHour: 12,
          hour: 0,
          simRunning: false,
          simProgress: 1,
        });
      } catch (err) {
        if (token === runToken) set({ simRunning: false, simError: err instanceof Error ? err.message : String(err) });
      }
      return;
    }
    const input: SimInput = { nowLocalHour, forecastWind: wind, members: ENSEMBLE_MEMBERS };
    try {
      const sim = await client.run(input, (p) => {
        if (token === runToken) set({ simProgress: p });
      });
      if (token !== runToken) return;
      const outlooks = world.farms.map((_, i) => farmOutlook(sim, i));
      set({ sim, outlooks, forecastWind: wind, simRunning: false, simProgress: 1, hasForecast: true });
    } catch (err) {
      if (token !== runToken) return;
      set({ simRunning: false, simError: err instanceof Error ? err.message : String(err) });
    }
  },

  setHour: (hour) => set((s) => ({ hour: Math.min(timelineEnd(s), Math.max(TIMELINE_START_H, hour)) })),
  setPlaying: (playing) => {
    if (playing && get().hour >= timelineEnd(get())) set({ hour: TIMELINE_START_H });
    set({ playing });
  },
  setSpeed: (speed) => set({ speed }),
  selectFarm: (id) =>
    set((s) => ({
      selectedFarmId: id,
      camera: id ? { kind: 'farm', id } : s.camera,
      cameraNonce: id ? s.cameraNonce + 1 : s.cameraNonce,
    })),
  setHoveredSensor: (id) => set({ hoveredSensorId: id }),
  toggleLayer: (key) => set((s) => ({ layers: { ...s.layers, [key]: !s.layers[key] } })),
  resetView: () => set((s) => ({ camera: { kind: 'home' }, cameraNonce: s.cameraNonce + 1 })),
}));

if (import.meta.env.DEV) (window as unknown as { __app: typeof useApp }).__app = useApp;

export const simInputFor = (s: Pick<AppState, 'nowLocalHour' | 'forecastWind'>): SimInput => ({
  nowLocalHour: s.nowLocalHour,
  forecastWind: s.forecastWind,
  members: ENSEMBLE_MEMBERS,
});

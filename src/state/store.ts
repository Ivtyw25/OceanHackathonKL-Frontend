import { create } from 'zustand';
import { ENSEMBLE_MEMBERS, TIME_ZONE, TIMELINE_END_H, TIMELINE_START_H } from '../config';
import { placeSites, type Farm, type Sensor } from '../data/sites';
import { loadTerrain, type Terrain } from '../data/terrain';
import { SimClient } from '../sim/client';
import { BloomModel, type SimInput, type SimOutput, type WindSetting } from '../sim/model';
import { farmOutlook, type FarmOutlook } from '../sim/risk';
import { buildSetup, DEFAULT_FORECAST_WIND } from '../sim/scenario';
import type { SimSetup } from '../sim/model';

export type LayerKey = 'algaeColour' | 'algaeHeight' | 'currents' | 'fronts' | 'uncertainty' | 'buoys' | 'contours';

export interface World {
  terrain: Terrain;
  farms: Farm[];
  sensors: Sensor[];
  setup: SimSetup;
  /** Main-thread copy of the model, used to draw currents for the hour on screen. */
  model: BloomModel;
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

const localHourOf = (d: Date) =>
  Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: TIME_ZONE }).format(d));

let client: SimClient | null = null;
let initPromise: Promise<void> | null = null;
let runToken = 0;

export const useApp = create<AppState>((set, get) => ({
  world: null,
  loadError: null,
  sim: null,
  outlooks: [],
  simRunning: false,
  simProgress: 0,
  simError: null,
  forecastWind: DEFAULT_FORECAST_WIND,
  now: startOfHour(),
  nowLocalHour: localHourOf(startOfHour()),
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
        const terrain = await loadTerrain(`${import.meta.env.BASE_URL}data/toba`);
        const { farms, sensors } = placeSites(terrain);
        const setup = buildSetup(terrain, farms, sensors);
        const model = new BloomModel(setup);
        client = new SimClient(setup);
        set({ world: { terrain, farms, sensors, setup, model } });
        await get().runForecast(get().forecastWind);
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
    const input: SimInput = { nowLocalHour, forecastWind: wind, members: ENSEMBLE_MEMBERS };
    try {
      const sim = await client.run(input, (p) => {
        if (token === runToken) set({ simProgress: p });
      });
      if (token !== runToken) return;
      const outlooks = world.farms.map((_, i) => farmOutlook(sim, i));
      set({ sim, outlooks, forecastWind: wind, simRunning: false, simProgress: 1 });
    } catch (err) {
      if (token !== runToken) return;
      set({ simRunning: false, simError: err instanceof Error ? err.message : String(err) });
    }
  },

  setHour: (hour) => set({ hour: Math.min(TIMELINE_END_H, Math.max(TIMELINE_START_H, hour)) }),
  setPlaying: (playing) => {
    if (playing && get().hour >= TIMELINE_END_H) set({ hour: TIMELINE_START_H });
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

// Colours for the 3D relief model (sRGB hex). The UI tokens in index.css mirror these.

export const PALETTE = {
  mistTop: '#eef2f3',
  mistBottom: '#c9d4d8',
  waterDeep: '#1b4660',
  waterShallow: '#4a8995',
  sky: '#dbe5e9',
  foam: '#e4eeec',
  sun: '#fff6e5',
  front: '#ffffff',
  uncertain: '#f6f3d6',
  shore: '#8f9d6c',
  forest: '#5e7151',
  upland: '#a59e80',
  rock: '#8b7f71',
  floorShallow: '#a8a68e',
  floorDeep: '#2c4651',
  tuff: '#d6ccb6',
  ash: '#aa9f8a',
  soil: '#6c5b49',
} as const;

/** Chlorophyll-a (µg/L) at which each algae colour stop is reached. */
export const ALGAE_STOPS = [5, 25, 80, 220] as const;
export const ALGAE_COLORS = ['#2f6f5c', '#3f9d4b', '#7fbe3c', '#c4d647'] as const;

export const STATUS_COLORS = {
  low: '#0ca30c',
  watch: '#fab219',
  high: '#ec835a',
  severe: '#d03b3b',
} as const;

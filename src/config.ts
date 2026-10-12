// Scene, timeline and threshold settings shared by the simulation, the 3D scene and the UI.

/** Hours relative to "now" covered by the timeline: three days observed, five days forecast. */
export const TIMELINE_START_H = -72;
export const TIMELINE_END_H = 120;
export const FRAME_COUNT = TIMELINE_END_H - TIMELINE_START_H + 1;

/** Forecast window used for each farm's headline outlook. */
export const OUTLOOK_HOURS = 72;

/** Vertical exaggeration of the relief model (1 world unit = 1 km horizontally). */
export const VERTICAL_EXAGGERATION = 3.5;
/** Bottom of the diorama block, in world units. */
export const BASE_Y = -4.6;

/** Simulation grid resolution (cells per side) and ensemble size. */
export const SIM_SIZE = 256;
export const ENSEMBLE_MEMBERS = 8;

/**
 * Chlorophyll-a thresholds in µg/L. Demo values for the prototype; replace with the
 * thresholds your monitoring programme uses.
 */
export const CHL_BLOOM = 25;
export const CHL_DENSE = 80;
export const CHL_ENCODE_MAX = 400;

/** Dissolved oxygen (mg/L) below which caged tilapia are stressed / at risk of dying. */
export const DO_STRESS = 4;
export const DO_DANGER = 2.5;

export const TIME_ZONE = 'Asia/Jakarta';

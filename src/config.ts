// Timeline, grid and threshold settings shared by every region. Per-place settings live in public/regions/.

/** Hours relative to "now" covered by the timeline: three days observed, five days forecast. */
export const TIMELINE_START_H = -72;
export const TIMELINE_END_H = 120;
export const FRAME_COUNT = TIMELINE_END_H - TIMELINE_START_H + 1;

/** Forecast window used for each farm's headline outlook. */
export const OUTLOOK_HOURS = 72;

/** Simulation grid resolution (cells per side) and ensemble size. */
export const SIM_SIZE = 256;
export const ENSEMBLE_MEMBERS = 8;

/** Top of the chlorophyll-a (µg/L) range stored in the 8-bit field textures. */
export const CHL_ENCODE_MAX = 400;

/** Dissolved oxygen (mg/L) below which caged fish are stressed / at risk of dying. */
export const DO_STRESS = 4;
export const DO_DANGER = 2.5;


// Sea coasts: water is below-zero ground connected to the open sea; depth is the tiles' bathymetry.

import { components, fillNoiseIslands } from './common.mjs';

export function buildSea(elev, w, h, cfg) {
  // Sea = below-zero ground connected to the open sea at the grid edge, plus large enclosed lagoons.
  const seaCC = components((i) => elev[i] < 0, w, h);
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) {
    const id = seaCC.label[i];
    if (id >= 0 && (seaCC.touchesBorder[id] || seaCC.sizes[id] >= cfg.minLagoonPx)) mask[i] = 1;
  }

  const { filled, islands } = fillNoiseIslands(mask, w, h, cfg.minIslandPx);

  // Smooth the sea floor using sea pixels only, so the coastline stays sharp.
  const depth = new Float32Array(w * h);
  for (let k = 0; k < depth.length; k++) if (mask[k]) depth[k] = Math.min(-0.5, elev[k]);
  for (let pass = 0; pass < cfg.depthSmoothPasses; pass++) {
    const src = depth.slice();
    for (let j = 1; j < h - 1; j++) {
      for (let i = 1; i < w - 1; i++) {
        const k = j * w + i;
        if (!mask[k]) continue;
        let s = 0;
        let c = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const kk = k + dy * w + dx;
            if (mask[kk]) {
              s += src[kk];
              c++;
            }
          }
        }
        depth[k] = Math.min(-0.5, s / c);
      }
    }
  }

  const heightsM = new Float32Array(w * h);
  for (let k = 0; k < heightsM.length; k++) {
    // Inland ground the tiles put below sea level would render as pits; lift it to the shore.
    heightsM[k] = mask[k] ? depth[k] : Math.max(0.5, elev[k]);
  }
  console.log(`${islands.length} islands kept, ${filled} noise px filled`);
  return {
    heightsM,
    mask,
    surfaceLevelM: 0,
    floorNote: 'Sea floor smoothed from ~1.8 km ETOPO1 cells.',
  };
}

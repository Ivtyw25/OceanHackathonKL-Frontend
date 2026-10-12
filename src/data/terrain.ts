// Loads the Lake Toba relief produced by scripts/build-terrain.mjs and maps between
// geographic, pixel and world coordinates. World: x = east, z = south, y = up, 1 unit = 1 km.

export interface TerrainMeta {
  width: number;
  height: number;
  bounds: { west: number; east: number; south: number; north: number };
  lakeLevelM: number;
  maxDepthM: number;
  metersPerPixel: { x: number; y: number };
  lakeAreaKm2: number;
  landRangeM: [number, number];
  heightsOffset: number;
  heightsScale: number;
  maskOffset: number;
  attribution: string;
}

export interface Terrain {
  meta: TerrainMeta;
  width: number;
  height: number;
  /** Metres relative to the lake surface (negative = lake floor). Row 0 is the north edge. */
  heightsM: Float32Array;
  /** 1 where the pixel is lake. */
  mask: Uint8Array;
  /** World size of the whole grid in km. */
  worldWidth: number;
  worldDepth: number;
  /** Pixel bounding box of the lake (inclusive). */
  lakeBox: { x0: number; y0: number; x1: number; y1: number };
}

export function parseTerrain(meta: TerrainMeta, buffer: ArrayBuffer): Terrain {
  const n = meta.width * meta.height;
  const raw = new Int16Array(buffer, meta.heightsOffset, n);
  const heightsM = new Float32Array(n);
  for (let i = 0; i < n; i++) heightsM[i] = raw[i] * meta.heightsScale;
  const mask = new Uint8Array(buffer, meta.maskOffset, n);

  let x0 = meta.width;
  let y0 = meta.height;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < meta.height; y++) {
    for (let x = 0; x < meta.width; x++) {
      if (!mask[y * meta.width + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }

  return {
    meta,
    width: meta.width,
    height: meta.height,
    heightsM,
    mask,
    worldWidth: (meta.width * meta.metersPerPixel.x) / 1000,
    worldDepth: (meta.height * meta.metersPerPixel.y) / 1000,
    lakeBox: { x0, y0, x1, y1 },
  };
}

export async function loadTerrain(base = '/data/toba'): Promise<Terrain> {
  const [metaRes, binRes] = await Promise.all([fetch(`${base}/meta.json`), fetch(`${base}/terrain.bin`)]);
  if (!metaRes.ok || !binRes.ok) {
    throw new Error('The Lake Toba relief data is missing. Run "npm run terrain" to build it.');
  }
  const meta = (await metaRes.json()) as TerrainMeta;
  return parseTerrain(meta, await binRes.arrayBuffer());
}

/** Continuous pixel coordinates (pixel i spans [i, i+1)). */
export function lonLatToPx(t: Terrain, lon: number, lat: number): [number, number] {
  const { west, east, south, north } = t.meta.bounds;
  return [((lon - west) / (east - west)) * t.width, ((north - lat) / (north - south)) * t.height];
}

export function pxToWorld(t: Terrain, x: number, y: number): [number, number] {
  return [(x / t.width - 0.5) * t.worldWidth, (y / t.height - 0.5) * t.worldDepth];
}

export function worldToPx(t: Terrain, wx: number, wz: number): [number, number] {
  return [(wx / t.worldWidth + 0.5) * t.width, (wz / t.worldDepth + 0.5) * t.height];
}

/** Bilinear height in metres at continuous pixel coordinates. */
export function heightAtPx(t: Terrain, x: number, y: number): number {
  const fx = Math.min(Math.max(x - 0.5, 0), t.width - 1.001);
  const fy = Math.min(Math.max(y - 0.5, 0), t.height - 1.001);
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const ax = fx - ix;
  const ay = fy - iy;
  const k = iy * t.width + ix;
  const h = t.heightsM;
  return (
    (h[k] * (1 - ax) + h[k + 1] * ax) * (1 - ay) + (h[k + t.width] * (1 - ax) + h[k + t.width + 1] * ax) * ay
  );
}

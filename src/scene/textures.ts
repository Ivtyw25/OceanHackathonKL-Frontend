import * as THREE from 'three';
import type { Terrain } from '../data/terrain';

/** RG half-float texture: R = height in km relative to sea level, G = sea mask. */
export function makeTerrainTexture(t: Terrain): THREE.DataTexture {
  const n = t.width * t.height;
  const data = new Uint16Array(n * 2);
  const toHalf = THREE.DataUtils.toHalfFloat;
  const one = toHalf(1);
  const zero = toHalf(0);
  for (let i = 0; i < n; i++) {
    data[i * 2] = toHalf(t.heightsM[i] / 1000);
    data[i * 2 + 1] = t.mask[i] ? one : zero;
  }
  const tex = new THREE.DataTexture(data, t.width, t.height, THREE.RGFormat, THREE.HalfFloatType);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

/** One byte per cell per hour; linear filtering interpolates in space and between hours. */
export function makeFieldTexture(data: Uint8Array, n: number, frames: number): THREE.Data3DTexture {
  const tex = new THREE.Data3DTexture(data, n, n, frames);
  tex.format = THREE.RedFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.wrapR = THREE.ClampToEdgeWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

/** Soft misty backdrop drawn behind the diorama. */
export function makeBackdrop(top: string, bottom: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const lin = ctx.createLinearGradient(0, 0, 0, 512);
  lin.addColorStop(0, top);
  lin.addColorStop(1, bottom);
  ctx.fillStyle = lin;
  ctx.fillRect(0, 0, 512, 512);
  const glow = ctx.createRadialGradient(256, 230, 20, 256, 230, 330);
  glow.addColorStop(0, 'rgba(255,255,255,0.55)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

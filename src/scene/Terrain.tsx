// The relief model: real caldera terrain on a block whose cut sides show pale Toba tuff.

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { BASE_Y, VERTICAL_EXAGGERATION as EXAG } from '../config';
import { heightAtPx, pxToWorld, type Terrain as TerrainData } from '../data/terrain';
import { useApp } from '../state/store';
import { PALETTE } from './palette';

const SEGMENTS = 511;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function noise2(x: number, z: number) {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function smoothNoise(x: number, z: number) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fz = z - zi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = noise2(xi, zi);
  const b = noise2(xi + 1, zi);
  const c = noise2(xi, zi + 1);
  const d = noise2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function buildSurface(t: TerrainData) {
  const n = SEGMENTS + 1;
  const pos = new Float32Array(n * n * 3);
  const elev = new Float32Array(n * n);
  const lake = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const px = (i / SEGMENTS) * t.width;
      const py = (j / SEGMENTS) * t.height;
      const h = heightAtPx(t, px, py);
      const [wx, wz] = pxToWorld(t, px, py);
      elev[k] = h;
      const mx = Math.min(t.width - 1, Math.floor(px));
      const my = Math.min(t.height - 1, Math.floor(py));
      lake[k] = t.mask[my * t.width + mx];
      pos[k * 3] = wx;
      pos[k * 3 + 1] = (h / 1000) * EXAG;
      pos[k * 3 + 2] = wz;
    }
  }
  const index = new Uint32Array(SEGMENTS * SEGMENTS * 6);
  let p = 0;
  for (let j = 0; j < SEGMENTS; j++) {
    for (let i = 0; i < SEGMENTS; i++) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      index.set([a, c, b, b, c, d], p);
      p += 6;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeVertexNormals();

  const normals = geo.getAttribute('normal') as THREE.BufferAttribute;
  const colors = new Float32Array(n * n * 3);
  const C = (hex: string) => new THREE.Color(hex);
  const shore = C(PALETTE.shore);
  const forest = C(PALETTE.forest);
  const upland = C(PALETTE.upland);
  const rock = C(PALETTE.rock);
  const floorShallow = C(PALETTE.floorShallow);
  const floorDeep = C(PALETTE.floorDeep);
  const col = new THREE.Color();
  for (let k = 0; k < n * n; k++) {
    const h = elev[k];
    // Lake floor by the lake mask, not by sign: some land outside the caldera lies below the lake.
    if (lake[k]) {
      col.copy(floorShallow).lerp(floorDeep, smooth(0, 160, -h));
    } else {
      const slope = 1 - normals.getY(k);
      col.copy(shore).lerp(forest, smooth(25, 190, Math.abs(h)));
      col.lerp(upland, smooth(480, 950, h));
      col.lerp(rock, smooth(0.3, 0.65, slope));
    }
    const v = 0.93 + 0.14 * smoothNoise(pos[k * 3] * 0.55, pos[k * 3 + 2] * 0.55);
    colors[k * 3] = col.r * v;
    colors[k * 3 + 1] = col.g * v;
    colors[k * 3 + 2] = col.b * v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aLake', new THREE.BufferAttribute(lake, 1));
  geo.computeBoundingSphere();
  return { geo, pos, n };
}

/** Four strips from the terrain edge down to the base of the block. */
function buildSkirt(pos: Float32Array, n: number) {
  const positions: number[] = [];
  const normals: number[] = [];
  const tops: number[] = [];
  const index: number[] = [];
  const edges = [
    { at: (s: number) => s, normal: [0, 0, -1], flip: true },
    { at: (s: number) => (n - 1) * n + s, normal: [0, 0, 1], flip: false },
    { at: (s: number) => s * n, normal: [-1, 0, 0], flip: false },
    { at: (s: number) => s * n + n - 1, normal: [1, 0, 0], flip: true },
  ];
  for (const e of edges) {
    const start = positions.length / 3;
    for (let s = 0; s < n; s++) {
      const k = e.at(s);
      const x = pos[k * 3];
      const y = pos[k * 3 + 1];
      const z = pos[k * 3 + 2];
      positions.push(x, y, z, x, BASE_Y, z);
      normals.push(...e.normal, ...e.normal);
      tops.push(y, y);
    }
    for (let s = 0; s < n - 1; s++) {
      const a = start + s * 2;
      const c = a + 1;
      const b = a + 2;
      const d = a + 3;
      if (e.flip) index.push(a, b, c, b, d, c);
      else index.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('aTop', new THREE.Float32BufferAttribute(tops, 1));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  return geo;
}

function makeSurfaceMaterial(contours: { value: number }) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uContours = contours;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aLake;\nvarying float vElevM;\nvarying float vLake;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\nvElevM = position.y / ${EXAG.toFixed(4)} * 1000.0;\nvLake = aLake;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vElevM;\nvarying float vLake;\nuniform float uContours;')
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        {
          // Contour lines: every 100 m on land, every 50 m on the lake floor, bolder every 500 m.
          float interval = vLake > 0.5 ? 50.0 : 100.0;
          float f = vElevM / interval;
          float minor = 1.0 - smoothstep(0.0, fwidth(f) * 1.1, abs(fract(f + 0.5) - 0.5));
          float g = vElevM / 500.0;
          float major = 1.0 - smoothstep(0.0, fwidth(g) * 1.7, abs(fract(g + 0.5) - 0.5));
          diffuseColor.rgb *= 1.0 - max(minor * 0.2, major * 0.3) * uContours;
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'relief-surface';
  return mat;
}

function makeSkirtMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0 });
  const tuff = new THREE.Color(PALETTE.tuff);
  const ash = new THREE.Color(PALETTE.ash);
  const soil = new THREE.Color(PALETTE.soil);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTuff = { value: tuff };
    shader.uniforms.uAsh = { value: ash };
    shader.uniforms.uSoil = { value: soil };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aTop;\nvarying float vTop;\nvarying vec3 vPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTop = aTop;\nvPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying float vTop;\nvarying vec3 vPos;\nuniform vec3 uTuff;\nuniform vec3 uAsh;\nuniform vec3 uSoil;',
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        {
          float along = vPos.x + vPos.z;
          float wobble = 0.12 * sin(along * 0.31) + 0.07 * sin(along * 0.83 + 1.3);
          float band = fract((vPos.y + wobble) * 1.15);
          vec3 strata = mix(uTuff, uAsh, smoothstep(0.55, 0.6, band) * (1.0 - smoothstep(0.85, 0.9, band)));
          float soilMix = 1.0 - smoothstep(0.08, 0.2, vTop - vPos.y);
          diffuseColor.rgb = mix(strata, uSoil, soilMix);
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'relief-skirt';
  return mat;
}

function makeContactShadow() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(128, 128, 60, 128, 128, 128);
  g.addColorStop(0, 'rgba(20,30,36,0.55)');
  g.addColorStop(1, 'rgba(20,30,36,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function Terrain({ terrain }: { terrain: TerrainData }) {
  const contours = useApp((s) => s.layers.contours);
  const contourUniform = useMemo(() => ({ value: 1 }), []);
  const { surface, skirt } = useMemo(() => {
    const s = buildSurface(terrain);
    return { surface: s.geo, skirt: buildSkirt(s.pos, s.n) };
  }, [terrain]);
  const surfaceMat = useMemo(() => makeSurfaceMaterial(contourUniform), [contourUniform]);
  const skirtMat = useMemo(() => makeSkirtMaterial(), []);
  const shadowTex = useMemo(() => makeContactShadow(), []);

  useEffect(() => {
    contourUniform.value = contours ? 1 : 0;
  }, [contours, contourUniform]);

  useEffect(
    () => () => {
      surface.dispose();
      skirt.dispose();
      surfaceMat.dispose();
      skirtMat.dispose();
      shadowTex.dispose();
    },
    [surface, skirt, surfaceMat, skirtMat, shadowTex],
  );

  const size = Math.max(terrain.worldWidth, terrain.worldDepth);
  return (
    <group>
      <mesh geometry={surface} material={surfaceMat} castShadow receiveShadow />
      <mesh geometry={skirt} material={skirtMat} castShadow receiveShadow />
      <mesh rotation-x={-Math.PI / 2} position-y={BASE_Y - 0.01} receiveShadow>
        <planeGeometry args={[size * 5, size * 5]} />
        <shadowMaterial opacity={0.16} transparent />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={BASE_Y - 0.005} renderOrder={-1}>
        <planeGeometry args={[size * 1.5, size * 1.5]} />
        <meshBasicMaterial map={shadowTex} transparent depthWrite={false} />
      </mesh>
    </group>
  );
}

// Surface currents as drifting streaks, moving faster while the timeline plays. With backend data they
// follow the real daily currents, blended between days; otherwise the simulation's own current field.

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { TIMELINE_START_H } from '../config';
import { simInputFor, useApp } from '../state/store';
import { useScene } from './resources';

const COUNT = 4500;
const IDLE_HOURS_PER_SECOND = 2;

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function Currents() {
  const { world, simRect } = useScene();
  const visible = useApp((s) => s.layers.currents);
  const grid = world.setup.grid;
  const n = grid.n;

  const state = useMemo(() => {
    const rand = mulberry(42);
    const px = new Float32Array(COUNT);
    const pz = new Float32Array(COUNT);
    const age = new Float32Array(COUNT);
    const life = new Float32Array(COUNT);
    const spawn = (i: number) => {
      const c = grid.waterIdx[Math.floor(rand() * grid.waterIdx.length)];
      const ci = c % n;
      px[i] = ci + rand();
      pz[i] = (c - ci) / n + rand();
      age[i] = 0;
      life[i] = 2.5 + rand() * 3.5;
    };
    for (let i = 0; i < COUNT; i++) {
      spawn(i);
      age[i] = rand() * life[i];
    }
    return { px, pz, age, life, spawn };
  }, [grid, n]);

  const fields = useRef<{ hour: number; u: Float32Array; v: Float32Array } | null>(null);
  const windKey = useApp((s) => `${s.forecastWind.fromDeg}:${s.forecastWind.speed}`);
  const sim = useApp((s) => s.sim);
  useEffect(() => {
    fields.current = null;
  }, [windKey, sim]);

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new THREE.BufferAttribute(new Float32Array(COUNT * 6), 3);
    const col = new THREE.BufferAttribute(new Float32Array(COUNT * 8), 4);
    pos.setUsage(THREE.DynamicDrawUsage);
    col.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', pos);
    g.setAttribute('color', col);
    return g;
  }, []);
  const material = useMemo(
    () => new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }),
    [],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame((frame, delta) => {
    if (!visible) return;
    const app = useApp.getState();
    const hourKey = Math.round(app.hour);
    if (!fields.current || fields.current.hour !== hourKey) {
      const u = fields.current?.u ?? new Float32Array(n * n);
      const v = fields.current?.v ?? new Float32Array(n * n);
      const real = app.sim?.currents;
      if (real) {
        // Day k sits at local noon, 24 h apart from the timeline start.
        const pos = Math.min(Math.max((hourKey - TIMELINE_START_H) / 24, 0), real.u.length - 1);
        const k = Math.min(Math.floor(pos), real.u.length - 2);
        const a = pos - k;
        for (let c = 0; c < u.length; c++) {
          u[c] = real.u[k][c] * (1 - a) + real.u[k + 1][c] * a;
          v[c] = real.v[k][c] * (1 - a) + real.v[k + 1][c] * a;
        }
      } else {
        world.model.currentsAt(simInputFor(app), hourKey, u, v);
      }
      fields.current = { hour: hourKey, u, v };
    }
    const { u, v } = fields.current;
    const dt = Math.min(delta, 0.05);
    const hoursPerSecond = app.playing ? Math.max(app.speed, IDLE_HOURS_PER_SECOND) : IDLE_HOURS_PER_SECOND;
    const cellsPerMps = (dt * hoursPerSecond * 3600) / grid.cellM;
    const streakPerMps = (0.6 * hoursPerSecond * 3600) / grid.cellM;
    const { px, pz, age, life, spawn } = state;
    const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
    const col = geometry.getAttribute('color') as THREE.BufferAttribute;
    const P = pos.array as Float32Array;
    const C = col.array as Float32Array;
    // Streaks fade as the camera pulls back, so the whole-coast view doesn't turn to static.
    const distance = (frame.controls as unknown as { distance?: number } | null)?.distance ?? 100;
    const zoomFade = Math.min(1, Math.max(0.2, 1.25 - distance / 115));
    const sx = simRect.w / n;
    const sz = simRect.d / n;
    const y = 0.03;

    for (let i = 0; i < COUNT; i++) {
      age[i] += dt;
      let c = (pz[i] | 0) * n + (px[i] | 0);
      if (age[i] > life[i] || !grid.water[c]) {
        spawn(i);
        c = (pz[i] | 0) * n + (px[i] | 0);
      }
      const uu = u[c];
      const vv = v[c];
      px[i] += uu * cellsPerMps;
      pz[i] += vv * cellsPerMps;
      const speed = Math.hypot(uu, vv);
      const len = Math.min(3, speed * streakPerMps);
      const inv = speed > 1e-6 ? 1 / speed : 0;
      const hx = simRect.x + px[i] * sx;
      const hz = simRect.z + pz[i] * sz;
      const o = i * 6;
      P[o] = hx;
      P[o + 1] = y;
      P[o + 2] = hz;
      P[o + 3] = hx - uu * inv * len * sx;
      P[o + 4] = y;
      P[o + 5] = hz - vv * inv * len * sz;
      const t = age[i] / life[i];
      const fade = Math.min(1, t * 5) * Math.min(1, (1 - t) * 4);
      const a = fade * Math.min(1, 0.2 + speed * 6) * 0.75 * zoomFade;
      const k = i * 8;
      C[k] = 0.92;
      C[k + 1] = 0.97;
      C[k + 2] = 1;
      C[k + 3] = a;
      C[k + 4] = 0.92;
      C[k + 5] = 0.97;
      C[k + 6] = 1;
      C[k + 7] = 0;
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  });

  return (
    <lineSegments
      visible={visible}
      geometry={geometry}
      material={material}
      renderOrder={3}
      frustumCulled={false}
    />
  );
}

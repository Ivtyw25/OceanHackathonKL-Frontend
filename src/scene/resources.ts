// Textures and uniforms shared by several scene layers.

import { createContext, useContext, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { FRAME_COUNT } from '../config';
import { useApp, type World } from '../state/store';
import { makeFieldTexture, makeTerrainTexture } from './textures';

export interface SceneResources {
  world: World;
  terrainTex: THREE.DataTexture;
  conc: THREE.Data3DTexture | null;
  prob: THREE.Data3DTexture | null;
  /** Shared uniform objects, updated once per frame by <TimeDriver>. */
  time: {
    uTime: { value: number };
    uTimeZ: { value: number };
    uFrontZ: { value: THREE.Vector3 };
    uIsForecast: { value: number };
  };
  /** World-space rectangle covered by the simulation grid: x0, z0, width, depth. */
  simRect: { x: number; z: number; w: number; d: number };
}

export const SceneContext = createContext<SceneResources | null>(null);

export function useScene(): SceneResources {
  const ctx = useContext(SceneContext);
  if (!ctx) throw new Error('useScene must be used inside <SceneContext>');
  return ctx;
}

export function useSceneResources(world: World): SceneResources {
  const sim = useApp((s) => s.sim);
  const terrainTex = useMemo(() => makeTerrainTexture(world.terrain), [world]);
  const n = world.setup.grid.n;
  const fields = useMemo(
    () =>
      sim
        ? { conc: makeFieldTexture(sim.conc, n, FRAME_COUNT), prob: makeFieldTexture(sim.prob, n, FRAME_COUNT) }
        : { conc: null, prob: null },
    [sim, n],
  );
  useEffect(
    () => () => {
      fields.conc?.dispose();
      fields.prob?.dispose();
    },
    [fields],
  );
  useEffect(() => () => terrainTex.dispose(), [terrainTex]);

  const time = useMemo(
    () => ({
      uTime: { value: 0 },
      uTimeZ: { value: 0 },
      uFrontZ: { value: new THREE.Vector3(-1, -1, -1) },
      uIsForecast: { value: 0 },
    }),
    [],
  );

  const simRect = useMemo(() => {
    const [u0, v0, su, sv] = world.setup.grid.uvRect;
    const { worldWidth: W, worldDepth: D } = world.terrain;
    return { x: (u0 - 0.5) * W, z: (v0 - 0.5) * D, w: su * W, d: sv * D };
  }, [world]);

  return { world, terrainTex, conc: fields.conc, prob: fields.prob, time, simRect };
}

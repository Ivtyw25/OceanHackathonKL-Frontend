import { CameraControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { pxToWorld } from '../data/terrain';
import { useApp } from '../state/store';
import { useScene } from './resources';
import { prefersReducedMotion } from './usePrefersReducedMotion';

/** Width of the side panels in CSS px on wide screens; the view is nudged so the coast stays centred. */
export const LEFT_PANEL_PX = 296;
export const RIGHT_PANEL_PX = 400;
const WIDE = 1024;

export function CameraRig() {
  const ref = useRef<CameraControls>(null);
  const { world } = useScene();
  const request = useApp((s) => s.camera);
  const nonce = useApp((s) => s.cameraNonce);
  const panelOpen = useApp((s) => s.selectedFarmId !== null);
  const size = useThree((s) => s.size);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;

  const portrait = size.width / size.height < 0.9;
  const home = useMemo(() => {
    // Frame the farms, not the map: open sea fills most of the box.
    const xs = world.farms.map((f) => f.px[0]);
    const ys = world.farms.map((f) => f.px[1]);
    const [cx, cz] = pxToWorld(world.terrain, (Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2);
    if (portrait) {
      // On tall screens, look along the region's long axis (azimuth set per region).
      const { portraitDistance: d, portraitAzimuth: az } = world.region.view;
      const polar = 0.82;
      return {
        target: [cx, -0.6, cz] as const,
        position: [cx + d * Math.sin(polar) * Math.sin(az), d * Math.cos(polar), cz + d * Math.sin(polar) * Math.cos(az)] as const,
      };
    }
    return { target: [cx + 1, -0.6, cz + 4] as const, position: [cx - 14, 92, cz + 102] as const };
  }, [world, portrait]);

  const bounds = useMemo(() => {
    const hw = world.terrain.worldWidth / 2;
    const hd = world.terrain.worldDepth / 2;
    return new THREE.Box3(new THREE.Vector3(-hw, -3, -hd), new THREE.Vector3(hw, 3, hd));
  }, [world]);

  // Opening move: settle from high above onto the coast.
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.setBoundary(bounds);
    const [tx, ty, tz] = home.target;
    const [px, py, pz] = home.position;
    if (prefersReducedMotion()) {
      void c.setLookAt(px, py, pz, tx, ty, tz, false);
      return;
    }
    void c.setLookAt(px - 30, py + 70, pz + 50, tx, ty, tz, false);
    c.smoothTime = 1.2;
    void c.setLookAt(px, py, pz, tx, ty, tz, true).then(() => {
      if (ref.current) ref.current.smoothTime = 0.35;
    });
  }, [home, bounds]);

  // Requested moves: back to the whole coast, or in to a farm.
  useEffect(() => {
    const c = ref.current;
    if (!c || nonce === 0) return;
    const animate = !prefersReducedMotion();
    c.smoothTime = 0.55;
    if (request.kind === 'home') {
      const [tx, ty, tz] = home.target;
      const [px, py, pz] = home.position;
      void c.setLookAt(px, py, pz, tx, ty, tz, animate);
      return;
    }
    const farm = world.farms.find((f) => f.id === request.id);
    if (!farm) return;
    const [fx, fz] = farm.world;
    const r = 12;
    const polar = 0.95;
    const az = c.azimuthAngle;
    void c.setLookAt(
      fx + r * Math.sin(polar) * Math.sin(az),
      r * Math.cos(polar),
      fz + r * Math.sin(polar) * Math.cos(az),
      fx,
      0,
      fz,
      animate,
    );
  }, [nonce, request, home, world]);

  // Keep the subject centred in the space left between the side panels.
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const wide = size.width >= WIDE;
    const offsetPx = wide ? ((panelOpen ? RIGHT_PANEL_PX : 0) - LEFT_PANEL_PX) / 2 : 0;
    const distance = request.kind === 'farm' ? 12 : Math.hypot(...home.position.map((v, i) => v - home.target[i]));
    const worldPerPx = (2 * distance * Math.tan((camera.fov * Math.PI) / 360)) / size.height;
    void c.setFocalOffset(offsetPx * worldPerPx, 0, 0, !prefersReducedMotion());
  }, [panelOpen, size, nonce, request, home, camera]);

  return (
    <CameraControls
      ref={ref}
      makeDefault
      minDistance={3}
      maxDistance={170}
      minPolarAngle={0.12}
      maxPolarAngle={1.3}
      dollyToCursor
      smoothTime={0.35}
    />
  );
}

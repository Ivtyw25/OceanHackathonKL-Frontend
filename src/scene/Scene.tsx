import { useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { useEffect, useMemo } from 'react';
import { FRAME_COUNT, TIMELINE_END_H, TIMELINE_START_H } from '../config';
import { useApp, type World } from '../state/store';
import { AlgaeLayer } from './AlgaeLayer';
import { Buoys } from './Buoys';
import { CameraRig } from './CameraRig';
import { Currents } from './Currents';
import { Farms } from './Farms';
import { PALETTE } from './palette';
import { SceneContext, useScene, useSceneResources } from './resources';
import { Terrain } from './Terrain';
import { makeBackdrop } from './textures';
import { prefersReducedMotion } from './usePrefersReducedMotion';
import { Water } from './Water';

/** Advances the timeline while playing and feeds the shared time uniforms. */
function TimeDriver() {
  const { time } = useScene();
  const reduced = useMemo(prefersReducedMotion, []);
  useFrame((state, delta) => {
    const app = useApp.getState();
    let hour = app.hour;
    if (app.playing) {
      hour = Math.min(TIMELINE_END_H, hour + Math.min(delta, 0.1) * app.speed);
      app.setHour(hour);
      if (hour >= TIMELINE_END_H) app.setPlaying(false);
    }
    const z = (h: number) => (h - TIMELINE_START_H + 0.5) / FRAME_COUNT;
    const front = (lead: number) => (hour + lead <= TIMELINE_END_H ? z(hour + lead) : -1);
    if (!reduced) time.uTime.value = state.clock.elapsedTime;
    time.uTimeZ.value = z(hour);
    time.uFrontZ.value.set(front(24), front(48), front(72));
    time.uIsForecast.value = hour > 0.5 ? 1 : 0;
  });
  return null;
}

function Backdrop() {
  const scene = useThree((s) => s.scene);
  const texture = useMemo(() => makeBackdrop(PALETTE.mistTop, PALETTE.mistBottom), []);
  useEffect(() => {
    scene.background = texture;
    return () => {
      scene.background = null;
      texture.dispose();
    };
  }, [scene, texture]);
  return null;
}

export function Scene({ world, effects }: { world: World; effects: boolean }) {
  const resources = useSceneResources(world);
  const shadowExtent = Math.max(world.terrain.worldWidth, world.terrain.worldDepth) * 0.72;
  return (
    <SceneContext.Provider value={resources}>
      <Backdrop />
      <TimeDriver />
      <CameraRig />
      <hemisphereLight args={['#e3ecf1', '#6d6352', 1.5]} />
      <directionalLight
        position={[-55, 80, -45]}
        intensity={2.6}
        color="#fff4e2"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-shadowExtent}
        shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent}
        shadow-camera-bottom={-shadowExtent}
        shadow-camera-near={10}
        shadow-camera-far={260}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
      <Terrain terrain={world.terrain} />
      <Water />
      <AlgaeLayer />
      <Currents />
      <Farms />
      <Buoys />
      {effects && (
        <EffectComposer multisampling={4}>
          <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.2} intensity={0.85} />
        </EffectComposer>
      )}
    </SceneContext.Provider>
  );
}

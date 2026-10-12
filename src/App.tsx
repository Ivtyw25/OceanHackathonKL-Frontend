import { PerformanceMonitor } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import { labelLayer } from './scene/labelLayer';
import { Scene } from './scene/Scene';
import { useApp } from './state/store';
import { FarmList } from './ui/FarmList';
import { FarmPanel } from './ui/FarmPanel';
import { Header } from './ui/Header';
import { LoadingOverlay } from './ui/LoadingOverlay';
import { MapKey } from './ui/MapKey';
import { Timeline } from './ui/Timeline';
import { useKeyboardShortcuts } from './ui/useKeyboardShortcuts';

export function App() {
  const world = useApp((s) => s.world);
  const init = useApp((s) => s.init);
  const [dpr, setDpr] = useState(() => Math.min(window.devicePixelRatio, 1.75));
  const [effects, setEffects] = useState(true);

  useEffect(() => {
    void init();
  }, [init]);
  useKeyboardShortcuts();

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-mist text-ink">
      <div className="absolute inset-0">
        <Canvas
          flat
          shadows="percentage"
          dpr={dpr}
          gl={{ antialias: false, powerPreference: 'high-performance' }}
          camera={{ fov: 32, near: 0.1, far: 700, position: [-40, 130, 140] }}
        >
          <PerformanceMonitor
            onDecline={() => {
              setDpr(1);
              setEffects(false);
            }}
          />
          {world && <Scene world={world} effects={effects} />}
        </Canvas>
      </div>
      <div ref={labelLayer} className="pointer-events-none absolute inset-0 z-10 overflow-hidden" />
      <Header />
      <MapKey />
      <FarmList />
      <FarmPanel />
      <Timeline />
      <LoadingOverlay />
    </div>
  );
}

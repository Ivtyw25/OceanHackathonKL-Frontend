// Monitoring buoys. Hover or focus one to read its sensors at the hour on the timeline.

import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { FRAME_COUNT } from '../config';
import type { Sensor } from '../data/sites';
import { frameOfHour, oxygenAt } from '../sim/risk';
import { useApp } from '../state/store';
import { labelLayer } from './labelLayer';
import { useScene } from './resources';

const bodyMat = new THREE.MeshStandardMaterial({ color: '#e9b23c', roughness: 0.5 });
const mastMat = new THREE.MeshStandardMaterial({ color: '#2b3a40', roughness: 0.6 });
const lampColor = new THREE.Color('#fff2c4').multiplyScalar(3);

function Buoy({ sensor, index, shown }: { sensor: Sensor; index: number; shown: boolean }) {
  const group = useRef<THREE.Group>(null);
  const lamp = useRef<THREE.MeshBasicMaterial>(null);
  const hovered = useApp((s) => s.hoveredSensorId === sensor.id);
  const setHovered = useApp((s) => s.setHoveredSensor);
  const sim = useApp((s) => s.sim);
  const hourIndex = useApp((s) => Math.min(FRAME_COUNT - 1, Math.max(0, frameOfHour(s.hour))));

  useFrame(({ clock }) => {
    const t = clock.elapsedTime + index * 1.7;
    if (group.current) {
      group.current.position.y = Math.sin(t * 1.4) * 0.008;
      group.current.rotation.z = Math.sin(t * 1.1) * 0.06;
    }
    if (lamp.current) lamp.current.opacity = (t * 0.5) % 1 < 0.12 ? 1 : 0.15;
  });

  const chl = sim ? sim.sensorSeries[index * FRAME_COUNT + hourIndex] : null;
  const temp = sim ? sim.tempC[hourIndex] : null;
  const oxygen = sim && chl !== null && temp !== null ? oxygenAt(chl, sim.light[hourIndex], temp) : null;

  return (
    <group position={[sensor.world[0], 0, sensor.world[1]]}>
      <group ref={group} visible={shown}>
        <mesh position-y={0.03} material={bodyMat} castShadow>
          <cylinderGeometry args={[0.045, 0.055, 0.06, 16]} />
        </mesh>
        <mesh position-y={0.12} material={mastMat}>
          <cylinderGeometry args={[0.008, 0.008, 0.13, 6]} />
        </mesh>
        <mesh position-y={0.19}>
          <sphereGeometry args={[0.018, 12, 8]} />
          <meshBasicMaterial ref={lamp} color={lampColor} toneMapped={false} transparent />
        </mesh>
      </group>
      {shown && (
      <mesh
        position-y={0.1}
        visible={false}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(sensor.id);
        }}
        onPointerOut={() => setHovered(null)}
      >
        <sphereGeometry args={[0.35, 8, 6]} />
      </mesh>
      )}
      <Html
        position={[0, 0.32, 0]}
        center
        portal={labelLayer as React.RefObject<HTMLElement>}
        zIndexRange={[40, 30]}
        style={{ pointerEvents: 'none', visibility: hovered && shown ? 'visible' : 'hidden' }}
      >
        <div className="buoy-card" role="tooltip">
          <p className="buoy-card-title">{sensor.name}</p>
          {chl !== null && (
            <dl>
              <div>
                <dt>Chlorophyll-a</dt>
                <dd>{chl.toFixed(1)} µg/L</dd>
              </div>
              <div>
                <dt>Oxygen</dt>
                <dd>{oxygen?.toFixed(1)} mg/L</dd>
              </div>
              <div>
                <dt>Water</dt>
                <dd>{temp?.toFixed(1)} °C</dd>
              </div>
            </dl>
          )}
        </div>
      </Html>
    </group>
  );
}

export function Buoys() {
  const { world } = useScene();
  const shown = useApp((s) => s.layers.buoys);
  // Buoys stay mounted when hidden so their <Html> roots are never torn down.
  return (
    <group>
      {world.sensors.map((s, i) => (
        <Buoy key={s.id} sensor={s} index={i} shown={shown} />
      ))}
    </group>
  );
}

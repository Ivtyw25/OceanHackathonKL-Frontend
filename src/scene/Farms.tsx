// Floating-cage farms: a cluster of square net cages aligned with the shore, a status halo
// on the water, and a label that opens the farm's forecast.

import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Farm } from '../data/sites';
import { pxToCell } from '../sim/grid';
import type { FarmOutlook } from '../sim/risk';
import { useApp } from '../state/store';
import { outlookShort } from '../ui/format';
import { StatusIcon } from '../ui/StatusIcon';
import { labelLayer } from './labelLayer';
import { STATUS_COLORS } from './palette';
import { useScene } from './resources';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

const CAGE = 0.1;
const GAP = 0.135;

const frameGeo = new THREE.RingGeometry(CAGE * 0.5, CAGE * 0.62, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2);
const netGeo = new THREE.PlaneGeometry(CAGE * 0.78, CAGE * 0.78).rotateX(-Math.PI / 2);
const frameMat = new THREE.MeshStandardMaterial({ color: '#e7e2d6', roughness: 0.6 });
const netMat = new THREE.MeshStandardMaterial({ color: '#203239', roughness: 0.9, transparent: true, opacity: 0.85 });
const hutWallMat = new THREE.MeshStandardMaterial({ color: '#efe9dc', roughness: 0.8 });
const hutRoofMat = new THREE.MeshStandardMaterial({ color: '#7b4a39', roughness: 0.7 });
const pinMat = new THREE.MeshBasicMaterial({ color: '#1e2a30', transparent: true, opacity: 0.55 });

function CageCluster({ count, angle }: { count: number; angle: number }) {
  const cols = Math.ceil(Math.sqrt(count * 2.2));
  const rows = Math.ceil(count / cols);
  const frames = useRef<THREE.InstancedMesh>(null);
  const nets = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const m = new THREE.Matrix4();
    for (let k = 0; k < count; k++) {
      const c = k % cols;
      const r = Math.floor(k / cols);
      m.makeTranslation((c - (cols - 1) / 2) * GAP, 0.012, (r - (rows - 1) / 2) * GAP);
      frames.current?.setMatrixAt(k, m);
      m.makeTranslation((c - (cols - 1) / 2) * GAP, 0.006, (r - (rows - 1) / 2) * GAP);
      nets.current?.setMatrixAt(k, m);
    }
    if (frames.current) frames.current.instanceMatrix.needsUpdate = true;
    if (nets.current) nets.current.instanceMatrix.needsUpdate = true;
  }, [count, cols, rows]);

  const hutX = ((cols - 1) / 2 + 1) * GAP;
  return (
    <group rotation-y={angle}>
      <instancedMesh ref={frames} args={[frameGeo, frameMat, count]} castShadow />
      <instancedMesh ref={nets} args={[netGeo, netMat, count]} />
      <group position={[hutX, 0, 0]}>
        <mesh position-y={0.03} material={hutWallMat} castShadow>
          <boxGeometry args={[0.1, 0.05, 0.08]} />
        </mesh>
        <mesh position-y={0.075} rotation-y={Math.PI / 4} material={hutRoofMat} castShadow>
          <coneGeometry args={[0.085, 0.045, 4]} />
        </mesh>
      </group>
    </group>
  );
}

function Halo({ level, radius, emphasised }: { level: FarmOutlook['level']; radius: number; emphasised: boolean }) {
  const ring = useRef<THREE.Mesh>(null);
  const reduced = usePrefersReducedMotion();
  const pulse = level === 'high' || level === 'severe';
  const material = useMemo(() => {
    const color = new THREE.Color(STATUS_COLORS[level]);
    if (pulse) color.multiplyScalar(2.2);
    // Drawn over the raised algae layer so a farm's status stays visible inside a bloom.
    return new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, depthTest: false, toneMapped: false });
  }, [level, pulse]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame(({ clock }) => {
    if (!ring.current) return;
    const base = emphasised ? 0.95 : 0.7;
    if (!pulse || reduced) {
      ring.current.scale.setScalar(1);
      material.opacity = base;
      return;
    }
    const t = (clock.elapsedTime * 0.6) % 1;
    ring.current.scale.setScalar(1 + t * 0.6);
    material.opacity = base * (1 - t);
  });

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={0.02} material={material} renderOrder={5}>
        <ringGeometry args={[radius, radius + (emphasised ? 0.07 : 0.045), 64]} />
      </mesh>
      {pulse && (
        <mesh ref={ring} rotation-x={-Math.PI / 2} position-y={0.021} material={material} renderOrder={5}>
          <ringGeometry args={[radius, radius + 0.03, 64]} />
        </mesh>
      )}
    </group>
  );
}

function FarmMarker({ farm, outlook, angle }: { farm: Farm; outlook: FarmOutlook | undefined; angle: number }) {
  const selected = useApp((s) => s.selectedFarmId === farm.id);
  const selectFarm = useApp((s) => s.selectFarm);
  const count = Math.min(15, Math.max(4, Math.round(farm.cages / 30)));
  const radius = 0.32 + Math.sqrt(count) * 0.09;
  const level = outlook?.level ?? 'low';
  const labelHeight = 0.95;

  return (
    <group position={[farm.world[0], 0, farm.world[1]]}>
      <CageCluster count={count} angle={angle} />
      {outlook && <Halo level={level} radius={radius} emphasised={selected} />}
      <mesh position-y={labelHeight / 2} material={pinMat}>
        <cylinderGeometry args={[0.006, 0.006, labelHeight, 6]} />
      </mesh>
      <mesh
        rotation-x={-Math.PI / 2}
        position-y={0.03}
        visible={false}
        onClick={(e) => {
          e.stopPropagation();
          selectFarm(farm.id);
        }}
      >
        <circleGeometry args={[radius + 0.2, 24]} />
      </mesh>
      <Html
        position={[0, labelHeight, 0]}
        center
        portal={labelLayer as React.RefObject<HTMLElement>}
        zIndexRange={[20, 0]}
        style={{ pointerEvents: 'none' }}
      >
        <button
          type="button"
          onClick={() => selectFarm(farm.id)}
          className={`farm-label pointer-events-auto ${selected ? 'is-selected' : ''}`}
          aria-pressed={selected}
          aria-label={`${farm.name}${outlook ? `, ${outlookShort(outlook)}` : ''}`}
        >
          {outlook && <StatusIcon level={level} size={14} />}
          <span>{farm.name}</span>
        </button>
      </Html>
    </group>
  );
}

export function Farms() {
  const { world } = useScene();
  const outlooks = useApp((s) => s.outlooks);
  const grid = world.setup.grid;

  const angles = useMemo(
    () =>
      world.farms.map((f) => {
        const [cx, cz] = pxToCell(grid, f.px);
        const c = Math.floor(cz) * grid.n + Math.floor(cx);
        const nx = grid.normalX[c];
        const nz = grid.normalZ[c];
        // Rows of cages run along the shore (perpendicular to the offshore normal).
        return nx === 0 && nz === 0 ? 0 : Math.PI / 2 - Math.atan2(nz, nx);
      }),
    [world, grid],
  );

  return (
    <group>
      {world.farms.map((farm, i) => (
        <FarmMarker key={farm.id} farm={farm} outlook={outlooks[i]} angle={angles[i]} />
      ))}
    </group>
  );
}

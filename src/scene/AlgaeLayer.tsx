// A translucent sheet raised above the water: the denser the algae, the taller it stands.

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useApp } from '../state/store';
import { useScene } from './resources';
import { algaeUniforms, COMMON_GLSL } from './shaders';

/** Height in world units at very dense scum. */
export const ALGAE_LAYER_MAX_H = 0.75;

const vertex = /* glsl */ `
${COMMON_GLSL}
uniform sampler2D uTerrain;
uniform highp sampler3D uConc;
uniform vec2 uWorldSize;
uniform vec4 uSimRect;
uniform float uTimeZ;
uniform float uMaxH;
uniform float uCell;
varying float vChl;
varying vec3 vWorld;
varying vec3 vNormal2;

float heightAt(vec2 suv) {
  float chl = decodeChl(texture(uConc, vec3(suv, uTimeZ)).r);
  return uMaxH * pow(smoothstep(0.5 * uBloom, 10.0 * uBloom, chl), 0.75);
}

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec2 tuv = vec2(wp.x / uWorldSize.x + 0.5, wp.z / uWorldSize.y + 0.5);
  vec2 suv = (tuv - uSimRect.xy) / uSimRect.zw;
  float wet = smoothstep(0.2, 0.8, texture(uTerrain, tuv).g);
  vChl = decodeChl(texture(uConc, vec3(suv, uTimeZ)).r) * step(0.5, wet);
  float h = heightAt(suv) * wet;
  float hx = heightAt(suv + vec2(uCell, 0.0)) - heightAt(suv - vec2(uCell, 0.0));
  float hz = heightAt(suv + vec2(0.0, uCell)) - heightAt(suv - vec2(0.0, uCell));
  float span = 2.0 * uCell * uSimRect.z * uWorldSize.x;
  vNormal2 = normalize(vec3(-hx / span, 1.0, -hz / span));
  wp.y += 0.015 + h;
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const fragment = /* glsl */ `
${COMMON_GLSL}
uniform vec3 uSunDir;
varying float vChl;
varying vec3 vWorld;
varying vec3 vNormal2;

void main() {
  if (vChl < 12.0) discard;
  vec3 N = normalize(vNormal2);
  vec3 V = normalize(cameraPosition - vWorld);
  float diffuse = 0.55 + 0.6 * max(dot(N, uSunDir), 0.0);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.0);
  vec3 col = algaeRamp(vChl) * diffuse + rim * 0.25;
  float a = smoothstep(0.5 * uBloom, 1.8 * uBloom, vChl) * (0.42 + 0.25 * smoothstep(1.8 * uBloom, 8.0 * uBloom, vChl)) + rim * 0.12;
  gl_FragColor = vec4(col, clamp(a, 0.0, 0.85));
  #include <colorspace_fragment>
}
`;

export function AlgaeLayer() {
  const { world, terrainTex, conc, time, simRect } = useScene();
  const visible = useApp((s) => s.layers.algaeHeight);
  const n = world.setup.grid.n;

  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(simRect.w, simRect.d, n - 1, n - 1);
    g.rotateX(-Math.PI / 2);
    return g;
  }, [simRect, n]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          ...algaeUniforms(),
          ...time,
          uTerrain: { value: terrainTex },
          uConc: { value: null },
          uWorldSize: { value: new THREE.Vector2(world.terrain.worldWidth, world.terrain.worldDepth) },
          uSimRect: { value: new THREE.Vector4(...world.setup.grid.uvRect) },
          uMaxH: { value: ALGAE_LAYER_MAX_H },
          uCell: { value: 1 / n },
          uSunDir: { value: new THREE.Vector3(-0.45, 0.8, -0.4).normalize() },
        },
      }),
    [world, terrainTex, time, n],
  );

  useEffect(() => {
    material.uniforms.uConc.value = conc;
  }, [material, conc]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  if (!conc) return null;
  return (
    <mesh
      visible={visible}
      geometry={geometry}
      material={material}
      position={[simRect.x + simRect.w / 2, 0, simRect.z + simRect.d / 2]}
      renderOrder={2}
      frustumCulled={false}
    />
  );
}

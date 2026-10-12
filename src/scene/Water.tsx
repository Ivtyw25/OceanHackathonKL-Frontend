// The lake surface: depth-tinted water, algae colour from the simulation, and the
// forecast bloom edges drawn as contour lines of the ensemble probability.

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useApp } from '../state/store';
import { PALETTE } from './palette';
import { useScene } from './resources';
import { algaeUniforms, COMMON_GLSL } from './shaders';

const vertex = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const fragment = /* glsl */ `
${COMMON_GLSL}
uniform sampler2D uTerrain;
uniform highp sampler3D uConc;
uniform highp sampler3D uProb;
uniform float uHasSim;
uniform vec2 uWorldSize;
uniform vec4 uSimRect;
uniform float uTime;
uniform float uTimeZ;
uniform vec3 uFrontZ;
uniform float uIsForecast;
uniform float uShowAlgae;
uniform float uShowFronts;
uniform float uShowUncertainty;
uniform vec3 uSunDir;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uSky;
uniform vec3 uFoam;
uniform vec3 uSun;
uniform vec3 uFront;
uniform vec3 uUncertain;
varying vec3 vWorld;

vec3 waveNormal(vec2 p, float t, float amp) {
  vec2 g = vec2(0.0);
  g += vec2(0.8, 0.6) * cos(dot(p, vec2(0.8, 0.6)) * 9.0 + t * 1.1) * 0.016;
  g += vec2(-0.5, 0.85) * cos(dot(p, vec2(-0.5, 0.85)) * 14.0 + t * 1.6) * 0.012;
  g += vec2(0.95, -0.3) * cos(dot(p, vec2(0.95, -0.3)) * 23.0 + t * 2.2) * 0.008;
  g += vec2(-0.7, -0.7) * cos(dot(p, vec2(-0.7, -0.7)) * 37.0 + t * 3.0) * 0.005;
  g *= amp;
  return normalize(vec3(-g.x, 1.0, -g.y));
}

float isoline(float v, float level, float widthPx) {
  float w = max(fwidth(v), 1e-4);
  return 1.0 - smoothstep(w * widthPx * 0.5, w * widthPx, abs(v - level));
}

uniform float uCell;

float frontAt(vec2 suv, float z, float widthPx) {
  if (z < 0.0) return 0.0;
  // A small blur softens the stair-steps of the 8-run probability grid.
  float d = uCell * 0.75;
  float p = texture(uProb, vec3(suv, z)).r * 0.4
    + texture(uProb, vec3(suv + vec2(d, 0.0), z)).r * 0.15
    + texture(uProb, vec3(suv - vec2(d, 0.0), z)).r * 0.15
    + texture(uProb, vec3(suv + vec2(0.0, d), z)).r * 0.15
    + texture(uProb, vec3(suv - vec2(0.0, d), z)).r * 0.15;
  // 0.5625 sits between 4 and 5 of 8 runs: the edge of "more than half".
  return isoline(p, 0.5625, widthPx);
}

void main() {
  vec2 tuv = vec2(vWorld.x / uWorldSize.x + 0.5, vWorld.z / uWorldSize.y + 0.5);
  vec2 hm = texture(uTerrain, tuv).rg;
  float wet = smoothstep(0.3, 0.7, hm.g);
  if (wet < 0.01) discard;
  float depthKm = max(0.0, -hm.r);
  vec2 suv = (tuv - uSimRect.xy) / uSimRect.zw;

  // Ripples fade with distance; far away they only alias into glitter.
  float camDist = length(cameraPosition - vWorld);
  vec3 N = waveNormal(vWorld.xz, uTime, clamp(1.5 - camDist / 60.0, 0.08, 1.0));
  vec3 V = normalize(cameraPosition - vWorld);
  float fresnel = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);

  float shallow = 1.0 - smoothstep(0.0, 0.08, depthKm);
  vec3 col = mix(uDeep, uShallow, shallow);
  col *= 0.8 + 0.3 * max(dot(N, uSunDir), 0.0);

  float vis = 0.0;
  if (uHasSim > 0.5) {
    float chl = decodeChl(texture(uConc, vec3(suv, uTimeZ)).r);
    float n1 = fbm(vWorld.xz * 0.5 + vec2(uTime * 0.010, -uTime * 0.007));
    float n2 = fbm(vWorld.xz * 1.7 + n1 * 2.2);
    float amount = smoothstep(3.0, 26.0, chl);
    vis = clamp(amount * (0.8 + 0.55 * (n2 - 0.5)), 0.0, 1.0) * uShowAlgae;
    col = mix(col, algaeRamp(chl), vis);
  }

  col = mix(col, uSky, fresnel * 0.6 * (1.0 - vis * 0.7));
  vec3 H = normalize(uSunDir + V);
  col += uSun * pow(max(dot(N, H), 0.0), 320.0) * 0.8 * (1.0 - vis);

  float rim = 1.0 - smoothstep(0.0, 0.01, depthKm);
  col = mix(col, uFoam, rim * 0.4);

  if (uHasSim > 0.5) {
    if (uShowUncertainty > 0.5 && uIsForecast > 0.5) {
      float p = texture(uProb, vec3(suv, uTimeZ)).r;
      float band = smoothstep(0.05, 0.2, p) * (1.0 - smoothstep(0.8, 0.95, p));
      col = mix(col, uUncertain, band * 0.45);
    }
    if (uShowFronts > 0.5) {
      col = mix(col, uFront, frontAt(suv, uFrontZ.x, 1.7) * 0.92);
      col = mix(col, uFront, frontAt(suv, uFrontZ.y, 1.4) * 0.68);
      col = mix(col, uFront, frontAt(suv, uFrontZ.z, 1.2) * 0.45);
    }
  }

  float alpha = mix(0.6, 0.94, smoothstep(0.0, 0.09, depthKm));
  alpha = max(alpha, vis * 0.97);
  gl_FragColor = vec4(col, alpha * wet);
  #include <colorspace_fragment>
}
`;

export function Water() {
  const { world, terrainTex, conc, prob, time, simRect } = useScene();
  const layers = useApp((s) => s.layers);

  const material = useMemo(() => {
    const C = (hex: string) => new THREE.Color(hex);
    return new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
      uniforms: {
        ...algaeUniforms(),
        ...time,
        uTerrain: { value: terrainTex },
        uConc: { value: null },
        uProb: { value: null },
        uHasSim: { value: 0 },
        uWorldSize: { value: new THREE.Vector2(world.terrain.worldWidth, world.terrain.worldDepth) },
        uSimRect: { value: new THREE.Vector4(...world.setup.grid.uvRect) },
        uCell: { value: 1 / world.setup.grid.n },
        uShowAlgae: { value: 1 },
        uShowFronts: { value: 1 },
        uShowUncertainty: { value: 0 },
        uSunDir: { value: new THREE.Vector3(-0.45, 0.8, -0.4).normalize() },
        uDeep: { value: C(PALETTE.waterDeep) },
        uShallow: { value: C(PALETTE.waterShallow) },
        uSky: { value: C(PALETTE.sky) },
        uFoam: { value: C(PALETTE.foam) },
        uSun: { value: C(PALETTE.sun) },
        uFront: { value: C(PALETTE.front) },
        uUncertain: { value: C(PALETTE.uncertain) },
      },
    });
  }, [world, terrainTex, time]);

  useEffect(() => {
    material.uniforms.uConc.value = conc;
    material.uniforms.uProb.value = prob;
    material.uniforms.uHasSim.value = conc && prob ? 1 : 0;
  }, [material, conc, prob]);

  useEffect(() => {
    material.uniforms.uShowAlgae.value = layers.algaeColour ? 1 : 0;
    material.uniforms.uShowFronts.value = layers.fronts ? 1 : 0;
    material.uniforms.uShowUncertainty.value = layers.uncertainty ? 1 : 0;
  }, [material, layers]);

  useEffect(() => () => material.dispose(), [material]);

  return (
    <mesh
      position={[simRect.x + simRect.w / 2, 0, simRect.z + simRect.d / 2]}
      rotation-x={-Math.PI / 2}
      material={material}
      renderOrder={1}
    >
      <planeGeometry args={[simRect.w, simRect.d]} />
    </mesh>
  );
}

// GLSL shared by the water surface and the raised algae layer.

import * as THREE from 'three';
import { CHL_ENCODE_MAX } from '../config';
import { ALGAE_COLORS, ALGAE_STOPS } from './palette';

export const algaeUniforms = () => ({
  uAlgae0: { value: new THREE.Color(ALGAE_COLORS[0]) },
  uAlgae1: { value: new THREE.Color(ALGAE_COLORS[1]) },
  uAlgae2: { value: new THREE.Color(ALGAE_COLORS[2]) },
  uAlgae3: { value: new THREE.Color(ALGAE_COLORS[3]) },
});

const f = (n: number) => n.toFixed(4);

export const COMMON_GLSL = /* glsl */ `
uniform vec3 uAlgae0;
uniform vec3 uAlgae1;
uniform vec3 uAlgae2;
uniform vec3 uAlgae3;

const float CHL_MAX = ${f(CHL_ENCODE_MAX)};

float decodeChl(float enc) { return enc * enc * CHL_MAX; }

vec3 algaeRamp(float chl) {
  float t = log(max(chl, 1.0));
  vec3 c = mix(uAlgae0, uAlgae1, smoothstep(${f(Math.log(ALGAE_STOPS[0]))}, ${f(Math.log(ALGAE_STOPS[1]))}, t));
  c = mix(c, uAlgae2, smoothstep(${f(Math.log(ALGAE_STOPS[1]))}, ${f(Math.log(ALGAE_STOPS[2]))}, t));
  c = mix(c, uAlgae3, smoothstep(${f(Math.log(ALGAE_STOPS[2]))}, ${f(Math.log(ALGAE_STOPS[3]))}, t));
  return c;
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return s;
}
`;

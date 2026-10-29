// Lake: sky-coloured by fresnel, 3 analytic sine ripples, sun/moon glitter columns,
// rain-roughened surface. No real reflections — the fresnel trick sells it.

import * as THREE from 'three';
import { WORLD } from '../config.js';
import { ensureSeed } from './materials.js';

const WATER_VERT = /* glsl */`
varying vec3 vW, vC;
varying vec3 vN;
uniform float uTime, uRipple;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float t = uTime;
  vec2 d1 = normalize(vec2(0.8, 0.6));
  vec2 d2 = normalize(vec2(-0.6, 0.8));
  vec2 d3 = normalize(vec2(0.2, -1.0));
  float p1 = dot(wp.xz, d1) * 0.35 + t * 1.1;
  float p2 = dot(wp.xz, d2) * 0.9 + t * 1.7;
  float p3 = dot(wp.xz, d3) * 1.7 + t * 2.3;
  wp.y += (sin(p1) * 0.09 + sin(p2) * 0.05 + sin(p3) * 0.028) * uRipple;
  float dx = (cos(p1) * 0.35 * d1.x * 0.09 + cos(p2) * 0.9 * d2.x * 0.05 + cos(p3) * 1.7 * d3.x * 0.028) * uRipple;
  float dz = (cos(p1) * 0.35 * d1.y * 0.09 + cos(p2) * 0.9 * d2.y * 0.05 + cos(p3) * 1.7 * d3.y * 0.028) * uRipple;
  vN = normalize(vec3(-dx * 6.0, 1.0, -dz * 6.0));
  vW = wp.xyz;
  vC = color;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const WATER_FRAG = /* glsl */`
varying vec3 vW, vC;
varying vec3 vN;
uniform vec3 uSkyZenith, uSkyHorizon, uFogColor, uWaterTint, uSunDir, uMoonDir, uSunColor, uMoonColor;
uniform float uFogDensity, uFogBase, uRain, uNight, uSunI, uMoonI, uTime;
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float hash12(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 glitter(vec3 L, vec3 V, vec3 N, float strength) {
  if (L.y < 0.03) return vec3(0.0);
  vec3 R = reflect(-V, N);
  float spec = pow(max(dot(R, normalize(L)), 0.0), 90.0);
  vec2 toL = normalize(L.xz);
  vec2 rel = vW.xz - cameraPosition.xz;
  float along = dot(rel, toL);
  float perp = length(rel - toL * along);
  float colMask = exp(-pow(perp / (5.0 + max(along, 0.0) * 0.09), 2.0)) * step(0.0, along) * exp(-abs(along) * 0.010);
  float n = hash12(floor(vec2(perp * 1.6, along * 0.30 - uTime * 1.1)));
  float streaks = smoothstep(0.52, 0.95, n);
  return vec3((spec * 2.2 + streaks * 0.5) * colMask * strength);
}
void main() {
  vec3 V = normalize(cameraPosition - vW);
  vec3 N = normalize(vN);
  N.xz += (vec2(hash12(floor(vW.xz * 2.0) + uTime * 9.0), hash12(floor(vW.zx * 2.0) - uTime * 8.0)) - 0.5) * (0.10 + uRain * 0.35);
  N = normalize(N);
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.0);
  vec3 deep = uWaterTint * (0.62 + 0.55 * vC.r);
  vec3 skyRef = mix(uSkyHorizon, uSkyZenith, 0.30 + 0.55 * fres);
  vec3 col = mix(deep, skyRef, 0.40 + 0.55 * fres);
  col += uSunColor * glitter(uSunDir, V, N, uSunI * 0.8);
  col += uMoonColor * glitter(uMoonDir, V, N, uMoonI * 1.2);
  float pool = exp(-max(vW.y - uFogBase, 0.0) * 0.05);
  float fog = 1.0 - exp(-length(cameraPosition - vW) * uFogDensity * (0.45 + pool));
  col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));
  col += (hash21(gl_FragCoord.xy) - 0.5) * (2.0 / 255.0);
  gl_FragColor = vec4(col, 1.0);
}`;

export function createWater(ctx) {
  const { scene, shared } = ctx;
  const geo = new THREE.PlaneGeometry(300, 145, 88, 48);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, WORLD.waterY, (WORLD.lake.z0 + WORLD.lake.z1) / 2);

  // bake depth darkening toward the lake centre into vertex colors
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const dx = (x - (WORLD.lake.x0 + WORLD.lake.x1) / 2) / (WORLD.lake.x1 - WORLD.lake.x0);
    const dz = (z - (WORLD.lake.z0 + WORLD.lake.z1) / 2) / (WORLD.lake.z0 - WORLD.lake.z1);
    const depth = Math.min(1, Math.hypot(dx, dz) * 1.5);
    const v = 0.45 + 0.55 * depth;
    colors[i * 3] = v; colors[i * 3 + 1] = v; colors[i * 3 + 2] = v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  ensureSeed(geo, 0.5);

  const uniforms = Object.assign({}, shared, {
    uRipple: { value: 1 },
  });
  const mat = new THREE.ShaderMaterial({
    vertexShader: WATER_VERT, fragmentShader: WATER_FRAG,
    uniforms, vertexColors: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  scene.add(mesh);

  return {
    group: mesh,
    update() { /* all shader-driven */ },
    applyTier() { /* static */ },
    dispose() { scene.remove(mesh); geo.dispose(); mat.dispose(); },
  };
}

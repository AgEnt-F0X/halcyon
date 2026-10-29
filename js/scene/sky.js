// Sky dome (gradient, sun disc+glow, real moon phase, Milky Way, lightning flash),
// sun glow sprite, god-ray shafts, aurora ribbon. Dome follows the camera.

import * as THREE from 'three';
import { WORLD } from '../config.js';
import { makeSpriteTexture } from './materials.js';

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAG = /* glsl */`
varying vec3 vDir;
uniform vec3 uSkyZenith, uSkyHorizon, uFogColor, uSunColor, uSunDir, uMoonDir, uMoonColor;
uniform float uTime, uNight, uSunVis, uMoonVis, uFlash, uFogDensity;
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i), n100 = hash13(i + vec3(1, 0, 0));
  float n010 = hash13(i + vec3(0, 1, 0)), n110 = hash13(i + vec3(1, 1, 0));
  float n001 = hash13(i + vec3(0, 0, 1)), n101 = hash13(i + vec3(1, 0, 1));
  float n011 = hash13(i + vec3(0, 1, 1)), n111 = hash13(i + vec3(1, 1, 1));
  return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
             mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}
void main() {
  vec3 dir = normalize(vDir);
  float h = dir.y;
  vec3 col = mix(uSkyHorizon, uSkyZenith, smoothstep(0.02, 0.45, h));
  col = mix(uFogColor, col, smoothstep(-0.05, 0.10, h));
  // faint Milky Way band on clear nights
  vec3 mwN = normalize(vec3(0.42, 0.60, 0.38));
  float band = exp(-pow(dot(dir, mwN) / 0.17, 2.0));
  float mw = band * (0.55 + 0.45 * noise3(dir * 5.0)) * (0.35 + 0.65 * noise3(dir * 13.0 + 7.0));
  col += vec3(0.60, 0.66, 0.85) * mw * uNight * 0.15;
  // sun: soft disc + layered glow
  float sd = dot(dir, uSunDir);
  float disc = smoothstep(0.99928, 0.99965, sd);
  float glow = pow(max(sd, 0.0), 22.0) * 0.30 + pow(max(sd, 0.0), 150.0) * 0.7;
  col += uSunColor * ((disc * 1.3 + glow) * uSunVis);
  // moon with the real phase
  float md = dot(dir, uMoonDir);
  if (md > 0.85) {
    vec3 mR = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
    vec3 mU = cross(mR, uMoonDir);
    vec3 dp = dir - uMoonDir * md;
    vec2 p = vec2(dot(dp, mR), dot(dp, mU)) / 0.030;
    float r2 = dot(p, p);
    float discM = 1.0 - smoothstep(0.82, 0.99, sqrt(r2));
    float c = dot(uSunDir, uMoonDir);
    vec3 sm = uSunDir - uMoonDir * c;
    float sl = length(sm);
    vec2 sHat = sl > 1e-4 ? vec2(dot(sm, mR), dot(sm, mU)) / sl : vec2(0.0);
    float lit = smoothstep(-0.10, 0.10, dot(p, sHat) * sl + c * sqrt(max(1.0 - r2, 0.0)));
    float crater = 0.9 + 0.1 * noise3(vec3(p * 3.2, 4.2));
    col += vec3(0.93, 0.92, 0.86) * (discM * uMoonVis * (0.05 + lit * crater));
    col += uMoonColor * (pow(max(md, 0.0), 320.0) * 0.22 * uMoonVis);
  }
  // lightning sky flash
  col += vec3(0.62, 0.68, 0.82) * uFlash;
  // dither every gradient so banding is impossible
  col += (hash21(gl_FragCoord.xy + fract(uTime) * 61.7) - 0.5) * (2.0 / 255.0);
  gl_FragColor = vec4(col, 1.0);
}`;

const AURORA_VERT = /* glsl */`
varying vec2 vUv;
uniform float uTime;
void main() {
  vUv = uv;
  vec3 p = position;
  p.z += sin(p.x * 0.004) * 90.0;
  p.x += sin(uTime * 0.05 + p.y * 0.01) * 18.0;
  p.y += sin(uTime * 0.09 + p.x * 0.006) * 9.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const AURORA_FRAG = /* glsl */`
varying vec2 vUv;
uniform float uTime, uAurora;
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  float n = noise2(vec2(vUv.x * 9.0 + uTime * 0.03, vUv.y * 2.0));
  float bands = 0.55 + 0.45 * sin(vUv.x * 34.0 + uTime * 0.22 + n * 7.0);
  float env = pow(1.0 - vUv.y, 1.7) * smoothstep(0.0, 0.10, vUv.y);
  vec3 col = mix(vec3(0.15, 0.85, 0.5), vec3(0.45, 0.3, 0.85), vUv.y);
  gl_FragColor = vec4(col, uAurora * env * bands * 0.35);
}`;

export function createSky(ctx) {
  const { scene, shared } = ctx;
  const group = new THREE.Group();

  // dome
  const domeMat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms: shared,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(WORLD.skyRadius, 40, 20), domeMat);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  group.add(dome);

  // sun glow sprite
  const glowTex = makeSpriteTexture('glow');
  const glowMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0xffdca8, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true,
  });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.setScalar(210);
  glow.renderOrder = 5;
  group.add(glow);

  // god-ray shafts: 5 tapered quads fanning from the sun, kept camera-facing
  const shaftTex = makeSpriteTexture('shaft');
  const shaftMat = new THREE.MeshBasicMaterial({
    map: shaftTex, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const shafts = new THREE.Group();
  for (const ang of [-26, -13, 0, 13, 26]) {
    const g = new THREE.PlaneGeometry(30, 330);
    g.translate(0, -165, 0);
    const m = new THREE.Mesh(g, shaftMat);
    m.rotation.z = (ang * Math.PI) / 180;
    m.frustumCulled = false;
    shafts.add(m);
  }
  shafts.renderOrder = 6;
  group.add(shafts);

  // aurora ribbon (only visible on clear winter nights at |lat| > 55)
  const auroraMat = new THREE.ShaderMaterial({
    vertexShader: AURORA_VERT, fragmentShader: AURORA_FRAG,
    uniforms: shared, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const aurora = new THREE.Mesh(new THREE.PlaneGeometry(1100, 190, 56, 8), auroraMat);
  aurora.position.set(0, 175, -640);
  aurora.rotation.x = -0.18;
  aurora.renderOrder = 4;
  aurora.frustumCulled = false;
  group.add(aurora);

  scene.add(group);

  const sunWorld = new THREE.Vector3();
  const camQ = new THREE.Quaternion();

  return {
    group,
    update(dt, t, camera) {
      dome.position.copy(camera.position);
      sunWorld.copy(shared.uSunDir.value).multiplyScalar(WORLD.skyRadius * 0.9).add(camera.position);
      glow.position.copy(sunWorld);
      shafts.position.copy(sunWorld);
      camera.getWorldQuaternion(camQ);
      shafts.quaternion.copy(camQ);
      shaftMat.opacity = shared.uShaftI.value * 0.6;
      glowMat.opacity = Math.min(1, shared.uSunVis.value * (0.35 + shared.uSunI.value * 0.5));
      const warm = shared.uSunColor.value;
      glowMat.color.setRGB(warm.r * 1.05 + 0.1, warm.g * 1.02 + 0.06, warm.b);
    },
    dispose() {
      scene.remove(group);
      dome.geometry.dispose(); domeMat.dispose();
      glowMat.dispose(); glowTex.dispose();
      shaftMat.dispose(); shaftTex.dispose();
      shafts.children.forEach(m => m.geometry.dispose());
      aurora.geometry.dispose(); auroraMat.dispose();
    },
  };
}

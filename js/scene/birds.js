// Birds: instanced V-shapes with wing flap in the vertex shader. Small flocks
// cross the valley only around sunrise and sunset, fading in and out.
// Flock anchors live in uniforms; per-instance data is baked attributes, so the
// per-frame CPU cost is three vector writes.

import * as THREE from 'three';
import { mulberry32 } from '../config.js';

const BIRD_VERT = /* glsl */`
attribute float aSeed;
attribute vec3 aOff;
attribute float aFlock;
attribute float aYaw;
attribute float aScale;
varying float vA;
uniform float uTime, uIntensity;
uniform vec3 uA0, uA1, uA2;
void main() {
  vec3 p = position * aScale;
  p.y += sin(uTime * 9.0 + aSeed * 30.0) * abs(position.x) * 0.6 * aScale;
  vec3 local = p + aOff;
  float cy = cos(aYaw), sy = sin(aYaw);
  vec3 rot = vec3(local.x * cy - local.z * sy, local.y, local.x * sy + local.z * cy);
  vec3 anchor = aFlock < 0.5 ? uA0 : (aFlock < 1.5 ? uA1 : uA2);
  vec3 wp = anchor + rot;
  wp.y += sin(uTime * 0.5 + aSeed * 10.0) * 1.6;
  vA = uIntensity;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const BIRD_FRAG = /* glsl */`
varying float vA;
uniform vec3 uAmbSky;
void main() {
  if (vA < 0.01) discard;
  vec3 col = mix(vec3(0.10, 0.11, 0.15), uAmbSky * 0.32, 0.35);
  gl_FragColor = vec4(col, vA);
}`;

const PER_FLOCK = 14, FLOCKS = 3, MAX_BIRDS = PER_FLOCK * FLOCKS;

export function createBirds(ctx) {
  const { scene, shared } = ctx;
  const rng = mulberry32(616);
  const group = new THREE.Group();

  // two wing triangles meeting at the body
  const verts = new Float32Array([
    0, 0, 0, -0.5, 0.1, 0, -1.0, 0.24, 0,
    0, 0, 0, 1.0, 0.24, 0, 0.5, 0.1, 0,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(18).fill(1), 3));
  const seeds = new Float32Array(MAX_BIRDS);
  const offs = new Float32Array(MAX_BIRDS * 3);
  const flockIds = new Float32Array(MAX_BIRDS);
  const yaws = new Float32Array(MAX_BIRDS);
  const scales = new Float32Array(MAX_BIRDS);
  for (let i = 0; i < MAX_BIRDS; i++) {
    seeds[i] = rng();
    offs[i * 3] = (rng() - 0.5) * 20;
    offs[i * 3 + 1] = (rng() - 0.5) * 5;
    offs[i * 3 + 2] = (rng() - 0.5) * 16;
    flockIds[i] = Math.floor(i / PER_FLOCK);
  }
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(offs, 3));
  geo.setAttribute('aFlock', new THREE.InstancedBufferAttribute(flockIds, 1));
  geo.setAttribute('aYaw', new THREE.InstancedBufferAttribute(yaws, 1));
  geo.setAttribute('aScale', new THREE.InstancedBufferAttribute(scales, 1));

  const uniforms = Object.assign({}, shared, {
    uIntensity: { value: 0 },
    uA0: { value: new THREE.Vector3(0, 200, 0) },
    uA1: { value: new THREE.Vector3(0, 200, 0) },
    uA2: { value: new THREE.Vector3(0, 200, 0) },
  });
  const mat = new THREE.ShaderMaterial({
    vertexShader: BIRD_VERT, fragmentShader: BIRD_FRAG,
    uniforms, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, MAX_BIRDS);
  mesh.frustumCulled = false;
  group.add(mesh);

  const flocks = [];
  for (let f = 0; f < FLOCKS; f++) {
    flocks.push({
      active: false, e: 2, dur: 50, dir: 1, y: 60, z: -60,
      from: new THREE.Vector3(0, 200, 0), to: new THREE.Vector3(0, 200, 0),
      cur: new THREE.Vector3(0, 200, 0),
    });
  }
  const anchors = [uniforms.uA0.value, uniforms.uA1.value, uniforms.uA2.value];
  const travel = new THREE.Vector3();

  function startFlock(f, progress = 0) {
    const k = flocks[f];
    k.active = true;
    k.e = progress;
    k.dir = rng() < 0.5 ? 1 : -1;
    k.dur = 46 + rng() * 26;
    k.y = 52 + rng() * 26;
    k.z = -45 - rng() * 70;
    k.from.set(k.dir * 380, k.y, k.z);
    k.to.set(-k.dir * 380, k.y + (rng() - 0.5) * 10, k.z);
    travel.subVectors(k.to, k.from).normalize();
    const yaw = Math.atan2(-travel.z, travel.x) - Math.PI / 2;
    for (let i = 0; i < PER_FLOCK; i++) {
      const idx = f * PER_FLOCK + i;
      yaws[idx] = yaw;
      scales[idx] = (1.8 + rng() * 1.6) * (1 - Math.abs(offs[idx * 3]) * 0.012);
    }
    geo.attributes.aYaw.needsUpdate = true;
    geo.attributes.aScale.needsUpdate = true;
  }
  for (let f = 0; f < FLOCKS; f++) startFlock(f, rng()); // staggered initial phases

  scene.add(group);

  return {
    group,
    update(dt, t, windowOn) {
      const target = windowOn ? 1 : 0;
      uniforms.uIntensity.value += (target - uniforms.uIntensity.value) * (1 - Math.exp(-2.5 * dt));
      const visible = uniforms.uIntensity.value > 0.02;
      mesh.visible = visible;
      if (!visible) return;
      for (let f = 0; f < FLOCKS; f++) {
        const k = flocks[f];
        if (!k.active) {
          if (windowOn && rng() < dt * 0.5) startFlock(f, 0);
          else { anchors[f].set(0, 250, 0); continue; }
        }
        k.e += dt / k.dur;
        if (k.e >= 1) { k.active = false; anchors[f].set(0, 250, 0); continue; }
        k.cur.lerpVectors(k.from, k.to, k.e);
        anchors[f].copy(k.cur);
      }
    },
    dispose() {
      scene.remove(group);
      geo.dispose(); mat.dispose();
    },
  };
}

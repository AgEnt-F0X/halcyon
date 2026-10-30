// The Curl-Noise Particle Stream: 2,500 particles in ONE THREE.Points draw
// call. Every formation (hero vortex, wind tunnel, helix lattice, geodesic
// network, neural cloud, orbital field) is pure vertex-shader math, so the
// CPU never touches a position — morphing between chapter moods is a single
// damped uniform. Per-frame CPU cost: zero.

import * as THREE from 'three';
import { mulberry32 } from '../config.js';
import { createStreamMaterial } from './materials.js';

const MAX_PARTICLES = 2500;

export function createNodes(ctx) {
  const { scene, shared } = ctx;
  const group = new THREE.Group();
  group.name = 'particleStream';
  scene.add(group);

  // ---- static typed buffers: all motion lives in the vertex shader ---------
  const rng = mulberry32(0xc0ffee);
  const pos = new Float32Array(MAX_PARTICLES * 3); // unused by the shader; keeps bounds checks quiet
  const rand = new Float32Array(MAX_PARTICLES * 4);
  const id = new Float32Array(MAX_PARTICLES);
  for (let i = 0; i < MAX_PARTICLES; i++) {
    rand[i * 4] = rng();
    rand[i * 4 + 1] = rng();
    rand[i * 4 + 2] = rng();
    rand[i * 4 + 3] = rng();
    id[i] = i / MAX_PARTICLES;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 4));
  geo.setAttribute('aId', new THREE.BufferAttribute(id, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 10, 0), 400);

  const mat = createStreamMaterial(shared, 3);
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  group.add(points);

  // ---- damped formation morph ---------------------------------------------
  let formationF = 0;
  let formationTarget = 0;
  let pulseT = 0;
  let baseTurbulence = 1; // the tuner's setting; pulses kick above this

  function setFormation(index) {
    formationTarget = Math.max(0, Math.min(5, index | 0));
  }

  function setTurbulence(v) {
    baseTurbulence = Math.max(0, Math.min(2, v));
  }

  // a one-shot turbulence kick (chapter hand-offs feel the thump)
  function pulse(strength = 1) {
    pulseT = Math.max(pulseT, strength);
  }

  function applyTier(tier) {
    geo.setDrawRange(0, Math.min(tier.particles, MAX_PARTICLES));
    const oct = tier.fbmOct;
    if (mat.defines.FBM_OCT !== oct) {
      mat.defines.FBM_OCT = oct;
      mat.needsUpdate = true;
    }
  }

  // ---- per-frame: only uniforms move ----------------------------------------
  function update(dt, t, camera) {
    formationF += (formationTarget - formationF) * Math.min(1, dt * 1.9);
    shared.uFormationF.value = formationF;
    if (pulseT > 0.001) {
      pulseT *= Math.exp(-dt * 2.6);
    } else {
      pulseT = 0;
    }
    shared.uTurbulence.value = baseTurbulence + pulseT * 0.9;
    void t; void camera;
  }

  return { group, update, applyTier, setFormation, setTurbulence, pulse };
}

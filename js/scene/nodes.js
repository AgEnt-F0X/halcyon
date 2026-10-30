// The 5-Mode Mathematical Attractor & Vortex Engine.
// 4,000 particles integrated on the CPU with elastic spring physics toward
// procedurally computed target formations — a real Lorenz strange attractor,
// an aerodynamic wind-tunnel vortex, cymatic standing-wave ribbons, a
// Fibonacci geodesic globe with pulsing route arcs, and a cursor-driven
// double-helix neural lattice. Click anywhere: a radial shockwave blasts the
// swarm outward and the springs snap it back into formation.

import * as THREE from 'three';
import { mulberry32 } from '../config.js';
import {
  createParticleMaterial, createTrailMaterial, createArcMaterial,
} from './materials.js';

const MAX_PARTICLES = 4000;
const SCULPT_Y = 0.4;
const LORENZ_S = 0.165;      // attractor → world scale
const TRAIL_LEN = 220;       // lead-trajectory history points
const ARC_COUNT = 26;        // geodesic route arcs
const ARC_SEGS = 22;

export function createNodes(ctx) {
  const { scene, shared, isReducedMotion } = ctx;
  const group = new THREE.Group();
  group.name = 'attractorEngine';
  scene.add(group);

  const rng = mulberry32(0xa77ac7);

  // ---- typed state -----------------------------------------------------------
  const N = MAX_PARTICLES;
  const pos = new Float32Array(N * 3);
  const vel = new Float32Array(N * 3);
  const tgt = new Float32Array(N * 3);
  const seed = new Float32Array(N);
  const lor = new Float32Array(N * 3);   // live Lorenz state per particle

  for (let i = 0; i < N; i++) {
    seed[i] = rng();
    // seed Lorenz states on the attractor, pre-warmed so frame one is formed
    lor[i * 3] = (rng() * 2 - 1) * 14;
    lor[i * 3 + 1] = (rng() * 2 - 1) * 14;
    lor[i * 3 + 2] = 18 + rng() * 14;
    for (let s = 0; s < 90; s++) lorenzStep(i, 0.016);
    pos[i * 3] = lor[i * 3] * LORENZ_S;
    pos[i * 3 + 1] = (lor[i * 3 + 2] - 25) * LORENZ_S + SCULPT_Y;
    pos[i * 3 + 2] = lor[i * 3 + 1] * LORENZ_S;
  }

  function lorenzStep(i, dt) {
    const j = i * 3;
    const x = lor[j], y = lor[j + 1], z = lor[j + 2];
    const dx = 10 * (y - x);
    const dy = x * (28 - z) - y;
    const dz = x * y - (8 / 3) * z;
    lor[j] = x + dx * dt;
    lor[j + 1] = y + dy * dt;
    lor[j + 2] = z + dz * dt;
  }

  // ---- buffers + draw call ---------------------------------------------------
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, SCULPT_Y, 0), 30);
  const mat = createParticleMaterial(shared);
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  group.add(points);

  // ---- lead-trajectory glowing trail ------------------------------------------
  const trailPos = new Float32Array(TRAIL_LEN * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  trailGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, SCULPT_Y, 0), 30);
  const trailMat = createTrailMaterial(shared);
  const trail = new THREE.Line(trailGeo, trailMat);
  trail.frustumCulled = false;
  group.add(trail);

  // ---- geodesic route arcs (mode 3) -------------------------------------------
  const FIB_NODES = 46;
  const fibPts = [];
  {
    const ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < FIB_NODES; i++) {
      const y = 1 - (i / (FIB_NODES - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const th = ga * i;
      fibPts.push(new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r));
    }
  }
  const arcVerts = ARC_COUNT * (ARC_SEGS + 1);
  const arcPos = new Float32Array(arcVerts * 3);
  const arcCol = new Float32Array(arcVerts * 3);
  const arcGeo = new THREE.BufferGeometry();
  arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPos, 3));
  arcGeo.setAttribute('color', new THREE.BufferAttribute(arcCol, 3));
  arcGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, SCULPT_Y, 0), 30);
  const arcMat = createArcMaterial(shared);
  const arcs = new THREE.LineSegments(arcGeo, arcMat);
  arcs.frustumCulled = false;
  arcs.visible = false;
  group.add(arcs);

  const arcPairs = [];
  for (let a = 0; a < ARC_COUNT; a++) {
    const i = a % FIB_NODES;
    const j2 = (i * 7 + 5) % FIB_NODES;
    if (i === j2) { arcPairs.push([i, (i + 3) % FIB_NODES]); continue; }
    arcPairs.push([i, j2]);
  }
  const ARC_R = 3.85;
  const aP0 = new THREE.Vector3();
  const aP1 = new THREE.Vector3();
  const aMid = new THREE.Vector3();
  function writeArc(a, t) {
    const [i, j2] = arcPairs[a];
    aP0.copy(fibPts[i]).multiplyScalar(ARC_R + Math.sin(t * 1.7 + i) * 0.07);
    aP1.copy(fibPts[j2]).multiplyScalar(ARC_R + Math.sin(t * 1.9 + j2) * 0.07);
    aMid.copy(aP0).add(aP1).multiplyScalar(0.5).setLength(ARC_R * 1.24);
    const base = a * (ARC_SEGS + 1);
    const glow = 0.45 + 0.55 * Math.max(0, Math.sin(t * 2.3 - a * 0.7));
    for (let s = 0; s <= ARC_SEGS; s++) {
      const u = s / ARC_SEGS;
      const iu = 1 - u;
      const x = iu * iu * aP0.x + 2 * iu * u * aMid.x + u * u * aP1.x;
      const y = iu * iu * aP0.y + 2 * iu * u * aMid.y + u * u * aP1.y;
      const z = iu * iu * aP0.z + 2 * iu * u * aMid.z + u * u * aP1.z;
      const k = (base + s) * 3;
      arcPos[k] = x; arcPos[k + 1] = y + SCULPT_Y; arcPos[k + 2] = z;
      const fade = Math.sin(u * Math.PI);
      arcCol[k] = 0.95 * glow * fade;
      arcCol[k + 1] = 0.72 * glow * fade;
      arcCol[k + 2] = 0.35 * glow * fade;
    }
  }

  // ---- engine state -----------------------------------------------------------
  let mode = 0;
  let modeF = 0;          // damped, feeds shared.uFormationF for shader accents
  let modeTarget = 0;
  let turbulence = 1;
  let pulseKick = 0;
  let trailTick = 0;

  // shockwave
  let shockT = 2;                       // ≥0.6 = idle
  const shockC = new THREE.Vector3(0, SCULPT_Y, 0);
  const dvec = new THREE.Vector3();

  // pointer world (cursor sweep for cymatics / helix rotation)
  const pointer3 = new THREE.Vector3(0, SCULPT_Y, 3);
  const pRay = new THREE.Vector3();

  // ---- public API ---------------------------------------------------------------
  function setFormation(index) {
    // legacy mapping: 5 (orbital fallback) folds into the geodesic globe
    modeTarget = index >= 5 ? 3 : Math.max(0, Math.min(4, index | 0));
  }

  function setTurbulence(v) { turbulence = Math.max(0, Math.min(2, v)); }

  function pulse(strength = 1) { pulseKick = Math.max(pulseKick, strength); }

  // click shockwave — camera passes NDC coords; we intersect the core shell
  function shockwave(ndcX, ndcY) {
    if (!cameraRef) return;
    pRay.set(ndcX, ndcY, 0.5).unproject(cameraRef).sub(cameraRef.position).normalize();
    const oc = new THREE.Vector3().subVectors(shockC, cameraRef.position);
    const tca = oc.dot(pRay);
    const d2 = oc.lengthSq() - tca * tca;
    if (d2 < 14) {
      const thc = Math.sqrt(Math.max(0, 14 - d2));
      shockC.copy(cameraRef.position).addScaledVector(pRay, tca - thc);
    } else {
      shockC.set(0, SCULPT_Y, 0);
    }
    shockT = 0;
  }

  function applyTier(tier) {
    geo.setDrawRange(0, Math.min(tier.particles, N));
  }

  // ---- formation target functions ------------------------------------------------
  function targetMode0(i, t) {
    // Hero: the living Lorenz strange attractor — particles chase their own
    // continuously integrated trajectory, swirling on twin butterfly wings
    lorenzStep(i, 0.0045 * (0.7 + seed[i] * 0.9));
    const j = i * 3;
    tgt[j] = lor[j] * LORENZ_S;
    tgt[j + 1] = (lor[j + 2] - 25) * LORENZ_S + SCULPT_Y;
    tgt[j + 2] = lor[j + 1] * LORENZ_S - 1.2;
  }

  function targetMode1(i, t) {
    // Apex: high-speed helical slipstream tubes streaking along Z, bending
    // around the central core
    const j = i * 3;
    const tube = i % 7;
    const tubeAng = tube * 0.897;
    const speed = 5.5 + seed[i] * 4.5;
    const u = (seed[i] * 21 + t * speed) % 21;
    const z = 7 - u;
    const a = t * 3.1 + u * 0.85 + tubeAng * 6;
    const rt = 0.42 + seed[(i + 997) % N] * 0.5;
    let x = Math.cos(tubeAng) * 4.3 + Math.cos(a) * rt;
    let y = Math.sin(tubeAng) * 2.1 + Math.sin(a) * rt;
    // bend around the core: radial push-out from the sculpture shell
    const dxz = Math.sqrt(x * x + (y - SCULPT_Y) * (y - SCULPT_Y));
    if (dxz < 3.4 && Math.abs(z) < 3.6) {
      const push = (3.4 - dxz) * (1 - Math.abs(z) / 3.6);
      x += (x / Math.max(dxz, 0.001)) * push;
      y += ((y - SCULPT_Y) / Math.max(dxz, 0.001)) * push;
    }
    tgt[j] = x;
    tgt[j + 1] = y;
    tgt[j + 2] = z;
  }

  function targetMode2(i, t) {
    // StudyPulse: 40 stacked harmonic cymatic ribbons, rippling under the
    // cursor sweep
    const j = i * 3;
    const ribbon = Math.floor(i / 100) % 40;
    const u = (i * 0.61803) % 1;
    const y = (ribbon - 19.5) * 0.168;
    const x = (u - 0.5) * 11.5;
    // harmonic wave: sum of two spatial frequencies + slow phase drift
    const k1 = Math.sin(u * 12.56 + t * 2.1 + ribbon * 0.32);
    const k2 = 0.45 * Math.sin(u * 29.2 - t * 3.3 + ribbon * 0.11);
    let z = (k1 + k2) * (0.62 + 0.3 * Math.sin(ribbon * 0.21 + t * 0.7));
    // cursor sweep ripple: amplitude swells near the pointer
    const dx = x - pointer3.x;
    const dy = y - pointer3.y;
    const near = Math.exp(-(dx * dx + dy * dy) * 0.32);
    z += k1 * near * 1.35;
    tgt[j] = x;
    tgt[j + 1] = y + k1 * near * 0.4;
    tgt[j + 2] = z;
  }

  function targetMode3(i, t) {
    // KaamSaarthi: sharp Fibonacci geodesic globe with breathing hubs
    const j = i * 3;
    const fi = i % FIB_NODES;
    const y = 1 - (fi / (FIB_NODES - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = Math.PI * (3 - Math.sqrt(5)) * fi;
    const R = 3.85 + seed[i] * 0.35 + Math.sin(t * 2.1 + fi * 1.31) * 0.09;
    tgt[j] = Math.cos(th) * r * R;
    tgt[j + 1] = y * R + SCULPT_Y;
    tgt[j + 2] = Math.sin(th) * r * R;
  }

  function targetMode4(i, t) {
    // ASL / Vision: intertwined double-helix neural lattice, rotating with
    // the cursor, with rung clusters between the strands
    const j = i * 3;
    const strand = i % 2;
    const rung = (i % 14) < 3; // every ~7th particle forms a cross-link rung
    const u = (i * 0.61803) % 1;
    const cursorSpin = pointer3.x * 0.55;
    const ang = u * Math.PI * 6 + t * 0.55 + strand * Math.PI + cursorSpin;
    const y = (u - 0.5) * 9.4;
    let rad = 2.15 + seed[i] * 0.42;
    let x = Math.cos(ang) * rad;
    let z = Math.sin(ang) * rad;
    if (rung) {
      // rungs: interpolate between the two strands at the same height
      const half = (i % 3) / 2; // 0, 0.5, 1 across the rung
      const ang2 = ang + Math.PI;
      x = Math.cos(ang) * rad * (1 - half) + Math.cos(ang2) * rad * half;
      z = Math.sin(ang) * rad * (1 - half) + Math.sin(ang2) * rad * half;
    }
    tgt[j] = x;
    tgt[j + 1] = y + SCULPT_Y + Math.sin(u * 40 + t * 2) * 0.06;
    tgt[j + 2] = z;
  }

  const MODE_FNS = [targetMode0, targetMode1, targetMode2, targetMode3, targetMode4];

  // ---- per-frame integration ------------------------------------------------
  let cameraRef = null;
  function update(dt, t, camera) {
    cameraRef = camera;

    // damp the visible mode blend for shader-side accents; the spring flight
    // itself is the morph — targets switch immediately and particles fly
    modeF += (modeTarget - modeF) * Math.min(1, dt * 2.2);
    shared.uFormationF.value = modeF;
    mode = modeTarget;
    arcs.visible = mode === 3;
    if (mode === 3) writeArcs(t);

    // pointer world point on the z=0 plane (cursor sweep + helix spin)
    if (camera) {
      pRay.set(shared.uMouse.value.x, shared.uMouse.value.y, 0.5)
        .unproject(camera).sub(camera.position).normalize();
      const dz = pRay.z;
      if (Math.abs(dz) > 1e-4) {
        const tt = (0 - camera.position.z) / dz;
        if (tt > 0) pointer3.copy(camera.position).addScaledVector(pRay, tt);
      }
    }

    // active formation targets
    const fn = MODE_FNS[mode] || targetMode0;
    const cnt = Math.min(geo.drawRange.count || N, N);
    for (let i = 0; i < cnt; i++) fn(i, t);

    // shockwave impulse: travelling shell blasts particles outward
    if (shockT < 0.6) {
      shockT += dt;
      const R = shockT * 15;
      const amp = (1 - shockT / 0.6) * 26;
      for (let i = 0; i < cnt; i++) {
        const j = i * 3;
        dvec.set(pos[j] - shockC.x, pos[j + 1] - shockC.y, pos[j + 2] - shockC.z);
        const d = dvec.length() || 0.001;
        const shell = Math.exp(-((d - R) * (d - R)) * 0.22) * amp;
        dvec.multiplyScalar(1 / d);
        vel[j] += dvec.x * shell * dt;
        vel[j + 1] += dvec.y * shell * dt;
        vel[j + 2] += dvec.z * shell * dt;
      }
    }

    // turbulence + pulse kick + elastic spring integration
    const kick = pulseKick;
    if (pulseKick > 0.001) pulseKick *= Math.exp(-dt * 2.4);
    const turb = turbulence * (1 + kick * 1.6);
    const K = 30;
    const damp = Math.exp(-dt * 5.2);
    const jit = 0.09 * turb;
    for (let i = 0; i < cnt; i++) {
      const j = i * 3;
      const s = seed[i];
      vel[j] += (tgt[j] - pos[j]) * K * dt
        + Math.sin(t * 1.9 + s * 61) * jit * dt;
      vel[j + 1] += (tgt[j + 1] - pos[j + 1]) * K * dt
        + Math.cos(t * 1.6 + s * 43) * jit * dt;
      vel[j + 2] += (tgt[j + 2] - pos[j + 2]) * K * dt
        + Math.sin(t * 2.1 + s * 29) * jit * dt;
      vel[j] *= damp; vel[j + 1] *= damp; vel[j + 2] *= damp;
      pos[j] += vel[j] * dt;
      pos[j + 1] += vel[j + 1] * dt;
      pos[j + 2] += vel[j + 2] * dt;
    }

    // lead-particle glowing trail (ring buffer)
    if (!isReducedMotion()) {
      if (++trailTick % 2 === 0) {
        trailPos.copyWithin(0, 3);
        const L = (TRAIL_LEN - 1) * 3;
        trailPos[L] = pos[0];
        trailPos[L + 1] = pos[1];
        trailPos[L + 2] = pos[2];
        trailGeo.attributes.position.needsUpdate = true;
      }
      trailMat.color.copy(shared.uColorAccent.value);
      trailMat.opacity = 0.5 + 0.3 * Math.sin(t * 2.7);
    }

    geo.attributes.position.needsUpdate = true;
  }

  function writeArcs(t) {
    for (let a = 0; a < ARC_COUNT; a++) writeArc(a, t);
    arcGeo.attributes.position.needsUpdate = true;
    arcGeo.attributes.color.needsUpdate = true;
  }

  // sync trail to the Lorenz lead immediately at boot
  for (let s = 0; s < TRAIL_LEN; s++) {
    const k = s * 3;
    trailPos[k] = pos[0]; trailPos[k + 1] = pos[1]; trailPos[k + 2] = pos[2];
  }

  return {
    group, update, applyTier,
    setFormation, setTurbulence, pulse, shockwave,
    get mode() { return mode; },
  };
}

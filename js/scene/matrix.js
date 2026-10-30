// The Centerpiece Sculpture Engine — a multi-layer stage that always gives
// the eye a hypnotic focal point:
//   · the Ferrofluid Core: IcosahedronGeometry(2.6, 64), domain-warped simplex
//     displacement, magnetic cursor spikes, IQ iridescent Fresnel shading
//   · a 4-ring orbital gyroscope: tori, dashed glowing line loops, degree
//     ticks and coordinate markers — counter-rotating, cursor-tilted,
//     spinning faster with scroll velocity
//   · a curved topographic horizon floor rolling neon shockwaves on scroll

import * as THREE from 'three';
import {
  createCoreMaterial, CORE_PRESETS, createFloorMaterial,
  createRingTorusMaterial,
} from './materials.js';

const SCULPT_Y = 0.4;
const FLOOR_Y = -4.4;

export function createMatrix(ctx) {
  const { scene, shared, isReducedMotion } = ctx;
  const group = new THREE.Group();
  group.name = 'sculptureStage';
  scene.add(group);

  // the whole world tints its background from the live palette
  scene.background = shared.uColorPrimary.value;

  // ===========================================================================
  // 1. THE FERROFLUID CORE
  // ===========================================================================
  const sculpt = new THREE.Group();
  sculpt.position.set(0, SCULPT_Y, 0);
  group.add(sculpt);

  const coreMat = createCoreMaterial(shared);
  let coreDetail = 0;
  let core = null;
  function buildCore(detail) {
    if (coreDetail === detail) return;
    coreDetail = detail;
    if (core) {
      sculpt.remove(core);
      core.geometry.dispose();
    }
    core = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6, detail), coreMat);
    core.frustumCulled = false;
    sculpt.add(core);
  }
  buildCore(64);

  // ===========================================================================
  // 2. ORBITAL GYROSCOPE — 4 interlocking counter-rotating rings
  // ===========================================================================
  const rings = new THREE.Group();
  sculpt.add(rings);

  const torusMatA = createRingTorusMaterial(shared, 0);
  const torusMatB = createRingTorusMaterial(shared, 1);
  const ringA = new THREE.Mesh(new THREE.TorusGeometry(3.55, 0.016, 8, 128), torusMatA);
  ringA.rotation.x = Math.PI / 2.15;
  const ringB = new THREE.Mesh(new THREE.TorusGeometry(4.35, 0.012, 8, 128), torusMatB);
  ringB.rotation.x = Math.PI / 1.75;
  ringB.rotation.y = 0.45;
  rings.add(ringA, ringB);

  // dashed glowing line loops
  function dashedCircle(r, segments = 160) {
    const pts = new Float32Array((segments + 1) * 3);
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      pts[i * 3] = Math.cos(a) * r;
      pts[i * 3 + 1] = 0;
      pts[i * 3 + 2] = Math.sin(a) * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    const m = new THREE.LineDashedMaterial({
      color: 0xE5A93C, dashSize: 0.34, gapSize: 0.2, transparent: true,
      opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const line = new THREE.Line(g, m);
    line.computeLineDistances();
    return line;
  }
  const dashA = dashedCircle(3.95);
  dashA.rotation.x = Math.PI / 2.6;
  const dashB = dashedCircle(4.75);
  dashB.rotation.x = Math.PI / 1.9;
  dashB.rotation.z = 0.6;
  rings.add(dashA, dashB);

  // degree ticks + coordinate markers, merged into ONE LineSegments
  function ticksGeometry(r) {
    const segs = [];
    const push = (x1, y1, z1, x2, y2, z2) => segs.push(x1, y1, z1, x2, y2, z2);
    for (let d = 0; d < 360; d += 5) {
      const a = (d * Math.PI) / 180;
      const len = d % 90 === 0 ? 0.34 : d % 30 === 0 ? 0.2 : 0.1;
      const c = Math.cos(a), s = Math.sin(a);
      push(c * r, 0, s * r, c * (r + len), 0, s * (r + len));
    }
    // coordinate crosses at the cardinals
    for (let d = 0; d < 360; d += 90) {
      const a = (d * Math.PI) / 180;
      const c = Math.cos(a) * (r + 0.52), s = Math.sin(a) * (r + 0.52);
      push(c - 0.09, 0, s, c + 0.09, 0, s);
      push(c, 0, s - 0.09, c, 0, s + 0.09);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segs), 3));
    return g;
  }
  const tickMatA = new THREE.LineBasicMaterial({
    color: 0xE5A93C, transparent: true, opacity: 0.65,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const tickMatB = new THREE.LineBasicMaterial({
    color: 0xF4F1EA, transparent: true, opacity: 0.4,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const ticksA = new THREE.LineSegments(ticksGeometry(3.55), tickMatA);
  ticksA.rotation.x = Math.PI / 2.15;
  const ticksB = new THREE.LineSegments(ticksGeometry(4.35), tickMatB);
  ticksB.rotation.x = Math.PI / 1.75;
  ticksB.rotation.y = 0.45;
  rings.add(ticksA, ticksB);

  // ===========================================================================
  // 3. TOPOGRAPHIC HORIZON FLOOR
  // ===========================================================================
  const FLOOR_MAX_X = 90;
  const FLOOR_MAX_Y = 60;
  const floorMat = createFloorMaterial(shared);
  const floorGeo = new THREE.PlaneGeometry(60, 40, FLOOR_MAX_X, FLOOR_MAX_Y);
  floorGeo.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.set(0, FLOOR_Y, 4);
  floor.frustumCulled = false;
  floor.renderOrder = -5;
  group.add(floor);

  // ---- scroll shockwave pulses (3 slots, rolling foreground → horizon) ----
  const pulses = [
    new THREE.Vector4(14, 0, 0, 9),
    new THREE.Vector4(14, 0, 0, 9),
    new THREE.Vector4(14, 0, 0, 9),
  ];
  floorMat.uniforms.uPulse0.value = pulses[0];
  floorMat.uniforms.uPulse1.value = pulses[1];
  floorMat.uniforms.uPulse2.value = pulses[2];
  let pulseIdx = 0;
  let lastVelPulse = 0;

  // ---- chapter sculpt mode (lerped between CORE_PRESETS) -------------------
  let modeFrom = 0;
  let modeTo = 0;
  let modeMix = 1;
  const palA = new THREE.Vector3();
  const palB = new THREE.Vector3();
  const palC = new THREE.Vector3();
  const palD = new THREE.Vector3();
  const rim = new THREE.Color();
  const spec = new THREE.Color();

  function setMode(index) {
    const m = Math.max(0, Math.min(4, index | 0));
    if (m === modeTo) return;
    modeFrom = modeTo;
    modeTo = m;
    modeMix = 0;
  }

  // lerp a numeric/vec/color channel between the two active presets
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const tmpCA = new THREE.Color();
  const tmpCB = new THREE.Color();
  function applyModeMix(f) {
    const P0 = CORE_PRESETS[modeFrom];
    const P1 = CORE_PRESETS[modeTo];
    const U = coreMat.uniforms;
    U.uNoiseFreq.value = P0.freq + (P1.freq - P0.freq) * f;
    U.uAmp.value = P0.amp + (P1.amp - P0.amp) * f;
    U.uMorphSpeed.value = P0.speed + (P1.speed - P0.speed) * f;
    U.uFaceted.value = P0.faceted + (P1.faceted - P0.faceted) * f;
    U.uGridI.value = P0.gridI + (P1.gridI - P0.gridI) * f;
    U.uGridF.value = P0.gridF + (P1.gridF - P0.gridF) * f;
    palA.fromArray(P0.palA); tmpA.fromArray(P1.palA); palA.lerp(tmpA, f);
    palB.fromArray(P0.palB); tmpB.fromArray(P1.palB); palB.lerp(tmpB, f);
    palC.fromArray(P0.palC); tmpA.fromArray(P1.palC); palC.lerp(tmpA, f);
    palD.fromArray(P0.palD); tmpB.fromArray(P1.palD); palD.lerp(tmpB, f);
    U.uPalA.value.copy(palA);
    U.uPalB.value.copy(palB);
    U.uPalC.value.copy(palC);
    U.uPalD.value.copy(palD);
    tmpCA.set(P0.rim); tmpCB.set(P1.rim); rim.copy(tmpCA).lerp(tmpCB, f);
    tmpCA.set(P0.spec); tmpCB.set(P1.spec); spec.copy(tmpCA).lerp(tmpCB, f);
    U.uRimColor.value.copy(rim);
    U.uSpecColor.value.copy(spec);
    dashA.material.color.copy(rim);
    tickMatA.color.copy(rim);
    torusMatA.uniforms.uTint.value.copy(rim);
    torusMatB.uniforms.uTint.value.copy(spec);
    dashB.material.color.copy(spec);
  }

  // ---- cursor → sculpture intersection (magnetic pull target) ---------------
  const rayDir = new THREE.Vector3();
  const sphereC = new THREE.Vector3(0, SCULPT_Y, 0);
  const toC = new THREE.Vector3();
  let spikeEnergy = 0;
  let lastMouseX = 0;
  let lastMouseY = 0;
  function updateMouse3D(cam) {
    const mx = shared.uMouse.value.x;
    const my = shared.uMouse.value.y;
    // spike energy feeds on cursor speed, decays otherwise
    const speed = Math.hypot(mx - lastMouseX, my - lastMouseY);
    lastMouseX = mx; lastMouseY = my;
    spikeEnergy = Math.min(1, spikeEnergy + speed * 14);
    rayDir.set(mx, my, 0.5).unproject(cam).sub(cam.position).normalize();
    toC.copy(sphereC).sub(cam.position);
    const tca = toC.dot(rayDir);
    const d2 = toC.lengthSq() - tca * tca;
    const r2 = 3.3 * 3.3;
    if (d2 < r2 && tca > 0) {
      const thc = Math.sqrt(r2 - d2);
      shared.uMouse3D.value.copy(cam.position).addScaledVector(rayDir, tca - thc);
    } else {
      // nearest point on the ray to the sphere centre, clamped to a shell
      const t = Math.max(tca, 2);
      shared.uMouse3D.value.copy(cam.position).addScaledVector(rayDir, t);
      shared.uMouse3D.value.sub(sphereC).setLength(3.1).add(sphereC);
    }
  }

  // ---- tier -----------------------------------------------------------------
  function applyTier(tier) {
    const detail = tier.name === 'Potato' ? 24 : tier.name === 'Low' ? 40 : 64;
    buildCore(detail);
    const [sx, sy] = tier.name === 'Potato' ? [50, 34] : [FLOOR_MAX_X, FLOOR_MAX_Y];
    floor.geometry.setDrawRange(0, sx * sy * 6);
  }

  // ---- per-frame -------------------------------------------------------------
  function update(dt, t, camera) {
    updateMouse3D(camera);
    spikeEnergy *= Math.exp(-dt * 2.2);
    const U = coreMat.uniforms;
    U.uMouseInfluence.value += ((0.35 + spikeEnergy * 0.65) - U.uMouseInfluence.value) * Math.min(1, dt * 5);
    U.uSpike.value = 0.85 + spikeEnergy * 0.8;

    // sculpture breathing + slow majestic spin
    if (!isReducedMotion()) {
      core.rotation.y += dt * 0.14;
      core.rotation.x = Math.sin(t * 0.17) * 0.12;
    }
    core.scale.setScalar(1 + Math.sin(t * 0.9) * 0.012);

    // gyro: counter-rotation, cursor tilt, scroll-speed boost
    const boost = 1 + Math.min(Math.abs(shared.uScrollVelocity.value) * 3.2, 3.4);
    for (let i = 0; i < rings.children.length; i++) {
      const child = rings.children[i];
      const dir = i % 2 === 0 ? 1 : -1;
      child.rotation.z += dt * (child.isMesh ? 0.22 : 0.3) * boost * dir;
    }
    dashA.rotation.y -= dt * 0.1 * boost;
    dashB.rotation.y += dt * 0.14 * boost;
    const tiltX = shared.uMouse.value.y * 0.22;
    const tiltZ = shared.uMouse.value.x * 0.22;
    rings.rotation.x += (tiltX - rings.rotation.x) * Math.min(1, dt * 3);
    rings.rotation.z += (tiltZ - rings.rotation.z) * Math.min(1, dt * 3);

    // chapter morph
    if (modeMix < 1) {
      modeMix = Math.min(1, modeMix + dt * 1.4);
      applyModeMix(modeMix * modeMix * (3 - 2 * modeMix));
    }

    // floor pulses: spawn on scroll velocity spikes
    const vel = Math.abs(shared.uScrollVelocity.value);
    if (vel > 0.55 && t - lastVelPulse > 0.55) {
      lastVelPulse = t;
      spawnPulse();
    }
    for (const P of pulses) {
      if (P.z > 0.004) {
        P.y += dt * P.w;
        P.z *= Math.exp(-dt * 1.5);
        if (P.y > 34) P.z = 0;
      }
    }
  }

  function spawnPulse(strength = 1) {
    const P = pulses[pulseIdx];
    pulseIdx = (pulseIdx + 1) % pulses.length;
    P.set(14, 0, 0.85 * strength, 11);
  }

  return {
    group,
    update,
    applyTier,
    setMode,
    pulse: spawnPulse,
    get core() { return core; },
    get sculpt() { return sculpt; },
  };
}
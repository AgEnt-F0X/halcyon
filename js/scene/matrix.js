// The Global Grid Matrix: the infinite dark-mode coordinate field the whole
// portfolio lives in. Everything is batched — the grid is a single shader
// plane, ambient data nodes are one Points cloud (drawRange-gated per tier),
// the distant monolith skyline is one LineSegments mesh, and the central
// Architectural Core is three meshes. Total: ~7 draw calls for the world.

import * as THREE from 'three';
import { MATRIX, mulberry32 } from '../config.js';
import {
  createSkyDomeMaterial, createGridMaterial, createParticleMaterial,
  createCoreMaterial,
} from './materials.js';

const MAX_PARTICLES = 640;
const MAX_SKYLINE = 30;

export function createMatrix(ctx) {
  const { scene, shared } = ctx;
  const group = new THREE.Group();
  group.name = 'matrixWorld';
  scene.add(group);

  // ---- sky dome ----------------------------------------------------------
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(700, 24, 16),
    createSkyDomeMaterial(shared),
  );
  dome.frustumCulled = false;
  group.add(dome);

  // ---- infinite grid plane (the whole grid is the fragment shader) -------
  const gridGeo = new THREE.PlaneGeometry(MATRIX.gridHalf * 2, MATRIX.gridHalf * 2, 1, 1);
  gridGeo.rotateX(-Math.PI / 2);
  const grid = new THREE.Mesh(gridGeo, createGridMaterial(shared));
  grid.frustumCulled = false;
  grid.renderOrder = -1;
  group.add(grid);

  // ---- ambient data nodes (one batched Points cloud) ----------------------
  function buildParticles() {
    const rng = mulberry32(0x4d4721);
    const pos = new Float32Array(MAX_PARTICLES * 3);
    const phase = new Float32Array(MAX_PARTICLES);
    const size = new Float32Array(MAX_PARTICLES);
    const tint = new Float32Array(MAX_PARTICLES);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      // ring-biased spread, denser near the core, thinning outward
      const a = rng() * Math.PI * 2;
      const r = 14 + Math.pow(rng(), 0.7) * 300;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = 1.5 + Math.pow(rng(), 1.4) * 80;
      pos[i * 3 + 2] = Math.sin(a) * r;
      phase[i] = rng() * Math.PI * 2;
      size[i] = 0.5 + rng() * 1.7;
      tint[i] = rng() < 0.22 ? 0.5 + rng() * 0.5 : rng() * 0.15;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aTint', new THREE.BufferAttribute(tint, 1));
    const mat = createParticleMaterial(shared);
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    return pts;
  }
  const particles = buildParticles();
  group.add(particles);

  // ---- distant monolith skyline (one merged LineSegments) ------------------
  const skylineVertsPerBox = 24; // 12 edges x 2
  function buildSkyline() {
    const rng = mulberry32(0x51a7e5);
    const verts = new Float32Array(MAX_SKYLINE * skylineVertsPerBox * 3);
    const boxEdges = [
      [0, 1], [1, 2], [2, 3], [3, 0], // bottom
      [4, 5], [5, 6], [6, 7], [7, 4], // top
      [0, 4], [1, 5], [2, 6], [3, 7], // verticals
    ];
    const corners = new Float32Array(8 * 3);
    let v = 0;
    for (let i = 0; i < MAX_SKYLINE; i++) {
      const a = rng() * Math.PI * 2;
      const r = 190 + rng() * 230;
      const cx = Math.cos(a) * r;
      const cz = Math.sin(a) * r;
      const w = 5 + rng() * 16;
      const d = 5 + rng() * 16;
      const h = 14 + Math.pow(rng(), 1.6) * 64;
      // 8 corners
      let ci = 0;
      for (const sy of [0, 1]) {
        for (const [dx, dz] of [[-w, -d], [w, -d], [w, d], [-w, d]]) {
          corners[ci * 3] = cx + dx; corners[ci * 3 + 1] = sy * h; corners[ci * 3 + 2] = cz + dz;
          ci++;
        }
      }
      for (const [a0, a1] of boxEdges) {
        verts[v * 3] = corners[a0 * 3]; verts[v * 3 + 1] = corners[a0 * 3 + 1]; verts[v * 3 + 2] = corners[a0 * 3 + 2]; v++;
        verts[v * 3] = corners[a1 * 3]; verts[v * 3 + 1] = corners[a1 * 3 + 1]; verts[v * 3 + 2] = corners[a1 * 3 + 2]; v++;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0x2b3a4e, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const lines = new THREE.LineSegments(g, mat);
    lines.frustumCulled = false;
    return lines;
  }
  const skyline = buildSkyline();
  group.add(skyline);

  // ---- the Architectural Core (centre of the matrix) -----------------------
  const coreGroup = new THREE.Group();
  coreGroup.position.set(0, 16, 0);
  group.add(coreGroup);

  const coreEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(6.2, 0)),
    new THREE.LineBasicMaterial({ color: 0x4da6ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending }),
  );
  coreGroup.add(coreEdges);

  const coreInner = new THREE.Mesh(
    new THREE.IcosahedronGeometry(3.3, 1),
    createCoreMaterial(shared),
  );
  coreGroup.add(coreInner);

  // gyroscope rings — flat additive annuli on tilted axes
  const ringMatA = new THREE.MeshBasicMaterial({
    color: 0x4da6ff, transparent: true, opacity: 0.28, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const ringA = new THREE.Mesh(new THREE.RingGeometry(9.4, 9.8, 72), ringMatA);
  ringA.rotation.x = Math.PI / 2.25;
  coreGroup.add(ringA);
  const ringMatB = new THREE.MeshBasicMaterial({
    color: 0xf4f1ea, transparent: true, opacity: 0.14, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const ringB = new THREE.Mesh(new THREE.RingGeometry(11.6, 11.85, 72), ringMatB);
  ringB.rotation.x = Math.PI / 1.7;
  ringB.rotation.y = 0.5;
  coreGroup.add(ringB);

  // ---- tier gating (drawRange only — no rebuilds, no shader recompiles) ----
  function applyTier(tier) {
    particles.geometry.setDrawRange(0, tier.particles);
    skyline.visible = tier.skyline > 0;
    if (skyline.visible) skyline.geometry.setDrawRange(0, tier.skyline * skylineVertsPerBox);
  }

  // ---- per-frame update (zero allocations) ---------------------------------
  function update(dt, t, camera) {
    shared.uCamPos.value.copy(camera.position);
    coreGroup.rotation.y += dt * 0.16;
    coreInner.rotation.x -= dt * 0.22;
    coreInner.rotation.y += dt * 0.1;
    ringA.rotation.z += dt * 0.4;
    ringB.rotation.z -= dt * 0.26;
    // core warms to the active accent
    coreEdges.material.color.lerp(shared.uAccent.value, Math.min(1, dt * 2.5));
    ringMatA.color.lerp(shared.uAccent.value, Math.min(1, dt * 2.5));
    void dome;
  }

  return { group, update, applyTier };
}

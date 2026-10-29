// Forest: one merged low-poly pine (3 stacked cones + trunk) instanced across the
// valley banks, plus rocks and grass tufts. All counts are allocated at the High-tier
// maximum once; applyTier() just changes instance counts — no rebuilds, no reallocs.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD, mulberry32, TIERS } from '../config.js';
import { makeToonMaterial, ensureSeed, jitterVertexColors } from './materials.js';
import { groundHeight } from './terrain.js';

function pineGeometry(rng) {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.14, 0.24, 1.3, 6, 1, true);
  trunk.translate(0, 0.6, 0);
  jitterVertexColors(trunk, 0x4a3b2c, rng, 0.05);
  parts.push(trunk);
  const tiers = [
    { r: 1.55, h: 2.3, y: 2.1, c: 0x3a5c36 },
    { r: 1.15, h: 2.0, y: 3.4, c: 0x416338 },
    { r: 0.72, h: 1.6, y: 4.6, c: 0x4a6c3c },
  ];
  for (const t of tiers) {
    const cone = new THREE.ConeGeometry(t.r, t.h, 6, 1, true);
    cone.translate(0, t.y, 0);
    jitterVertexColors(cone, t.c, rng, 0.07);
    parts.push(cone);
  }
  const g = mergeGeometries(parts, false);
  parts.forEach(p => p.dispose());
  return g;
}

function rockGeometry(rng) {
  const g = new THREE.IcosahedronGeometry(1, 0);
  // non-indexed: displace per unique corner so the mesh stays welded
  const pos = g.getAttribute('position');
  const seen = new Map();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const key = `${x.toFixed(3)}|${y.toFixed(3)}|${z.toFixed(3)}`;
    let s = seen.get(key);
    if (s === undefined) { s = 0.75 + rng() * 0.5; seen.set(key, s); }
    pos.setXYZ(i, x * s, y * s * 0.72, z * s);
  }
  g.computeVertexNormals();
  jitterVertexColors(g, 0x8d8a80, rng, 0.06);
  return g;
}

function grassGeometry(rng) {
  const blades = [];
  for (let i = 0; i < 3; i++) {
    const b = new THREE.ConeGeometry(0.09, 0.85, 3, 1, true);
    b.translate((rng() - 0.5) * 0.5, 0.4, (rng() - 0.5) * 0.5);
    b.rotateY(rng() * Math.PI);
    jitterVertexColors(b, 0x6d8a4a, rng, 0.12);
    blades.push(b);
  }
  const g = mergeGeometries(blades, false);
  blades.forEach(p => p.dispose());
  return g;
}

export function createForest(ctx) {
  const { scene, shared } = ctx;
  const rng = mulberry32(4242);
  const group = new THREE.Group();
  const dummy = new THREE.Object3D();

  // ---- pines ----
  const MAX_PINES = TIERS.high.pines;
  const pineGeo = pineGeometry(rng);
  ensureSeed(pineGeo, 0.5);
  const pineSeeds = new Float32Array(MAX_PINES);
  for (let i = 0; i < MAX_PINES; i++) pineSeeds[i] = rng();
  pineGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(pineSeeds, 1));
  const pineMat = makeToonMaterial(shared, { foliage: true, snowCap: true, sway: 0.06, swayH: 5.5, rim: 0.45, name: 'pine' });
  const pines = new THREE.InstancedMesh(pineGeo, pineMat, MAX_PINES);
  pines.frustumCulled = false;
  group.add(pines);

  let placed = 0, guard = 0;
  while (placed < MAX_PINES && guard++ < MAX_PINES * 30) {
    let x, z;
    const r = rng();
    if (r < 0.42) { x = (38 + rng() * 130) * (rng() < 0.5 ? -1 : 1); z = 2 + rng() * 42; }        // foreground banks
    else if (r < 0.78) { x = -190 + rng() * 380; z = -205 + rng() * 80; }                          // far shore
    else { x = (24 + rng() * 180) * (rng() < 0.5 ? -1 : 1); z = -120 + rng() * 118; }              // mid scattered
    const y = groundHeight(x, z);
    if (y < WORLD.waterY + 0.7) continue;
    if (Math.hypot(x - WORLD.cabin.x, z - WORLD.cabin.z) < 9.5) continue;
    const s = z > 0 ? 1.05 + rng() * 0.85 : 0.8 + rng() * 0.6;
    dummy.position.set(x, y - 0.15, z);
    dummy.rotation.set(0, rng() * Math.PI * 2, (rng() - 0.5) * 0.06);
    dummy.scale.set(s * (0.85 + rng() * 0.3), s, s * (0.85 + rng() * 0.3));
    dummy.updateMatrix();
    pines.setMatrixAt(placed, dummy.matrix);
    placed++;
  }
  const placedPines = placed;

  // ---- rocks ----
  const MAX_ROCKS = TIERS.high.rocks;
  const rockGeo = rockGeometry(rng);
  ensureSeed(rockGeo, 0.5);
  const rockSeeds = new Float32Array(MAX_ROCKS);
  for (let i = 0; i < MAX_ROCKS; i++) rockSeeds[i] = rng();
  rockGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(rockSeeds, 1));
  const rockMat = makeToonMaterial(shared, { snowCap: true, rim: 0.3, sunAmt: 0.85, name: 'rock' });
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, MAX_ROCKS);
  rocks.frustumCulled = false;
  group.add(rocks);

  placed = 0; guard = 0;
  while (placed < MAX_ROCKS && guard++ < MAX_ROCKS * 40) {
    const x = (10 + rng() * 170) * (rng() < 0.5 ? -1 : 1);
    const z = -60 + rng() * 110;
    const y = groundHeight(x, z);
    if (y < WORLD.waterY + 0.35 || y > 30) continue;
    if (Math.hypot(x - WORLD.cabin.x, z - WORLD.cabin.z) < 6) continue;
    const s = 0.5 + rng() * 1.7;
    dummy.position.set(x, y - s * 0.25, z);
    dummy.rotation.set(rng() * 0.4, rng() * Math.PI * 2, rng() * 0.4);
    dummy.scale.set(s, s * (0.6 + rng() * 0.5), s);
    dummy.updateMatrix();
    rocks.setMatrixAt(placed, dummy.matrix);
    placed++;
  }
  const placedRocks = placed;

  // ---- grass tufts (High tier only) ----
  const MAX_GRASS = TIERS.high.grassN;
  const grassGeo = grassGeometry(rng);
  ensureSeed(grassGeo, 0.5);
  const grassSeeds = new Float32Array(MAX_GRASS);
  for (let i = 0; i < MAX_GRASS; i++) grassSeeds[i] = rng();
  grassGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(grassSeeds, 1));
  const grassMat = makeToonMaterial(shared, { foliage: true, sway: 0.16, swayH: 0.9, snowCap: true, rim: 0.2, sunAmt: 0.9, name: 'grass' });
  const grass = new THREE.InstancedMesh(grassGeo, grassMat, MAX_GRASS);
  grass.frustumCulled = false;
  group.add(grass);

  placed = 0; guard = 0;
  while (placed < MAX_GRASS && guard++ < MAX_GRASS * 20) {
    const x = (12 + rng() * 95) * (rng() < 0.5 ? -1 : 1);
    const z = -4 + rng() * 46;
    const y = groundHeight(x, z);
    if (y < WORLD.waterY + 0.6) continue;
    dummy.position.set(x, y - 0.05, z);
    dummy.rotation.set(0, rng() * Math.PI * 2, 0);
    const s = 0.7 + rng() * 0.9;
    dummy.scale.set(s, s * (0.8 + rng() * 0.7), s);
    dummy.updateMatrix();
    grass.setMatrixAt(placed, dummy.matrix);
    placed++;
  }
  const placedGrass = placed;

  scene.add(group);

  return {
    group,
    update() { /* sway is in the vertex shader */ },
    applyTier(tier) {
      pines.count = Math.min(tier.pines, placedPines);
      rocks.count = Math.min(tier.rocks, placedRocks);
      grass.visible = !!tier.grass;
      grass.count = tier.grass ? Math.min(MAX_GRASS, placedGrass) : 0;
    },
    dispose() {
      scene.remove(group);
      [pineGeo, rockGeo, grassGeo].forEach(g => g.dispose());
      [pineMat, rockMat, grassMat].forEach(m => m.dispose());
    },
  };
}

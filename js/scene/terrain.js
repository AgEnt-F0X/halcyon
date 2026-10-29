// Terrain: foreground ground with a carved lake basin and valley walls,
// plus three atmospheric ridge silhouettes and distant snow peaks.
// Exports groundHeight(x, z) so forest/cabin placement matches the mesh exactly.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD, mulberry32, smooth } from '../config.js';
import { makeToonMaterial, ensureSeed } from './materials.js';

function hash2(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, seed, oct = 4) {
  let s = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { s += amp * vnoise(x * f, y * f, seed + i * 101); norm += amp; f *= 2; amp *= 0.5; }
  return s / norm;
}

const LK = WORLD.lake;

export function groundHeight(x, z) {
  let h = fbm(x * 0.013, z * 0.013, 7, 4) * 13 + 11;
  const side = smooth(55, 175, Math.abs(x));
  h += side * (9 + fbm(x * 0.02, z * 0.02, 11, 3) * 17);
  const bx = smooth(LK.x0 - 26, LK.x0 + 30, x) * (1 - smooth(LK.x1 - 30, LK.x1 + 26, x));
  const bz = smooth(LK.z0 - 26, LK.z0 + 26, z) * (1 - smooth(LK.z1 - 22, LK.z1 + 24, z));
  const basin = bx * bz;
  h = h * (1 - basin) + 3.8 * basin;
  const pd = Math.hypot(x - WORLD.cabin.x, z - WORLD.cabin.z);
  const pad = smooth(16, 7, pd);
  h = h * (1 - pad) + 11.2 * pad;
  // gentle lawn where the viewer stands, sloping down to the shore so the cabin
  // and lake stay in frame and the near ground catches low sun
  const corridor = smooth(28, 10, Math.abs(x)) * smooth(12, 26, z) * (1 - smooth(46, 66, z));
  const lawn = 12.6 + (10.2 - 12.6) * smooth(74, 14, z);
  h = h * (1 - corridor) + Math.min(h, lawn) * corridor;
  return h;
}

// Jitter the already-baked vertex colors per triangle (brush-stroke feel).
function jitterColors(geo, rng, j = 0.05) {
  const col = geo.getAttribute('color');
  const idx = geo.getIndex();
  const triCount = idx ? idx.count / 3 : col.count / 3;
  for (let t = 0; t < triCount; t++) {
    const m = 1 + (rng() * 2 - 1) * j;
    for (let k = 0; k < 3; k++) {
      const vi = idx ? idx.getX(t * 3 + k) : t * 3 + k;
      col.setXYZ(vi, col.getX(vi) * m, col.getY(vi) * m, col.getZ(vi) * m);
    }
  }
}

function ridgeGeometry({ z, base, amp, seed, segs = 150, x0 = -520, x1 = 520, tint = 0x6a8296, snowLine = 1e9 }) {
  const verts = [];
  const cols = [];
  const idx = [];
  const topC = new THREE.Color(tint);
  const botC = topC.clone().multiplyScalar(0.62);
  const snowC = new THREE.Color(0xe9edf4);
  const c = new THREE.Color();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, x = x0 + (x1 - x0) * t;
    const n = fbm(x * 0.006 + seed * 13.7, seed * 7.7, seed, 4);
    const y = base + Math.pow(n, 1.6) * amp;
    const v = 0.92 + 0.16 * fbm(x * 0.02, seed, seed + 5, 2);
    c.copy(topC).multiplyScalar(v);
    if (snowLine < 1e8 && y > snowLine + fbm(x * 0.03, seed * 3, seed + 9, 2) * 14) c.lerp(snowC, 0.92);
    verts.push(x, y, z, x, base - 30, z);
    cols.push(c.r, c.g, c.b, botC.r * v, botC.g * v, botC.b * v);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cols), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function createTerrain(ctx) {
  const { scene, shared } = ctx;
  const rng = mulberry32(1207);
  const group = new THREE.Group();
  const geometries = [];

  // ---- foreground ground ----
  const geo = new THREE.PlaneGeometry(560, 340, 120, 72);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -60);
  const pos = geo.getAttribute('position');
  const grass1 = new THREE.Color(0x597a49), grass2 = new THREE.Color(0x74885a);
  const rockC = new THREE.Color(0x8a8478), mudC = new THREE.Color(0x46523c);
  const c = new THREE.Color();
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = groundHeight(x, z);
    pos.setY(i, h);
    c.copy(grass1).lerp(grass2, fbm(x * 0.05, z * 0.05, 21, 3));
    c.lerp(rockC, smooth(24, 42, h) * 0.85);
    c.lerp(mudC, smooth(8.8, 4.5, h));
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  ensureSeed(geo, 0.5);
  jitterColors(geo, rng, 0.05);
  const groundMat = makeToonMaterial(shared, { ground: true, snowCap: true, rim: 0.08, sunAmt: 0.9, name: 'ground' });
  const ground = new THREE.Mesh(geo, groundMat);
  ground.frustumCulled = false;
  group.add(ground);
  geometries.push(geo);

  // ---- ridges: each farther band lighter, bluer, lower contrast ----
  const ridgeMatShared = makeToonMaterial(shared, { sunAmt: 0.3, rim: 0.12, name: 'ridge' });
  const ridgeDefs = [
    { z: -260, base: 20, amp: 46, seed: 31, tint: 0x54718c, snowLine: 1e9 },
    { z: -380, base: 26, amp: 62, seed: 57, tint: 0x64819c, snowLine: 1e9 },
    { z: -520, base: 34, amp: 78, seed: 83, tint: 0x7a92a8, snowLine: 74 },
  ];
  for (const d of ridgeDefs) {
    const g = ridgeGeometry({ ...d, segs: 150 });
    geometries.push(g);
    group.add(new THREE.Mesh(g, ridgeMatShared));
  }
  // distant snow peaks
  for (const [zx, seed, amp] of [[-700, 111, 120], [-720, 131, 132], [-680, 149, 104]]) {
    const g = ridgeGeometry({ z: zx, base: 30, amp, seed, segs: 110, x0: -620, x1: 620, tint: 0x93a4b8, snowLine: 52 });
    geometries.push(g);
    group.add(new THREE.Mesh(g, ridgeMatShared));
  }

  scene.add(group);

  return {
    group,
    groundHeight,
    update() { /* static */ },
    applyTier() { /* static */ },
    dispose() {
      scene.remove(group);
      geometries.forEach(g => g.dispose());
      groundMat.dispose();
      ridgeMatShared.dispose();
    },
  };
}

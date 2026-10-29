// Clouds: clumps of flat-bottomed icosahedron puffs, toon-lit with a bright
// sun-facing rim. Drift and torus-wrapping happen entirely in the vertex shader;
// cloud cover reveals instances by fraction — nothing pops.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../config.js';
import { ensureSeed } from './materials.js';

const CLOUD_VERT = /* glsl */`
attribute float aSeed;
varying vec3 vN, vW;
varying float vSeed, vVis;
uniform float uTime, uWindSpeed, uFrac;
uniform vec2 uWindDir;
void main() {
  vSeed = aSeed;
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  float sp = (2.0 + fract(aSeed * 7.31) * 2.8) * (0.25 + uWindSpeed);
  wp.x = mod(wp.x + uTime * sp * uWindDir.x + 280.0, 560.0) - 280.0;
  wp.z = mod(wp.z + uTime * sp * uWindDir.y + 280.0, 560.0) - 280.0;
  wp.y += sin(uTime * 0.07 + aSeed * 40.0) * 2.2;
  float vis = 1.0 - smoothstep(uFrac - 0.22, uFrac, fract(aSeed * 3.71));
  float edge = (1.0 - smoothstep(225.0, 280.0, abs(wp.x))) * (1.0 - smoothstep(235.0, 280.0, -wp.z));
  vVis = vis * edge;
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const CLOUD_FRAG = /* glsl */`
varying vec3 vN, vW;
varying float vSeed, vVis;
uniform vec3 uSunDir, uSunColor, uMoonDir, uMoonColor, uAmbSky, uFogColor;
uniform float uSunI, uMoonI, uFogDensity, uFogBase, uAlphaBase;
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main() {
  vec3 N = normalize(vN);
  vec3 L = normalize(uSunDir);
  float ndl = dot(N, L) * 0.5 + 0.5;
  float band = 0.30 * smoothstep(0.30, 0.42, ndl) + 0.42 * smoothstep(0.52, 0.62, ndl) + 0.28 * smoothstep(0.74, 0.84, ndl);
  vec3 shadowC = uAmbSky * 0.92;
  vec3 col = shadowC + (vec3(1.04) - shadowC) * band;
  vec3 Lm = normalize(uMoonDir);
  float ndm = dot(N, Lm) * 0.5 + 0.5;
  col += uMoonColor * (uMoonI * 0.30 * (0.4 + 0.6 * smoothstep(0.35, 0.8, ndm)));
  vec3 V = normalize(cameraPosition - vW);
  float rim = pow(1.0 - abs(dot(N, V)), 2.0) * max(dot(N, L), 0.0);
  col += uSunColor * rim * (0.55 * uSunI);
  float fog = 1.0 - exp(-length(cameraPosition - vW) * uFogDensity * 0.6);
  col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));
  col += (hash21(gl_FragCoord.xy) - 0.5) * (2.0 / 255.0);
  gl_FragColor = vec4(col, uAlphaBase * vVis);
}`;

function puffGeometry(rng, puffCount) {
  const parts = [];
  for (let i = 0; i < puffCount; i++) {
    const g = new THREE.IcosahedronGeometry(1, 1);
    // PolyhedronGeometry is non-indexed: displace deterministically per unique
    // corner (keyed on position) so coincident vertices stay welded.
    const pos = g.getAttribute('position');
    const seen = new Map();
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v), y0 = pos.getY(v), z = pos.getZ(v);
      const key = `${x.toFixed(3)}|${y0.toFixed(3)}|${z.toFixed(3)}`;
      let d = seen.get(key);
      if (d === undefined) {
        d = { rx: 0.8 + rng() * 0.4, ry: 0.62 + rng() * 0.25, rz: 0.8 + rng() * 0.4 };
        seen.set(key, d);
      }
      let y = y0 * d.ry;
      if (y < 0) y *= 0.22; // flat bottom
      pos.setXYZ(v, x * d.rx, y, z * d.rz);
    }
    g.computeVertexNormals();
    const s = 6 + rng() * 7;
    g.scale(s, s * 0.8, s);
    g.translate((rng() - 0.5) * 18, (rng() - 0.5) * 4, (rng() - 0.5) * 10);
    parts.push(g);
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach(p => p.dispose());
  return merged;
}

export function createClouds(ctx) {
  const { scene, shared } = ctx;
  const rng = mulberry32(9001);
  const group = new THREE.Group();
  const uniforms = Object.assign({}, shared, {
    uFrac: { value: 0.3 },
    uAlphaBase: { value: 0.92 },
  });
  const mat = new THREE.ShaderMaterial({
    vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG,
    uniforms, vertexColors: true, transparent: true, depthWrite: false,
  });

  const variants = [];
  const spots = [
    { x: -220, y: 78, z: -80 }, { x: -60, y: 92, z: -150 }, { x: 120, y: 70, z: -60 },
    { x: 230, y: 88, z: -170 }, { x: -150, y: 102, z: -220 }, { x: 30, y: 64, z: -110 },
    { x: 180, y: 108, z: -240 }, { x: -260, y: 86, z: -180 }, { x: 80, y: 96, z: -30 },
    { x: -30, y: 112, z: -260 }, { x: 280, y: 74, z: -120 }, { x: -190, y: 68, z: -40 },
    { x: 260, y: 100, z: -30 }, { x: -110, y: 80, z: -250 }, { x: 160, y: 84, z: -200 }, { x: -280, y: 96, z: -100 },
  ];
  const MAXC = 16;
  const geos = [];
  for (let v = 0; v < 3; v++) {
    const g = puffGeometry(rng, 4 + v + Math.floor(rng() * 2)); // 4-7 puffs
    ensureSeed(g, 0.5);
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 3).fill(1), 3));
    const seeds = new Float32Array(6);
    for (let i = 0; i < 6; i++) seeds[i] = rng();
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    geos.push(g);
    const mesh = new THREE.InstancedMesh(g, mat, 6);
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    variants.push(mesh);
    group.add(mesh);
  }
  // place instances at spread-out spots
  const dummy = new THREE.Object3D();
  let spot = 0;
  for (const mesh of variants) {
    for (let i = 0; i < 6; i++) {
      const s = spots[spot % spots.length]; spot++;
      dummy.position.set(s.x, s.y, s.z);
      dummy.scale.setScalar(0.85 + rng() * 0.5);
      dummy.rotation.y = rng() * Math.PI * 2;
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  scene.add(group);

  return {
    group,
    update() { /* drift is in the vertex shader */ },
    setCover(frac01) { uniforms.uFrac.value = 0.10 + frac01 * 0.9; },
    applyTier(tier) {
      const per = Math.ceil(tier.clouds / 3);
      variants.forEach(m => { m.count = Math.min(per, 6); });
    },
    dispose() {
      scene.remove(group);
      geos.forEach(g => g.dispose());
      mat.dispose();
    },
  };
}

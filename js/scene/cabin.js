// Cabin on the left third: low-poly walls + gabled roof + chimney, a pier into the
// lake, warm windows that fade in around sunset, chimney smoke drifting with the
// wind, and a flickering lantern on the pier.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD, mulberry32 } from '../config.js';
import { makeToonMaterial, ensureSeed, jitterVertexColors, makeSpriteTexture } from './materials.js';
import { groundHeight } from './terrain.js';

function box(w, h, d, x, y, z, rz = 0, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rz) g.rotateZ(rz);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

export function createCabin(ctx) {
  const { scene, shared } = ctx;
  const rng = mulberry32(777);
  const group = new THREE.Group();
  const gy = groundHeight(WORLD.cabin.x, WORLD.cabin.z);
  group.position.set(WORLD.cabin.x, gy, WORLD.cabin.z);
  group.scale.setScalar(1.25);
  group.rotation.y = 0.06;

  // ---- structure (one merged geometry, vertex-coloured) ----
  const wood = 0x5c4632, woodDark = 0x4a3828, roofC = 0x3d4448, stoneC = 0x77746c;
  const parts = [
    ...[box(5.2, 2.6, 4.2, 0, 1.3, 0)],                                   // walls
    box(3.3, 0.16, 4.9, -1.45, 3.24, 0, 0.44),                            // roof left
    box(3.3, 0.16, 4.9, 1.45, 3.24, 0, -0.44),                            // roof right
    box(0.55, 1.8, 0.55, 1.2, 4.05, -0.8),                                // chimney
    box(1.5, 0.14, 23, 1.5, -1.2, -13.5),                                 // pier deck
    box(1.5, 0.14, 23, 1.5, -1.45, -13.5),                                // deck under-layer
    box(0.16, 2.2, 0.16, 0.9, -2.3, -4.5),                                // posts
    box(0.16, 2.2, 0.16, 2.1, -2.3, -4.5),
    box(0.16, 2.4, 0.16, 0.9, -2.4, -11),
    box(0.16, 2.4, 0.16, 2.1, -2.4, -11),
    box(0.16, 2.6, 0.16, 0.9, -2.5, -17.5),
    box(0.16, 2.6, 0.16, 2.1, -2.5, -17.5),
    box(0.08, 1.25, 0.08, 1.5, -0.35, -22.5),                             // lantern post
  ];
  const colors = [wood, roofC, roofC, stoneC, woodDark, woodDark, woodDark, woodDark, woodDark, woodDark, woodDark, woodDark, woodDark, woodDark];
  const mergedParts = [];
  parts.forEach((g, i) => {
    jitterVertexColors(g, colors[i] || wood, rng, 0.06);
    mergedParts.push(g);
  });
  const cabinGeo = mergeGeometries(mergedParts, false);
  mergedParts.forEach(g => g.dispose());
  ensureSeed(cabinGeo, 0.5);
  const cabinMat = makeToonMaterial(shared, { snowCap: true, rim: 0.5, sunAmt: 1, name: 'cabin' });
  const cabinMesh = new THREE.Mesh(cabinGeo, cabinMat);
  group.add(cabinMesh);

  // ---- windows (emissive, fade in at dusk) ----
  const glowTex = makeSpriteTexture('glow');
  const winUniforms = { uGlow: { value: 0 }, uTime: shared.uTime, uFogColor: shared.uFogColor, uFogDensity: shared.uFogDensity, uFogBase: shared.uFogBase };
  const WIN_FRAG = /* glsl */`
    varying vec2 vUv;
    varying float vFog;
    uniform float uGlow, uTime, uFogDensity, uFogBase;
    uniform vec3 uFogColor;
    void main() {
      float fl = 0.88 + 0.12 * sin(uTime * 2.7 + sin(uTime * 5.3) * 2.0);
      vec3 col = mix(vec3(0.10, 0.13, 0.18), vec3(1.0, 0.62, 0.28) * 1.15 * fl, uGlow);
      if (abs(vUv.x - 0.5) < 0.035 || abs(vUv.y - 0.5) < 0.05) col *= 0.4;
      col = mix(col, uFogColor, clamp(vFog, 0.0, 1.0));
      gl_FragColor = vec4(col, 1.0);
    }`;
  const WIN_VERT = /* glsl */`
    varying vec2 vUv;
    varying float vFog;
    uniform float uFogDensity, uFogBase;
    void main() {
      vUv = uv;
      vec4 wp = modelMatrix * vec4(position, 1.0);
      float pool = exp(-max(wp.y - uFogBase, 0.0) * 0.05);
      vFog = 1.0 - exp(-length(cameraPosition - wp.xyz) * uFogDensity * (0.45 + pool));
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`;
  const winMat = new THREE.ShaderMaterial({ vertexShader: WIN_VERT, fragmentShader: WIN_FRAG, uniforms: winUniforms });
  const winGeo = new THREE.PlaneGeometry(0.72, 0.92);
  const windows = [];
  for (const wx of [-1.35, 1.35]) {
    const w = new THREE.Mesh(winGeo, winMat);
    w.position.set(wx, 1.5, 2.115);
    group.add(w);
    windows.push(w);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xff9a4a, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    spr.scale.setScalar(2.6);
    spr.position.set(wx, 1.5, 2.4);
    spr.userData.isWindow = true;
    group.add(spr);
    windows.push(spr);
  }
  // lantern head (emissive)
  const lanternMat = new THREE.ShaderMaterial({ vertexShader: WIN_VERT, fragmentShader: WIN_FRAG, uniforms: { ...winUniforms, uGlow: { value: 0 } } });
  const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.32, 0.26), lanternMat);
  lantern.position.set(1.5, 0.42, -22.5);
  group.add(lantern);
  const lanternSpr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xffb060, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  lanternSpr.scale.setScalar(2.2);
  lanternSpr.position.set(1.5, 0.42, -22.3);
  group.add(lanternSpr);

  // ---- smoke (7 billboarded puffs, fully shader-animated) ----
  const SMOKE_VERT = /* glsl */`
    attribute float aSeed;
    varying vec2 vUv;
    varying float vA;
    uniform float uTime, uWindSpeed;
    uniform vec2 uWindDir;
    void main() {
      vUv = uv;
      float life = fract(uTime * 0.085 + aSeed);
      vec3 pos = vec3(1.2, 5.05, -0.8);
      pos.xz += uWindDir * (life * (5.0 + uWindSpeed * 30.0));
      pos.y += life * (7.5 + aSeed * 4.0);
      pos.x += sin(uTime * 0.7 + aSeed * 40.0 + life * 7.0) * life * 1.4;
      float size = mix(0.55, 2.9, life) * (0.8 + aSeed * 0.6);
      vA = (1.0 - life) * smoothstep(0.0, 0.10, life);
      vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
      vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
      vec4 wp = modelMatrix * vec4(pos, 1.0);
      wp.xyz += (right * position.x + up * position.y) * size;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`;
  const SMOKE_FRAG = /* glsl */`
    varying vec2 vUv;
    varying float vA;
    uniform sampler2D uMap;
    uniform vec3 uAmbSky;
    void main() {
      float a = texture2D(uMap, vUv).a * vA * 0.30;
      vec3 col = mix(vec3(0.75, 0.77, 0.8), uAmbSky * 1.1, 0.4);
      gl_FragColor = vec4(col, a);
    }`;
  const smokeGeo = new THREE.PlaneGeometry(1, 1);
  const seeds = new Float32Array(7);
  for (let i = 0; i < 7; i++) seeds[i] = rng();
  smokeGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  const smokeMat = new THREE.ShaderMaterial({
    vertexShader: SMOKE_VERT, fragmentShader: SMOKE_FRAG,
    uniforms: { uTime: shared.uTime, uWindSpeed: shared.uWindSpeed, uWindDir: shared.uWindDir, uAmbSky: shared.uAmbSky, uMap: { value: makeSpriteTexture('smoke') } },
    transparent: true, depthWrite: false,
  });
  const smoke = new THREE.InstancedMesh(smokeGeo, smokeMat, 7);
  smoke.frustumCulled = false;
  group.add(smoke);

  // ---- soft blob shadow ----
  const blobMat = new THREE.MeshBasicMaterial({
    map: glowTex, color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false,
  });
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(9, 7), blobMat);
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.04;
  group.add(blob);

  scene.add(group);
  const sprites = windows.filter(w => w.isSprite).concat([lanternSpr]);

  return {
    group,
    update() { /* windows/smoke are shader-driven; glow values set via setGlow/setLantern */ },
    setGlow(v) {
      winUniforms.uGlow.value = v;
      for (const s of sprites) if (s.userData.isWindow) s.material.opacity = v * 0.55;
    },
    setLantern(v) {
      lanternMat.uniforms.uGlow.value = v;
      lanternSpr.material.opacity = v * 0.8;
    },
    applyTier() { /* static */ },
    dispose() {
      scene.remove(group);
      cabinGeo.dispose(); cabinMat.dispose(); winGeo.dispose(); winMat.dispose();
      lantern.geometry.dispose(); lanternMat.dispose();
      smokeGeo.dispose(); smokeMat.dispose(); smokeMat.uniforms.uMap.value.dispose();
      blob.geometry.dispose(); blobMat.dispose();
      sprites.forEach(s => s.material.dispose());
      glowTex.dispose();
    },
  };
}

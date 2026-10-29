// Weather FX: GPU-driven rain streaks, snow, fireflies and lightning.
// Every particle's position is f(time, seed) in the vertex shader — zero CPU updates.

import * as THREE from 'three';
import { mulberry32 } from '../config.js';
import { makeSpriteTexture } from './materials.js';

const PRECIP_VERT = /* glsl */`
attribute float aSeed;
varying float vA;
uniform float uTime, uIntensity, uWindSpeed, uSize, uMode; // uMode 0 = rain, 1 = snow
uniform vec2 uWindDir;
void main() {
  vec3 seed = position; // packed 0..1 seeds
  float H = 64.0;
  float speed = uMode < 0.5 ? (40.0 + aSeed * 16.0) : (1.4 + aSeed * 1.6);
  float y = mod(seed.y * H - uTime * speed, H);
  vec3 base = vec3((seed.x - 0.5) * 140.0, 0.0, (seed.z - 0.5) * 160.0);
  if (uMode < 0.5) {
    base.xz += (H - y) * uWindDir * (0.22 + uWindSpeed * 0.8);
  } else {
    base.x += sin(uTime * (0.5 + aSeed) + aSeed * 40.0) * 3.0;
    base.z += cos(uTime * (0.4 + aSeed * 0.7) + aSeed * 30.0) * 2.5;
  }
  vec3 wp = vec3(cameraPosition.x + base.x, cameraPosition.y + (y - H * 0.52), cameraPosition.z + base.z);
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  float edge = smoothstep(0.0, 6.0, y) * (1.0 - smoothstep(H - 10.0, H, y));
  vA = uIntensity * edge;
  gl_PointSize = min(uSize * (0.6 + aSeed * 0.8) * (300.0 / max(-mv.z, 1.0)), uMode < 0.5 ? 42.0 : 13.0);
  gl_Position = projectionMatrix * mv;
}`;

const PRECIP_FRAG = /* glsl */`
varying float vA;
uniform sampler2D uMap;
uniform vec3 uColor;
uniform float uOpacity;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float alpha = texture2D(uMap, uv + 0.5).a * vA * uOpacity;
  if (alpha < 0.003) discard;
  gl_FragColor = vec4(uColor, alpha);
}`;

const FIREFLY_VERT = /* glsl */`
attribute float aSeed;
varying float vA;
uniform float uTime, uIntensity;
void main() {
  vec3 base = position; // baked world position
  float t = uTime;
  vec3 p = base + vec3(
    sin(t * (0.31 + aSeed * 0.2) + aSeed * 30.0) * 2.2,
    sin(t * (0.23 + aSeed * 0.17) + aSeed * 50.0) * 1.1,
    cos(t * (0.27 + aSeed * 0.15) + aSeed * 40.0) * 2.0);
  float pulse = pow(0.5 + 0.5 * sin(t * (1.1 + aSeed * 1.6) + aSeed * 20.0), 3.0);
  vA = uIntensity * (0.15 + 0.85 * pulse);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_PointSize = (1.8 + aSeed * 2.2) * (300.0 / max(-mv.z, 1.0));
  gl_Position = projectionMatrix * mv;
}`;

export function createWeatherFx(ctx) {
  const { scene, shared } = ctx;
  const rng = mulberry32(5150);
  const group = new THREE.Group();

  const rainMat = new THREE.ShaderMaterial({
    vertexShader: PRECIP_VERT, fragmentShader: PRECIP_FRAG,
    uniforms: {
      uTime: shared.uTime, uWindSpeed: shared.uWindSpeed, uWindDir: shared.uWindDir,
      uIntensity: { value: 0 }, uSize: { value: 7.0 }, uMode: { value: 0 },
      uMap: { value: makeSpriteTexture('streak') }, uColor: { value: new THREE.Color(0xaebdd0) }, uOpacity: { value: 0.42 },
    },
    transparent: true, depthWrite: false,
  });
  const snowMat = new THREE.ShaderMaterial({
    vertexShader: PRECIP_VERT, fragmentShader: PRECIP_FRAG,
    uniforms: {
      uTime: shared.uTime, uWindSpeed: shared.uWindSpeed, uWindDir: shared.uWindDir,
      uIntensity: { value: 0 }, uSize: { value: 4.5 }, uMode: { value: 1 },
      uMap: { value: makeSpriteTexture('flake') }, uColor: { value: new THREE.Color(0xffffff) }, uOpacity: { value: 0.85 },
    },
    transparent: true, depthWrite: false,
  });
  const fireflyMat = new THREE.ShaderMaterial({
    vertexShader: FIREFLY_VERT, fragmentShader: PRECIP_FRAG,
    uniforms: {
      uTime: shared.uTime, uIntensity: { value: 0 },
      uMap: { value: makeSpriteTexture('glow') }, uColor: { value: new THREE.Color(0xd8e874) }, uOpacity: { value: 0.45 },
    },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });

  function makePoints(mat, count, fillPos) {
    const pos = new Float32Array(count * 3);
    fillPos(pos, count);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) seeds[i] = rng();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    const p = new THREE.Points(g, mat);
    p.frustumCulled = false;
    group.add(p);
    return p;
  }

  const MAX_RAIN = 1400, MAX_SNOW = 1200, MAX_FF = 140;
  const rain = makePoints(rainMat, MAX_RAIN, (pos, n) => {
    for (let i = 0; i < n * 3; i++) pos[i] = rng();
  });
  const snow = makePoints(snowMat, MAX_SNOW, (pos, n) => {
    for (let i = 0; i < n * 3; i++) pos[i] = rng();
  });
  const fireflies = makePoints(fireflyMat, MAX_FF, (pos, n) => {
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (rng() - 0.5) * 120;
      pos[i * 3 + 1] = 9.2 + rng() * 4.5;
      pos[i * 3 + 2] = -28 + rng() * 36;
    }
  });

  // ---- lightning ----
  const boltGeo = new THREE.BufferGeometry();
  const boltPos = new Float32Array(18 * 3);
  boltGeo.setAttribute('position', new THREE.BufferAttribute(boltPos, 3));
  const boltMat = new THREE.LineBasicMaterial({
    color: 0xeaf0ff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const bolt = new THREE.Line(boltGeo, boltMat);
  bolt.frustumCulled = false;
  bolt.visible = false;
  group.add(bolt);

  let flash = 0;
  let nextStrike = 20 + rng() * 20;
  let boltLife = 0;
  const strikeAt = new THREE.Vector3();

  function makeBolt() {
    strikeAt.set((rng() - 0.5) * 420, 0, -300 - rng() * 260);
    const topY = 95 + rng() * 40;
    const botY = 30 + rng() * 25;
    const n = 9 + Math.floor(rng() * 5);
    let x = strikeAt.x, z = strikeAt.z;
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1);
      boltPos[i * 3] = x; boltPos[i * 3 + 1] = topY + (botY - topY) * f; boltPos[i * 3 + 2] = z;
      x += (rng() - 0.5) * 16; z += (rng() - 0.5) * 10;
    }
    boltGeo.setDrawRange(0, n);
    boltGeo.attributes.position.needsUpdate = true;
    boltGeo.computeBoundingSphere();
  }

  scene.add(group);

  return {
    group,
    update(dt, t, stormOn) {
      // lightning scheduling
      if (stormOn) {
        if (t > nextStrike) {
          nextStrike = t + 4 + rng() * 11;
          if (rng() < 0.55) { makeBolt(); bolt.visible = true; boltLife = 0.3; flash = 1; }
          else flash = Math.max(flash, 0.5); // distant sheet flash
        }
      }
      if (boltLife > 0) {
        boltLife -= dt;
        boltMat.opacity = Math.max(0, boltLife / 0.3);
        if (boltLife <= 0) bolt.visible = false;
      }
      flash *= Math.exp(-dt * 9);
      shared.uFlash.value = Math.min(1, flash + (boltLife > 0 ? 0.25 : 0));
      shared.uLightning.value = shared.uFlash.value; // ground-level flash brightening
    },
    setFirefly(v) { fireflyMat.uniforms.uIntensity.value = v; },
    setRain(v) { rainMat.uniforms.uIntensity.value = v; },
    setSnow(v) { snowMat.uniforms.uIntensity.value = v; },
    applyTier(tier) {
      rain.count = Math.round(MAX_RAIN * Math.min(1, tier.fxMul));
      snow.count = Math.round(MAX_SNOW * Math.min(1, tier.fxMul));
      fireflies.count = tier.fireflies;
    },
    dispose() {
      scene.remove(group);
      [rain, snow, fireflies].forEach(p => p.geometry.dispose());
      [rainMat, snowMat, fireflyMat].forEach(m => { m.uniforms.uMap.value.dispose(); m.dispose(); });
      boltGeo.dispose(); boltMat.dispose();
    },
  };
}

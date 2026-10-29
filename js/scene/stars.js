// Stars: Points on a camera-locked dome, per-star size/twinkle in the shader,
// plus one rare pre-authored shooting star. Occluded by ridges via depth test.

import * as THREE from 'three';
import { mulberry32 } from '../config.js';
import { makeSpriteTexture } from './materials.js';

const STAR_VERT = /* glsl */`
attribute float aSize;
attribute float aSeed;
varying float vA;
varying vec3 vC;
uniform float uTime, uNightLocal, uPr;
void main() {
  float tw = 0.55 + 0.45 * sin(uTime * (0.8 + fract(aSeed * 5.0) * 2.4) + aSeed * 70.0);
  vA = uNightLocal * (0.35 + 0.65 * tw);
  vC = color;
  vec4 mv = viewMatrix * modelMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uPr * (0.85 + tw * 0.5);
  gl_Position = projectionMatrix * mv;
}`;

const STAR_FRAG = /* glsl */`
varying float vA;
varying vec3 vC;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.08, d) * vA;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vC, a);
}`;

export function createStars(ctx) {
  const { scene, shared } = ctx;
  const rng = mulberry32(31337);
  const group = new THREE.Group();

  const MAX_STARS = 2500;
  const pos = new Float32Array(MAX_STARS * 3);
  const col = new Float32Array(MAX_STARS * 3);
  const sizes = new Float32Array(MAX_STARS);
  const seeds = new Float32Array(MAX_STARS);
  const c = new THREE.Color();
  for (let i = 0; i < MAX_STARS; i++) {
    // upper hemisphere, denser toward the zenith
    const y = Math.pow(rng(), 0.6);
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(1 - y * y);
    pos[i * 3] = Math.cos(a) * r * 940;
    pos[i * 3 + 1] = y * 940;
    pos[i * 3 + 2] = Math.sin(a) * r * 940;
    const warm = rng();
    c.setRGB(0.82 + warm * 0.18, 0.85 + warm * 0.1, 0.95 + (1 - warm) * 0.05);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    const big = rng() < 0.08;
    sizes[i] = big ? 3.4 + rng() * 1.6 : 1.1 + rng() * 1.7;
    seeds[i] = rng();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  const uniforms = Object.assign({}, shared, { uPr: { value: 1 }, uNightLocal: { value: 0 } });
  const mat = new THREE.ShaderMaterial({
    vertexShader: STAR_VERT, fragmentShader: STAR_FRAG,
    uniforms, vertexColors: true, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.renderOrder = 2;
  points.frustumCulled = false;
  group.add(points);

  // ---- shooting star ----
  const streakTex = makeSpriteTexture('shaft');
  const streakMat = new THREE.MeshBasicMaterial({
    map: streakTex, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const streakGeo = new THREE.PlaneGeometry(1, 3);
  streakGeo.translate(0.5, 0, 0); // anchored at head, stretches along +x
  const streak = new THREE.Mesh(streakGeo, streakMat);
  streak.visible = false;
  streak.frustumCulled = false;
  streak.renderOrder = 2;
  group.add(streak);

  let shootT = -1;            // <0 = idle
  let nextShoot = 8 + rng() * 14;
  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), cur = new THREE.Vector3();
  const dir = new THREE.Vector3(), xaxis = new THREE.Vector3(1, 0, 0);

  scene.add(group);

  return {
    group,
    update(dt, t, camera, cloud01) {
      group.position.copy(camera.position);
      mat.uniforms.uPr.value = ctx.renderer.getPixelRatio();
      // stars fade with night factor and get dimmed by cloud cover
      mat.uniforms.uNightLocal.value = shared.uNight.value * (1 - cloud01 * 0.75);

      if (shootT < 0 && shared.uNight.value > 0.7 && cloud01 < 0.6 && t > nextShoot) {
        shootT = 0;
        nextShoot = t + 10 + rng() * 18;
        const a = rng() * Math.PI * 2;
        p0.set(Math.cos(a) * 700, 420 + rng() * 260, -350 - Math.abs(Math.cos(a)) * 300);
        dir.set((rng() - 0.5) * 500, -160 - rng() * 120, -120).normalize();
        p1.copy(p0).addScaledVector(dir, 420);
        streak.visible = true;
      }
      if (shootT >= 0) {
        shootT += dt;
        const e = shootT / 1.0;
        if (e >= 1) { shootT = -1; streak.visible = false; streakMat.opacity = 0; }
        else {
          cur.lerpVectors(p0, p1, e);
          streak.position.copy(cur);
          dir.subVectors(p1, p0).normalize();
          streak.quaternion.setFromUnitVectors(xaxis, dir);
          streak.scale.set(150, 4, 1);
          streakMat.opacity = Math.sin(e * Math.PI) * 0.85 * shared.uNight.value;
        }
      }
    },
    applyTier(tier) { points.count = Math.min(2500, tier.stars); },
    dispose() {
      scene.remove(group);
      geo.dispose(); mat.dispose();
      streakGeo.dispose(); streakMat.dispose(); streakTex.dispose();
    },
  };
}

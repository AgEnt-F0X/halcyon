// HALCYON shader family — the Ferrofluid Core engine.
// Ashima simplex noise, 2-octave domain warping, magnetic mouse spikes,
// Inigo Quilez cosine iridescence, sharp Fresnel rims, fwidth grid overlays,
// curved topographic floor with rolling shockwaves, and the particle stream.
// Compiled once; chapter changes only ever write uniforms.

import * as THREE from 'three';

export function createSharedUniforms() {
  return {
    uTime: { value: 0 },
    uWaveSpeed: { value: 1 },          // tuner: global field speed
    uTurbulence: { value: 1 },         // tuner: particle turbulence
    uScrollVelocity: { value: 0 },     // signed normalized scroll velocity
    uMouse: { value: new THREE.Vector2(0, 0) },        // NDC cursor
    uMouse3D: { value: new THREE.Vector3(0, 0.4, 3) }, // cursor on the sculpture
    uColorPrimary: { value: new THREE.Color('#06070A') },   // background ink
    uColorSecondary: { value: new THREE.Color('#F4F1EA') }, // primary glow
    uColorAccent: { value: new THREE.Color('#E5A93C') },    // secondary accent
    uFormationF: { value: 0 },         // damped particle mode float
    uParticleSize: { value: 1 },
    uAspect: { value: 1.6 },
  };
}

// ---------------------------------------------------------------------------
// Ashima 3D simplex noise (shared GLSL chunk)
// ---------------------------------------------------------------------------
export const NOISE_GLSL = /* glsl */`
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

// ---------------------------------------------------------------------------
// THE FERROFLUID CORE — IcosahedronGeometry(2.6, 64) with 2-octave domain-
// warped simplex displacement, magnetic mouse spikes, IQ cosine iridescence,
// sharp Fresnel rim, specular highlights and an fwidth lat/long grid overlay.
// ---------------------------------------------------------------------------
const CORE_VERT = /* glsl */`
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vObj;
varying float vNoise;
varying float vDisp;
uniform float uTime, uMorphSpeed, uNoiseFreq, uAmp;
uniform float uMouseInfluence, uSpike;
uniform vec3 uMouse3D;
${NOISE_GLSL}

void main() {
  vec3 p = position;
  vec3 n = normal;

  // 2-octave domain warping of the noise domain
  vec3 q = p * uNoiseFreq;
  vec3 w1 = vec3(
    snoise(q + vec3(0.0, 0.0, uTime * 0.05)),
    snoise(q + vec3(5.2, 1.3, -uTime * 0.04)),
    snoise(q + vec3(-3.1, 7.7, uTime * 0.03)));
  vec3 w2 = vec3(
    snoise(q * 2.1 + w1 * 0.9 + vec3(uTime * 0.03, 0.0, 0.0)),
    snoise(q * 2.1 + w1 * 0.9 + vec3(0.0, uTime * 0.026, 4.4)),
    snoise(q * 2.1 + w1 * 0.9 + vec3(8.8, 0.0, -uTime * 0.02)));
  vec3 warped = q + w1 * 0.42 + w2 * 0.22;

  // silk undulation along the normal
  float n1 = snoise(warped + vec3(0.0, uTime * uMorphSpeed, 0.0));
  float n2 = 0.5 * snoise(warped * 2.3 - vec3(0.0, uTime * uMorphSpeed * 1.45, 0.0));
  float disp = (n1 + n2) * uAmp;

  // magnetic ferrofluid pull toward the cursor
  vec4 world4 = modelMatrix * vec4(p, 1.0);
  vec3 world = world4.xyz;
  float md = distance(world, uMouse3D);
  float pull = exp(-md * md * 0.42) * uMouseInfluence;
  vec3 pullDir = (uMouse3D - world) / max(md, 0.0001);

  p += n * disp + pullDir * pull * uSpike;

  vNoise = n1 + n2;
  vDisp = disp + pull * uSpike * 0.5;
  vObj = position;
  vNormalW = normalize(mat3(modelMatrix) * n);
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const CORE_FRAG = /* glsl */`
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vObj;
varying float vNoise;
varying float vDisp;
uniform float uTime, uFaceted, uGridI, uGridF;
uniform vec3 uPalA, uPalB, uPalC, uPalD;
uniform vec3 uRimColor, uSpecColor;

void main() {
  // faceted (derivative) vs smooth normals — geodesic mode flips this
  vec3 flatN = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  vec3 N = normalize(mix(normalize(vNormalW), flatN, uFaceted));
  vec3 V = normalize(cameraPosition - vWorld);

  // Inigo Quilez cosine iridescent palette
  float t = vNoise * 0.32 + vDisp * 0.14 + uTime * 0.018 + vObj.y * 0.055;
  vec3 iri = uPalA + uPalB * cos(6.28318 * (uPalC * t + uPalD));

  // base metal: dark chrome folded with the iridescence
  vec3 col = mix(iri * 0.22, iri, smoothstep(-0.7, 1.1, vNoise) * 0.85);
  col += vec3(0.045, 0.05, 0.062); // obsidian lift

  // sharp fresnel rim
  float fres = pow(1.0 - abs(dot(N, V)), 3.0);
  col += uRimColor * fres * 1.55;

  // specular highlight
  vec3 L = normalize(vec3(0.45, 0.85, 0.55));
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 72.0);
  col += uSpecColor * spec * 1.15;

  // secondary spec from below (molten bounce)
  vec3 L2 = normalize(vec3(-0.4, -0.6, 0.35));
  float spec2 = pow(max(dot(N, normalize(L2 + V)), 0.0), 34.0);
  col += uRimColor * spec2 * 0.35;

  // dynamic lat/long wireframe grid overlay (fwidth antialiased)
  float u = atan(vObj.z, vObj.x) / 6.28318 + 0.5;
  float v = vObj.y / 5.2 + 0.5;
  vec2 g = vec2(u * 18.0 * uGridF, v * 12.0 * uGridF);
  vec2 gw = abs(fract(g - 0.5) - 0.5) / max(fwidth(g), vec2(1e-4));
  float grid = 1.0 - clamp(min(gw.x, gw.y) / 1.4, 0.0, 1.0);
  col += uRimColor * grid * uGridI * (0.5 + 0.5 * fres);

  gl_FragColor = vec4(col, 1.0);
}`;

export function createCoreMaterial(shared) {
  return new THREE.ShaderMaterial({
    vertexShader: CORE_VERT,
    fragmentShader: CORE_FRAG,
    uniforms: {
      uTime: shared.uTime,
      uMouse3D: shared.uMouse3D,
      // per-chapter sculpt parameters (lerped by matrix.js)
      uMorphSpeed: { value: 0.32 },
      uNoiseFreq: { value: 1.15 },
      uAmp: { value: 0.34 },
      uMouseInfluence: { value: 0.0 },
      uSpike: { value: 0.9 },
      uFaceted: { value: 0.0 },
      uGridI: { value: 0.18 },
      uGridF: { value: 1.0 },
      uPalA: { value: new THREE.Vector3(0.03, 0.03, 0.04) },
      uPalB: { value: new THREE.Vector3(0.55, 0.50, 0.45) },
      uPalC: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
      uPalD: { value: new THREE.Vector3(0.00, 0.06, 0.12) },
      uRimColor: { value: new THREE.Color('#E5A93C') },
      uSpecColor: { value: new THREE.Color('#4DD8FF') },
    },
  });
}

// Per-chapter sculpt presets: [freq, amp, speed, faceted, gridI, gridF, rim, spec, palA, palB, palC, palD]
import { Color, Vector3 } from 'three';
export const CORE_PRESETS = [
  { // 0 hero — liquid chrome obsidian, molten gold + electric cyan
    freq: 1.15, amp: 0.34, speed: 0.32, faceted: 0, gridI: 0.16, gridF: 1.0,
    rim: '#E5A93C', spec: '#4DD8FF',
    palA: [0.03, 0.03, 0.04], palB: [0.55, 0.50, 0.45],
    palC: [1.0, 1.0, 1.0], palD: [0.00, 0.06, 0.12],
  },
  { // 1 apex — carbon + crimson laser ripples, fast rhythmic spikes
    freq: 2.8, amp: 0.5, speed: 1.6, faceted: 0, gridI: 0.24, gridF: 1.4,
    rim: '#FF3366', spec: '#9D4EDD',
    palA: [0.02, 0.02, 0.03], palB: [0.5, 0.28, 0.42],
    palC: [1.0, 0.9, 1.1], palD: [0.55, 0.30, 0.75],
  },
  { // 2 studypulse — harmonic cymatics crystalline, indigo + mint
    freq: 1.6, amp: 0.3, speed: 0.5, faceted: 0, gridI: 0.3, gridF: 1.8,
    rim: '#00F5D4', spec: '#6366F1',
    palA: [0.02, 0.04, 0.05], palB: [0.32, 0.55, 0.5],
    palC: [1.0, 1.0, 0.9], palD: [0.25, 0.7, 0.45],
  },
  { // 3 kaamsaarthi — geodesic faceted globe, emerald + warm amber meridians
    freq: 2.2, amp: 0.42, speed: 0.22, faceted: 1, gridI: 0.5, gridF: 1.2,
    rim: '#10B981', spec: '#F97316',
    palA: [0.03, 0.04, 0.03], palB: [0.35, 0.5, 0.38],
    palC: [1.0, 0.85, 1.0], palD: [0.45, 0.15, 0.6],
  },
  { // 4 asl — synaptic neural plasma, electric green + sky filaments
    freq: 3.4, amp: 0.24, speed: 1.1, faceted: 0, gridI: 0.34, gridF: 2.4,
    rim: '#10F587', spec: '#38BDF8',
    palA: [0.02, 0.03, 0.03], palB: [0.4, 0.6, 0.45],
    palC: [1.0, 1.1, 0.9], palD: [0.65, 0.85, 0.3],
  },
];

// ---------------------------------------------------------------------------
// Topographic horizon floor: curved wireframe grid with rolling scroll
// shockwaves. PlaneGeometry(60, 40, 90, 60) at y = -4.4.
// ---------------------------------------------------------------------------
const FLOOR_VERT = /* glsl */`
varying vec3 vWorld;
varying vec2 vUvF;
uniform float uTime, uScrollVelocity;
${NOISE_GLSL}
void main() {
  vec3 p = position;
  // gentle topographic breathing
  float n = snoise(vec3(p.x * 0.09, p.y * 0.12, uTime * 0.06));
  p.z += n * 0.55;
  vec4 w = modelMatrix * vec4(p, 1.0);
  // curve the horizon down for deep perspective
  w.y -= pow(max(w.z + 14.0, 0.0) * 0.062, 2.0);
  vWorld = w.xyz;
  vUvF = uv;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FLOOR_FRAG = /* glsl */`
varying vec3 vWorld;
varying vec2 vUvF;
uniform float uTime;
uniform vec3 uColorSecondary, uColorAccent;
uniform vec4 uPulse0, uPulse1, uPulse2; // x: originZ, y: radius, z: strength, w: unused

float gridLine(vec2 p, float scale, float thick) {
  vec2 q = p / scale;
  vec2 g = abs(fract(q - 0.5) - 0.5) / max(fwidth(q), vec2(1e-4));
  return 1.0 - clamp(min(g.x, g.y) / thick, 0.0, 1.0);
}

float pulseGlow(vec4 P, vec3 w) {
  if (P.z < 0.004) return 0.0;
  float d = abs(distance(w.xz, vec2(0.0, P.x)) - P.y);
  return exp(-d * d * 0.55) * P.z;
}

void main() {
  float minor = gridLine(vWorld.xz, 0.8, 1.4) * 0.20;
  float major = gridLine(vWorld.xz, 4.0, 1.7) * 0.42;

  float pu = max(max(pulseGlow(uPulse0, vWorld), pulseGlow(uPulse1, vWorld)), pulseGlow(uPulse2, vWorld));

  vec3 col = uColorSecondary * (minor + major);
  col += uColorAccent * pu * 1.4;

  // horizon + near fade
  float dist = distance(vWorld, cameraPosition);
  float fade = (1.0 - smoothstep(18.0, 52.0, dist)) * smoothstep(-6.0, -1.5, vWorld.z - cameraPosition.z + 16.0);
  float alpha = clamp(minor + major + pu, 0.0, 1.0) * fade;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(col, alpha);
}`;

export function createFloorMaterial(shared) {
  return new THREE.ShaderMaterial({
    vertexShader: FLOOR_VERT,
    fragmentShader: FLOOR_FRAG,
    uniforms: {
      uTime: shared.uTime,
      uColorSecondary: shared.uColorSecondary,
      uColorAccent: shared.uColorAccent,
      uPulse0: { value: new THREE.Vector4(0, 0, 0, 0) },
      uPulse1: { value: new THREE.Vector4(0, 0, 0, 0) },
      uPulse2: { value: new THREE.Vector4(0, 0, 0, 0) },
    },
    transparent: true,
    depthWrite: false,
  });
}

// ---------------------------------------------------------------------------
// Particle stream: positions arrive fully integrated from the CPU spring
// engine; the GPU adds cursor proximity glow, size attenuation, palette mix.
// ---------------------------------------------------------------------------
const STREAM_VERT = /* glsl */`
attribute float aSeed;
varying float vSeed;
varying float vGlow;
varying float vFade;
uniform float uTime, uParticleSize, uFormationF;
uniform vec3 uMouse3D;
void main() {
  vec3 p = position;
  // organic micro-drift so nothing ever looks frozen
  p.x += sin(uTime * 0.6 + aSeed * 41.0) * 0.05;
  p.y += cos(uTime * 0.5 + aSeed * 27.0) * 0.05;
  p.z += sin(uTime * 0.7 + aSeed * 19.0) * 0.05;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float dist = -mv.z;
  float md = distance(p, uMouse3D);
  vGlow = exp(-md * 0.55);
  vFade = clamp(1.0 - smoothstep(16.0, 34.0, dist), 0.1, 1.0);
  vSeed = aSeed;
  gl_PointSize = uParticleSize * (1.1 + aSeed * 2.4) * (52.0 / max(dist, 2.0));
  gl_Position = projectionMatrix * mv;
}`;

const STREAM_FRAG = /* glsl */`
varying float vSeed;
varying float vGlow;
varying float vFade;
uniform vec3 uColorSecondary, uColorAccent;
uniform float uFormationF;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  float alpha = smoothstep(0.5, 0.04, d) * vFade;
  if (alpha < 0.015) discard;
  vec3 col = mix(uColorSecondary, uColorAccent, fract(vSeed * 7.31));
  col += vec3(0.85) * smoothstep(0.14, 0.0, d) * 0.5; // hot core
  col += uColorAccent * vGlow * 0.9;                  // cursor proximity
  gl_FragColor = vec4(col, alpha * (0.55 + vGlow * 0.45));
}`;

export function createParticleMaterial(shared) {
  return new THREE.ShaderMaterial({
    vertexShader: STREAM_VERT,
    fragmentShader: STREAM_FRAG,
    uniforms: {
      uTime: shared.uTime,
      uParticleSize: shared.uParticleSize,
      uFormationF: shared.uFormationF,
      uMouse3D: shared.uMouse3D,
      uColorSecondary: shared.uColorSecondary,
      uColorAccent: shared.uColorAccent,
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

// ---------------------------------------------------------------------------
// Lead-trajectory trail + geodesic route arcs (additive lines)
// ---------------------------------------------------------------------------
export function createTrailMaterial(shared) {
  return new THREE.LineBasicMaterial({
    color: new THREE.Color('#E5A93C'),
    transparent: true,
    opacity: 0.75,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

export function createArcMaterial(shared) {
  return new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

// ---------------------------------------------------------------------------
// Gyroscope torus rings: thin additive metal tubes tinted by the live palette
// ---------------------------------------------------------------------------
export function createRingTorusMaterial(shared, slot = 0) {
  const tint = new THREE.Color(slot === 0 ? '#E5A93C' : '#F4F1EA');
  return new THREE.ShaderMaterial({
    vertexShader: /* glsl */`
      varying vec3 vN;
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vN;
      varying vec3 vW;
      uniform vec3 uTint;
      uniform vec3 uColorSecondary, uColorAccent;
      uniform float uTime;
      void main() {
        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - abs(dot(normalize(vN), V)), 2.0);
        float pulse = 0.75 + 0.25 * sin(uTime * 2.1 + vW.y * 2.2 + vW.x * 1.7);
        vec3 col = uTint * (0.5 + fres * 1.4) * pulse;
        gl_FragColor = vec4(col, 0.55 + fres * 0.4);
      }`,
    uniforms: {
      uTint: { value: tint },
      uTime: shared.uTime,
      uColorSecondary: shared.uColorSecondary,
      uColorAccent: shared.uColorAccent,
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

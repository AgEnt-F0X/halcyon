// HALCYON shader family — custom GLSL atmospheric flow field.
// One shared uniform object drives every material: the world's palette, the
// scroll velocity warp and the cursor field all live here. Materials are
// compiled once per tier (FBM_OCT define changes only on tier switches).

import * as THREE from 'three';

export function createSharedUniforms() {
  return {
    uTime: { value: 0 },
    uWaveSpeed: { value: 1 },          // tuner: time scale of the field
    uTurbulence: { value: 1 },         // tuner: curl/noise amplitude
    uScrollVelocity: { value: 0 },     // signed, normalized -1.5..1.5
    uMouse: { value: new THREE.Vector2(0, 0) },      // NDC
    uMouseWorld: { value: new THREE.Vector3(0, 10, 0) }, // cursor on the field plane
    uColorPrimary: { value: new THREE.Color('#06070A') },   // background ink
    uColorSecondary: { value: new THREE.Color('#F4F1EA') }, // primary glow
    uColorAccent: { value: new THREE.Color('#E5A93C') },    // secondary accent
    uFormationF: { value: 0 },          // damped float, morphs formations
    uParticleSize: { value: 1 },
    uAspect: { value: 1.6 },
  };
}

// ---------------------------------------------------------------------------
// Ashima 3D simplex noise + fBm (shared GLSL chunk)
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

float fbm(vec3 p) {
  float f = 0.0;
  float a = 0.5;
  for (int i = 0; i < FBM_OCT; i++) {
    f += a * snoise(p);
    p = p * 2.02 + vec3(11.3, 7.7, 3.1);
    a *= 0.5;
  }
  return f;
}
`;

// ---------------------------------------------------------------------------
// Flow-field background: one fullscreen triangle behind everything. fBm
// topographic bands, cursor ripple, scroll-velocity domain warp.
// ---------------------------------------------------------------------------
const FLOW_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}`;

const FLOW_FRAG = /* glsl */`
varying vec2 vUv;
uniform float uTime, uWaveSpeed, uTurbulence, uScrollVelocity, uAspect;
uniform vec2 uMouse;
uniform vec3 uColorPrimary, uColorSecondary, uColorAccent;
${NOISE_GLSL}
void main() {
  vec2 st = vUv - 0.5;
  vec2 p = st * vec2(uAspect, 1.0) * 2.1;
  float t = uTime * 0.045 * uWaveSpeed;
  vec3 q = vec3(p * 1.25, t);
  // scroll velocity warps the field domain along the scroll axis
  q.y += uScrollVelocity * 0.35;
  q.x += uScrollVelocity * 0.12;
  float n = fbm(q);

  // cursor ripple: a soft ring expelling from the pointer
  float md = length(st * vec2(uAspect, 1.0) - uMouse * vec2(uAspect, 1.0) * 0.5);
  n += exp(-md * 6.0) * sin(md * 26.0 - uTime * 3.4) * 0.13 * uTurbulence;

  // topographic contour lines carved out of the noise field
  float band = fract(n * 5.0);
  float line = 1.0 - smoothstep(0.0, 0.10, abs(band - 0.5));

  vec3 col = uColorPrimary;
  col = mix(col, uColorPrimary + uColorSecondary * 0.085, smoothstep(-0.7, 0.9, n));
  col += uColorSecondary * line * (0.05 + 0.20 * smoothstep(0.15, 0.85, n));
  col += uColorAccent * pow(max(n, 0.0), 2.4) * 0.22;

  // subtle grain to kill banding
  float g = fract(sin(dot(vUv, vec2(12.9898, 78.233)) + uTime) * 43758.5453);
  col += (g - 0.5) * 0.012;
  gl_FragColor = vec4(col, 1.0);
}`;

export function createFlowFieldMaterial(shared, fbmOct = 3) {
  return new THREE.ShaderMaterial({
    vertexShader: FLOW_VERT,
    fragmentShader: FLOW_FRAG,
    uniforms: {
      uTime: shared.uTime,
      uWaveSpeed: shared.uWaveSpeed,
      uTurbulence: shared.uTurbulence,
      uScrollVelocity: shared.uScrollVelocity,
      uAspect: shared.uAspect,
      uMouse: shared.uMouse,
      uColorPrimary: shared.uColorPrimary,
      uColorSecondary: shared.uColorSecondary,
      uColorAccent: shared.uColorAccent,
    },
    defines: { FBM_OCT: Math.max(2, Math.min(4, fbmOct | 0)) },
    depthTest: false,
    depthWrite: false,
  });
}

// ---------------------------------------------------------------------------
// Displaced topographic wave mesh: a big XZ plane whose vertices ride fBm —
// silk undulation, cursor repel ripples, scroll-velocity swell — shaded with
// elevation contour lines in the chapter palette.
// ---------------------------------------------------------------------------
const RIBBON_VERT = /* glsl */`
varying vec3 vW;
varying float vElev;
varying float vRidge;
uniform float uTime, uWaveSpeed, uTurbulence, uScrollVelocity;
uniform vec3 uMouseWorld;
${NOISE_GLSL}
void main() {
  vec3 pos = position;
  float t = uTime * 0.06 * uWaveSpeed;
  vec3 q = vec3(pos.x * 0.016, pos.z * 0.02, t);
  q.y += uScrollVelocity * 0.4;
  float n = fbm(q);
  // cursor repel: a travelling ripple ring on the silk
  float md = distance(pos.xz, uMouseWorld.xz);
  float ripple = exp(-md * 0.055) * sin(md * 0.85 - uTime * 4.2) * 2.4 * uTurbulence;
  float elev = n * 8.5 * (0.55 + 0.45 * uTurbulence) + ripple;
  pos.y += elev;
  vElev = elev;
  vRidge = n;
  vec4 w = modelMatrix * vec4(pos, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const RIBBON_FRAG = /* glsl */`
varying vec3 vW;
varying float vElev;
varying float vRidge;
uniform vec3 uColorPrimary, uColorSecondary, uColorAccent;
uniform vec3 uMouseWorld;
uniform float uScrollVelocity;
void main() {
  float bands = fract(vElev * 0.75);
  float line = 1.0 - smoothstep(0.0, 0.14, abs(bands - 0.5));

  vec3 col = uColorPrimary;
  col = mix(col, uColorSecondary * 0.30, smoothstep(-6.0, 9.0, vElev) * 0.5);
  col += uColorSecondary * line * 0.26;
  col += uColorAccent * smoothstep(0.5, 1.0, vRidge) * 0.38;

  // accent heat where the cursor presses the field
  float md = distance(vW.xz, uMouseWorld.xz);
  col += uColorAccent * exp(-md * 0.09) * 0.30;

  // velocity chromatic hint: crimson/purple split on fast scroll
  col += uColorAccent * abs(uScrollVelocity) * 0.10 * line;

  float dist = distance(vW, cameraPosition);
  float fade = 1.0 - smoothstep(70.0, 330.0, dist);
  gl_FragColor = vec4(col, fade * 0.92);
}`;

export function createRibbonMaterial(shared, fbmOct = 3) {
  return new THREE.ShaderMaterial({
    vertexShader: RIBBON_VERT,
    fragmentShader: RIBBON_FRAG,
    uniforms: {
      uTime: shared.uTime,
      uWaveSpeed: shared.uWaveSpeed,
      uTurbulence: shared.uTurbulence,
      uScrollVelocity: shared.uScrollVelocity,
      uMouseWorld: shared.uMouseWorld,
      uColorPrimary: shared.uColorPrimary,
      uColorSecondary: shared.uColorSecondary,
      uColorAccent: shared.uColorAccent,
    },
    defines: { FBM_OCT: Math.max(2, Math.min(4, fbmOct | 0)) },
    transparent: true,
    depthWrite: false,
  });
}

// ---------------------------------------------------------------------------
// Curl-noise particle stream: ONE Points draw call. Every formation is pure
// vertex-shader math; uFormationF morphs continuously between neighbouring
// formations; a 3-sample noise field adds curl-like flow turbulence.
// ---------------------------------------------------------------------------
const STREAM_VERT = /* glsl */`
attribute vec4 aRand;
attribute float aId;
varying float vMix;
varying float vFade;
uniform float uTime, uWaveSpeed, uTurbulence, uScrollVelocity, uParticleSize;
uniform float uFormationF;
uniform vec3 uMouseWorld;
${NOISE_GLSL}

vec3 formation(int f, float id, vec4 r, float t) {
  float a = r.x * 6.28318;
  float b = r.y * 6.28318;
  float c = r.z;
  if (f <= 0) {
    // HERO — sweeping horizontal vortex ribbon across the horizon
    float R = 58.0 + c * 48.0;
    float ang = a + t * (0.05 + c * 0.12) * (r.w < 0.5 ? 1.0 : -1.0);
    return vec3(cos(ang) * R, sin(a * 3.0 + t * 0.7) * 5.0 + (c - 0.5) * 8.0, sin(ang) * R * 0.62);
  }
  if (f == 1) {
    // APEX — high-speed aerodynamic wind-tunnel stream ribbons
    float x = mod(c * 340.0 + t * (46.0 + r.w * 80.0), 340.0) - 170.0;
    float lane = floor(r.x * 7.0);
    return vec3(x, (lane - 3.0) * 4.4 + sin(b + t * 2.0) * 1.1, (r.y - 0.5) * 64.0);
  }
  if (f == 2) {
    // STUDYPULSE — double-helix harmonic sine-wave pulse lattice
    float u = c;
    float strand = step(0.5, r.x);
    float ang = u * 12.56 + strand * 3.14159 + t * 0.45;
    float rad = 16.0 + r.w * 8.0;
    vec3 p = vec3((u - 0.5) * 250.0, cos(ang) * rad, sin(ang) * rad);
    p.y += (r.z - 0.5) * 7.0 + sin(u * 20.0 + t * 2.2) * 1.4;
    return p;
  }
  if (f == 3) {
    // KAAMSAARTHI — curved planetary geodesic network with pulsing hubs
    float i = floor(id * 911.0);
    float phi = acos(clamp(1.0 - 2.0 * (i + 0.5) / 911.0, -1.0, 1.0));
    float theta = 6.28318 * i * 0.618034;
    float R = 50.0 + r.w * 9.0;
    vec3 p = vec3(sin(phi) * cos(theta), cos(phi), sin(phi) * sin(theta)) * R;
    float hub = step(0.962, r.x);
    p *= 1.0 + hub * 0.10 * sin(t * 3.2 + b);
    p.y += 8.0;
    return p;
  }
  if (f == 4) {
    // ASL / AI — multi-layered neural network synapse cloud
    float layer = floor(r.x * 4.0);
    float li = fract(id * 0.618034);
    vec3 p = vec3(
      (layer - 1.5) * 46.0,
      (li - 0.5) * 58.0,
      (fract(id * 0.381966) - 0.5) * 58.0
    );
    p += vec3(sin(t * 0.8 + b * 4.0), cos(t * 0.7 + a * 4.0), sin(t * 0.9 + c * 7.0)) * (1.3 + r.w);
    return p;
  }
  // fallback — ORBITAL ring field (bin sorter & everything else)
  float ring = floor(r.y * 3.0);
  float R = 32.0 + ring * 22.0 + (c - 0.5) * 7.0;
  float dir = mod(r.x * 7.0, 2.0) < 1.0 ? 1.0 : -1.0;
  float ang = a + t * (0.16 - ring * 0.035) * dir;
  return vec3(cos(ang) * R, (r.z - 0.5) * 26.0 + sin(ang * 2.0 + t) * 3.2, sin(ang) * R);
}

void main() {
  float t = uTime * uWaveSpeed;
  float ff = clamp(uFormationF, 0.0, 5.0);
  int fA = int(floor(ff));
  int fB = int(min(ff + 1.0, 5.0));
  float mixB = smoothstep(0.0, 1.0, ff - floor(ff));
  vec3 pA = formation(fA, aId, aRand, t);
  vec3 pB = formation(fB, aId, aRand, t);
  vec3 p = mix(pA, pB, mixB);

  // curl-like flow turbulence from three offset noise taps
  vec3 np = p * 0.02 + vec3(0.0, uTime * 0.035, 0.0);
  vec3 flow = vec3(
    snoise(np + vec3(0.0, 31.4, 0.0)),
    snoise(np + vec3(0.0, 7.7, 0.0)),
    snoise(np + vec3(0.0, 19.2, 0.0))
  );
  p += flow * 2.6 * uTurbulence;
  p += vec3(sin(uTime * 0.5 + aId * 41.0), cos(uTime * 0.4 + aId * 17.0), sin(uTime * 0.6 + aId * 29.0)) * 0.55;

  // scroll kinetic: vertical stretch + shear with velocity
  p.y += uScrollVelocity * 2.2 * (aRand.w - 0.5);
  p.x += uScrollVelocity * 1.2 * (aRand.z - 0.5);

  // cursor repel in world space
  vec3 dm = p - uMouseWorld;
  float dl = length(dm);
  p += (dm / max(dl, 0.001)) * exp(-dl * 0.085) * 6.5 * uTurbulence;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float dist = -mv.z;
  gl_PointSize = uParticleSize * (0.9 + aRand.z * 2.3) * (150.0 / max(dist, 6.0));
  gl_Position = projectionMatrix * mv;
  vMix = clamp(length(flow) * 0.45 + aRand.w * 0.2, 0.0, 1.0);
  vFade = clamp(1.0 - smoothstep(90.0, 270.0, dist), 0.12, 1.0);
}`;

const STREAM_FRAG = /* glsl */`
varying float vMix;
varying float vFade;
uniform vec3 uColorSecondary, uColorAccent;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  float core = smoothstep(0.5, 0.02, d);
  float alpha = core * vFade;
  if (alpha < 0.012) discard;
  vec3 col = mix(uColorSecondary, uColorAccent, vMix);
  col += vec3(0.9) * smoothstep(0.16, 0.0, d) * 0.55; // hot white core
  gl_FragColor = vec4(col, alpha * 0.85);
}`;

export function createStreamMaterial(shared, fbmOct = 3) {
  return new THREE.ShaderMaterial({
    vertexShader: STREAM_VERT,
    fragmentShader: STREAM_FRAG,
    uniforms: {
      uTime: shared.uTime,
      uWaveSpeed: shared.uWaveSpeed,
      uTurbulence: shared.uTurbulence,
      uScrollVelocity: shared.uScrollVelocity,
      uParticleSize: shared.uParticleSize,
      uFormationF: shared.uFormationF,
      uMouseWorld: shared.uMouseWorld,
      uColorSecondary: shared.uColorSecondary,
      uColorAccent: shared.uColorAccent,
    },
    defines: { FBM_OCT: Math.max(2, Math.min(4, fbmOct | 0)) },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

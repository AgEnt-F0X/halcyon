// Shared uniforms + shader materials for the Architectural Matrix.
// Every material is compiled once at boot — tier changes drive uniforms and
// geometry counts only, never shader recompiles. No per-frame allocations.

import * as THREE from 'three';

export function createSharedUniforms() {
  return {
    uTime: { value: 0 },
    uPointer: { value: new THREE.Vector2(0, 0) },   // smoothed -1..1 cursor
    uAccent: { value: new THREE.Color(0x4da6ff) },  // active project accent
    uCamPos: { value: new THREE.Vector3() },
    uFocus: { value: 0 },                            // 0..1 focus energy (flights)
    uActiveNode: { value: -1 },                      // index of the focused rack
    uScanT: { value: 2 },                            // grid scan-ring progress (>=1 off)
    uScanOrigin: { value: new THREE.Vector3() },
  };
}

// ---------------------------------------------------------------------------
// Sky dome: one inverted sphere, deep architectural gradient + faint horizon
// aurora bands. 1 draw call.
// ---------------------------------------------------------------------------
const DOME_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const DOME_FRAG = /* glsl */`
varying vec3 vDir;
uniform float uTime;
void main() {
  float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 low = vec3(0.016, 0.024, 0.042);
  vec3 high = vec3(0.004, 0.006, 0.012);
  vec3 c = mix(low, high, smoothstep(0.0, 0.65, h));
  float band = sin(vDir.x * 3.0 + uTime * 0.05) * sin(vDir.z * 2.2 - uTime * 0.03);
  c += vec3(0.010, 0.020, 0.028) * smoothstep(0.35, 0.9, h) * smoothstep(0.2, 1.0, band);
  gl_FragColor = vec4(c, 1.0);
}`;

export function createSkyDomeMaterial(shared) {
  return new THREE.ShaderMaterial({
    vertexShader: DOME_VERT,
    fragmentShader: DOME_FRAG,
    uniforms: { uTime: shared.uTime },
    side: THREE.BackSide,
    depthWrite: false,
  });
}

// ---------------------------------------------------------------------------
// Ground grid: one big plane, the whole grid lives in the fragment shader —
// minor/major lines, glowing world axes, travel pulses and the focus scan
// ring. Distance-faded from the camera. 1 draw call.
// ---------------------------------------------------------------------------
const GRID_VERT = /* glsl */`
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const GRID_FRAG = /* glsl */`
varying vec3 vWorld;
uniform float uTime;
uniform vec3 uCamPos;
uniform vec3 uAccent;
uniform float uScanT;
uniform vec3 uScanOrigin;

float gridMask(vec2 p, float scale, float thick) {
  vec2 q = p / scale;
  vec2 g = abs(fract(q - 0.5) - 0.5) / fwidth(q);
  float line = min(g.x, g.y);
  return 1.0 - clamp(line / thick, 0.0, 1.0);
}

void main() {
  vec2 p = vWorld.xz;
  float minor = gridMask(p, 4.0, 1.3) * 0.26;
  float major = gridMask(p, 20.0, 1.6) * 0.55;

  // slow luminous pulses travelling along the major lattice
  float vein = 0.5 + 0.5 * sin(uTime * 0.5 + (vWorld.x + vWorld.z) * 0.045);
  major *= 0.75 + 0.45 * vein;

  // glowing world axes
  float axisX = 1.0 - smoothstep(0.0, 0.55, abs(vWorld.z));
  float axisZ = 1.0 - smoothstep(0.0, 0.55, abs(vWorld.x));
  float axis = max(axisX, axisZ);

  vec3 col = vec3(0.55, 0.62, 0.72) * minor + vec3(0.78, 0.84, 0.94) * major;
  col += uAccent * axis * (0.75 + 0.3 * sin(uTime * 1.4));

  // focus scan ring expanding from the focused node
  float d = distance(p, uScanOrigin.xz);
  float ring = exp(-pow((d - uScanT * 120.0) * 0.09, 2.0)) * step(uScanT, 1.0);
  col += uAccent * ring * 0.9;

  // distance fade from the camera, keep the horizon clean
  float dist = distance(vWorld, uCamPos);
  float fade = 1.0 - smoothstep(140.0, 520.0, dist);
  float alpha = clamp(max(max(minor, major), max(axis * 0.9, ring)), 0.0, 1.0) * fade;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(col, alpha);
}`;

export function createGridMaterial(shared) {
  return new THREE.ShaderMaterial({
    vertexShader: GRID_VERT,
    fragmentShader: GRID_FRAG,
    uniforms: {
      uTime: shared.uTime,
      uCamPos: shared.uCamPos,
      uAccent: shared.uAccent,
      uScanT: shared.uScanT,
      uScanOrigin: shared.uScanOrigin,
    },
    transparent: true,
    depthWrite: false,
  });
}

// ---------------------------------------------------------------------------
// Ambient data nodes: ONE THREE.Points cloud of floating motes with per-point
// phase drift and depth-weighted cursor parallax. 1 draw call.
// ---------------------------------------------------------------------------
const PARTICLE_VERT = /* glsl */`
attribute float aPhase;
attribute float aSize;
attribute float aTint;
uniform float uTime;
uniform vec2 uPointer;
varying float vTint;
varying float vFade;
void main() {
  vec3 p = position;
  p.x += sin(uTime * 0.21 + aPhase) * 1.9;
  p.y += sin(uTime * 0.33 + aPhase * 1.71) * 1.3;
  p.z += cos(uTime * 0.17 + aPhase * 0.9) * 1.9;
  p.x += uPointer.x * (0.6 + position.y * 0.018);
  p.y += uPointer.y * (0.4 + position.y * 0.012);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float dist = -mv.z;
  vFade = 1.0 - smoothstep(120.0, 340.0, dist);
  vTint = aTint;
  gl_PointSize = aSize * (160.0 / max(dist, 4.0));
  gl_Position = projectionMatrix * mv;
}`;

const PARTICLE_FRAG = /* glsl */`
varying float vTint;
varying float vFade;
uniform vec3 uAccent;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  float alpha = smoothstep(0.5, 0.05, d) * vFade;
  if (alpha < 0.01) discard;
  vec3 cool = vec3(0.62, 0.72, 0.85);
  vec3 col = mix(cool, uAccent, vTint * 0.75);
  gl_FragColor = vec4(col, alpha * 0.8);
}`;

export function createParticleMaterial(shared) {
  return new THREE.ShaderMaterial({
    vertexShader: PARTICLE_VERT,
    fragmentShader: PARTICLE_FRAG,
    uniforms: { uTime: shared.uTime, uPointer: shared.uPointer, uAccent: shared.uAccent },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

// ---------------------------------------------------------------------------
// Data beams: merged vertical gradient planes rising from each project node
// into the sky, with rising energy stripes. Per-vertex accent colour + a
// per-quad node id for the active-node boost. 1 draw call for ALL beams.
// ---------------------------------------------------------------------------
const BEAM_VERT = /* glsl */`
attribute vec3 aColor;
attribute float aNode;
varying vec2 vUv;
varying vec3 vColor;
varying float vNode;
void main() {
  vUv = uv;
  vColor = aColor;
  vNode = aNode;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const BEAM_FRAG = /* glsl */`
varying vec2 vUv;
varying vec3 vColor;
varying float vNode;
uniform float uTime;
uniform float uFocus;
uniform float uActiveNode;
void main() {
  float edge = 1.0 - smoothstep(0.0, 0.5, abs(vUv.x - 0.5) * 2.0);
  float grad = smoothstep(0.0, 0.35, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
  float rise = fract(vUv.y * 2.0 - uTime * 0.22);
  float stripe = smoothstep(0.0, 0.45, rise) * smoothstep(1.0, 0.55, rise);
  float act = 0.55 + 0.45 * step(abs(vNode - uActiveNode), 0.25);
  float alpha = edge * grad * (0.10 + stripe * 0.22) * act * (0.7 + uFocus * 0.9);
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(vColor, alpha);
}`;

export function createBeamMaterial(shared) {
  return new THREE.ShaderMaterial({
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    uniforms: {
      uTime: shared.uTime,
      uFocus: shared.uFocus,
      uActiveNode: shared.uActiveNode,
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

// ---------------------------------------------------------------------------
// Rack materials: merged server-rack slabs (one solid mesh, per-vertex colour,
// per-vertex node id) + merged edge lines. 2 draw calls for ALL racks.
// ---------------------------------------------------------------------------
const RACK_VERT = /* glsl */`
attribute vec3 aColor;
attribute float aNode;
varying vec3 vColor;
varying float vNode;
void main() {
  vColor = aColor;
  vNode = aNode;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const RACK_FRAG = /* glsl */`
varying vec3 vColor;
varying float vNode;
uniform float uActiveNode;
uniform float uFocus;
uniform float uTime;
void main() {
  float act = 1.0 - step(0.25, abs(vNode - uActiveNode));
  float breathe = 0.9 + 0.1 * sin(uTime * 2.0 + vNode * 1.3);
  float glow = (0.62 + act * 1.15) * breathe * (1.0 + uFocus * 0.35);
  gl_FragColor = vec4(vColor * glow, 1.0);
}`;

export function createRackSolidMaterial(shared) {
  return new THREE.ShaderMaterial({
    vertexShader: RACK_VERT,
    fragmentShader: RACK_FRAG,
    uniforms: {
      uActiveNode: shared.uActiveNode,
      uFocus: shared.uFocus,
      uTime: shared.uTime,
    },
  });
}

const RACKLINE_FRAG = /* glsl */`
varying vec3 vColor;
varying float vNode;
uniform float uActiveNode;
uniform float uFocus;
uniform float uTime;
void main() {
  float act = 1.0 - step(0.25, abs(vNode - uActiveNode));
  float breathe = 0.85 + 0.15 * sin(uTime * 2.4 + vNode * 1.9);
  float glow = (0.5 + act * 1.6) * breathe * (1.0 + uFocus * 0.4);
  gl_FragColor = vec4(vColor * glow, 1.0);
}`;

export function createRackLineMaterial(shared) {
  return new THREE.ShaderMaterial({
    vertexShader: RACK_VERT,
    fragmentShader: RACKLINE_FRAG,
    uniforms: {
      uActiveNode: shared.uActiveNode,
      uFocus: shared.uFocus,
      uTime: shared.uTime,
    },
  });
}

// ---------------------------------------------------------------------------
// The Architectural Core: fresnel-glass inner polyhedron (outer wireframe and
// gyroscope rings are plain line materials built in matrix.js).
// ---------------------------------------------------------------------------
const CORE_VERT = /* glsl */`
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const CORE_FRAG = /* glsl */`
varying vec3 vNormal;
varying vec3 vView;
uniform vec3 uAccent;
uniform float uTime;
void main() {
  float fres = pow(1.0 - abs(dot(vNormal, vView)), 2.2);
  float pulse = 0.85 + 0.15 * sin(uTime * 1.8);
  vec3 col = mix(vec3(0.05, 0.08, 0.13), uAccent, fres * 0.9) * pulse;
  gl_FragColor = vec4(col, 0.25 + fres * 0.75);
}`;

export function createCoreMaterial(shared) {
  return new THREE.ShaderMaterial({
    vertexShader: CORE_VERT,
    fragmentShader: CORE_FRAG,
    uniforms: { uAccent: shared.uAccent, uTime: shared.uTime },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

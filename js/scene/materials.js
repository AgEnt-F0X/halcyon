// The ONE shared ShaderMaterial family ("ToonLit") + shared uniforms + canvas textures.
// Every opaque painterly surface uses this; changing time of day or weather only
// ever writes uniforms, so nothing recompiles at runtime.

import * as THREE from 'three';

export function createSharedUniforms() {
  return {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.4, 0.5, -0.7) },
    uMoonDir: { value: new THREE.Vector3(-0.4, -0.2, -0.7) },
    uSunColor: { value: new THREE.Color(0xfff2d8) },
    uMoonColor: { value: new THREE.Color(0x8fa3d0) },
    uSunI: { value: 1 },
    uMoonI: { value: 0 },
    uAmbSky: { value: new THREE.Color(0x9ac4e8) },
    uAmbGnd: { value: new THREE.Color(0x64745e) },
    uAmbI: { value: 1 },
    uFogColor: { value: new THREE.Color(0xcfe6f5) },
    uFogDensity: { value: 0.0026 },
    uFogBase: { value: 12 },
    uSkyZenith: { value: new THREE.Color(0x2f86e8) },
    uSkyHorizon: { value: new THREE.Color(0xa9d8ff) },
    uGroundTint: { value: new THREE.Color(0xb4bcae) },
    uWaterTint: { value: new THREE.Color(0x3f7fb8) },
    uSeasonTint: { value: new THREE.Color(1, 1, 1) },
    uBlossom: { value: 0 },
    uSnowGround: { value: 0 },
    uWindSpeed: { value: 0.25 },
    uWindDir: { value: new THREE.Vector2(0.85, 0.53) },
    uLightning: { value: 0 },
    uNight: { value: 0 },
    uRain: { value: 0 },
    uSnow: { value: 0 },
    uCloudCover: { value: 0.2 },
    uSunVis: { value: 1 },
    uMoonVis: { value: 0 },
    uFlash: { value: 0 },
    uAurora: { value: 0 },
    uShaftI: { value: 0 },
  };
}

const TOON_VERT = /* glsl */`
attribute float aSeed;
varying vec3 vN, vW, vC;
varying float vSeed;
uniform float uTime, uWindSpeed, uSwayAmp, uSwayH;
uniform vec2 uWindDir;
void main() {
  vSeed = aSeed;
  #ifdef USE_COLOR
    vC = color;
  #else
    vC = vec3(1.0);
  #endif
  vec4 local = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    local = instanceMatrix * local;
  #endif
  vec4 wp = modelMatrix * local;
  #ifdef SWAY
    float ph = aSeed * 6.28318;
    float h = smoothstep(0.0, uSwayH, position.y);
    float s = uSwayAmp * uWindSpeed * h;
    float gust = sin(uTime * 0.31 + ph * 0.5) * 0.5 + 0.6;
    wp.xz += uWindDir * (sin(uTime * 1.45 + ph + position.y * 0.35) * s + gust * s * 0.5);
  #endif
  vec3 n = normal;
  #ifdef USE_INSTANCING
    n = mat3(instanceMatrix) * n;
  #endif
  vN = normalize(mat3(modelMatrix) * n);
  vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const TOON_FRAG = /* glsl */`
varying vec3 vN, vW, vC;
varying float vSeed;
uniform vec3 uSunDir, uMoonDir, uSunColor, uMoonColor, uAmbSky, uAmbGnd, uFogColor, uGroundTint, uSeasonTint;
uniform float uSunI, uMoonI, uAmbI, uFogDensity, uFogBase, uSnowGround, uBlossom, uNight, uLightning;
uniform float uSunAmt, uRim, uAlpha;
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  vec3 albedo = vC;
  #ifdef FOLIAGE
    albedo *= uSeasonTint;
    float blossom = step(0.8, fract(vSeed * 7.31));
    albedo = mix(albedo, vec3(1.0, 0.93, 0.96), blossom * uBlossom);
  #endif
  #ifdef GROUND
    albedo *= uGroundTint;
  #endif
  #ifdef SNOWCAP
    float sm = clamp(uSnowGround * smoothstep(0.42, 0.78, N.y), 0.0, 1.0);
    albedo = mix(albedo, vec3(0.93, 0.95, 1.0), sm);
  #endif
  vec3 L = normalize(uSunDir);
  float ndl = dot(N, L) * 0.5 + 0.5;
  float bands = 0.34 * smoothstep(0.26, 0.34, ndl) + 0.33 * smoothstep(0.48, 0.56, ndl) + 0.33 * smoothstep(0.70, 0.78, ndl);
  float shade = 0.35 + 0.65 * bands;
  vec3 col = albedo * (uAmbSky * (0.62 + 0.38 * N.y) + uAmbGnd * (0.5 - 0.5 * N.y)) * uAmbI;
  col += albedo * uSunColor * (uSunI * uSunAmt * shade);
  vec3 Lm = normalize(uMoonDir);
  float ndm = dot(N, Lm) * 0.5 + 0.5;
  col += albedo * uMoonColor * (uMoonI * (0.4 + 0.6 * smoothstep(0.3, 0.85, ndm)));
  float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0) * clamp(dot(N, L) + 0.55, 0.0, 1.0);
  col += uSunColor * (rim * uSunI * uRim);
  col += vec3(0.9, 0.95, 1.0) * (uLightning * 0.22);
  float pool = exp(-max(vW.y - uFogBase, 0.0) * 0.05);
  float fog = 1.0 - exp(-length(cameraPosition - vW) * uFogDensity * (0.45 + pool));
  col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));
  col += (hash21(gl_FragCoord.xy) - 0.5) * (2.0 / 255.0);
  gl_FragColor = vec4(col, uAlpha);
}`;

// opts: sway (amp), swayH, foliage, ground, snowCap, sunAmt, rim, transparent, alphaBase, depthWrite
export function makeToonMaterial(shared, opts = {}) {
  const defines = {};
  if (opts.sway) defines.SWAY = '';
  if (opts.foliage) defines.FOLIAGE = '';
  if (opts.ground) defines.GROUND = '';
  if (opts.snowCap) defines.SNOWCAP = '';
  const uniforms = Object.assign({}, shared, {
    uSwayAmp: { value: opts.sway || 0 },
    uSwayH: { value: opts.swayH || 4 },
    uSunAmt: { value: opts.sunAmt !== undefined ? opts.sunAmt : 1 },
    uRim: { value: opts.rim !== undefined ? opts.rim : 0.5 },
    uAlpha: { value: opts.alphaBase !== undefined ? opts.alphaBase : 1 },
  });
  const mat = new THREE.ShaderMaterial({
    vertexShader: TOON_VERT,
    fragmentShader: TOON_FRAG,
    uniforms,
    defines,
    vertexColors: true,
    transparent: !!opts.transparent,
    depthWrite: opts.depthWrite !== undefined ? opts.depthWrite : true,
  });
  mat.name = opts.name || 'toon';
  return mat;
}

export function ensureSeed(geometry, value = 0.5) {
  if (!geometry.getAttribute('aSeed')) {
    const n = geometry.getAttribute('position').count;
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(n).fill(value), 1));
  }
  if (!geometry.getAttribute('color')) {
    const n = geometry.getAttribute('position').count;
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  }
  return geometry;
}

// Per-triangle hue/lightness jitter baked into vertex colors: the brush-stroke feel.
export function jitterVertexColors(geometry, baseHex, rng, jitter = 0.06) {
  const pos = geometry.getAttribute('position');
  const idx = geometry.getIndex();
  const triCount = (idx ? idx.count : pos.count) / 3;
  const colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color(baseHex);
  const c = new THREE.Color();
  for (let t = 0; t < triCount; t++) {
    const j = 1 + (rng() * 2 - 1) * jitter;
    const hb = (rng() * 2 - 1) * jitter * 0.5;
    c.setRGB(
      Math.min(1, Math.max(0, base.r * j + hb)),
      Math.min(1, Math.max(0, base.g * j + hb * 0.7)),
      Math.min(1, Math.max(0, base.b * j - hb * 0.5)),
    );
    for (let k = 0; k < 3; k++) {
      const vi = idx ? idx.getX(t * 3 + k) : t * 3 + k;
      colors[vi * 3] = c.r; colors[vi * 3 + 1] = c.g; colors[vi * 3 + 2] = c.b;
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// Canvas-generated sprite textures (no external images allowed).
export function makeSpriteTexture(kind) {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  if (kind === 'glow') {
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(255,255,255,0.85)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.28)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  } else if (kind === 'smoke') {
    for (const [x, y, r, a] of [[64, 64, 60, 0.5], [46, 70, 34, 0.3], [84, 58, 30, 0.28]]) {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(255,255,255,${a})`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, S, S);
    }
  } else if (kind === 'streak') {
    for (let i = 0; i < 24; i++) {
      const x = S / 2 + (i - 12) * 1.2;
      const a = Math.exp(-(i - 12) * (i - 12) / 40) * 0.75;
      g.fillStyle = `rgba(255,255,255,${a})`;
      g.fillRect(x, 8, 1, S - 16);
    }
    const gr = g.createLinearGradient(0, 0, 0, S);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.2, 'rgba(0,0,0,0)');
    gr.addColorStop(0.8, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  } else if (kind === 'flake') {
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.3, 'rgba(255,255,255,0.7)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  } else if (kind === 'shaft') {
    g.save();
    g.translate(S / 2, S / 2); g.scale(0.22, 1);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, S / 2);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)');
    gr.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(-S, -S, S * 2, S * 2);
    g.restore();
    const fade = g.createLinearGradient(0, 0, 0, S);
    fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(0.85, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = fade; g.fillRect(0, 0, S, S);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

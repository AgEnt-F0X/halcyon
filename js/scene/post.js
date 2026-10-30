// Post: one cheap fullscreen pass — soft tonemapping, palette grading, vignette,
// 24 fps film grain, dithering. Skipped entirely on Low (CSS vignette instead).

import * as THREE from 'three';
import { clamp } from '../config.js';

const POST_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const POST_FRAG = /* glsl */`
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform float uTime, uVig, uGrain, uGradeAmt, uAberration;
uniform vec3 uGrade;
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main() {
  vec3 c;
  if (uAberration > 0.001) {
    // radial RGB split for the speed-scroll overdrive pulse
    vec2 dir = (vUv - 0.5) * uAberration * 0.035;
    c.r = texture2D(tDiffuse, vUv + dir).r;
    c.g = texture2D(tDiffuse, vUv).g;
    c.b = texture2D(tDiffuse, vUv - dir).b;
  } else {
    c = texture2D(tDiffuse, vUv).rgb;
  }
  vec3 graded = c * uGrade;
  graded = mix(graded, aces(graded * 1.22) * 1.04, 0.4);
  c = mix(c, graded, uGradeAmt);
  float d = distance(vUv, vec2(0.5, 0.47));
  c *= 1.0 - smoothstep(0.44, 0.94, d) * uVig;
  float seed = floor(uTime * 24.0);
  float g = hash21(vUv * vec2(1287.0, 718.0) + seed * 7.13);
  c += (g - 0.5) * uGrain;
  c += (hash21(vUv * 913.7 + seed) - 0.5) * (1.6 / 255.0);
  gl_FragColor = vec4(c, 1.0);
}`;

export function createPost(ctx) {
  const { renderer, scene, camera } = ctx;
  const triGeo = new THREE.BufferGeometry();
  triGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const uniforms = {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVig: { value: 0.34 },
    uGrain: { value: 0.028 },
    uGrade: { value: new THREE.Color(1, 1, 1) },
    uGradeAmt: { value: 0.2 },
    uAberration: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({ vertexShader: POST_VERT, fragmentShader: POST_FRAG, uniforms, depthTest: false, depthWrite: false });
  const tri = new THREE.Mesh(triGeo, mat);
  tri.frustumCulled = false;
  const postScene = new THREE.Scene();
  postScene.add(tri);
  const postCam = new THREE.Camera();

  let rt = null;
  let enabled = true;
  let samples = 0;
  let pulse = 0;
  let velAb = 0;

  function ensureRT() {
    if (rt) rt.dispose();
    // domElement.width/height already include the pixel ratio — match the drawing buffer
    rt = new THREE.WebGLRenderTarget(
      Math.max(2, Math.floor(renderer.domElement.width)),
      Math.max(2, Math.floor(renderer.domElement.height)),
      { samples, depthBuffer: true, stencilBuffer: false },
    );
    uniforms.tDiffuse.value = rt.texture;
  }

  return {
    get enabled() { return enabled; },
    setEnabled(b) {
      if (enabled === b) return;
      enabled = b;
      if (b) ensureRT();
    },
    setMSAA(s) {
      if (samples === s) return;
      samples = s;
      if (enabled) ensureRT();
    },
    onResize() { if (enabled) ensureRT(); },
    render(dt = 0) {
      uniforms.uTime.value = performance.now() / 1000;
      // chromatic aberration: decaying pulses + camera-flight velocity drive it
      if (pulse > 0.001) pulse *= Math.exp(-(dt || 0.016) * 2.6);
      const target = Math.min(1, Math.max(pulse, velAb));
      if (Math.abs(uniforms.uAberration.value - target) > 0.002) {
        uniforms.uAberration.value = target;
      }
      if (!enabled) {
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
        return;
      }
      if (!rt) ensureRT();
      renderer.setRenderTarget(rt);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(postScene, postCam);
    },
    pulseChromatic(strength = 1) {
      pulse = Math.max(pulse, strength);
      if (!enabled) { enabled = true; ensureRT(); } // overdrive deserves the full pass
    },
    // continuous RGB split linked to camera flight velocity (medium/high tiers)
    setVelocityAberration(v) {
      velAb = clamp(v, 0, 0.55);
    },
    setGrade(color, amt) {
      uniforms.uGrade.value.copy(color);
      uniforms.uGradeAmt.value = amt;
    },
    dispose() {
      if (rt) rt.dispose();
      triGeo.dispose(); mat.dispose();
    },
  };
}

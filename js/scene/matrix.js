// The Atmospheric Flow Field: a fullscreen fBm shader backdrop plus a vast
// displaced topographic wave mesh riding the same noise field. No primitives
// — the entire environment is two custom-GLSL surfaces driven by the shared
// uniforms (palette morph, scroll velocity warp, cursor ripples).

import * as THREE from 'three';
import { createFlowFieldMaterial, createRibbonMaterial } from './materials.js';

export function createMatrix(ctx) {
  const { scene, shared } = ctx;
  const group = new THREE.Group();
  group.name = 'flowField';
  scene.add(group);

  // ---- fullscreen background flow field -----------------------------------
  const bgGeo = new THREE.BufferGeometry();
  bgGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -1, -1, 0, 3, -1, 0, -1, 3, 0,
  ]), 3));
  const bg = new THREE.Mesh(bgGeo, createFlowFieldMaterial(shared, 3));
  bg.frustumCulled = false;
  bg.renderOrder = -10;
  group.add(bg);

  // ---- displaced topographic ribbon ---------------------------------------
  const RIBBON_X = 620;
  const RIBBON_Z = 340;
  const MAX_SEG_X = 220;
  const MAX_SEG_Z = 110;
  const ribbonGeo = new THREE.PlaneGeometry(RIBBON_X, RIBBON_Z, MAX_SEG_X, MAX_SEG_Z);
  ribbonGeo.rotateX(-Math.PI / 2);
  const ribbon = new THREE.Mesh(ribbonGeo, createRibbonMaterial(shared, 3));
  ribbon.position.y = -14;
  ribbon.frustumCulled = false;
  ribbon.renderOrder = -5;
  group.add(ribbon);

  let currentOct = 3;

  // ---- tier gating: tessellation via drawRange, noise octaves via define ---
  function applyTier(tier) {
    const [sx, sz] = tier.ribbon;
    // PlaneGeometry indices run row-major: drawRange keeps a clean sub-grid
    ribbon.geometry.setDrawRange(0, sx * sz * 6);
    if (tier.fbmOct !== currentOct) {
      // tier switches are rare — a one-off recompile for the octave count is
      // the correct trade against per-pixel cost on weak GPUs
      currentOct = tier.fbmOct;
      for (const mesh of [bg, ribbon]) {
        mesh.material.defines.FBM_OCT = currentOct;
        mesh.material.needsUpdate = true;
      }
    }
  }

  // ---- per-frame ------------------------------------------------------------
  function update(dt, t, camera) {
    shared.uAspect.value = window.innerWidth / Math.max(window.innerHeight, 1);
    // the ribbon breathes toward the camera with the beat of the field
    ribbon.position.y = -14 + Math.sin(t * 0.11) * 1.2;
    void dt; void camera;
  }

  return { group, update, applyTier };
}

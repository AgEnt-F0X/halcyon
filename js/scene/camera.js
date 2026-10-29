// Camera rig: breathing dolly, pointer parallax, drag-to-look with inertia and
// auto-recentering after 4 s idle. All motion is time-based and damped.

import * as THREE from 'three';
import { WORLD, damp, clamp } from '../config.js';

const YAW_LIM = 12 * Math.PI / 180;
const PITCH_LIM = 6 * Math.PI / 180;

export function createCameraRig(ctx) {
  const { camera, canvas, isReducedMotion } = ctx;
  const baseTarget = new THREE.Vector3(...WORLD.camPos);
  const base = new THREE.Vector3(...WORLD.camPos);
  const look = new THREE.Vector3(...WORLD.camTarget);
  const parallax = { x: 0, y: 0, tx: 0, ty: 0 };
  const drag = { yaw: 0, pitch: 0, vy: 0, vp: 0, down: false, lastX: 0, lastY: 0 };
  let lastInput = -10;
  let fovTarget = WORLD.fov;
  let posTargetZ = baseTarget.z;
  let posTargetY = baseTarget.y;

  function onMove(e) {
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = (e.clientY / window.innerHeight) * 2 - 1;
    parallax.tx = nx * 2.5;
    parallax.ty = -ny * 1.2;
  }
  function onDown(e) {
    drag.down = true;
    drag.lastX = e.clientX; drag.lastY = e.clientY;
    lastInput = performance.now() / 1000;
    canvas.style.cursor = 'grabbing';
  }
  function onDrag(e) {
    if (!drag.down) return;
    const dx = e.clientX - drag.lastX;
    const dy = e.clientY - drag.lastY;
    drag.lastX = e.clientX; drag.lastY = e.clientY;
    drag.vy = dx * 0.16 * 0.0012 * 60;
    drag.vp = dy * 0.10 * 0.0012 * 60;
    drag.yaw = clamp(drag.yaw + dx * 0.0012, -YAW_LIM, YAW_LIM);
    drag.pitch = clamp(drag.pitch + dy * 0.0012, -PITCH_LIM, PITCH_LIM);
    lastInput = performance.now() / 1000;
  }
  function onUp() {
    drag.down = false;
    canvas.style.cursor = 'grab';
    lastInput = performance.now() / 1000;
  }

  canvas.style.cursor = 'grab';
  window.addEventListener('pointermove', onMove, { passive: true });
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onDrag, { passive: true });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  return {
    update(dt, t) {
      const reduced = isReducedMotion();
      // gentle re-frame on narrow/portrait screens so lake + cabin stay in frame
      const portrait = window.innerWidth / window.innerHeight < 0.9;
      fovTarget = portrait ? 50 : WORLD.fov;
      posTargetZ = portrait ? Math.max(70, WORLD.camPos[2]) : WORLD.camPos[2];
      posTargetY = portrait ? Math.max(13, WORLD.camPos[1]) : WORLD.camPos[1];

      base.z = damp(base.z, posTargetZ, 3, dt);
      base.y = damp(base.y, posTargetY, 3, dt);
      camera.fov = damp(camera.fov, fovTarget, 3, dt);
      camera.updateProjectionMatrix();

      // breathing dolly + slow sway
      const breathe = reduced ? 0 : Math.sin((t * Math.PI * 2) / 11) * 0.4;
      const sway = reduced ? 0 : Math.sin(t * 0.11) * 0.3;

      // parallax
      if (!reduced) {
        parallax.x = damp(parallax.x, parallax.tx, 4, dt);
        parallax.y = damp(parallax.y, parallax.ty, 4, dt);
      }

      // drag inertia + idle recenter
      if (!drag.down) {
        drag.yaw = clamp(drag.yaw + drag.vy * dt, -YAW_LIM, YAW_LIM);
        drag.pitch = clamp(drag.pitch + drag.vp * dt, -PITCH_LIM, PITCH_LIM);
        drag.vy *= Math.exp(-dt * 3);
        drag.vp *= Math.exp(-dt * 3);
        if (t - lastInput > 4) {
          drag.yaw = damp(drag.yaw, 0, 1.4, dt);
          drag.pitch = damp(drag.pitch, 0, 1.4, dt);
        }
      }

      camera.position.set(
        base.x + parallax.x + sway,
        base.y + breathe + parallax.y,
        base.z,
      );
      camera.lookAt(look);
      camera.rotateY(drag.yaw);
      camera.rotateX(drag.pitch);
    },
    noteInput() { lastInput = performance.now() / 1000; },
    dispose() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointermove', onDrag);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    },
  };
}

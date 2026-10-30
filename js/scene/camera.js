// Scroll-choreographed camera: the visitor's scroll IS the dolly. A pose
// table (hero → every chapter → bento) is interpolated by the damped
// chapter float, with an intra-chapter push-in across each pinned stage.
// Drag-to-look with inertia, angular cursor parallax and a free-orbit mode
// remain available on top of the scroll choreography.

import * as THREE from 'three';
import { clamp, damp, lerp, mulberry32 } from '../config.js';

const YAW_LIM = 9 * Math.PI / 180;
const PITCH_LIM = 6 * Math.PI / 180;
const PARALLAX_DEG = 1.3;

export function createCameraRig(ctx) {
  const { camera, canvas, isReducedMotion } = ctx;

  // ---- pose table (azimuth, radius, height, targetY) -----------------------
  const rng = mulberry32(0x505e);
  const poses = [
    { az: 0.0, radius: 98, height: 31, targetY: 6 },    // hero — wide obsidian vista
  ];
  function chapterPose(i) {
    return {
      az: 0.92 * i - 0.55 + (rng() * 2 - 1) * 0.4,
      radius: 84 + (i % 3) * 9,
      height: 26 + (i % 2) * 7,
      targetY: 10,
    };
  }
  const bentoPose = { az: 0.25, radius: 72, height: 46, targetY: 12 };
  let poseCount = 2; // hero + bento until chapters register

  function registerChapters(n) {
    poses.length = 1;
    for (let i = 0; i < n; i++) poses.push(chapterPose(i));
    poses.push(bentoPose);
    poseCount = poses.length;
  }

  // ---- input state ----------------------------------------------------------
  const parallax = { x: 0, y: 0, tx: 0, ty: 0 };
  const drag = { yaw: 0, pitch: 0, vy: 0, vp: 0, down: false, lastX: 0, lastY: 0 };
  const orbit = {
    on: false, pivot: new THREE.Vector3(0, 10, 0), radius: 90,
    az: 0.3, el: 0.34, vAz: 0, vEl: 0, engaged: false,
  };
  let lastInput = -10;
  let whip = 0;

  function engageOrbitFromCamera() {
    const dir = new THREE.Vector3().subVectors(camera.position, orbit.pivot);
    orbit.radius = clamp(dir.length(), 20, 240);
    orbit.az = Math.atan2(dir.x, dir.z);
    orbit.el = clamp(Math.asin(clamp((camera.position.y - orbit.pivot.y) / Math.max(orbit.radius, 1), -1, 1)), 0.06, 1.32);
    orbit.vAz = 0;
    orbit.vEl = 0;
    orbit.engaged = true;
  }

  function onMove(e) {
    if (!window.innerWidth || !window.innerHeight) return;
    parallax.tx = ((e.clientX / window.innerWidth) * 2 - 1) * PARALLAX_DEG;
    parallax.ty = ((e.clientY / window.innerHeight) * 2 - 1) * PARALLAX_DEG;
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
    if (orbit.on) {
      orbit.vAz = dx * 0.005;
      orbit.vEl = dy * 0.004;
      orbit.az -= dx * 0.005;
      orbit.el = clamp(orbit.el + dy * 0.004, -0.05, 1.32);
    } else {
      drag.vy = dx * 0.14 * 0.0012 * 60;
      drag.vp = dy * 0.09 * 0.0012 * 60;
      drag.yaw = clamp(drag.yaw + dx * 0.0011, -YAW_LIM, YAW_LIM);
      drag.pitch = clamp(drag.pitch + dy * 0.0011, -PITCH_LIM, PITCH_LIM);
    }
    lastInput = performance.now() / 1000;
  }
  function onUp() {
    drag.down = false;
    canvas.style.cursor = 'grab';
    lastInput = performance.now() / 1000;
  }
  function onWheel(e) {
    if (!orbit.on) return;
    orbit.radius = clamp(orbit.radius + e.deltaY * 0.08, 20, 240);
    lastInput = performance.now() / 1000;
  }

  canvas.style.cursor = 'grab';
  window.addEventListener('pointermove', onMove, { passive: true });
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onDrag, { passive: true });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: true });

  // scratch objects (zero per-frame allocation)
  const campos = new THREE.Vector3();
  const look = new THREE.Vector3();

  const rig = {
    update(dt, t, scroll) {
      const reduced = isReducedMotion();
      const vel = scroll ? scroll.velNorm : 0;

      // ---- free orbit (engages after in-flight scroll momentum settles) ----
      const flying = scroll ? Math.abs(scroll.velocity) > 60 : false;
      if (orbit.on && !flying) {
        if (!orbit.engaged) engageOrbitFromCamera();
        if (!drag.down) {
          orbit.az += orbit.vAz * dt;
          orbit.el = clamp(orbit.el + orbit.vEl * dt, -0.05, 1.32);
          orbit.vAz *= Math.exp(-dt * 3);
          orbit.vEl *= Math.exp(-dt * 3);
          if (t - lastInput > 12) orbit.az += dt * 0.05;
        }
        const r = orbit.radius;
        const cp = Math.cos(orbit.el);
        camera.position.set(
          orbit.pivot.x + Math.sin(orbit.az) * cp * r,
          Math.max(orbit.pivot.y + Math.sin(orbit.el) * r, 6),
          orbit.pivot.z + Math.cos(orbit.az) * cp * r,
        );
        camera.lookAt(orbit.pivot);
        camera.fov = damp(camera.fov, 50, 3, dt);
        camera.updateProjectionMatrix();
        return;
      }
      if (orbit.on) orbit.engaged = false;

      // ---- scroll-choreographed pose ---------------------------------------
      const f = scroll ? clamp(scroll.chapterFloat, 0, poseCount - 1) : 0;
      const iA = Math.min(Math.floor(f), poseCount - 2);
      const iB = Math.min(iA + 1, poseCount - 1);
      const mix = smooth01(f - iA);
      const A = poses[iA] || poses[0];
      const B = poses[iB] || poses[0];
      let az = lerp(A.az, B.az, mix);
      let radius = lerp(A.radius, B.radius, mix);
      let height = lerp(A.height, B.height, mix);
      let targetY = lerp(A.targetY, B.targetY, mix);

      // intra-chapter push-in: dive toward the stage mid-chapter, ease back out
      const p = scroll ? scroll.chapterP : 0;
      if (scroll && scroll.chapterIndex >= 0 && scroll.chapterIndex <= poseCount - 3) {
        radius += (0.5 - p) * 18;
        height += Math.sin(p * Math.PI) * 5;
      }

      // scroll velocity: FOV warp + lateral sway (kinetic dolly feel)
      const fov = 50 + Math.min(Math.abs(vel) * 5, 5);
      const sway = reduced ? 0 : Math.sin(t * 0.09) * 0.4;
      const breathe = reduced ? 0 : Math.sin((t * Math.PI * 2) / 13) * 0.6 + vel * 1.6;

      if (!reduced) {
        parallax.x = damp(parallax.x, parallax.tx, 3.5, dt);
        parallax.y = damp(parallax.y, parallax.ty, 3.5, dt);
      }

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

      look.set(0, targetY, 0);
      const r = Math.max(radius, 30);
      const el = Math.atan2(height, r);
      campos.set(
        Math.sin(az) * Math.cos(el) * r + sway,
        Math.max(height + breathe, 4),
        Math.cos(az) * Math.cos(el) * r,
      );
      camera.position.copy(campos);
      camera.lookAt(look);
      const DEG = Math.PI / 180;
      camera.rotateY(drag.yaw + parallax.x * DEG);
      camera.rotateX(drag.pitch - parallax.y * DEG);
      camera.fov = damp(camera.fov, fov, 4, dt);
      camera.updateProjectionMatrix();

      // whip decay (rail jumps)
      if (whip > 0.001) {
        whip *= Math.exp(-dt * 6.5);
        camera.rotateY(whip * 0.9);
      }
    },

    whipPan(strength = 1) { whip = 0.5 * strength; },

    registerChapters,

    setOrbit(on) {
      orbit.on = !!on;
      orbit.engaged = false;
      if (on) {
        const dir = new THREE.Vector3().subVectors(camera.position, orbit.pivot);
        orbit.radius = clamp(dir.length(), 20, 240);
        orbit.az = Math.atan2(dir.x, dir.z);
        orbit.el = clamp(Math.asin(clamp((camera.position.y - orbit.pivot.y) / Math.max(orbit.radius, 1), -1, 1)), 0.08, 1.3);
        lastInput = performance.now() / 1000;
      }
      return orbit.on;
    },
    isOrbit() { return orbit.on; },
    noteInput() { lastInput = performance.now() / 1000; },

    dispose() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointermove', onDrag);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
    },
  };
  return rig;
}

function smooth01(x) {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

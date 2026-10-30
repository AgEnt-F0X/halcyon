// Scroll-choreographed camera for the sculpture stage.
// Hero: the ferrofluid core sits dead-centre behind the split typography.
// Chapters: the pose table glides laterally so the sculpture lands in the
// open viewport beside the editorial deck. Hold-click-and-drag anywhere on
// the canvas for "Zen Inspect": the UI dissolves to 0.15, the camera dollies
// in and you can physically spin the sculpture. A clean click fires a
// particle shockwave.

import * as THREE from 'three';
import { clamp, damp, lerp, mulberry32 } from '../config.js';

const YAW_LIM = 8 * Math.PI / 180;
const PITCH_LIM = 5 * Math.PI / 180;
const PARALLAX_DEG = 2.2;      // stronger parallax at this intimate scale
const SCULPT = new THREE.Vector3(0, 0.4, 0);
const ZEN_RADIUS = 7.4;

export function createCameraRig(ctx) {
  const { camera, canvas, nodes, isReducedMotion } = ctx;

  // ---- pose table (azimuth, radius, height, lateral target offset) ----------
  const rng = mulberry32(0x5ca1e);
  const poses = [
    { az: 0.0, radius: 11.4, height: 1.3, tx: 0 },       // hero — dead centre
  ];
  function chapterPose(i) {
    const side = i % 2 === 0 ? 1 : -1;   // deck alternates; sculpture takes the open side
    return {
      az: 0.5 * i - 0.4 + (rng() * 2 - 1) * 0.3,
      radius: 14.2 + (i % 3) * 1.1,
      height: 1.0 + (i % 2) * 0.9,
      tx: side * 5.4,
    };
  }
  const bentoPose = { az: 0.3, radius: 13.4, height: 2.6, tx: 0 };
  let poseCount = 2;

  function registerChapters(n) {
    poses.length = 1;
    for (let i = 0; i < n; i++) poses.push(chapterPose(i));
    poses.push(bentoPose);
    poseCount = poses.length;
  }

  // ---- input -----------------------------------------------------------------
  const parallax = { x: 0, y: 0, tx: 0, ty: 0 };
  const drag = { yaw: 0, pitch: 0, vy: 0, vp: 0, down: false, lastX: 0, lastY: 0 };
  const zen = {
    engaged: false, factor: 0, t0: 0, moved: 0,
    az: 0.4, el: 0.18,
  };
  const orbit = {
    on: false, pivot: new THREE.Vector3(0, 0.4, 0), radius: 12,
    az: 0.4, el: 0.2, vAz: 0, vEl: 0, engaged: false,
  };
  let lastInput = -10;
  let whip = 0;

  function onMove(e) {
    if (!window.innerWidth || !window.innerHeight) return;
    parallax.tx = ((e.clientX / window.innerWidth) * 2 - 1) * PARALLAX_DEG;
    parallax.ty = ((e.clientY / window.innerHeight) * 2 - 1) * PARALLAX_DEG;
    if (drag.down) {
      zen.moved += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0);
    }
  }
  function onDown(e) {
    drag.down = true;
    drag.lastX = e.clientX; drag.lastY = e.clientY;
    zen.t0 = performance.now();
    zen.moved = 0;
    lastInput = performance.now() / 1000;
    canvas.style.cursor = 'grabbing';
  }
  // press anywhere except real UI — the scroll document overlays the canvas,
  // so a canvas-only binding would never receive the pointer
  function onPress(e) {
    if (e.target && e.target.closest && e.target.closest(
      'button, a, input, select, textarea, .deck, #palette, #tuner, #topbar, #rail, .bento-card, .sticker, .toast, .sb-canvas',
    )) return;
    onDown(e);
  }
  function onDrag(e) {
    if (!drag.down) return;
    const dx = e.clientX - drag.lastX;
    const dy = e.clientY - drag.lastY;
    drag.lastX = e.clientX; drag.lastY = e.clientY;
    if (zen.engaged) {
      // physical spin of the sculpture
      zen.az -= dx * 0.0062;
      zen.el = clamp(zen.el + dy * 0.0042, -0.9, 1.2);
    } else if (orbit.on) {
      orbit.vAz = dx * 0.005;
      orbit.vEl = dy * 0.004;
      orbit.az -= dx * 0.005;
      orbit.el = clamp(orbit.el + dy * 0.004, -0.4, 1.25);
    } else {
      drag.vy = dx * 0.15 * 0.0012 * 60;
      drag.vp = dy * 0.1 * 0.0012 * 60;
      drag.yaw = clamp(drag.yaw + dx * 0.0011, -YAW_LIM, YAW_LIM);
      drag.pitch = clamp(drag.pitch + dy * 0.0011, -PITCH_LIM, PITCH_LIM);
    }
    lastInput = performance.now() / 1000;
  }
  function onUp(e) {
    const held = performance.now() - zen.t0;
    const wasZen = zen.engaged;
    if (zen.engaged) {
      zen.engaged = false;
      document.body.classList.remove('zen-hold');
    }
    // clean click → shockwave (unless it was a zen hold or a drag)
    if (!wasZen && held < 350 && zen.moved < 8 && nodes && nodes.shockwave) {
      const nx = (e.clientX / Math.max(window.innerWidth, 1)) * 2 - 1;
      const ny = -((e.clientY / Math.max(window.innerHeight, 1)) * 2 - 1);
      nodes.shockwave(nx, ny);
    }
    drag.down = false;
    canvas.style.cursor = 'grab';
    lastInput = performance.now() / 1000;
  }
  function onWheel(e) {
    if (!orbit.on) return;
    orbit.radius = clamp(orbit.radius + e.deltaY * 0.02, 5, 40);
    lastInput = performance.now() / 1000;
  }

  canvas.style.cursor = 'grab';
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', onPress);
  window.addEventListener('pointermove', onDrag, { passive: true });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: true });

  // ---- scratch ------------------------------------------------------------------
  const basePos = new THREE.Vector3();
  const zenPos = new THREE.Vector3();
  const finalPos = new THREE.Vector3();
  const look = new THREE.Vector3();

  function smooth01(x) {
    const t = clamp(x, 0, 1);
    return t * t * (3 - 2 * t);
  }

  const rig = {
    update(dt, t, scroll) {
      const reduced = isReducedMotion();
      const vel = scroll ? scroll.velNorm : 0;

      // ---- zen hold engagement (press-and-hold OR deliberate drag) ----------
      if (drag.down && !zen.engaged && !orbit.on) {
        if (performance.now() - zen.t0 > 350 || zen.moved > 14) {
          zen.engaged = true;
          zen.az = Math.atan2(camera.position.x - SCULPT.x, camera.position.z - SCULPT.z);
          zen.el = clamp(Math.asin(clamp((camera.position.y - SCULPT.y) /
            Math.max(camera.position.distanceTo(SCULPT), 0.1), -1, 1)), -0.9, 1.2);
          document.body.classList.add('zen-hold');
        }
      }
      zen.factor += ((zen.engaged ? 1 : 0) - zen.factor) * Math.min(1, dt * 3.4);

      // ---- free orbit mode (palette command) --------------------------------
      const flying = scroll ? Math.abs(scroll.velocity) > 40 : false;
      if (orbit.on && !flying && zen.factor < 0.1) {
        if (!orbit.engaged) {
          const dir = new THREE.Vector3().subVectors(camera.position, orbit.pivot);
          orbit.radius = clamp(dir.length(), 5, 40);
          orbit.az = Math.atan2(dir.x, dir.z);
          orbit.el = clamp(Math.asin(clamp((camera.position.y - orbit.pivot.y) / Math.max(orbit.radius, 1), -1, 1)), 0.05, 1.25);
          orbit.engaged = true;
          orbit.vAz = 0; orbit.vEl = 0;
        }
        if (!drag.down) {
          orbit.az += orbit.vAz * dt;
          orbit.el = clamp(orbit.el + orbit.vEl * dt, -0.4, 1.25);
          orbit.vAz *= Math.exp(-dt * 3);
          orbit.vEl *= Math.exp(-dt * 3);
          if (t - lastInput > 12) orbit.az += dt * 0.05;
        }
        const cp = Math.cos(orbit.el);
        camera.position.set(
          orbit.pivot.x + Math.sin(orbit.az) * cp * orbit.radius,
          orbit.pivot.y + Math.sin(orbit.el) * orbit.radius,
          orbit.pivot.z + Math.cos(orbit.az) * cp * orbit.radius,
        );
        camera.lookAt(orbit.pivot);
        camera.fov = damp(camera.fov, 50, 3, dt);
        camera.updateProjectionMatrix();
        return;
      }
      if (orbit.on) orbit.engaged = false;

      // ---- scroll-choreographed pose ----------------------------------------
      const f = scroll ? clamp(scroll.chapterFloat, 0, poseCount - 1) : 0;
      const iA = Math.min(Math.floor(f), poseCount - 2);
      const iB = Math.min(iA + 1, poseCount - 1);
      const mix = smooth01(f - iA);
      const A = poses[iA] || poses[0];
      const B = poses[iB] || poses[0];
      let az = lerp(A.az, B.az, mix);
      let radius = lerp(A.radius, B.radius, mix);
      let height = lerp(A.height, B.height, mix);
      let tx = lerp(A.tx, B.tx, mix);

      // intra-chapter push-in
      const p = scroll ? scroll.chapterP : 0;
      if (scroll && scroll.chapterIndex >= 0 && scroll.chapterIndex <= poseCount - 3) {
        radius += (0.5 - p) * 3.4;
      }

      const fov = 50 + Math.min(Math.abs(vel) * 6, 6);
      const sway = reduced ? 0 : Math.sin(t * 0.09) * 0.14;
      const breathe = reduced ? 0 : Math.sin((t * Math.PI * 2) / 13) * 0.08 + vel * 0.12;

      if (!reduced) {
        parallax.x = damp(parallax.x, parallax.tx, 3.2, dt);
        parallax.y = damp(parallax.y, parallax.ty, 3.2, dt);
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

      // base scroll pose
      const r = Math.max(radius, 5);
      const el = Math.atan2(height, r);
      basePos.set(
        Math.sin(az) * Math.cos(el) * r + sway,
        height + breathe,
        Math.cos(az) * Math.cos(el) * r,
      );
      look.set(tx, 0.4, 0);

      // zen orbit pose
      if (zen.factor > 0.001) {
        const zr = lerp(r, ZEN_RADIUS, zen.factor);
        const zcp = Math.cos(zen.el);
        zenPos.set(
          SCULPT.x + Math.sin(zen.az) * zcp * zr,
          SCULPT.y + Math.sin(zen.el) * zr,
          SCULPT.z + Math.cos(zen.az) * zcp * zr,
        );
        finalPos.copy(basePos).lerp(zenPos, zen.factor);
        look.lerp(SCULPT, zen.factor);
      } else {
        finalPos.copy(basePos);
      }

      camera.position.copy(finalPos);
      camera.lookAt(look);
      const DEG = Math.PI / 180;
      const parAmp = 1 - zen.factor * 0.7; // zen spin owns the camera
      camera.rotateY((drag.yaw + parallax.x * parAmp) * DEG);
      camera.rotateX((drag.pitch - parallax.y * parAmp) * DEG);
      camera.fov = damp(camera.fov, fov, 4, dt);
      camera.updateProjectionMatrix();

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
        orbit.radius = clamp(dir.length(), 5, 40);
        orbit.az = Math.atan2(dir.x, dir.z);
        orbit.el = clamp(Math.asin(clamp((camera.position.y - orbit.pivot.y) / Math.max(orbit.radius, 1), -1, 1)), 0.05, 1.2);
        lastInput = performance.now() / 1000;
      }
      return orbit.on;
    },
    isOrbit() { return orbit.on; },
    noteInput() { lastInput = performance.now() / 1000; },

    dispose() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointermove', onDrag);
      window.removeEventListener('pointerdown', onPress);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
    },
  };
  return rig;
}

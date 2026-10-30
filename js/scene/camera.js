// Camera rig for the Architectural Matrix: spring-damped vector glides from
// any framing straight down a project's data lane to its node, angular cursor
// parallax, drag-to-look with inertia, free orbit around the core (or any
// node), and the flight-velocity queries the post pass uses for speed streaks.

import * as THREE from 'three';
import { MATRIX, damp, clamp } from '../config.js';

const YAW_LIM = 10 * Math.PI / 180;
const PITCH_LIM = 6 * Math.PI / 180;
const PARALLAX_DEG = 1.2; // damped cursor parallax, degrees

// Authored framings of the matrix (plus the dynamic node focus below).
export const WAYPOINTS = {
  overview: { pos: [0, 26, 92], target: [0, 10, 0], fov: 50 },   // the atrium vista
  core:     { pos: [15, 13, 27], target: [0, 15, 0], fov: 46 },  // architectural core close-up
  lane:     { pos: [62, 3.4, 10], target: [0, 7, 0], fov: 54 },  // low skimming run down a grid lane
  skyward:  { pos: [0, 64, 58], target: [0, 10, 0], fov: 55 },   // top-down survey
  // node_focus is computed at runtime by focusNode() — no static frame.
  node_focus: null,
};

// Critically-underdamped spring: arrives fast, settles with a soft overshoot.
const STIFFNESS = 9.0;
const DAMPING = 4.6;

export function createCameraRig(ctx) {
  const { camera, canvas, isReducedMotion } = ctx;
  const base = new THREE.Vector3(...MATRIX.camPos);
  const look = new THREE.Vector3(...MATRIX.camTarget);
  const parallax = { x: 0, y: 0, tx: 0, ty: 0 };
  const drag = { yaw: 0, pitch: 0, vy: 0, vp: 0, down: false, lastX: 0, lastY: 0 };
  const springPos = { p: base.clone(), v: new THREE.Vector3(), goal: new THREE.Vector3(...MATRIX.camPos), fov: null, active: false };
  const springLook = { p: look.clone(), v: new THREE.Vector3(), goal: new THREE.Vector3(...MATRIX.camTarget) };
  const orbit = {
    on: false, pivot: new THREE.Vector3(0, 15, 0), radius: 34,
    az: 0.35, el: 0.36, vAz: 0, vEl: 0,
    homeAz: null, homeEl: null,
    engaged: false,
  };

  function engageOrbitFromCamera() {
    const dir = new THREE.Vector3().subVectors(camera.position, orbit.pivot);
    orbit.radius = clamp(dir.length(), 8, 220);
    orbit.az = Math.atan2(dir.x, dir.z);
    orbit.el = clamp(Math.asin(clamp((camera.position.y - orbit.pivot.y) / Math.max(orbit.radius, 1), -1, 1)), 0.05, 1.35);
    orbit.vAz = 0;
    orbit.vEl = 0;
    orbit.engaged = true;
  }
  let lastInput = -10;
  let fovTarget = MATRIX.fov;
  let waypointName = null;
  let mode = 'world';
  let scrollVel = 0;
  let warp = 0;
  let whip = 0;

  function applyWhip(cam, dt) {
    if (whip < 0.001) return;
    whip *= Math.exp(-dt * 6.5);
    cam.rotateY(whip * 1.05);
    cam.fov = Math.min(cam.fov + Math.abs(whip) * 24, 95);
    cam.updateProjectionMatrix();
  }

  function springStep(s, dt, stiffness = STIFFNESS, damping = DAMPING) {
    const k = stiffness, c = damping;
    s.v.x += (s.goal.x - s.p.x) * k * dt;
    s.v.y += (s.goal.y - s.p.y) * k * dt;
    s.v.z += (s.goal.z - s.p.z) * k * dt;
    s.v.multiplyScalar(Math.exp(-c * dt));
    s.p.addScaledVector(s.v, dt);
  }

  function onMove(e) {
    if (!window.innerWidth || !window.innerHeight) return;
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = (e.clientY / window.innerHeight) * 2 - 1;
    parallax.tx = nx * PARALLAX_DEG;
    parallax.ty = ny * PARALLAX_DEG;
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
      orbit.el = clamp(orbit.el + dy * 0.004, -0.05, 1.35);
    } else {
      drag.vy = dx * 0.16 * 0.0012 * 60;
      drag.vp = dy * 0.10 * 0.0012 * 60;
      drag.yaw = clamp(drag.yaw + dx * 0.0012, -YAW_LIM, YAW_LIM);
      drag.pitch = clamp(drag.pitch + dy * 0.0012, -PITCH_LIM, PITCH_LIM);
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
    orbit.radius = clamp(orbit.radius + e.deltaY * 0.06, 12, 220);
    lastInput = performance.now() / 1000;
  }

  canvas.style.cursor = 'grab';
  window.addEventListener('pointermove', onMove, { passive: true });
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onDrag, { passive: true });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: true });

  const rig = {
    update(dt, t) {
      const reduced = isReducedMotion();

      // orbit defers to an in-flight waypoint spring, then engages
      const springFlying = springPos.active &&
        (springPos.v.length() > 0.6 || springPos.p.distanceTo(springPos.goal) > 0.8);
      if (orbit.on && !springFlying) {
        if (!orbit.engaged) engageOrbitFromCamera();
        if (!drag.down) {
          orbit.az += orbit.vAz * dt;
          orbit.el = clamp(orbit.el + orbit.vEl * dt, -0.05, 1.35);
          orbit.vAz *= Math.exp(-dt * 3);
          orbit.vEl *= Math.exp(-dt * 3);
          if (orbit.homeAz !== null && t - lastInput > 2.5) {
            orbit.az = damp(orbit.az, orbit.homeAz, 2, dt);
            orbit.el = damp(orbit.el, orbit.homeEl, 2, dt);
          }
        }
        if (orbit.homeAz === null && t - lastInput > 12) orbit.az += dt * 0.05;
        const r = orbit.radius;
        const cp = Math.cos(orbit.el);
        camera.position.set(
          orbit.pivot.x + Math.sin(orbit.az) * cp * r,
          Math.max(orbit.pivot.y + Math.sin(orbit.el) * r, 2.2),
          orbit.pivot.z + Math.cos(orbit.az) * cp * r,
        );
        camera.lookAt(orbit.pivot);
        camera.fov = damp(camera.fov, 48 + warp, 3, dt);
        camera.updateProjectionMatrix();
        applyWhip(camera, dt);
        mode = 'orbit';
        return;
      }
      if (orbit.on) orbit.engaged = false;
      mode = 'world';

      // scroll-velocity FOV warp
      warp = damp(warp, springPos.active ? Math.min(4, Math.abs(scrollVel) / 700) : Math.min(1.2, Math.abs(scrollVel) / 2200), 5, dt);

      if (springPos.active) {
        springStep(springPos, dt, reduced ? 14 : STIFFNESS, reduced ? 8 : DAMPING);
        springStep(springLook, dt, reduced ? 14 : STIFFNESS + 2, reduced ? 8 : DAMPING + 1);
        camera.fov = damp(camera.fov, (springPos.fov ?? fovTarget) + warp, 2.4, dt);
      } else {
        camera.fov = damp(camera.fov, fovTarget + warp, 3, dt);
        springPos.p.copy(base);
        springLook.p.copy(look);
      }
      camera.updateProjectionMatrix();

      // idle drift: the matrix is alive even when parked
      const breathe = reduced ? 0 : Math.sin((t * Math.PI * 2) / 13) * 0.5;
      const sway = reduced ? 0 : Math.sin(t * 0.09) * 0.35;

      if (!reduced) {
        const amp = springPos.active ? 0.5 : 1;
        parallax.x = damp(parallax.x, parallax.tx * amp, 3.5, dt);
        parallax.y = damp(parallax.y, parallax.ty * amp, 3.5, dt);
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

      camera.position.set(
        springPos.active ? springPos.p.x + sway : base.x + sway,
        springPos.active ? Math.max(springPos.p.y + breathe, 2.2) : base.y + breathe,
        springPos.active ? springPos.p.z : base.z,
      );
      camera.position.y = Math.max(camera.position.y, 2.0);

      const lookGoal = springPos.active ? springLook.p : look;
      camera.lookAt(lookGoal);
      const DEG = Math.PI / 180;
      camera.rotateY(drag.yaw + parallax.x * DEG);
      camera.rotateX(drag.pitch - parallax.y * DEG);
      applyWhip(camera, dt);
    },

    whipPan(strength = 1) { whip = 0.55 * strength; },

    // ---- showcase API -----------------------------------------------------
    // cfg: waypoint name from WAYPOINTS, or { pos:[..], target:[..], fov }
    transitionToWaypoint(cfg) {
      const wp = typeof cfg === 'string' ? WAYPOINTS[cfg] : cfg;
      if (!wp) return null;
      waypointName = typeof cfg === 'string' ? cfg : 'custom';
      springPos.goal.set(...wp.pos);
      springPos.fov = wp.fov ?? MATRIX.fov;
      springLook.goal.set(...wp.target);
      if (!springPos.active) {
        springPos.p.copy(camera.position);
        springLook.p.copy(look);
      }
      springPos.active = true;
      springPos.v.multiplyScalar(0.35);
      return waypointName;
    },

    releaseWaypoint() {
      if (!springPos.active) return;
      springPos.active = false;
      waypointName = null;
      base.copy(camera.position);
      base.y = Math.max(base.y, 2.2);
      look.set(...MATRIX.camTarget);
    },

    // node_focus: glide along the data lane to whichever rack is selected
    focusNode(anchor) {
      if (!anchor) return null;
      waypointName = 'node_focus';
      springPos.goal.copy(anchor.pos);
      springPos.fov = 42;
      springLook.goal.copy(anchor.look);
      if (!springPos.active) {
        springPos.p.copy(camera.position);
        springLook.p.copy(look);
      }
      springPos.active = true;
      springPos.v.multiplyScalar(0.35);
      return waypointName;
    },

    getActiveWaypoint() { return springPos.active ? (waypointName || null) : null; },
    isTransitioning() { return springPos.active && springPos.v.length() > 0.8; },
    getFlightVelocity() { return springPos.active ? springPos.v.length() : 0; },
    setScrollVelocity(v) { scrollVel = v; },
    getWaypoint() { return springPos.active ? waypointName : null; },

    setOrbitPivot(pivot, { radius = 30, homeAz = 0.18, homeEl = 0.34 } = {}) {
      orbit.pivot.copy(pivot);
      orbit.radius = clamp(radius, 8, 220);
      orbit.homeAz = homeAz;
      orbit.homeEl = homeEl;
    },

    setOrbit(on) {
      orbit.on = !!on;
      orbit.engaged = false;
      if (on) {
        springPos.active = false;
        waypointName = null;
        const dir = new THREE.Vector3().subVectors(camera.position, orbit.pivot);
        orbit.radius = clamp(dir.length(), 8, 220);
        orbit.az = Math.atan2(dir.x, dir.z);
        orbit.el = clamp(Math.asin(clamp((camera.position.y - orbit.pivot.y) / Math.max(orbit.radius, 1), -1, 1)), 0.08, 1.3);
        lastInput = performance.now() / 1000;
      }
      return orbit.on;
    },

    isOrbit() { return orbit.on; },
    getMode() { return mode; },
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

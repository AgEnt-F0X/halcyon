// Interaction layer: magnetic morphing cursor, 3D raycast hover/click on the
// project racks, wheel-to-teleport node stepping, and the pointer parallax
// vector the matrix shaders consume. Lean on purpose — the matrix is the star.

import * as THREE from 'three';

export function createInteractions(ctx) {
  const { document: doc, camera, canvas, nodes, rig, isReducedMotion } = ctx;
  const toast = (msg, opts) => (ctx.showcase && ctx.showcase.toast ? ctx.showcase.toast(msg, opts) : null);

  // ---------------- pointer parallax target (main damps it into uniforms) ---
  const pointerTarget = { x: 0, y: 0 };

  // ---------------- magnetic morphing cursor --------------------------------
  const ring = doc.getElementById('cursor-ring');
  const label = doc.getElementById('cursor-label');
  const cursor = { x: innerWidth / 2, y: innerHeight / 2, rx: innerWidth / 2, ry: innerHeight / 2 };
  let magnetEl = null;
  const finePointer = matchMedia('(pointer: fine)').matches;

  function onCursorMove(e) {
    cursor.x = e.clientX;
    cursor.y = e.clientY;
    pointerTarget.x = (e.clientX / Math.max(innerWidth, 1)) * 2 - 1;
    pointerTarget.y = (e.clientY / Math.max(innerHeight, 1)) * 2 - 1;
    // magnetic snap: nearest [data-magnetic] within range
    const targets = doc.querySelectorAll('[data-magnetic]');
    let best = null, bestD = 74 * 74;
    for (const el of targets) {
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = cursor.x - cx, dy = cursor.y - cy;
      const d2 = dx * dx + dy * dy;
      const range = 74 + Math.max(r.width, r.height) / 2;
      if (d2 < range * range && d2 < bestD) { bestD = d2; best = el; }
    }
    if (best !== magnetEl) {
      magnetEl = best;
      if (best) {
        const text = best.getAttribute('data-cursor-label');
        if (text) {
          label.textContent = text;
          ring.classList.add('is-label');
        } else {
          ring.classList.remove('is-label');
        }
      } else {
        ring.classList.remove('is-label');
      }
    }
  }
  if (finePointer) window.addEventListener('pointermove', onCursorMove, { passive: true });

  // ---------------- 3D raycast: rack hover + teleport click ------------------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hoveredNode = -1;
  let downAt = null;

  function raycastNode(e) {
    if (!nodes || !nodes.hitboxes || !nodes.hitboxes.length) return -1;
    ndc.set((e.clientX / Math.max(innerWidth, 1)) * 2 - 1, -(e.clientY / Math.max(innerHeight, 1)) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(nodes.hitboxes, false);
    return hits.length ? hits[0].object.userData.nodeIndex : -1;
  }

  function setHovered(i) {
    if (i === hoveredNode) return;
    hoveredNode = i;
    // pin highlight via the nodes module pins (index-matched buttons)
    const pins = doc.querySelectorAll('.node-pin');
    pins.forEach((p, k) => p.classList.toggle('is-hover', k === i));
    if (i >= 0) {
      label.textContent = 'TELEPORT';
      ring.classList.add('is-label');
      canvas.style.cursor = 'pointer';
    } else if (!magnetEl) {
      ring.classList.remove('is-label');
      canvas.style.cursor = 'grab';
    }
  }

  canvas.addEventListener('pointermove', (e) => {
    if (downAt) return; // dragging
    if (!finePointer) return;
    setHovered(raycastNode(e));
  }, { passive: true });

  canvas.addEventListener('pointerdown', (e) => {
    downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
  });

  canvas.addEventListener('pointerup', (e) => {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    const dt = performance.now() - downAt.t;
    downAt = null;
    if (moved > 7 || dt > 420) return; // that was a drag, not a click
    const i = raycastNode(e);
    if (i >= 0) {
      window.dispatchEvent(new CustomEvent('halcyon:node-select', { detail: { index: i } }));
    }
  });

  // ---------------- wheel: step through nodes (orbit mode zooms instead) ----
  let wheelCooldown = 0;
  canvas.addEventListener('wheel', (e) => {
    if (rig && rig.isOrbit()) return; // orbit uses the wheel to zoom
    const now = performance.now();
    if (now < wheelCooldown) return;
    wheelCooldown = now + 520;
    const dir = e.deltaY > 0 ? 1 : -1;
    if (ctx.showcase && ctx.showcase.stepNode) ctx.showcase.stepNode(dir);
  }, { passive: true });

  // ---------------- internal loop (cursor spring) ----------------------------
  let lastT = performance.now();
  function loop() {
    const now = performance.now();
    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;
    if (finePointer) {
      if (magnetEl) {
        const r = magnetEl.getBoundingClientRect();
        cursor.rx += (r.left + r.width / 2 - cursor.rx) * Math.min(1, dt * 18);
        cursor.ry += (r.top + r.height / 2 - cursor.ry) * Math.min(1, dt * 18);
      } else {
        cursor.rx += (cursor.x - cursor.rx) * Math.min(1, dt * 14);
        cursor.ry += (cursor.y - cursor.ry) * Math.min(1, dt * 14);
      }
      ring.style.transform = `translate(${cursor.rx.toFixed(1)}px, ${cursor.ry.toFixed(1)}px) translate(-50%, -50%)`;
    }
    requestAnimationFrame(loop);
  }
  if (finePointer && !isReducedMotion()) requestAnimationFrame(loop);

  return {
    pointerTarget,
    dispose() {
      window.removeEventListener('pointermove', onCursorMove);
    },
  };
}

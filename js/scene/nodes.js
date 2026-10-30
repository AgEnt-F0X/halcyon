// Project nodes: every repository becomes an architectural server rack — a
// telemetry hub standing in the matrix, marked by a data beam rising into the
// sky. ALL racks merge into one solid mesh + one line mesh + one beam mesh
// (3 draw calls total), with per-vertex accent colours and node ids so the
// active node glows via uniforms. DOM pins project the names each frame.

import * as THREE from 'three';
import { MATRIX, clamp } from '../config.js';
import {
  createRackSolidMaterial, createRackLineMaterial, createBeamMaterial,
} from './materials.js';

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const BEAM_H = 90;

// deterministic rack layout: golden-angle spiral over three concentric rings
function layoutPositions(n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = i * GOLDEN_ANGLE + 0.6;
    const r = MATRIX.nodeRadius - 12 + (i % 3) * MATRIX.ringGap + (i % 2) * 4;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

export function createNodes(ctx) {
  const { scene, shared, document: doc } = ctx;
  const group = new THREE.Group();
  group.name = 'projectNodes';
  scene.add(group);

  const solidMat = createRackSolidMaterial(shared);
  const lineMat = createRackLineMaterial(shared);
  const beamMat = createBeamMaterial(shared);

  let nodes = [];            // { name, accent, pos:Vector3, pin:el, pulseBase:[k,k] }
  let activeIndex = -1;
  let focusTarget = 0;
  let built = false;

  const solidMesh = new THREE.Mesh(new THREE.BufferGeometry(), solidMat);
  const lineMesh = new THREE.LineSegments(new THREE.BufferGeometry(), lineMat);
  const beamMesh = new THREE.Mesh(new THREE.BufferGeometry(), beamMat);
  beamMesh.frustumCulled = false;
  const pulseGeo = new THREE.BufferGeometry();
  const pulseMat = new THREE.PointsMaterial({
    size: 1.15, sizeAttenuation: true, vertexColors: true,
    transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const pulsePoints = new THREE.Points(pulseGeo, pulseMat);
  pulsePoints.frustumCulled = false;
  group.add(solidMesh, lineMesh, beamMesh, pulsePoints);

  const hitboxes = [];

  // ---- geometry helpers ----------------------------------------------------
  function pushBox(list, w, h, d, x, y, z, color) {
    // non-indexed box with position/normal, centered at (x,y,z)
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    g.translate(x, y, z);
    list.push(g);
  }

  function bakeAttrs(geoms, perNode) {
    // merge position+normal arrays; fill aColor (per-vertex colour) + aNode
    let vTotal = 0;
    for (const g of geoms) vTotal += g.attributes.position.count;
    const pos = new Float32Array(vTotal * 3);
    const nor = new Float32Array(vTotal * 3);
    const col = new Float32Array(vTotal * 3);
    const node = new Float32Array(vTotal);
    let o = 0;
    geoms.forEach((g, gi) => {
      const p = g.attributes.position.array;
      const nn = g.attributes.normal.array;
      const n = g.attributes.position.count;
      pos.set(p, o * 3);
      nor.set(nn, o * 3);
      const c = g.userData.color || [1, 1, 1];
      const idx = perNode ? (g.userData.node ?? 0) : 0;
      for (let i = 0; i < n; i++) {
        col[(o + i) * 3] = c[0]; col[(o + i) * 3 + 1] = c[1]; col[(o + i) * 3 + 2] = c[2];
        node[o + i] = idx;
      }
      o += n;
      g.dispose();
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aNode', new THREE.BufferAttribute(node, 1));
    return geo;
  }

  function bakeLineSegments(segs, perNode) {
    // segs: array of { pts: Float32Array (pairs), color:[r,g,b], node }
    let vTotal = 0;
    for (const s of segs) vTotal += s.pts.length / 3;
    const pos = new Float32Array(vTotal * 3);
    const col = new Float32Array(vTotal * 3);
    const node = new Float32Array(vTotal);
    let o = 0;
    for (const s of segs) {
      const n = s.pts.length / 3;
      pos.set(s.pts, o * 3);
      for (let i = 0; i < n; i++) {
        col[(o + i) * 3] = s.color[0]; col[(o + i) * 3 + 1] = s.color[1]; col[(o + i) * 3 + 2] = s.color[2];
        node[o + i] = perNode ? (s.node ?? 0) : 0;
      }
      o += n;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aNode', new THREE.BufferAttribute(node, 1));
    return geo;
  }

  function boxEdges(w, h, d, x, y, z) {
    const hw = w / 2, hh = h / 2, hd = d / 2;
    const c = [
      [x - hw, y - hh, z - hd], [x + hw, y - hh, z - hd], [x + hw, y - hh, z + hd], [x - hw, y - hh, z + hd],
      [x - hw, y + hh, z - hd], [x + hw, y + hh, z - hd], [x + hw, y + hh, z + hd], [x - hw, y + hh, z + hd],
    ];
    const pairs = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    const pts = new Float32Array(pairs.length * 6);
    let k = 0;
    for (const [a, b] of pairs) {
      pts[k++] = c[a][0]; pts[k++] = c[a][1]; pts[k++] = c[a][2];
      pts[k++] = c[b][0]; pts[k++] = c[b][1]; pts[k++] = c[b][2];
    }
    return pts;
  }

  function ringLine(x, z, r, segs = 48, y = 0.05) {
    const pts = new Float32Array(segs * 6);
    let k = 0;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      pts[k++] = x + Math.cos(a0) * r; pts[k++] = y; pts[k++] = z + Math.sin(a0) * r;
      pts[k++] = x + Math.cos(a1) * r; pts[k++] = y; pts[k++] = z + Math.sin(a1) * r;
    }
    return pts;
  }

  const tmpColor = new THREE.Color();
  function rgbOf(hex) { tmpColor.set(hex); return [tmpColor.r, tmpColor.g, tmpColor.b]; }

  // ---- build / rebuild -------------------------------------------------------
  function build(projects) {
    // dispose previous pin elements
    const pinsRoot = doc.getElementById('node-pins');
    if (pinsRoot) pinsRoot.textContent = '';
    hitboxes.length = 0;
    const layout = layoutPositions(projects.length);
    nodes = projects.map((p, i) => {
      const [x, z] = layout[i];
      const pin = doc.createElement('button');
      pin.type = 'button';
      pin.className = 'node-pin';
      pin.innerHTML = `<i></i><span>${String(i + 1).padStart(2, '0')} · ${p.name}</span>`;
      pin.style.setProperty('--pc', p.accent);
      pin.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('halcyon:node-select', { detail: { index: i, project: p } }));
      });
      pinsRoot && pinsRoot.appendChild(pin);
      return {
        name: p.name,
        accent: p.accent || '#4da6ff',
        pos: new THREE.Vector3(x, 0, z),
        pin,
        base: [0.37, 0.87],
      };
    });

    const solids = [];
    const segs = [];
    const beams = { pos: [], uv: [], col: [], node: [], idx: [] };

    nodes.forEach((nd, i) => {
      const { x, z } = nd.pos;
      const accent = rgbOf(nd.accent);
      const steel = [0.085, 0.105, 0.15];
      const steelLight = [0.14, 0.17, 0.24];

      // plinth + four deck slabs + screen + mast + tip
      const parts = [
        [7.0, 0.5, 4.6, x, 0.25, z, steelLight],
        [6.2, 0.6, 3.8, x, 1.0, z, steel],
        [6.2, 0.6, 3.8, x, 2.0, z, steel],
        [6.2, 0.6, 3.8, x, 3.0, z, steel],
        [6.2, 0.6, 3.8, x, 4.0, z, steel],
        [4.6, 0.3, 0.22, x, 4.68, z + 1.9, accent],
        [0.16, 3.0, 0.16, x, 6.2, z - 1.2, accent],
        [0.42, 0.42, 0.42, x, 7.85, z - 1.2, accent],
      ];
      for (const [w, h, d, px, py, pz, c] of parts) {
        const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
        g.translate(px, py, pz);
        g.userData.color = c;
        g.userData.node = i;
        solids.push(g);
        segs.push({ pts: boxEdges(w, h, d, px, py, pz), color: c, node: i });
      }
      segs.push({ pts: ringLine(x, z, 4.7), color: accent, node: i });

      // crossed beam quads (two planes, X and Z aligned)
      for (const rot of [0, Math.PI / 2]) {
        const w = 1.5;
        const cw = Math.cos(rot) * w, sw = Math.sin(rot) * w;
        const base = beams.pos.length / 3;
        beams.pos.push(
          x - cw, 0.5, z - sw, x + cw, 0.5, z + sw,
          x + cw, BEAM_H, z + sw, x - cw, BEAM_H, z - sw,
        );
        beams.uv.push(0, 0, 1, 0, 1, 1, 0, 1);
        for (let k = 0; k < 4; k++) beams.col.push(accent[0], accent[1], accent[2]);
        for (let k = 0; k < 4; k++) beams.node.push(i);
        beams.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }

      // invisible hitbox for raycast hover/click
      const hb = new THREE.Mesh(
        new THREE.BoxGeometry(8.2, 9.2, 5.6),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      hb.position.set(x, 4.6, z);
      hb.userData.nodeIndex = i;
      group.add(hb);
      hitboxes.push(hb);
    });

    solidMesh.geometry.dispose();
    solidMesh.geometry = bakeAttrs(solids, true);
    lineMesh.geometry.dispose();
    lineMesh.geometry = bakeLineSegments(segs, true);

    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(beams.pos), 3));
    bg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(beams.uv), 2));
    bg.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(beams.col), 3));
    bg.setAttribute('aNode', new THREE.BufferAttribute(new Float32Array(beams.node), 1));
    bg.setIndex(beams.idx);
    beamMesh.geometry.dispose();
    beamMesh.geometry = bg;

    // pulse points: 2 per node
    const pn = nodes.length * 2;
    pulseGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pn * 3), 3));
    const pcol = new Float32Array(pn * 3);
    nodes.forEach((nd, i) => {
      const c = rgbOf(nd.accent);
      for (let k = 0; k < 2; k++) {
        pcol[(i * 2 + k) * 3] = c[0]; pcol[(i * 2 + k) * 3 + 1] = c[1]; pcol[(i * 2 + k) * 3 + 2] = c[2];
      }
      nd.base = [0.21, 0.71];
    });
    pulseGeo.setAttribute('color', new THREE.BufferAttribute(pcol, 3));
    built = true;
  }

  // ---- API -------------------------------------------------------------------
  function getPos(nameOrIndex, out = new THREE.Vector3()) {
    const nd = typeof nameOrIndex === 'number' ? nodes[nameOrIndex]
      : nodes.find(n => n.name.toLowerCase() === String(nameOrIndex).toLowerCase());
    if (!nd) return null;
    return out.copy(nd.pos).setY(4.4);
  }

  const anchorPos = new THREE.Vector3();
  const anchorLook = new THREE.Vector3();
  function getFocusAnchor(index) {
    const nd = nodes[index];
    if (!nd) return null;
    // glide in along the radial data lane, framing the whole rack + beam
    const len = Math.hypot(nd.pos.x, nd.pos.z) || 1;
    const dx = nd.pos.x / len, dz = nd.pos.z / len;
    anchorPos.set(nd.pos.x + dx * 32, 9.2, nd.pos.z + dz * 32);
    anchorLook.set(nd.pos.x, 5.0, nd.pos.z);
    return { pos: anchorPos, look: anchorLook };
  }

  function setActive(index) {
    activeIndex = index;
    shared.uActiveNode.value = index;
    nodes.forEach((nd, i) => {
      if (nd.pin) nd.pin.classList.toggle('is-active', i === index);
    });
    if (index >= 0 && nodes[index]) {
      shared.uAccent.value.set(nodes[index].accent);
      nd_focusPulse(index);
    }
  }

  function nd_focusPulse(index) {
    const nd = nodes[index];
    if (!nd) return;
    shared.uScanOrigin.value.copy(nd.pos).setY(0);
    shared.uScanT.value = 0;
  }

  function pulseAll() {
    for (let i = 0; i < nodes.length; i++) {
      // staggered rings radiating from every node
      setTimeout(() => nd_focusPulse(i), i * 90);
    }
  }

  function setFocusTarget(v) { focusTarget = clamp(v, 0, 1); }

  function accentOf(index) { return nodes[index] ? nodes[index].accent : '#4da6ff'; }

  function byName(name) {
    const key = String(name || '').toLowerCase();
    return nodes.findIndex(n => n.name.toLowerCase() === key);
  }

  function applyTier(tier) {
    beamMesh.visible = !!tier.beams;
    pulsePoints.visible = !!tier.beams;
  }

  // ---- per-frame --------------------------------------------------------------
  const projV = new THREE.Vector3();
  const scanSpeed = 0.5;
  function update(dt, t, camera) {
    if (!built || !nodes.length) return;
    shared.uFocus.value += (focusTarget - shared.uFocus.value) * Math.min(1, dt * 4);

    // grid scan ring lifecycle
    if (shared.uScanT.value < 1.25) shared.uScanT.value += dt * scanSpeed;
    else if (shared.uScanT.value !== 2) shared.uScanT.value = 2;

    // rising data pulses along the beams
    const pp = pulseGeo.attributes.position;
    for (let i = 0; i < nodes.length; i++) {
      const nd = nodes[i];
      for (let k = 0; k < 2; k++) {
        const prog = (t * 0.12 + nd.base[k] + i * 0.13) % 1;
        pp.setXYZ(i * 2 + k, nd.pos.x, 1 + prog * (BEAM_H - 6), nd.pos.z);
      }
    }
    pp.needsUpdate = true;

    // project DOM pins
    const w = window.innerWidth, h = window.innerHeight;
    const showPins = w > 0 && h > 0;
    for (let i = 0; i < nodes.length; i++) {
      const nd = nodes[i];
      if (!nd.pin) continue;
      if (!showPins) { nd.pin.style.opacity = '0'; continue; }
      projV.set(nd.pos.x, 8.9, nd.pos.z).project(camera);
      const behind = projV.z > 1;
      const off = projV.x < -1.15 || projV.x > 1.15 || projV.y < -1.15 || projV.y > 1.15;
      if (behind || off) {
        nd.pin.style.opacity = '0';
        nd.pin.style.pointerEvents = 'none';
      } else {
        const px = (projV.x * 0.5 + 0.5) * w;
        const py = (-projV.y * 0.5 + 0.5) * h;
        nd.pin.style.opacity = '';
        nd.pin.style.pointerEvents = '';
        nd.pin.style.transform = `translate(-50%, -100%) translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
      }
    }
  }

  return {
    group, build, update, applyTier,
    getPos, getFocusAnchor, setActive, setFocusTarget,
    focusPulse: nd_focusPulse, pulseAll, accentOf, byName,
    hitboxes,
    get count() { return nodes.length; },
    get activeIndex() { return activeIndex; },
  };
}

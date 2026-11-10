#!/usr/bin/env node
/**
 * Refine the extracted muscles.glb before the shading bake (run after tools/extract-muscles.mjs):
 *
 *   node tools/refine-muscles.mjs
 *
 * - Rectus abdominis: the modelled straps are sheared sideways so both lie the same distance from the
 *   midline (the pubic landmark of this body sits 9 mm left of it): medial borders 4 mm from the midline
 *   at the pubis and 11 mm at the costal margin, as the linea alba widens above the umbilicus. They are
 *   subdivided twice (rows about 4 mm apart) so the bake can draw their tendinous intersections, and
 *   moved back where needed to lie at least 2 mm behind the BodyParts3D external oblique, whose medial
 *   part is its aponeurosis (the front of the rectus sheath); they pierced it in places.
 * - Linea alba: the BodyParts3D part is a rod that stands in front of the recti at the pubis and behind
 *   them higher up; it is rebuilt as a flat band 1.5 mm thick that fills the gap at the midline between the
 *   recti and the external obliques' aponeuroses, flush with the aponeuroses and tucked 3 mm under them.
 * - Occipitofrontalis: the epicranial aponeurosis (galea) is added between the frontal and occipital
 *   bellies, a sheet 1 mm thick cast onto the vault of this skull just beneath the bellies' edges, so
 *   the scalp is closed. The bake marks it as aponeurosis (thin).
 *
 * New vertices take the bone binding (_SKIN) of the nearest original vertex. Every primitive's _TISSUE is
 * removed (re-run tools/bake-shading.mjs); muscles.json and muscles-provenance.json are updated. A node
 * already refined (extras.refined) is left alone, so running twice changes nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { acceleratedRaycast } from 'three-mesh-bvh';
import { THREE, V, r6, weld, smoothNormals, mergePieces, subdivide, taubin, bboxOf, centroid, bvhOf, pca, signedVolume } from './mesh-lib.mjs';

THREE.Mesh.prototype.raycast = acceleratedRaycast;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const io = new NodeIO();
const glbPath = path.join(root, 'public/models/muscles.glb');
const jsonPath = path.join(root, 'src/lab/generated/muscles.json');
const provPath = path.join(root, 'src/lab/generated/muscles-provenance.json');
const doc = await io.readBinary(new Uint8Array(fs.readFileSync(glbPath)));
const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const prov = JSON.parse(fs.readFileSync(provPath, 'utf8'));
const buffer = doc.getRoot().listBuffers()[0];

// ── Access ───────────────────────────────────────────────────────────────
const nodeOf = (id) => { const n = doc.getRoot().listNodes().find((x) => x.getName() === id); if (!n) throw new Error(`no node ${id}`); return n; };
function read(id) {
  const prim = nodeOf(id).getMesh().listPrimitives()[0];
  return {
    prim,
    positions: Float32Array.from(prim.getAttribute('POSITION').getArray()),
    normals: Float32Array.from(prim.getAttribute('NORMAL').getArray()),
    skin: Float32Array.from(prim.getAttribute('_SKIN').getArray()),
    indices: Uint32Array.from(prim.getIndices().getArray()),
  };
}
function write(id, m, note) {
  const node = nodeOf(id), prim = node.getMesh().listPrimitives()[0];
  const set = (name, type, array) => {
    const old = prim.getAttribute(name);
    prim.setAttribute(name, doc.createAccessor().setType(type).setArray(array).setBuffer(buffer));
    if (old && old.listParents().length <= 1) old.dispose();
  };
  set('POSITION', 'VEC3', m.positions);
  set('NORMAL', 'VEC3', m.normals);
  set('_SKIN', 'VEC3', m.skin);
  const oldIdx = prim.getIndices();
  prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(m.positions.length / 3 < 65536 ? Uint16Array.from(m.indices) : Uint32Array.from(m.indices)).setBuffer(buffer));
  if (oldIdx && oldIdx.listParents().length <= 1) oldIdx.dispose();
  node.setExtras({ ...node.getExtras(), refined: note });
  // Geometry facts, as tools/extract-muscles.mjs writes them.
  const g = json.structures[id], [lo, hi] = bboxOf(m.positions), c = centroid(m.positions), p = pca(m.positions), ax = V(p.axes[0]);
  let nearest = 0, nd = Infinity, i0 = 0, i1 = 0, lo0 = Infinity, hi0 = -Infinity;
  for (let i = 0; i < m.positions.length; i += 3) {
    const d = Math.hypot(m.positions[i] - c[0], m.positions[i + 1] - c[1], m.positions[i + 2] - c[2]);
    if (d < nd) { nd = d; nearest = i; }
    const t = m.positions[i] * ax.x + m.positions[i + 1] * ax.y + m.positions[i + 2] * ax.z;
    if (t < lo0) { lo0 = t; i0 = i / 3; }
    if (t > hi0) { hi0 = t; i1 = i / 3; }
  }
  Object.assign(g, {
    bounds: [lo.map(r6), hi.map(r6)], centroid: c.map(r6), surfaceAnchor: [m.positions[nearest], m.positions[nearest + 1], m.positions[nearest + 2]].map(r6),
    axes: p.axes.map((a) => a.map(r6)), extentsMm: p.extents.map((e) => r6(e * 1000)), ends: [i0, i1],
    vertexCount: m.positions.length / 3, triangleCount: m.indices.length / 3,
  });
}
const refined = (id) => !!nodeOf(id).getExtras()?.refined;
/** _SKIN of the nearest vertex of `from` for every vertex of `positions`. */
function skinFrom(positions, from) {
  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    let best = 0, bd = Infinity;
    for (const f of from) for (let k = 0; k < f.positions.length; k += 3) {
      const d = (f.positions[k] - positions[i]) ** 2 + (f.positions[k + 1] - positions[i + 1]) ** 2 + (f.positions[k + 2] - positions[i + 2]) ** 2;
      if (d < bd) { bd = d; best = k; out.set(f.skin.subarray(k, k + 3), i); }
    }
    void best;
  }
  return out;
}
/** A closed slab from two grids (top and bottom, nu × nv points each), outward-wound, lightly smoothed. */
function slab(top, bottom, nu, nv, smooth = 2) {
  const pos = [], idx = [];
  for (const p of [...top, ...bottom]) pos.push(p.x, p.y, p.z);
  const T = (i, j) => j * nu + i, B = (i, j) => nu * nv + j * nu + i;
  for (let j = 0; j < nv - 1; j++) for (let i = 0; i < nu - 1; i++) {
    idx.push(T(i, j), T(i + 1, j), T(i, j + 1), T(i + 1, j), T(i + 1, j + 1), T(i, j + 1));
    idx.push(B(i, j), B(i, j + 1), B(i + 1, j), B(i + 1, j), B(i, j + 1), B(i + 1, j + 1));
  }
  const side = (a, b, c, d) => idx.push(a, c, b, b, c, d);
  for (let i = 0; i < nu - 1; i++) { side(T(i, 0), T(i + 1, 0), B(i, 0), B(i + 1, 0)); side(T(i + 1, nv - 1), T(i, nv - 1), B(i + 1, nv - 1), B(i, nv - 1)); }
  for (let j = 0; j < nv - 1; j++) { side(T(0, j + 1), T(0, j), B(0, j + 1), B(0, j)); side(T(nu - 1, j), T(nu - 1, j + 1), B(nu - 1, j), B(nu - 1, j + 1)); }
  let m = weld(Float32Array.from(pos), Uint32Array.from(idx));
  if (signedVolume(m) < 0) { const f = Uint32Array.from(m.indices); for (let t = 0; t < f.length; t += 3) [f[t + 1], f[t + 2]] = [f[t + 2], f[t + 1]]; m = { positions: m.positions, indices: f }; }
  if (smooth) taubin(m.positions, m.indices, smooth);
  return m;
}
const done = [];

// ── Rectus abdominis: the same distance from the midline on both sides ─────
const RECTUS_MEDIAL = { bottom: 0.004, top: 0.011 };
for (const side of ['left', 'right']) {
  const id = `rectus-abdominis-${side}`;
  if (refined(id)) continue;
  // Subdivided twice (rows about 4 mm apart instead of 18), so its tendinous intersections can be drawn.
  const coarse = read(id), once = subdivide(coarse.positions, coarse.indices), fine = subdivide(once.positions, once.indices);
  const m = { ...coarse, positions: fine.positions, indices: fine.indices, skin: skinFrom(fine.positions, [coarse]) };
  const sg = side === 'left' ? 1 : -1, P = m.positions;
  const [lo, hi] = bboxOf(P), h = hi[1] - lo[1];
  // The medial border (smallest distance past the midline on this side) near the bottom and the top.
  const medialAt = (y) => { let best = Infinity; for (let i = 0; i < P.length; i += 3) if (Math.abs(P[i + 1] - y) < 0.012) best = Math.min(best, P[i] * sg); return best; };
  const yb = lo[1] + 0.02 * h, yt = hi[1] - 0.04 * h;
  const mb = medialAt(yb), mt = medialAt(yt);
  for (let i = 0; i < P.length; i += 3) {
    const v = THREE.MathUtils.clamp((P[i + 1] - yb) / (yt - yb), 0, 1);
    const shift = (RECTUS_MEDIAL.bottom - mb) * (1 - v) + (RECTUS_MEDIAL.top - mt) * v;
    P[i] += sg * shift;
  }
  // Inside the rectus sheath: where the external oblique's aponeurosis lies over it, the strap sits at least
  // 2 mm behind the aponeurosis (it pierced it in places). The shift needed is spread over 2 cm so the
  // strap keeps its shape and thickness.
  const eo = read(`external-oblique-${side}`);
  const eoMesh = new THREE.Mesh(bvhOf(eo).geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  eoMesh.geometry.boundsTree = eo.bvh;
  const rc = new THREE.Raycaster(), need = new Float32Array(P.length / 3);
  for (let i = 0; i < P.length; i += 3) {
    rc.set(V([P[i], P[i + 1], P[i + 2] - 0.04]), V([0, 0, 1])); rc.far = 0.1;
    const hits = rc.intersectObject(eoMesh, false);
    if (hits.length) need[i / 3] = Math.max(0, P[i + 2] - (hits[0].point.z - 0.002));
  }
  const shift = new Float32Array(need.length);
  for (let a = 0; a < need.length; a++) for (let b = 0; b < need.length; b++) {
    const d = Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1]);
    if (d < 0.02) shift[a] = Math.max(shift[a], need[b] * (1 - (d / 0.02) ** 2));
  }
  let maxShift = 0;
  for (let i = 0; i < shift.length; i++) { P[i * 3 + 2] -= shift[i]; maxShift = Math.max(maxShift, shift[i]); }
  m.normals = smoothNormals(P, m.indices);
  write(id, m, `sheared ${r6((RECTUS_MEDIAL.bottom - mb) * 1000)} mm at the pubis and ${r6((RECTUS_MEDIAL.top - mt) * 1000)} mm at the costal margin, so its medial border lies ${RECTUS_MEDIAL.bottom * 1000}–${RECTUS_MEDIAL.top * 1000} mm from the midline, and moved up to ${r6(maxShift * 1000)} mm back to lie behind the external oblique's aponeurosis`);
  done.push(id);
}

// ── Linea alba: a flat band between the recti ───────────────────────────
if (!refined('linea-alba')) {
  const recti = ['left', 'right'].map((s) => read(`rectus-abdominis-${s}`));
  const old = read('linea-alba');
  const [rlo, rhi] = bboxOf(mergePieces(recti).positions);
  const [olo, ohi] = bboxOf(old.positions);
  const y0 = Math.max(olo[1], rlo[1] + 0.004), y1 = Math.min(ohi[1], rhi[1] + 0.006);
  /** Medial border (x) and front surface (z) of each rectus at a height. */
  const edge = (r, y, sg) => {
    let mx = Infinity;
    const P = r.positions;
    for (let i = 0; i < P.length; i += 3) if (Math.abs(P[i + 1] - y) < 0.01) mx = Math.min(mx, P[i] * sg);
    let z = -Infinity;
    for (let i = 0; i < P.length; i += 3) if (Math.abs(P[i + 1] - y) < 0.01 && P[i] * sg < mx + 0.006) z = Math.max(z, P[i + 2]);
    return { x: mx * sg, z };
  };
  // The external obliques' aponeuroses meet at the linea alba in front of the recti: the band lies flush
  // with them, filling the gap between their medial borders and the recti's.
  const eos = ['left', 'right'].map((s) => read(`external-oblique-${s}`));
  const nu = 5, nv = 48, top = [], bottom = [];
  let last = null;
  for (let j = 0; j < nv; j++) {
    const y = y0 + ((y1 - y0) * j) / (nv - 1);
    const yr = THREE.MathUtils.clamp(y, rlo[1] + 0.006, rhi[1] - 0.006);
    const l = edge(recti[0], yr, 1), r = edge(recti[1], yr, -1);
    const el = edge(eos[0], y, 1), er = edge(eos[1], y, -1);
    const sheath = Number.isFinite(el.z) && Number.isFinite(er.z);
    const e = Number.isFinite(l.z) && Number.isFinite(r.z)
      ? { xl: Math.max(l.x, sheath ? el.x : 0) + 0.003, xr: Math.min(r.x, sheath ? er.x : 0) - 0.003, z: (sheath ? Math.max((el.z + er.z) / 2, (l.z + r.z) / 2) : (l.z + r.z) / 2) - 0.0005 }
      : last;
    last = e;
    for (let i = 0; i < nu; i++) {
      const x = e.xr + ((e.xl - e.xr) * i) / (nu - 1);
      // Slightly dished: the band sits a little deeper at the midline, like the groove between the recti.
      const z = e.z - 0.0006 * (1 - (2 * i / (nu - 1) - 1) ** 2);
      top.push(V([x, y, z])); bottom.push(V([x, y, z - 0.0015]));
    }
  }
  const band = slab(top, bottom, nu, nv, 1);
  const m = { positions: band.positions, indices: band.indices, normals: smoothNormals(band.positions, band.indices), skin: skinFrom(band.positions, recti) };
  write('linea-alba', m, 'rebuilt as a flat band 1.5 mm thick between the medial borders of the recti and of the external obliques’ aponeuroses, flush with the aponeuroses (the source part is a rod in front of and behind the recti)');
  done.push('linea-alba');
}

// ── Occipitofrontalis: the epicranial aponeurosis ─────────────────────────
const skel = await io.readBinary(new Uint8Array(fs.readFileSync(path.join(root, 'public/models/skeleton.glb'))));
const bone = (id) => {
  const prim = skel.getRoot().listNodes().find((n) => n.getName() === id)?.getMesh()?.listPrimitives()[0];
  if (!prim) throw new Error(`no bone ${id}`);
  return { positions: Float32Array.from(prim.getAttribute('POSITION').getArray()), indices: Uint32Array.from(prim.getIndices().getArray()) };
};
const vaultMesh = mergePieces(['frontal', 'parietal-left', 'parietal-right', 'occipital', 'temporal-left', 'temporal-right'].map(bone));
const vault = new THREE.Mesh(bvhOf(vaultMesh).geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
vault.geometry.boundsTree = vaultMesh.bvh;
const caster = new THREE.Raycaster();
const outermost = (o, d) => { caster.set(o, d.clone().normalize()); caster.far = 0.3; const hit = caster.intersectObject(vault, false); return hit.length ? hit[hit.length - 1].point.clone() : null; };
const par = centroid(mergePieces([bone('parietal-left'), bone('parietal-right')]).positions);
const GALEA = { gap: 0.0007, thick: 0.001, overlapDeg: 4, lateralDeg: 58, nTheta: 26, nPhi: 11 };
for (const side of ['left', 'right']) {
  const id = `occipitofrontalis-${side}`;
  if (refined(id)) continue;
  const m = read(id), sg = side === 'left' ? 1 : -1, P = m.positions;
  // Centre of the vault (on the midline) and the angles, over the top, of the bellies' upper edges.
  const C = V([0, par[1] - 0.01, par[2]]);
  const ang = (i) => Math.atan2(P[i + 1] - C.y, P[i + 2] - C.z); // 0 = straight forwards, π/2 = up, π = backwards
  let front = -Infinity, back = Infinity, brow = Infinity, nape = -Infinity;
  for (let i = 0; i < P.length; i += 3) {
    const a = ang(i);
    if (P[i + 2] > C.z) { front = Math.max(front, a); if (Math.abs(P[i]) < 0.012) brow = Math.min(brow, a); } else {
      const b = a < 0 ? a + 2 * Math.PI : a;
      back = Math.min(back, b);
      if (Math.abs(P[i]) < 0.02) nape = Math.max(nape, b);
    }
  }
  const ov = THREE.MathUtils.degToRad(GALEA.overlapDeg), deg2 = THREE.MathUtils.degToRad(2);
  const top = [], bottom = [];
  for (let j = 0; j < GALEA.nTheta; j++) for (let i = 0; i < GALEA.nPhi; i++) {
    const phDeg = 0.4 + ((GALEA.lateralDeg - 0.4) * i) / (GALEA.nPhi - 1), ph = THREE.MathUtils.degToRad(phDeg);
    // Between the frontal bellies a narrow prolongation of the galea runs down to the root of the nose, and
    // between the occipital bellies it reaches the external occipital protuberance.
    const th0 = THREE.MathUtils.lerp(brow + deg2, front - ov, THREE.MathUtils.smoothstep(phDeg, 4, 9));
    const th1 = THREE.MathUtils.lerp(nape - deg2, back + ov, THREE.MathUtils.smoothstep(phDeg, 9, 15));
    const th = th0 + ((th1 - th0) * j) / (GALEA.nTheta - 1);
    const d = V([sg * Math.sin(ph), Math.cos(ph) * Math.sin(th), Math.cos(ph) * Math.cos(th)]);
    const hit = outermost(C, d) ?? C.clone().addScaledVector(d, 0.08);
    const base = hit.addScaledVector(d, GALEA.gap);
    bottom.push(base.clone()); top.push(base.clone().addScaledVector(d, GALEA.thick));
  }
  const sheet = slab(top, bottom, GALEA.nPhi, GALEA.nTheta, 2);
  const galea = { positions: sheet.positions, indices: sheet.indices, normals: smoothNormals(sheet.positions, sheet.indices) };
  const merged = mergePieces([{ positions: P, indices: m.indices }, galea]);
  const normals = new Float32Array(merged.positions.length);
  normals.set(m.normals); normals.set(galea.normals, m.normals.length);
  const skin = new Float32Array(merged.positions.length);
  skin.set(m.skin); skin.set(skinFrom(galea.positions, [m]), m.skin.length);
  write(id, { positions: merged.positions, indices: merged.indices, normals, skin }, `epicranial aponeurosis (galea) added: a sheet ${GALEA.thick * 1000} mm thick over the vault between the bellies, ${galea.positions.length / 3} vertices`);
  done.push(id);
}

// ── Notes, records ────────────────────────────────────────────────────────
const NOTES = {
  'occipitofrontalis': 'Modelled: its frontal belly cast onto the frontal bone above the brow and its occipital belly onto the occipital bone above the superior nuchal line, 2.5 mm thick, joined over the vault by the epicranial aponeurosis (galea), a sheet 1 mm thick.',
  'rectus-abdominis': 'Modelled: a strap about 6–8 mm thick from the pubic crest beside the symphysis to the xiphoid and costal cartilages 5–7 of this body, bowed 3 cm forwards like the abdominal wall, with the linea alba between the two; its three tendinous intersections are shown as pale bands.',
};
Object.assign(json.structures.$modelled, NOTES);
Object.assign(prov.sources.modelled, NOTES);
for (const prim of doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) {
  const t = prim.getAttribute('_TISSUE');
  if (t) { prim.setAttribute('_TISSUE', null); if (!t.listParents().some((p) => p !== doc.getRoot())) t.dispose(); }
}
for (const a of doc.getRoot().listAccessors()) if (a.listParents().every((p) => p === doc.getRoot())) a.dispose();

const glb = await io.writeBinary(doc);
fs.writeFileSync(glbPath, glb);
fs.writeFileSync(jsonPath, JSON.stringify(json, null, 1) + '\n');
const triangles = Object.entries(json.structures).filter(([k]) => !k.startsWith('$')).reduce((n, [, g]) => n + g.triangleCount, 0);
prov.outputs.muscles = { ...prov.outputs.muscles, bytes: glb.byteLength, sha256: sha256(glb), triangles };
prov.refine = {
  tool: 'tools/refine-muscles.mjs',
  changes: Object.fromEntries(doc.getRoot().listNodes().filter((n) => n.getExtras()?.refined).map((n) => [n.getName(), n.getExtras().refined])),
};
fs.writeFileSync(provPath, JSON.stringify(prov, null, 1) + '\n');
console.log(JSON.stringify({ refined: done, bytes: glb.byteLength, triangles }, null, 1));

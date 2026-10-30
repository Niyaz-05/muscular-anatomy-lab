#!/usr/bin/env node
/**
 * Build public/models/muscles.glb: the muscles of the BodyParts3D body, in the same frame as this
 * lab's skeleton.glb, bound to the bones so they bend when the skeleton is posed.
 *
 *   node tools/extract-muscles.mjs <Human Atlas models dir>
 *
 * - BodyParts3D 4.0 muscles (repo4-human-atlas/public/models), named and grouped by
 *   tools/make-muscles.mjs, centred like the skeleton and simplified within 1.2 % relative error.
 * - Muscles BodyParts3D 4.0 does not have (checked against its official parts list: latissimus dorsi,
 *   rectus abdominis, internal oblique, transversus abdominis, quadratus lumborum, the masseter,
 *   temporalis and pterygoids, and the facial muscles but the platysma) are modelled here on the real
 *   bones of this body: slabs cast onto the outermost bone surface, sheets wrapped over the ribs and
 *   deep back muscles, the external oblique moved inwards, tubes and rings between landmarks.
 * - Skinning: every vertex follows its two nearest bones (closest points, inverse-distance weights),
 *   stored as a `_SKIN` attribute (bone a, bone b, weight of b) with the bone list in muscles.json, so
 *   a muscle's belly rides on the bone beneath it while its tendon follows its insertion.
 * - Depth: each muscle is superficial, intermediate or deep by how much of it faces out unobstructed.
 *
 * Writes the GLB, src/lab/generated/muscles.json and muscles-provenance.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { acceleratedRaycast } from 'three-mesh-bvh';
import { Document, NodeIO } from '@gltf-transform/core';
import { THREE, V, r6, weld, smoothNormals, simplify, mergePieces, taubin, smoothSmall, bboxOf, centroid, bvhOf, pca, extreme, tube, cutMesh, signedVolume } from './mesh-lib.mjs';

// Rays use each mesh's BVH instead of testing every triangle.
THREE.Mesh.prototype.raycast = acceleratedRaycast;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [humanDir] = process.argv.slice(2);
if (!humanDir) { console.error('Usage: node tools/extract-muscles.mjs <human-atlas public/models dir>'); process.exit(2); }
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const spec = JSON.parse(fs.readFileSync(path.join(root, 'src/lab/source/muscles.source.json'), 'utf8'));
const skelProv = JSON.parse(fs.readFileSync(path.join(root, 'src/lab/generated/provenance.json'), 'utf8'));
const skelGeo = JSON.parse(fs.readFileSync(path.join(root, 'src/lab/generated/skeleton.json'), 'utf8')).structures;
const CENTRE = skelProv.centreOffsetMetres;
const MAX_ERROR = 0.012;

// ── Sources ────────────────────────────────────────────────────────────────
const atlasBytes = fs.readFileSync(path.join(humanDir, 'atlas.json'));
const atlas = JSON.parse(atlasBytes.toString('utf8'));
const byId = new Map(atlas.parts.map((p) => [p.id, p]));
const chunks = new Map(), chunkHashes = {};
function readPart(id) {
  const part = byId.get(id);
  if (!part) throw new Error(`BodyParts3D: part ${id} missing`);
  if (!chunks.has(part.chunk)) {
    const file = path.join(humanDir, atlas.chunks[part.chunk].url.split('/').pop());
    const buf = fs.readFileSync(file);
    chunks.set(part.chunk, buf); chunkHashes[path.basename(file)] = sha256(buf);
  }
  const b = chunks.get(part.chunk);
  const positions = new Float32Array(b.buffer.slice(b.byteOffset + part.positions, b.byteOffset + part.positions + part.vertexCount * 12));
  const indices = new Uint32Array(b.buffer.slice(b.byteOffset + part.indices, b.byteOffset + part.indices + part.indexCount * 4));
  for (let i = 0; i < positions.length; i += 3) for (let a = 0; a < 3; a++) positions[i + a] -= CENTRE[a];
  return { positions, indices, part };
}

// The bones, from this lab's skeleton (already centred).
const skelDoc = await new NodeIO().readBinary(new Uint8Array(fs.readFileSync(path.join(root, 'public/models/skeleton.glb'))));
const bones = new Map();
for (const node of skelDoc.getRoot().listNodes()) {
  const id = node.getName(), prim = node.getMesh()?.listPrimitives()[0];
  if (!prim || id.startsWith('female-')) continue;
  bones.set(id, { id, positions: Float32Array.from(prim.getAttribute('POSITION').getArray()), indices: Uint32Array.from(prim.getIndices().getArray()) });
}
const bone = (id) => { const b = bones.get(id); if (!b) throw new Error(`no bone ${id}`); return b; };
const bcen = (id) => V(centroid(bone(id).positions));
const verts = (m) => { const out = []; for (let i = 0; i < m.positions.length; i += 3) out.push(V([m.positions[i], m.positions[i + 1], m.positions[i + 2]])); return out; };
const joints = skelGeo.$joints;

// ── Muscles from BodyParts3D ───────────────────────────────────────────────
let sourceTriangles = 0, maxError = 0;
const bp3dParts = {};
const meshes = [], muscleById = new Map();
/** How much to keep of each source mesh: the vast intercostal sheets least. */
const ratioFor = (id, tris) => (/intercostal/.test(id) ? 0.12 : /external-oblique|diaphragm|serratus-anterior|transversus-thoracis/.test(id) ? 0.2 : tris > 3000 ? 0.22 : tris > 1200 ? 0.34 : tris > 400 ? 0.45 : 1);
for (const s of spec.structures.filter((x) => x.bp3d)) {
  const pieces = s.bp3d.map((id) => {
    const raw = readPart(id);
    bp3dParts[s.id] = [...(bp3dParts[s.id] ?? []), `${id} ${raw.part.name}`];
    sourceTriangles += raw.indices.length / 3;
    return weld(raw.positions, raw.indices);
  });
  let m = mergePieces(pieces);
  const tris = m.indices.length / 3, ratio = ratioFor(s.id, tris);
  if (ratio < 1) { const sm = simplify(m.positions, m.indices, ratio, MAX_ERROR); maxError = Math.max(maxError, sm.error); m = sm; }
  m = smoothSmall(m, 120);
  const mesh = { structure: s, ...m };
  meshes.push(mesh); muscleById.set(s.id, mesh);
}
const muscle = (id) => { const m = muscleById.get(id); if (!m) throw new Error(`no muscle ${id}`); return m; };

// ── Building blocks for the modelled muscles ───────────────────────────────
const ray = new THREE.Raycaster();
const merged = (ms) => { const m = mergePieces(ms); return { m, bvh: bvhOf(m) }; };
/** The farthest surface along a ray (the outermost layer), or null. */
function outermost(target, origin, dir, far = 0.3) {
  ray.set(origin, dir.clone().normalize()); ray.far = far;
  const mesh = target.mesh ?? (target.mesh = new THREE.Mesh(target.bvh.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })));
  mesh.geometry.boundsTree = target.bvh;
  const hit = ray.intersectObject(mesh, false);
  return hit.length ? hit[hit.length - 1].point.clone() : null;
}
/** A closed slab from two grids (top and bottom, nu × nv points each). */
function slab(top, bottom, nu, nv) {
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
  taubin(m.positions, m.indices, 2);
  return m;
}
/**
 * A slab cast onto bone: for each grid point, a ray from inside along `dir` finds the outermost
 * surface of the targets; the muscle lies on it (`gap`) with thickness `thick(u, v)`.
 */
function castSlab({ nu = 18, nv = 14, point, dir, target, gap = 0.001, thick, fallback }) {
  const top = [], bottom = [];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const u = i / (nu - 1), v = j / (nv - 1);
    const { origin, d } = point(u, v);
    const dd = (d ?? dir).clone().normalize();
    const t = typeof target === 'function' ? target(u, v) : target;
    const hit = t ? outermost(t, origin, dd) : null;
    const base = (hit ?? origin.clone().addScaledVector(dd, fallback ?? 0.02)).addScaledVector(dd, gap);
    bottom.push(base.clone()); top.push(base.clone().addScaledVector(dd, thick(u, v)));
  }
  return slab(top, bottom, nu, nv);
}
const lerp = (a, b, t) => a.clone().lerp(b, t);
const sideSign = (s) => (s === 'left' ? 1 : -1);
const subset = (id, keep) => verts(bone(id)).filter(keep);
const pickExtreme = (pts, dir) => pts.reduce((a, p) => (p.dot(dir) > a.dot(dir) ? p : a));
/** A polyline through points, resampled at `n` points by length. */
function polyline(pts, n) {
  const c = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  return Array.from({ length: n }, (_, i) => c.getPointAt(i / (n - 1)));
}

// ── The modelled muscles ───────────────────────────────────────────────────
const notes = {};
const generated = new Map();
function addGenerated(id, m, note) {
  const s = spec.structures.find((x) => x.id === id);
  if (!s) throw new Error(`generated ${id} not in the spec`);
  const mesh = { structure: s, positions: m.positions, indices: m.indices };
  meshes.push(mesh); muscleById.set(id, mesh); generated.set(id, mesh);
  notes[s.generated] = note;
}
const midTrunkZ = (y) => { const tz = (bcen('sternal-body').z + bcen('t8').z) / 2, lz = bcen('l3').z + 0.06; const t = THREE.MathUtils.clamp((bcen('t8').y - y) / (bcen('t8').y - bcen('l3').y), 0, 1); return tz + (lz - tz) * t; };

for (const side of ['left', 'right']) {
  const sg = sideSign(side), S = (b) => `${b}-${side}`;
  const X = V([sg, 0, 0]);

  // Latissimus dorsi: from the spinous processes of T7–L5 and the back of the iliac crest to the floor
  // of the intertubercular groove, wrapped over the ribs and the deep back muscles (under trapezius).
  {
    const tips = ['t7', 't9', 't11', 'l1', 'l3', 'l5'].map((v) => extreme(bone(v), V([0, -0.15, -1])).add(V([sg * 0.006, 0, -0.004])));
    const crest = [extreme(bone(S('hip-bone')), V([sg * 0.25, 1, -0.9])), extreme(bone(S('hip-bone')), V([sg * 0.75, 1, -0.45]))];
    const origin = polyline([...tips, ...crest], 18);
    const hum = verts(bone(S('humerus'))), top = Math.max(...hum.map((p) => p.y));
    const groove = (dy) => pickExtreme(hum.filter((p) => Math.abs(p.y - (top - dy)) < 0.004), V([-sg * 0.5, 0, 1]));
    const ins = [groove(0.05), groove(0.085)];
    const wrap = merged([
      ...Array.from({ length: 12 }, (_, i) => bone(S(`rib-${i + 1}`))), bone(S('scapula')), ...['t6', 't7', 't8', 't9', 't10', 't11', 't12', 'l1', 'l2', 'l3', 'l4', 'l5'].map(bone), bone(S('hip-bone')),
      ...['serratus-anterior', 'external-oblique', 'iliocostalis-thoracis', 'iliocostalis-lumborum', 'longissimus-thoracis', 'serratus-posterior-inferior', 'teres-major', 'rhomboid-major'].map((m) => muscle(S(m))),
    ]);
    const nu = origin.length, nv = 16, topG = [], botG = [];
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const u = i / (nu - 1), v = j / (nv - 1);
      const insertion = lerp(ins[0], ins[1], u);
      let p = lerp(origin[i], insertion, v);
      const tendon = v > 0.82;
      if (!tendon) {
        const axis = V([0, p.y, midTrunkZ(p.y)]);
        const hit = outermost(wrap, axis, p.clone().sub(axis));
        if (hit) p = hit.addScaledVector(p.clone().sub(axis).normalize(), 0.003);
      }
      const n = p.clone().sub(V([0, p.y, midTrunkZ(p.y)])).normalize();
      const th = tendon ? 0.004 : 0.003 + 0.004 * Math.sin(Math.PI * Math.min(1, v / 0.82));
      botG.push(p.clone()); topG.push(p.clone().addScaledVector(n, th));
    }
    addGenerated(S('latissimus-dorsi'), slab(topG, botG, nu, nv), 'Modelled: a sheet from the spinous processes of T7–L5 and the back of the iliac crest to the floor of the intertubercular groove of the humerus, wrapped over the ribs and the deep back muscles of this body (beneath the trapezius); 3–7 mm thick, tapering to its tendon.');
  }

  // Rectus abdominis: a strap from the pubic crest to the xiphoid and costal cartilages 5–7.
  {
    const sym = V((skelProv.measures.pelvis.male.symphysisTop));
    const cart = [5, 6, 7].flatMap((n) => verts(bone(S(`costal-cartilage-${n}`)))).concat(verts(bone('xiphoid')));
    const nu = 8, nv = 20, topG = [], botG = [];
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const u = i / (nu - 1), v = j / (nv - 1);
      const o = sym.clone().add(V([sg * (0.006 + 0.024 * u), 0.004, 0.006]));
      const X0 = sg * (0.008 + 0.07 * u);
      const near = cart.filter((p) => Math.abs(p.x - X0) < 0.006);
      const ins = near.length ? pickExtreme(near, V([0, -0.4, 1])) : cart[0];
      const p = lerp(o, ins, v).add(V([0, 0, 0.03 * Math.sin(Math.PI * v)]));
      botG.push(p.clone().add(V([0, 0, -0.008 + 0.002 * (1 - v)]))); topG.push(p);
    }
    addGenerated(S('rectus-abdominis'), slab(topG, botG, nu, nv), 'Modelled: a strap about 6–8 mm thick from the pubic crest beside the symphysis to the xiphoid and costal cartilages 5–7 of this body, bowed 3 cm forwards like the abdominal wall; its tendinous intersections are not shown.');
  }

  // Internal oblique and transversus abdominis: the real external oblique moved inwards, trimmed to their rib levels.
  for (const [id, off, topBone, note] of [
    ['internal-oblique', 0.006, 'rib-10', 'Modelled: the BodyParts3D external oblique of this body moved 6 mm towards the trunk, trimmed below the 10th rib (the internal oblique reaches the lower three ribs); its fibres run at right angles to the external oblique’s, which the model does not show.'],
    ['transversus-abdominis', 0.012, 'costal-cartilage-7', 'Modelled: the BodyParts3D external oblique of this body moved 12 mm towards the trunk, trimmed below the 7th costal cartilage (the transversus arises from the inner surfaces of costal cartilages 7–12).'],
  ]) {
    const eo = muscle(S('external-oblique'));
    const pos = Float32Array.from(eo.positions);
    for (let i = 0; i < pos.length; i += 3) {
      const d = V([0 - pos[i], 0, midTrunkZ(pos[i + 1]) - pos[i + 2]]).normalize();
      pos[i] += d.x * off; pos[i + 2] += d.z * off;
    }
    const limit = Math.min(...verts(bone(S(topBone))).map((p) => p.y)) + 0.01;
    const cut = cutMesh({ positions: pos, indices: eo.indices }, (c) => c[1] < limit);
    addGenerated(S(id), weld(cut.positions, cut.indices), note);
  }

  // Quadratus lumborum: a slab from the back of the iliac crest to the 12th rib, beside the lumbar transverse processes.
  {
    const hip = verts(bone(S('hip-bone'))), hz = bcen(S('hip-bone')).z, rib = verts(bone(S('rib-12')));
    const crestAt = (x) => { const c = hip.filter((p) => Math.abs(p.x - x) < 0.006 && p.z < hz); return c.length ? pickExtreme(c, V([0, 1, 0])) : null; };
    const ribAt = (x) => { const c = rib.filter((p) => Math.abs(p.x - x) < 0.006); return c.length ? pickExtreme(c, V([0, -1, 0])) : null; };
    const tp = ['l1', 'l2', 'l3', 'l4'].map((v) => pickExtreme(verts(bone(v)), X));
    const nu = 8, nv = 12, topG = [], botG = [];
    const zBack = tp.reduce((s, p) => s + p.z, 0) / tp.length;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const u = i / (nu - 1), v = j / (nv - 1);
      const x = sg * (0.035 + 0.055 * u);
      const lo = crestAt(x) ?? crestAt(sg * 0.06) ?? bcen(S('hip-bone'));
      const hi = ribAt(x) ?? ribAt(sg * 0.05) ?? bcen(S('rib-12'));
      const p = lerp(lo, hi, v); p.x = x; p.z = zBack + 0.004;
      botG.push(p.clone()); topG.push(p.clone().add(V([0, 0, 0.022 - 0.008 * Math.abs(u - 0.4)])));
    }
    addGenerated(S('quadratus-lumborum'), slab(topG, botG, nu, nv), 'Modelled: a slab about 2 cm thick in the posterior abdominal wall of this body, from the back of the iliac crest to the lower border of the 12th rib, against the tips of the L1–L4 transverse processes.');
  }

  // Muscles of mastication, cast onto the skull and mandible of this body.
  const skullT = merged(['mandible', S('zygomatic'), S('temporal'), S('maxilla'), 'sphenoid'].map(bone));
  const mand = verts(bone('mandible')).filter((p) => p.x * sg > 0.02);
  const angle = pickExtreme(mand, V([sg * 0.2, -0.7, -0.75]));
  const coronoid = pickExtreme(mand, V([0, 1, 0.9]));
  const zygLow = pickExtreme(verts(bone(S('zygomatic'))), V([sg * 0.3, -1, 0.35]));
  {
    const tf = zygLow, tb = zygLow.clone().add(V([0, 0.002, -0.032])), bb = angle.clone(), bf = angle.clone().add(V([0, 0.008, 0.03]));
    const m = castSlab({ nu: 12, nv: 14, dir: X, target: skullT, thick: (u, v) => 0.004 + 0.007 * Math.sin(Math.PI * (0.15 + 0.7 * u)) * Math.sin(Math.PI * (0.1 + 0.8 * v)),
      point: (u, v) => { const p = lerp(lerp(tf, tb, u), lerp(bf, bb, u), v); return { origin: V([sg * 0.012, p.y, p.z]) }; } });
    addGenerated(S('masseter'), m, 'Modelled: cast onto the lateral surface of the ramus of this mandible and up to the lower border of the zygomatic arch, 4–11 mm thick.');
  }
  {
    const tm = joints.tmj.pivot, tz = tm[2] + 0.012, ty = zygLow.y + 0.03;
    const vault = merged([S('parietal'), S('temporal'), 'frontal', 'sphenoid', S('zygomatic')].map(bone));
    const deep = merged(['mandible', 'sphenoid', S('temporal')].map(bone));
    const m = castSlab({ nu: 18, nv: 12, dir: X, gap: 0.0012, thick: (u, v) => 0.003 + 0.004 * v,
      target: (u, v) => (v > 0.7 ? deep : vault),
      point: (u, v) => {
        const th = Math.PI * u;
        const rim = V([0, ty + 0.06 * Math.sin(th), tz + 0.07 * Math.cos(th)]);
        const p = lerp(rim, coronoid, v * 0.92);
        return { origin: V([sg * (v > 0.7 ? 0.03 : 0.0), p.y, p.z]) };
      } });
    addGenerated(S('temporalis'), m, 'Modelled: a fan cast onto the temporal fossa of this skull, from the superior temporal line converging beneath the zygomatic arch onto the coronoid process; 3–7 mm thick.');
  }
  {
    const half = joints.tmj.intercondylarMm / 2000;
    const condyle = V(joints.tmj.pivot).add(V(joints.tmj.flex).normalize().multiplyScalar(sg * half)).add(V([0, -0.008, 0.004]));
    const plate = pickExtreme(verts(bone('sphenoid')).filter((p) => p.x * sg > 0.008), V([sg * 0.35, -1, 0.15]));
    addGenerated(S('lateral-pterygoid'), tube([plate, lerp(plate, condyle, 0.5).add(V([sg * 0.004, 0.003, 0])), condyle], () => 0.0055, 12, 1.4, 0.002), 'Modelled: a tube 11 mm across from the lateral pterygoid plate of this sphenoid to the neck of the mandibular condyle.');
    const inner = angle.clone().add(V([-sg * 0.01, 0.01, 0.004]));
    const start = plate.clone().add(V([-sg * 0.006, -0.004, -0.004]));
    addGenerated(S('medial-pterygoid'), tube([start, lerp(start, inner, 0.5).add(V([sg * 0.004, 0, 0])), inner], () => 0.006, 12, 1.6, 0.002), 'Modelled: a tube about 12 mm across from the pterygoid plates of this sphenoid to the inner surface of the mandibular angle, mirroring the masseter.');
  }

  // Facial muscles (BodyParts3D has only the platysma).
  const eye = V(centroid(readPart(side === 'left' ? 'FJ1317' : 'FJ1368').positions));
  {
    const ring = Array.from({ length: 33 }, (_, i) => { const a = (i / 32) * Math.PI * 2; return eye.clone().add(V([0.021 * Math.cos(a), 0.018 * Math.sin(a), 0.009])); });
    addGenerated(S('orbicularis-oculi'), tube(ring, () => 0.0036, 10, 2, 0.002), 'Modelled: a ring about 42 × 36 mm round the orbital opening, centred on this body’s eyeball (BodyParts3D sclera).');
  }
  {
    const frontal = merged(['frontal', S('parietal')].map(bone));
    const brow = eye.y + 0.02, sz = bcen(S('parietal')).z;
    addGenerated(S('occipitofrontalis'), mergePieces([
      castSlab({ nu: 10, nv: 10, dir: V([0, 0, 1]), target: frontal, thick: () => 0.0025, point: (u, v) => ({ origin: V([sg * (0.004 + 0.046 * u), brow + 0.06 * v, sz]) }) }),
      castSlab({ nu: 10, nv: 8, dir: V([0, 0, -1]), target: merged(['occipital', S('parietal')].map(bone)), thick: () => 0.0025, point: (u, v) => ({ origin: V([sg * (0.01 + 0.04 * u), bcen('occipital').y - 0.012 + 0.035 * v, sz]) }) }),
    ]), 'Modelled: its frontal belly cast onto the frontal bone above the brow and its occipital belly onto the occipital bone above the superior nuchal line, 2.5 mm thick; the epicranial aponeurosis between them is not shown.');
  }
  {
    const inc = ['tooth-upper-central-incisor-left', 'tooth-upper-central-incisor-right', 'tooth-lower-central-incisor-left', 'tooth-lower-central-incisor-right'].map(bcen);
    const mouth = inc.reduce((a, p) => a.add(p), V([0, 0, 0])).divideScalar(4).add(V([0, 0, 0.013]));
    const corner = mouth.clone().add(V([sg * 0.026, 0, -0.006]));
    const zyg = pickExtreme(verts(bone(S('zygomatic'))), V([sg * 0.6, 0, 0.8])).add(V([sg * 0.003, 0, 0.002]));
    addGenerated(S('zygomaticus-major'), tube([zyg, lerp(zyg, corner, 0.5).add(V([sg * 0.006, 0, 0.004])), corner], () => 0.0035, 10, 2, 0.002), 'Modelled: a strap from the zygomatic bone of this skull to the corner of the mouth.');
    const teeth = merged([S('maxilla'), 'mandible', ...['molar-1', 'molar-2', 'premolar-1', 'premolar-2'].flatMap((t) => [bone(`tooth-upper-${t}-${side}`), bone(`tooth-lower-${t}-${side}`)]).map((b) => b.id)].map(bone));
    const m1u = bcen(`tooth-upper-molar-2-${side}`), m1l = bcen(`tooth-lower-molar-1-${side}`);
    addGenerated(S('buccinator'), castSlab({ nu: 12, nv: 8, dir: X, target: teeth, gap: 0.003, thick: () => 0.004,
      point: (u, v) => { const z = m1u.z - 0.012 + (corner.z - (m1u.z - 0.012)) * u; return { origin: V([sg * 0.005, m1l.y - 0.004 + (m1u.y - m1l.y + 0.012) * v, z]) }; } }),
      'Modelled: a sheet cast onto the outer face of the molars and premolars of this body, from behind the second molar to the corner of the mouth.');
    if (side === 'left') {
      const ring = Array.from({ length: 33 }, (_, i) => { const a = (i / 32) * Math.PI * 2; return mouth.clone().add(V([0.027 * Math.cos(a), 0.014 * Math.sin(a), -0.004 * Math.cos(a) ** 2])); });
      addGenerated('orbicularis-oris', tube(ring, () => 0.0045, 10, 1.6, 0.002), 'Modelled: an oval ring about 54 × 28 mm round the mouth, in front of the incisors of this body.');
    }
  }
}

// ── Skinning: each vertex follows its two nearest bones ───────────────────
const boneIds = [...bones.keys()];
const boneIndex = new Map(boneIds.map((id, i) => [id, i]));
const boneBox = new Map(boneIds.map((id) => { const [lo, hi] = bboxOf(bone(id).positions); return [id, new THREE.Box3(V(lo), V(hi))]; }));
for (const id of boneIds) bvhOf(bone(id));
const hit = {}, q = new THREE.Vector3();
for (const m of meshes) {
  const [lo, hi] = bboxOf(m.positions);
  const box = new THREE.Box3(V(lo), V(hi)).expandByScalar(0.05);
  const cands = boneIds.filter((id) => boneBox.get(id).intersectsBox(box) && !/^tooth-|^gingiva/.test(id) || (/orbicularis-oris|buccinator|zygomaticus/.test(m.structure.id) && /^(mandible|maxilla-)/.test(id) && boneBox.get(id).intersectsBox(box)));
  if (!cands.length) throw new Error(`${m.structure.id}: no bone near it`);
  const n = m.positions.length / 3, skin = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    q.set(m.positions[v * 3], m.positions[v * 3 + 1], m.positions[v * 3 + 2]);
    let a = -1, da = Infinity, b = -1, db = Infinity;
    for (const id of cands) {
      bone(id).bvh.closestPointToPoint(q, hit);
      const d = Math.max(hit.distance, 1e-4);
      if (d < da) { b = a; db = da; a = boneIndex.get(id); da = d; } else if (d < db) { b = boneIndex.get(id); db = d; }
    }
    const wb = b < 0 ? 0 : da ** 3 / (da ** 3 + db ** 3);
    skin.set([a, b < 0 ? a : b, wb], v * 3);
  }
  m.skin = skin;
}

// ── Depth: how much of each muscle faces out unobstructed ─────────────────
for (const m of meshes) m.normals = smoothNormals(m.positions, m.indices);
const all = merged(meshes.map((m) => ({ positions: m.positions, indices: m.indices })));
const allMesh = new THREE.Mesh(all.bvh.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
allMesh.geometry.boundsTree = all.bvh;
for (const m of meshes) {
  let open = 0, n = 0;
  const step = Math.max(1, Math.floor(m.positions.length / 3 / 120));
  for (let v = 0; v < m.positions.length / 3; v += step) {
    const p = V([m.positions[v * 3], m.positions[v * 3 + 1], m.positions[v * 3 + 2]]), d = V([m.normals[v * 3], m.normals[v * 3 + 1], m.normals[v * 3 + 2]]);
    ray.set(p.addScaledVector(d, 0.0015), d); ray.far = 0.05;
    n++; if (!ray.intersectObject(allMesh, false).length) open++;
  }
  m.exposed = open / n;
  m.depth = m.exposed >= 0.3 ? 'superficial' : m.exposed >= 0.1 ? 'intermediate' : 'deep';
}

// ── Facts, checks and output ────────────────────────────────────────────────
const geometry = {}, sideErrors = [], checks = {};
for (const m of meshes) {
  const s = m.structure, [lo, hi] = bboxOf(m.positions), c = centroid(m.positions);
  if (s.sideCheck !== false && Math.abs(c[0]) > 0.004) {
    if (s.side === 'right' && !(c[0] < 0)) sideErrors.push(`${s.id} claims right but x = ${c[0].toFixed(4)}`);
    if (s.side === 'left' && !(c[0] > 0)) sideErrors.push(`${s.id} claims left but x = ${c[0].toFixed(4)}`);
  }
  let nearest = 0, nd = Infinity;
  for (let i = 0; i < m.positions.length; i += 3) { const d = Math.hypot(m.positions[i] - c[0], m.positions[i + 1] - c[1], m.positions[i + 2] - c[2]); if (d < nd) { nd = d; nearest = i; } }
  const p = pca(m.positions), ax = V(p.axes[0]);
  let i0 = 0, i1 = 0, lo0 = Infinity, hi0 = -Infinity;
  for (let i = 0; i < m.positions.length; i += 3) { const d = m.positions[i] * ax.x + m.positions[i + 1] * ax.y + m.positions[i + 2] * ax.z; if (d < lo0) { lo0 = d; i0 = i / 3; } if (d > hi0) { hi0 = d; i1 = i / 3; } }
  const bonesUsed = new Map();
  for (let v = 0; v < m.skin.length; v += 3) { const k = boneIds[m.skin[v]]; bonesUsed.set(k, (bonesUsed.get(k) ?? 0) + 1); }
  geometry[s.id] = {
    layer: s.layer, side: s.side, depth: m.depth, exposed: r6(m.exposed), bounds: [lo.map(r6), hi.map(r6)], centroid: c.map(r6),
    surfaceAnchor: [m.positions[nearest], m.positions[nearest + 1], m.positions[nearest + 2]].map(r6),
    axes: p.axes.map((a) => a.map(r6)), extentsMm: p.extents.map((e) => r6(e * 1000)), ends: [i0, i1],
    bones: [...bonesUsed].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k),
    vertexCount: m.positions.length / 3, triangleCount: m.indices.length / 3, ...(s.generated ? { modelled: true } : {}),
  };
}
if (sideErrors.length) throw new Error(`side checks failed:\n${sideErrors.join('\n')}`);
const G = (id) => geometry[id];
const above = (a, b) => G(a).centroid[1] > G(b).centroid[1];
checks.latissimusOnTheBack = ['left', 'right'].every((s) => G(`latissimus-dorsi-${s}`).centroid[2] < bcen('t10').z + 0.03);
checks.rectusInFront = ['left', 'right'].every((s) => G(`rectus-abdominis-${s}`).centroid[2] > bcen('l3').z + 0.08);
checks.obliquesLayered = ['left', 'right'].every((s) => Math.abs(G(`internal-oblique-${s}`).centroid[0]) < Math.abs(G(`external-oblique-${s}`).centroid[0]) + 0.002);
checks.masseterOnRamus = ['left', 'right'].every((s) => G(`masseter-${s}`).bones.includes('mandible'));
checks.temporalisAboveMasseter = ['left', 'right'].every((s) => above(`temporalis-${s}`, `masseter-${s}`));
checks.bicepsOnArm = ['left', 'right'].every((s) => G(`biceps-brachii-long-head-${s}`).bones.some((b) => /humerus|radius|scapula/.test(b)));
checks.gastrocnemiusOnLeg = ['left', 'right'].every((s) => G(`gastrocnemius-medial-head-${s}`).bones.some((b) => /femur|tibia/.test(b)));
checks.everyMuscleBound = meshes.every((m) => m.skin.length === m.positions.length);
const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);
if (failed.length) throw new Error(`layout checks failed: ${failed.join(', ')}`);
geometry.$skin = { bones: boneIds };
geometry.$modelled = notes;

const doc = new Document(), buffer = doc.createBuffer(), scene = doc.createScene('muscles');
for (const m of meshes) {
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(m.positions).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(m.normals).setBuffer(buffer))
    .setAttribute('_SKIN', doc.createAccessor().setType('VEC3').setArray(m.skin).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(m.positions.length / 3 < 65536 ? Uint16Array.from(m.indices) : m.indices).setBuffer(buffer));
  const s = m.structure;
  scene.addChild(doc.createNode(s.id).setMesh(doc.createMesh(s.id).addPrimitive(prim)).setExtras({ layer: s.layer, source: s.generated ? 'modelled' : 'bodyparts3d', nodes: s.bp3d ?? [] }));
}
doc.getRoot().getAsset().generator = 'muscular-anatomy-lab tools/extract-muscles.mjs';
doc.getRoot().getAsset().copyright = 'BodyParts3D (DBCLS), CC BY 4.0; latissimus dorsi, rectus abdominis, internal oblique, transversus abdominis, quadratus lumborum, masseter, temporalis, pterygoids and facial muscles modelled';
const glb = await new NodeIO().writeBinary(doc);
fs.writeFileSync(path.join(root, 'public/models/muscles.glb'), glb);
const gen = path.join(root, 'src/lab/generated');
fs.writeFileSync(path.join(gen, 'muscles.json'), JSON.stringify({ units: 'metres', axes: { x: "patient's left", y: 'superior', z: 'anterior' }, structures: geometry }, null, 1) + '\n');
const output = { file: 'public/models/muscles.glb', bytes: glb.byteLength, sha256: sha256(glb), triangles: meshes.reduce((n, m) => n + m.indices.length / 3, 0), sourceTriangles, maxErrorPct: r6(maxError * 100) };
const commit = (dir) => { try { return execFileSync('git', ['-C', path.resolve(dir, '../..'), 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return null; } };
fs.writeFileSync(path.join(gen, 'muscles-provenance.json'), JSON.stringify({
  outputs: { muscles: output },
  sources: {
    bodyparts3d: {
      name: 'BodyParts3D 4.0 (Database Center for Life Science), via the Human Atlas build', license: 'CC-BY-4.0',
      intermediate: 'github.com/Niyaz-05/human-atlas, commit ' + commit(humanDir), atlasJsonSha256: sha256(atlasBytes), chunkSha256: chunkHashes, parts: bp3dParts,
      missingFromOfficialRelease: 'Checked against https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/isa_parts_list_e.txt (BodyParts3D 4.0): no latissimus dorsi, rectus abdominis, internal oblique, transversus abdominis, quadratus lumborum, masseter, temporalis, pterygoids or facial muscles other than the platysma.',
    },
    skeleton: { file: 'public/models/skeleton.glb', sha256: skelProv.outputs.skeleton.sha256, centreOffsetMetres: CENTRE },
    modelled: notes,
  },
  changesHere: 'Selected and merged the BodyParts3D muscle meshes listed in src/lab/source/muscles.source.json; welded; simplified with meshoptimizer within 1.2 % relative error (to about a fifth to three fifths of the source triangles: the intercostals and the largest sheets most); subdivided and smoothed the smallest; recomputed smooth normals; translated by the skeleton’s centre offset; modelled the muscles the source lacks on this body’s bones; bound every vertex to its two nearest bones; classified each muscle’s depth.',
  depth: Object.fromEntries(meshes.map((m) => [m.structure.id, m.depth])),
  checks,
}, null, 1) + '\n');
console.log(JSON.stringify({ output, checks, depths: Object.entries(meshes.reduce((a, m) => ({ ...a, [m.depth]: (a[m.depth] ?? 0) + 1 }), {})) }, null, 1));

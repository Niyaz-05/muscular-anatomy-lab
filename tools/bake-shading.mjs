#!/usr/bin/env node
/**
 * Bake per-vertex shading data into the lab's models (listed in tools/bake.config.json), for the real-tissue look.
 *
 *   node tools/bake-shading.mjs              (reads tools/bake.config.json; every model)
 *   node tools/bake-shading.mjs muscles      (only the models of the bodies named)
 *
 * Adds one glTF attribute, _TISSUE (VEC4, normalised UNSIGNED_BYTE), to every primitive:
 *   r  ambient occlusion: 1 = open surface, 0 = deep in a fold (rays cast over the hemisphere
 *      around the normal against the meshes listed for that layer in `occluders`)
 *   g  mottling: smooth 3D value noise, so tissue is not one flat colour
 *   b  fat: closeness to the `fat.sourceLayers` meshes, in grooves (e.g. epicardial fat along the
 *      coronary vessels)
 *   a  tendon, for a model with a `tendon` entry: 1 where the muscle turns into tendon or aponeurosis,
 *      found by thickness (rays cast inwards against the mesh itself: a part much thinner than the
 *      muscle's belly, towards its ends) and by named rules (thin sheets, bands such as the tendinous
 *      intersections of rectus abdominis); otherwise unused (1)
 * Deterministic: fixed ray directions, no randomness. Re-running on a baked model strips the old
 * _TISSUE first, so the output is the same. Updates each output's size and sha256 in provenance.json.
 * Morph targets (the endometrium, the pregnant uterus) are baked in their base shape.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'tools/bake.config.json'), 'utf8'));
const only = process.argv.slice(2);
for (const b of only) if (!config.models.some((m) => m.body === b)) throw new Error(`bake.config: no model for body "${b}"`);
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const io = new NodeIO();
/** One provenance file per entry (`provenance`), defaulting to the config's. */
const provs = new Map();
function provFor(entry) {
  const file = path.join(root, entry.provenance ?? config.provenance);
  if (!provs.has(file)) {
    const prov = JSON.parse(fs.readFileSync(file, 'utf8'));
    prov.shadingBake = {
      tool: 'tools/bake-shading.mjs',
      attribute: `_TISSUE (VEC4 unsigned byte, normalised): r ambient occlusion, g mottling noise, b fat proximity, a ${entry.tendon ? 'tendon and aponeurosis' : 'unused'}`,
      settings: { aoDistance: config.aoDistance, rays: config.rays, rayOffset: config.rayOffset, noiseFrequency: config.noiseFrequency, ...(entry.tendon ? { tendon: entry.tendon } : {}) },
      bodies: prov.shadingBake?.bodies ?? {},
    };
    provs.set(file, prov);
  }
  return provs.get(file);
}
const summary = {};

for (const entry of config.models) {
if (only.length && !only.includes(entry.body)) continue;
const modelPath = path.join(root, entry.model);
const prov = provFor(entry);
const doc = await io.readBinary(new Uint8Array(fs.readFileSync(modelPath)));
const occluders = entry.occluders;

// ── Collect meshes in world space ───────────────────────────────────────────
const items = [];
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const layer = node.getExtras()?.layer;
  if (typeof layer !== 'string') throw new Error(`node "${node.getName()}" has no extras.layer`);
  const m = new THREE.Matrix4().fromArray(node.getWorldMatrix());
  const nm = new THREE.Matrix3().getNormalMatrix(m);
  for (const prim of mesh.listPrimitives()) {
    const old = prim.getAttribute('_TISSUE');
    if (old) { prim.setAttribute('_TISSUE', null); old.dispose(); }
    const pos = prim.getAttribute('POSITION').getArray();
    const nor = prim.getAttribute('NORMAL').getArray();
    const idx = prim.getIndices().getArray();
    const wp = new Float32Array(pos.length), wn = new Float32Array(nor.length);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.length; i += 3) {
      v.set(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(m); wp.set([v.x, v.y, v.z], i);
      v.set(nor[i], nor[i + 1], nor[i + 2]).applyMatrix3(nm).normalize(); wn.set([v.x, v.y, v.z], i);
    }
    items.push({ name: node.getName(), layer, prim, positions: wp, normals: wn, indices: idx });
  }
}
const known = new Set(items.map((i) => i.layer));
for (const [layer, list] of Object.entries(occluders)) {
  if (!known.has(layer)) throw new Error(`bake.config: unknown layer "${layer}"`);
  for (const l of list) if (!known.has(l)) throw new Error(`bake.config: unknown occluder layer "${l}" for ${layer}`);
}
for (const l of known) if (!(l in occluders)) throw new Error(`bake.config: no occluders listed for layer "${l}"`);

// ── One BVH per occluder set ────────────────────────────────────────────────
const bvhCache = new Map();
function bvhFor(layers) {
  const key = [...layers].sort().join('|');
  if (!key) return null;
  if (!bvhCache.has(key)) {
    const parts = items.filter((i) => layers.includes(i.layer));
    const vCount = parts.reduce((n, p) => n + p.positions.length / 3, 0);
    const pos = new Float32Array(vCount * 3), idx = new Uint32Array(parts.reduce((n, p) => n + p.indices.length, 0));
    let vo = 0, io2 = 0;
    for (const p of parts) {
      pos.set(p.positions, vo * 3);
      for (let k = 0; k < p.indices.length; k++) idx[io2 + k] = p.indices[k] + vo;
      vo += p.positions.length / 3; io2 += p.indices.length;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    bvhCache.set(key, new MeshBVH(g));
  }
  return bvhCache.get(key);
}

// Fixed, evenly spread ray directions (Fibonacci sphere); each vertex uses those in its hemisphere.
const RAYS = config.rays ?? 48;
const dirs = [];
for (let i = 0; i < RAYS; i++) {
  const y = 1 - (2 * (i + 0.5)) / RAYS, r = Math.sqrt(1 - y * y), phi = i * Math.PI * (3 - Math.sqrt(5));
  dirs.push(new THREE.Vector3(Math.cos(phi) * r, y, Math.sin(phi) * r));
}

// ── Noise ───────────────────────────────────────────────────────────────────
function hash(x, y, z) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function valueNoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const s = (t) => t * t * (3 - 2 * t);
  const fx = s(x - xi), fy = s(y - yi), fz = s(z - zi);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (i, j, k) => hash(xi + i, yi + j, zi + k);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), fx), l(c(0, 1, 0), c(1, 1, 0), fx), fy),
    l(l(c(0, 0, 1), c(1, 0, 1), fx), l(c(0, 1, 1), c(1, 1, 1), fx), fy),
    fz,
  );
}
const F = config.noiseFrequency ?? 150;
const mottle = (x, y, z) => 0.65 * valueNoise(x * F, y * F, z * F) + 0.35 * valueNoise(x * F * 2.7 + 17, y * F * 2.7 + 5, z * F * 2.7 + 11);

// ── Fat proximity (spatial grid over the source meshes) ─────────────────────
let fatGrid = null;
const fat = config.fat;
if (fat) {
  const C = fat.far;
  fatGrid = new Map();
  for (const it of items.filter((i) => fat.sourceLayers.includes(i.layer))) {
    for (let k = 0; k < it.positions.length; k += 3) {
      const key = `${Math.floor(it.positions[k] / C)},${Math.floor(it.positions[k + 1] / C)},${Math.floor(it.positions[k + 2] / C)}`;
      (fatGrid.get(key) ?? fatGrid.set(key, []).get(key)).push(it.positions[k], it.positions[k + 1], it.positions[k + 2]);
    }
  }
}
function fatAt(x, y, z) {
  const C = fat.far;
  const [gx, gy, gz] = [Math.floor(x / C), Math.floor(y / C), Math.floor(z / C)];
  let best = Infinity;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
    const c = fatGrid.get(`${gx + i},${gy + j},${gz + k}`);
    if (!c) continue;
    for (let q = 0; q < c.length; q += 3) best = Math.min(best, (c[q] - x) ** 2 + (c[q + 1] - y) ** 2 + (c[q + 2] - z) ** 2);
  }
  const d = Math.sqrt(best);
  const t = Math.min(1, Math.max(0, (fat.far - d) / (fat.far - fat.near)));
  // Fat follows the vessels as a band, slightly uneven.
  return t * t * (3 - 2 * t) * (0.8 + 0.2 * valueNoise(x * F * 1.5 + 3, y * F * 1.5 + 7, z * F * 1.5 + 1));
}

// ── Tendon and aponeurosis ──────────────────────────────────────────────────
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Principal (longest) axis and centroid of a point set, by power iteration on the covariance. */
function mainAxis(pos) {
  const n = pos.length / 3, c = [0, 0, 0];
  for (let i = 0; i < pos.length; i += 3) for (let a = 0; a < 3; a++) c[a] += pos[i + a] / n;
  const m = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < pos.length; i += 3) {
    const d = [pos[i] - c[0], pos[i + 1] - c[1], pos[i + 2] - c[2]];
    for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) m[r * 3 + k] += d[r] * d[k];
  }
  let v = [0.577, 0.577, 0.577];
  for (let it = 0; it < 60; it++) {
    const w = [0, 1, 2].map((r) => m[r * 3] * v[0] + m[r * 3 + 1] * v[1] + m[r * 3 + 2] * v[2]);
    const l = Math.hypot(...w) || 1;
    v = w.map((x) => x / l);
  }
  return { axis: new THREE.Vector3(...v), centre: new THREE.Vector3(...c) };
}
/**
 * Per-vertex tendon mask, 0–1. Thickness is the median distance through the mesh along five rays cast
 * inwards (the normal reversed and tilted 20° four ways). Where a muscle is much thinner than its belly
 * (the 85th percentile of its thickness) and outside its middle, it is tendon; thin sheets are left
 * alone because their whole belly is thin. `rules` add aponeuroses by name.
 */
function rawTendonMask(it, cfg) {
  const count = it.positions.length / 3, mask = new Float32Array(count);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(it.positions, 3));
  g.setIndex(new THREE.BufferAttribute(it.indices, 1));
  const bvh = new MeshBVH(g);
  const th = new Float32Array(count), r = new THREE.Ray(), nn = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
  const tilt = Math.tan(THREE.MathUtils.degToRad(20));
  for (let v = 0; v < count; v++) {
    nn.set(it.normals[v * 3], it.normals[v * 3 + 1], it.normals[v * 3 + 2]).negate();
    t1.set(Math.abs(nn.x) < 0.9 ? 1 : 0, Math.abs(nn.x) < 0.9 ? 0 : 1, 0).cross(nn).normalize();
    t2.crossVectors(nn, t1);
    const d = [];
    for (const [a, b] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      r.origin.set(it.positions[v * 3], it.positions[v * 3 + 1], it.positions[v * 3 + 2]);
      r.direction.copy(nn).addScaledVector(t1, a * tilt).addScaledVector(t2, b * tilt).normalize();
      const hit = bvh.raycastFirst(r, THREE.DoubleSide, 0.0002, 0.08);
      d.push(hit ? hit.distance : Infinity);
    }
    d.sort((x, y) => x - y);
    th[v] = d[2];
  }
  const finite = [...th].filter(Number.isFinite).sort((x, y) => x - y);
  const belly = finite.length ? finite[Math.floor(finite.length * 0.85)] : 0;
  const { axis, centre } = mainAxis(it.positions);
  let lo = Infinity, hi = -Infinity;
  const proj = new Float32Array(count);
  for (let v = 0; v < count; v++) {
    proj[v] = (it.positions[v * 3] - centre.x) * axis.x + (it.positions[v * 3 + 1] - centre.y) * axis.y + (it.positions[v * 3 + 2] - centre.z) * axis.z;
    lo = Math.min(lo, proj[v]); hi = Math.max(hi, proj[v]);
  }
  if (belly >= cfg.minBelly) {
    for (let v = 0; v < count; v++) {
      if (!Number.isFinite(th[v])) continue;
      const thin = 1 - smoothstep(cfg.thin[0] * belly, cfg.thin[1] * belly, th[v]);
      const small = 1 - smoothstep(cfg.maxThickness * 0.7, cfg.maxThickness, th[v]);
      const outer = smoothstep(cfg.outer[0], cfg.outer[1], Math.abs((proj[v] - lo) / (hi - lo || 1) - 0.5));
      mask[v] = thin * small * outer;
    }
  }
  let bb = null;
  for (const rule of cfg.rules ?? []) {
    if (!new RegExp(rule.match).test(it.name)) continue;
    if (rule.thinnerThan) for (let v = 0; v < count; v++) mask[v] = Math.max(mask[v], 1 - smoothstep(rule.thinnerThan * 0.8, rule.thinnerThan, th[v]));
    if (rule.medialOf) {
      // Aponeurosis nearer the midline than a border that varies with height: [[y, |x|], …], linear between.
      const pts = rule.medialOf.border, soft = rule.medialOf.soft;
      const borderAt = (y) => {
        if (y <= pts[0][0]) return pts[0][1];
        for (let k = 1; k < pts.length; k++) if (y <= pts[k][0]) return pts[k - 1][1] + ((pts[k][1] - pts[k - 1][1]) * (y - pts[k - 1][0])) / (pts[k][0] - pts[k - 1][0]);
        return pts[pts.length - 1][1];
      };
      for (let v = 0; v < count; v++) {
        const x = Math.abs(it.positions[v * 3]), b = borderAt(it.positions[v * 3 + 1]);
        mask[v] = Math.max(mask[v], 1 - smoothstep(b - soft / 2, b + soft / 2, x));
      }
    }
    if (rule.bands) {
      if (!bb) { bb = [Infinity, -Infinity]; for (let v = 0; v < count; v++) { bb[0] = Math.min(bb[0], it.positions[v * 3 + 1]); bb[1] = Math.max(bb[1], it.positions[v * 3 + 1]); } }
      const half = rule.bands.width / 2;
      for (let v = 0; v < count; v++) {
        const y = it.positions[v * 3 + 1], x = it.positions[v * 3];
        for (const at of rule.bands.at) {
          // Tendinous intersections are rarely straight: a slight zig-zag across the muscle.
          const d = Math.abs(y - (bb[0] + at * (bb[1] - bb[0])) - rule.bands.wave * Math.sin(x * 260 + at * 17));
          mask[v] = Math.max(mask[v], 1 - smoothstep(half * 0.55, half, d));
        }
      }
    }
  }
  return { mask, bvh };
}
/**
 * `veil` rules: a sheet over another muscle (the rectus sheath over rectus abdominis) is aponeurosis but
 * thin, so the muscle beneath shows through: the mask is lowered to `strength` where a ray cast inwards
 * meets the muscle beneath within `depth`, except where that muscle is itself tendinous (its tendinous
 * intersections show on the sheath, to which they are attached).
 */
function applyVeils(it, mask, cfg, raw) {
  for (const rule of cfg.rules ?? []) {
    if (!rule.veil || !new RegExp(rule.match).test(it.name)) continue;
    const under = items.filter((o) => new RegExp(rule.veil.over).test(o.name));
    const r = new THREE.Ray();
    const factor = new Float32Array(mask.length).fill(1);
    for (let v = 0; v < mask.length; v++) {
      if (mask[v] <= 0) continue;
      let best = null;
      // Both ways along the normal: a sheet's two faces look opposite ways.
      for (const sign of [-1, 1]) {
        r.origin.set(it.positions[v * 3], it.positions[v * 3 + 1], it.positions[v * 3 + 2]);
        r.direction.set(it.normals[v * 3] * sign, it.normals[v * 3 + 1] * sign, it.normals[v * 3 + 2] * sign);
        for (const o of under) {
          const hit = raw.get(o).bvh.raycastFirst(r, THREE.DoubleSide, 0.0002, rule.veil.depth);
          if (hit && (!best || hit.distance < best.hit.distance)) best = { hit, o };
        }
      }
      if (!best) continue;
      const m = raw.get(best.o).mask, f = best.hit.face;
      const beneath = Math.min(1, (m[f.a] + m[f.b] + m[f.c]) / 3);
      factor[v] = rule.veil.strength + (1 - rule.veil.strength) * beneath;
    }
    // Soften the veil's outline a little, then apply it to the finished mask.
    const nb = neighbours(it);
    for (let pass = 0; pass < 2; pass++) {
      const next = Float32Array.from(factor);
      for (let v = 0; v < factor.length; v++) { if (!nb[v].size) continue; let s = 0; for (const u of nb[v]) s += factor[u]; next[v] = 0.5 * factor[v] + (0.5 * s) / nb[v].size; }
      factor.set(next);
    }
    for (let v = 0; v < mask.length; v++) mask[v] *= factor[v];
  }
}
function neighbours(it) {
  const nb = Array.from({ length: it.positions.length / 3 }, () => new Set());
  for (let t = 0; t < it.indices.length; t += 3) {
    const [a, b, c] = [it.indices[t], it.indices[t + 1], it.indices[t + 2]];
    nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b);
  }
  return nb;
}
/** Smooth the mask over the mesh, then sharpen its edge a little (the musculotendinous junction). */
function finishMask(it, mask, cfg) {
  const count = mask.length;
  const nb = neighbours(it);
  for (let pass = 0; pass < (cfg.smooth ?? 3); pass++) {
    const next = Float32Array.from(mask);
    for (let v = 0; v < count; v++) {
      if (!nb[v].size) continue;
      let s = 0;
      for (const u of nb[v]) s += mask[u];
      next[v] = 0.5 * mask[v] + (0.5 * s) / nb[v].size;
    }
    mask.set(next);
  }
  for (let v = 0; v < count; v++) mask[v] = smoothstep(0.25, 0.7, mask[v]);
  return mask;
}

// ── Bake ────────────────────────────────────────────────────────────────────
const ray = new THREE.Ray();
const o = new THREE.Vector3(), n = new THREE.Vector3();
const EPS = config.rayOffset ?? 0.0003;
const D = config.aoDistance;
const stats = {};
let vertices = 0;
const t0 = Date.now();
// Tendon masks: every mesh's own first (veils read the masks of the muscles beneath), then the veils.
const raw = new Map();
if (entry.tendon) for (const it of items) raw.set(it, rawTendonMask(it, entry.tendon));
const tendons = new Map();
if (entry.tendon) for (const it of items) {
  const mask = finishMask(it, Float32Array.from(raw.get(it).mask), entry.tendon);
  applyVeils(it, mask, entry.tendon, raw);
  tendons.set(it, mask);
}
for (const it of items) {
  const bvh = bvhFor(occluders[it.layer]);
  const count = it.positions.length / 3;
  const data = new Uint8Array(count * 4);
  const tendon = tendons.get(it) ?? null;
  let aoSum = 0, tendonSum = 0;
  for (let v = 0; v < count; v++) {
    const [x, y, z] = [it.positions[v * 3], it.positions[v * 3 + 1], it.positions[v * 3 + 2]];
    n.set(it.normals[v * 3], it.normals[v * 3 + 1], it.normals[v * 3 + 2]);
    let ao = 1;
    if (bvh) {
      let occ = 0, wsum = 0;
      o.set(x, y, z).addScaledVector(n, EPS);
      for (const d of dirs) {
        const c = d.dot(n);
        if (c <= 0.05) continue;
        ray.set(o, d);
        const hit = bvh.raycastFirst(ray, THREE.DoubleSide, 0, D);
        if (hit) occ += c * (1 - hit.distance / D);
        wsum += c;
      }
      ao = wsum > 0 ? 1 - occ / wsum : 1;
    }
    aoSum += ao;
    // Fat sits in the grooves along the vessels: near a vessel and in a concave (occluded) spot.
    const groove = Math.min(1, Math.max(0, (0.93 - ao) / 0.25));
    const f = fat && fat.tissueLayers.includes(it.layer) ? fatAt(x, y, z) * groove : 0;
    data[v * 4] = Math.round(Math.max(0, Math.min(1, ao)) * 255);
    data[v * 4 + 1] = Math.round(mottle(x, y, z) * 255);
    data[v * 4 + 2] = Math.round(f * 255);
    data[v * 4 + 3] = tendon ? Math.round(tendon[v] * 255) : 255;
    if (tendon) tendonSum += tendon[v];
  }
  if (process.env.BAKE_DEBUG && tendon) console.error(`${it.name}\t${(tendonSum / count).toFixed(3)}`);
  vertices += count;
  const acc = doc.createAccessor(`${it.name}_tissue`).setType('VEC4').setArray(data).setNormalized(true)
    .setBuffer(doc.getRoot().listBuffers()[0]);
  it.prim.setAttribute('_TISSUE', acc);
  stats[it.layer] ??= { meshes: 0, meanAO: 0, vertices: 0, ...(tendon ? { tendonShare: 0 } : {}) };
  stats[it.layer].meshes++;
  stats[it.layer].vertices += count;
  stats[it.layer].meanAO += aoSum;
  if (tendon) stats[it.layer].tendonShare += tendonSum;
}
for (const s of Object.values(stats)) {
  s.meanAO = Math.round((s.meanAO / s.vertices) * 1000) / 1000;
  if (s.tendonShare !== undefined) s.tendonShare = Math.round((s.tendonShare / s.vertices) * 1000) / 1000;
}

const glb = await io.writeBinary(doc);
fs.writeFileSync(modelPath, glb);

const out = prov.outputs[entry.body];
// The unbaked hash is kept from the first bake after an extraction (re-baking leaves it alone).
const before = prov.shadingBake.bodies[entry.body];
const unbakedSha256 = before && before.bakedSha256 === out.sha256 ? before.unbakedSha256 : out.sha256;
prov.shadingBake.bodies[entry.body] = { occluders, unbakedSha256, bakedSha256: sha256(glb), vertices, layers: stats };
prov.outputs[entry.body] = { ...out, bytes: glb.byteLength, sha256: sha256(glb) };
summary[entry.body] = { vertices, bytes: glb.byteLength, sha256: sha256(glb), seconds: (Date.now() - t0) / 1000 };
}
for (const [file, prov] of provs) fs.writeFileSync(file, JSON.stringify(prov, null, 1) + '\n');
console.log(JSON.stringify(summary, null, 2));

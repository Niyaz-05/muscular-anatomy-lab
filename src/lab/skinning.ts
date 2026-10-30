/**
 * Linear-blend skinning on the CPU. The extractor binds every muscle vertex to its two nearest bones
 * (`_SKIN`: bone a, bone b, weight of b); when the skeleton is posed each vertex takes the weighted
 * blend of its two bones' matrices, so a muscle's belly rides on the bone beneath it while its ends
 * follow their attachments.
 */
import * as THREE from 'three';

/** Bone matrices as one flat array (16 numbers per bone, column-major), in the order of the bone list. */
export function flatten(mats: readonly THREE.Matrix4[]): Float32Array<ArrayBuffer> {
  const out = new Float32Array(mats.length * 16);
  mats.forEach((m, i) => out.set(m.elements, i * 16));
  return out;
}

/** Skin positions (and, if given, normals) from their rest values. Normals use the blended rotation only. */
export function skin(
  restPos: Float32Array, restNor: Float32Array | null, skinAttr: Float32Array, bones: Float32Array,
  outPos: Float32Array, outNor: Float32Array | null,
): void {
  const n = restPos.length / 3;
  for (let v = 0; v < n; v++) {
    const a = skinAttr[v * 3]! * 16, b = skinAttr[v * 3 + 1]! * 16, w = skinAttr[v * 3 + 2]!, u = 1 - w;
    const x = restPos[v * 3]!, y = restPos[v * 3 + 1]!, z = restPos[v * 3 + 2]!;
    const m = (k: number) => bones[a + k]! * u + bones[b + k]! * w;
    outPos[v * 3] = m(0) * x + m(4) * y + m(8) * z + m(12);
    outPos[v * 3 + 1] = m(1) * x + m(5) * y + m(9) * z + m(13);
    outPos[v * 3 + 2] = m(2) * x + m(6) * y + m(10) * z + m(14);
    if (restNor && outNor) {
      const nx = restNor[v * 3]!, ny = restNor[v * 3 + 1]!, nz = restNor[v * 3 + 2]!;
      const tx = m(0) * nx + m(4) * ny + m(8) * nz, ty = m(1) * nx + m(5) * ny + m(9) * nz, tz = m(2) * nx + m(6) * ny + m(10) * nz;
      const len = Math.hypot(tx, ty, tz) || 1;
      outNor[v * 3] = tx / len; outNor[v * 3 + 1] = ty / len; outNor[v * 3 + 2] = tz / len;
    }
  }
}

/** One skinned point (for the ends of a muscle). */
export function skinPoint(rest: Float32Array, index: number, skinAttr: Float32Array, bones: Float32Array, out = new THREE.Vector3()): THREE.Vector3 {
  const a = skinAttr[index * 3]! * 16, b = skinAttr[index * 3 + 1]! * 16, w = skinAttr[index * 3 + 2]!, u = 1 - w;
  const x = rest[index * 3]!, y = rest[index * 3 + 1]!, z = rest[index * 3 + 2]!;
  const m = (k: number) => bones[a + k]! * u + bones[b + k]! * w;
  return out.set(m(0) * x + m(4) * y + m(8) * z + m(12), m(1) * x + m(5) * y + m(9) * z + m(13), m(2) * x + m(6) * y + m(10) * z + m(14));
}

/**
 * How much a muscle's ends have moved apart or together, as a percentage of its rest length (the
 * extractor's `ends` are the vertices farthest apart along its long axis). Negative: it has shortened.
 */
export function lengthChangePct(rest: Float32Array, skinAttr: Float32Array, ends: readonly [number, number], bones: Float32Array): number {
  const r0 = new THREE.Vector3(rest[ends[0] * 3], rest[ends[0] * 3 + 1], rest[ends[0] * 3 + 2]);
  const r1 = new THREE.Vector3(rest[ends[1] * 3], rest[ends[1] * 3 + 1], rest[ends[1] * 3 + 2]);
  const base = r0.distanceTo(r1);
  if (base < 1e-6) return 0;
  return (skinPoint(rest, ends[0], skinAttr, bones).distanceTo(skinPoint(rest, ends[1], skinAttr, bones)) / base - 1) * 100;
}

/**
 * The change in a muscle's length along its own axis, as a percentage of its rest length. The muscle is
 * cut into `slices` pieces along its long axis (from its rest shape); the path through the centres of the
 * pieces is measured at rest and as posed. Unlike the distance between the two ends, it follows a muscle
 * that wraps a joint or fans out. Negative: shortened.
 */
export function pathLengthChangePct(rest: Float32Array, skinAttr: Float32Array, axis: readonly number[], bones: Float32Array, slices = 8): number {
  const n = rest.length / 3;
  const t = new Float32Array(n);
  let lo = Infinity, hi = -Infinity;
  for (let v = 0; v < n; v++) {
    t[v] = rest[v * 3]! * axis[0]! + rest[v * 3 + 1]! * axis[1]! + rest[v * 3 + 2]! * axis[2]!;
    if (t[v]! < lo) lo = t[v]!;
    if (t[v]! > hi) hi = t[v]!;
  }
  if (!(hi - lo > 1e-6)) return 0;
  const sumR = new Float64Array(slices * 3), sumP = new Float64Array(slices * 3), count = new Uint32Array(slices);
  const p = new THREE.Vector3();
  for (let v = 0; v < n; v++) {
    const s = Math.min(slices - 1, Math.floor(((t[v]! - lo) / (hi - lo)) * slices));
    count[s]!++;
    for (let k = 0; k < 3; k++) sumR[s * 3 + k]! += rest[v * 3 + k]!;
    skinPoint(rest, v, skinAttr, bones, p);
    sumP[s * 3]! += p.x; sumP[s * 3 + 1]! += p.y; sumP[s * 3 + 2]! += p.z;
  }
  const length = (sum: Float64Array) => {
    let total = 0, prev: number[] | null = null;
    for (let s = 0; s < slices; s++) {
      if (!count[s]) continue;
      const c = [sum[s * 3]! / count[s]!, sum[s * 3 + 1]! / count[s]!, sum[s * 3 + 2]! / count[s]!];
      if (prev) total += Math.hypot(c[0]! - prev[0]!, c[1]! - prev[1]!, c[2]! - prev[2]!);
      prev = c;
    }
    return total;
  };
  const base = length(sumR);
  return base > 1e-6 ? (length(sumP) / base - 1) * 100 : 0;
}

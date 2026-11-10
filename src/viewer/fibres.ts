/**
 * Fibre coordinates for the striations of the tissue shader: for every vertex of a muscle, where it lies
 * across the fibres (two coordinates) and along them (one), in metres, so the shader can draw fascicles
 * that run along the muscle.
 *
 * The fibres follow the muscle's centre line: the mesh is cut into slices along its longest axis, the
 * slice centres form a (curved) centre line with a frame carried along it, and each vertex is placed in
 * the frame of its slice. Across-fibre coordinates are scaled by how wide the muscle is at that slice
 * compared with its belly, so where a muscle narrows into its tendon or converges on its insertion the
 * fibres converge with it. Ring muscles (orbicularis oculi and oris, the sphincters) have circular fibres.
 * The coordinates are attributes, so they follow the muscle when it is posed.
 *
 * A fourth value says how squarely the surface faces along the fibres (|normal · fibre|): where a surface
 * cuts across the fibres (the end of a muscle, or a curved sheet whose centre line is only a rough guide)
 * the shader fades the striations out rather than draw the fascicles' cross-sections.
 */

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const at = (p: ArrayLike<number>, i: number): V3 => [p[i * 3]!, p[i * 3 + 1]!, p[i * 3 + 2]!];

/** Centroid and principal axes (largest spread first) of a point set. */
export function principalAxes(pos: ArrayLike<number>): { centre: V3; axes: [V3, V3, V3] } {
  const n = pos.length / 3;
  const c: V3 = [0, 0, 0];
  for (let i = 0; i < n; i++) { c[0] += pos[i * 3]! / n; c[1] += pos[i * 3 + 1]! / n; c[2] += pos[i * 3 + 2]! / n; }
  const m = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    const d = sub(at(pos, i), c);
    for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) m[r * 3 + k]! += d[r]! * d[k]!;
  }
  const mul = (v: V3): V3 => [m[0]! * v[0] + m[1]! * v[1] + m[2]! * v[2], m[3]! * v[0] + m[4]! * v[1] + m[5]! * v[2], m[6]! * v[0] + m[7]! * v[1] + m[8]! * v[2]];
  const power = (start: V3, deflate: V3[]) => {
    let v = norm(start);
    for (let it = 0; it < 80; it++) {
      let w = mul(v);
      for (const d of deflate) w = sub(w, scale(d, dot(w, d)));
      const l = Math.hypot(...w);
      if (l < 1e-18) break;
      v = scale(w, 1 / l);
    }
    return v;
  };
  const a0 = power([0.5773, 0.5774, 0.5775], []);
  const seed: V3 = Math.abs(a0[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const a1 = power(norm(sub(seed, scale(a0, dot(seed, a0)))), [a0]);
  return { centre: c, axes: [a0, a1, norm(cross(a0, a1))] };
}

/** A small deterministic offset per muscle, so neighbouring muscles do not share one continuous grain. */
function offsetFor(id: string): V3 {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  const r = (k: number) => (((Math.imul(h, k) >>> 0) % 10000) / 10000);
  return [r(7919) * 3, r(104729) * 3, r(1299709) * 3];
}

export const isRing = (id: string) => /orbicularis|sphincter/.test(id);

/**
 * Fibre coordinates (4 per vertex: across, across, along, in metres; then |normal · fibre|, 0–1) for one
 * muscle's rest positions and normals. `id` picks ring fibres for ring muscles and seeds the per-muscle offset.
 */
export function fibreCoords(pos: ArrayLike<number>, id: string, vertexNormals?: ArrayLike<number>): Float32Array {
  const n = pos.length / 3;
  const out = new Float32Array(n * 4);
  if (n === 0) return out;
  const { centre, axes } = principalAxes(pos);
  const off = offsetFor(id);
  const facing = (i: number, fibre: V3) => (vertexNormals ? Math.abs(dot(norm(at(vertexNormals, i)), fibre)) : 0);

  if (isRing(id)) {
    // Circular fibres round the opening: along = arc length round the ring, across = radius and height.
    const [e1, e2, up] = axes;
    let rSum = 0;
    for (let i = 0; i < n; i++) { const d = sub(at(pos, i), centre); rSum += Math.hypot(dot(d, e1), dot(d, e2)); }
    const R = rSum / n;
    for (let i = 0; i < n; i++) {
      const d = sub(at(pos, i), centre);
      const x = dot(d, e1), y = dot(d, e2);
      const tangent = norm(add(scale(e2, x), scale(e1, -y)));
      out.set([Math.hypot(x, y) - R + off[0], dot(d, up) + off[1], Math.atan2(y, x) * R + off[2], facing(i, tangent)], i * 4);
    }
    return out;
  }

  // Slices along the longest axis.
  const axis = axes[0];
  const t = new Float32Array(n);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { t[i] = dot(sub(at(pos, i), centre), axis); lo = Math.min(lo, t[i]!); hi = Math.max(hi, t[i]!); }
  const length = Math.max(hi - lo, 1e-6);
  const bins = Math.max(3, Math.min(28, Math.round(length / 0.012)));
  const binOf = (ti: number) => Math.min(bins - 1, Math.max(0, Math.floor(((ti - lo) / length) * bins)));
  const sums: V3[] = Array.from({ length: bins }, () => [0, 0, 0]);
  const counts = new Array<number>(bins).fill(0);
  for (let i = 0; i < n; i++) { const b = binOf(t[i]!); sums[b] = add(sums[b]!, at(pos, i)); counts[b]!++; }
  // Slice centres; an empty slice takes the point on the axis.
  let centres: V3[] = sums.map((s, b) => (counts[b] ? scale(s, 1 / counts[b]!) : add(centre, scale(axis, lo + ((b + 0.5) / bins) * length))));
  for (let pass = 0; pass < 2; pass++) {
    centres = centres.map((c, b) => (b === 0 || b === bins - 1 ? c : scale(add(add(centres[b - 1]!, centres[b + 1]!), scale(c, 2)), 0.25)));
  }
  // Tangents, and a frame carried along the centre line without twisting.
  const tangents = centres.map((_, b) => {
    const d = sub(centres[Math.min(bins - 1, b + 1)]!, centres[Math.max(0, b - 1)]!);
    const l = Math.hypot(...d);
    // A centre line that folds back on itself is no guide: fall back to the axis.
    return l < 1e-6 || dot(d, axis) < 0.2 * l ? axis : scale(d, 1 / l);
  });
  const normals: V3[] = [];
  let prev: V3 = axes[1];
  for (let b = 0; b < bins; b++) {
    const T = tangents[b]!;
    let N = sub(prev, scale(T, dot(prev, T)));
    if (Math.hypot(...N) < 1e-6) N = sub(axes[2], scale(T, dot(axes[2], T)));
    N = norm(N);
    normals.push(N);
    prev = N;
  }
  // Arc length to each slice centre.
  const arc = [0];
  for (let b = 1; b < bins; b++) arc.push(arc[b - 1]! + Math.hypot(...sub(centres[b]!, centres[b - 1]!)));
  // Width of each slice (RMS distance from the centre, across the fibres), smoothed.
  const w2 = new Array<number>(bins).fill(0);
  for (let i = 0; i < n; i++) {
    const b = binOf(t[i]!);
    const d = sub(at(pos, i), centres[b]!);
    const along = dot(d, tangents[b]!);
    w2[b]! += (dot(d, d) - along * along) / counts[b]!;
  }
  let width = w2.map(Math.sqrt);
  width = width.map((w, b) => (counts[b] ? w : 0));
  for (let pass = 0; pass < 2; pass++) width = width.map((w, b) => (w + (width[b - 1] ?? w) + (width[b + 1] ?? w)) / 3);
  const belly = Math.max(1e-4, [...width].sort((a, b) => a - b)[Math.floor(bins * 0.7)]!);

  for (let i = 0; i < n; i++) {
    const p = at(pos, i);
    const f = Math.min(bins - 1, Math.max(0, ((t[i]! - lo) / length) * bins - 0.5));
    const b0 = Math.floor(f), b1 = Math.min(bins - 1, b0 + 1), k = f - b0;
    const C = lerp(centres[b0]!, centres[b1]!, k);
    const T = norm(lerp(tangents[b0]!, tangents[b1]!, k));
    const N = norm(sub(lerp(normals[b0]!, normals[b1]!, k), scale(T, dot(lerp(normals[b0]!, normals[b1]!, k), T))));
    const B = cross(T, N);
    const w = width[b0]! + (width[b1]! - width[b0]!) * k;
    // Converge where the muscle narrows (but not without limit, at the very tip of a tendon).
    const spread = belly / Math.max(w, belly * 0.3);
    const d = sub(p, C);
    const s = arc[b0]! + (arc[b1]! - arc[b0]!) * k + dot(d, T);
    out.set([dot(d, N) * spread + off[0], dot(d, B) * spread + off[1], s + off[2], facing(i, T)], i * 4);
  }
  return out;
}

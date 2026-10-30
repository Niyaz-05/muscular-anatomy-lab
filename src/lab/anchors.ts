/**
 * Geometry facts written by the extractor: each muscle's bounds, centroid, depth, ends and bones.
 * Every function takes the definition, so the shape matches the other labs.
 */
import muscleJson from './generated/muscles.json';
import skeletonJson from './generated/skeleton.json';
import type { CloseUp, Mode, SimulationDefinition } from '../contract/schema';

export type Vec3 = [number, number, number];
export type Depth = 'superficial' | 'intermediate' | 'deep';
export interface G {
  centroid: number[]; bounds: number[][]; surfaceAnchor?: number[]; axes?: number[][]; extentsMm?: number[]; side: string; layer: string;
  depth: Depth; exposed: number; ends: [number, number]; bones: string[]; vertexCount: number; triangleCount: number; modelled?: boolean;
}

const raw = muscleJson.structures as unknown as Record<string, unknown>;
const GEOMETRY = Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith('$'))) as Record<string, G>;
/** The bones the muscles are bound to, in the order of the `_SKIN` indices. */
export const SKIN_BONES = (raw.$skin as { bones: string[] }).bones;
export const geometryOf = (_def?: SimulationDefinition) => GEOMETRY;
export const depthOf = (id: string): Depth | null => GEOMETRY[id]?.depth ?? null;
const JOINTS = (skeletonJson.structures as unknown as { $joints: Record<string, { pivot: number[] }> }).$joints;
export const jointPivot = (id: string): Vec3 => vec(JOINTS[id]?.pivot ?? [0, 0, 0]);

export const vec = (p: readonly number[]): Vec3 => [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0];

/** A point to hang a label on: on the structure's surface, or the middle of a group. */
export function anchorOf(def: SimulationDefinition, id: string): Vec3 | null {
  const g = GEOMETRY[id];
  if (g) return vec(g.surfaceAnchor ?? g.centroid);
  const s = def.structures.find((x) => x.id === id);
  if (s?.kind === 'group' && s.members) {
    const pts = s.members.map((m) => anchorOf(def, m)).filter((p): p is Vec3 => p !== null);
    if (!pts.length) return null;
    return [0, 1, 2].map((a) => pts.reduce((n, p) => n + p[a]!, 0) / pts.length) as Vec3;
  }
  return null;
}
/** The centroid of a mesh structure (or the middle of a group's members). */
export function centroidOf(def: SimulationDefinition, id: string): Vec3 {
  const g = GEOMETRY[id];
  if (g) return vec(g.centroid);
  const b = boundsOfIds(def, [id]);
  return b ? [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2, (b[0][2] + b[1][2]) / 2] : [0, 0, 0];
}

/** Axis-aligned bounds of a set of structures (groups expand to their members). */
export function boundsOfIds(def: SimulationDefinition, ids: readonly string[]): [Vec3, Vec3] | null {
  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  const visit = (id: string) => {
    const g = GEOMETRY[id];
    if (g) {
      for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a]!, g.bounds[0]![a]!); hi[a] = Math.max(hi[a]!, g.bounds[1]![a]!); }
      return;
    }
    def.structures.find((x) => x.id === id)?.members?.forEach(visit);
  };
  ids.forEach(visit);
  return Number.isFinite(lo[0]) ? [lo, hi] : null;
}

/** Bounds of the default view: every muscle (the arms hang at the sides). */
export function homeBounds(def: SimulationDefinition, _mode: Mode = 'explore'): [Vec3, Vec3] {
  return boundsOfIds(def, def.structures.filter((s) => s.kind === 'mesh').map((s) => s.id)) ?? [[-0.5, -0.87, -0.15], [0.5, 0.87, 0.15]];
}
/** Bounds of everything shown in a mode (used to place the cut). */
export const modeBounds = homeBounds;
/** Slice position (−1 … 1 across `bounds` on an axis) for a world coordinate. */
export function sliceAt(bounds: [Vec3, Vec3], axis: 0 | 1 | 2, world: number): number {
  const mid = (bounds[0][axis] + bounds[1][axis]) / 2, half = (bounds[1][axis] - bounds[0][axis]) / 2;
  return half > 0 ? Math.max(-1, Math.min(1, (world - mid) / half)) : 0;
}
/** The world coordinate of a slice position. */
export function sliceWorld(bounds: [Vec3, Vec3], axis: 0 | 1 | 2, at: number): number {
  const mid = (bounds[0][axis] + bounds[1][axis]) / 2, half = (bounds[1][axis] - bounds[0][axis]) / 2;
  return mid + at * half;
}

/**
 * Where each magnified close-up sits and how large it is (radius, metres): drawn at the muscle it is
 * about while the body is hidden.
 */
export function closeUpFrame(def: SimulationDefinition, id: CloseUp): { centre: Vec3; radius: number } {
  const c = (sid: string) => centroidOf(def, sid);
  switch (id) {
    case 'sarcomere': return { centre: c('biceps-brachii-long-head-left'), radius: 0.02 };
    case 'nmj': return { centre: c('biceps-brachii-long-head-left'), radius: 0.02 };
    case 'fibre-types': return { centre: c('vastus-lateralis-left'), radius: 0.02 };
    case 'spindle': return { centre: c('biceps-brachii-short-head-left'), radius: 0.02 };
    case 'tendon': return { centre: c('calcaneal-tendon-left'), radius: 0.02 };
    case 'fascicle': return { centre: c('biceps-brachii-long-head-left'), radius: 0.02 };
  }
}

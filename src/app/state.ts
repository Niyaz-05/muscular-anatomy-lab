/**
 * UI and simulation state as a pure reducer, so every learner action is unit-testable without
 * rendering. The 3D scene only reads this state; it never owns selection, visibility or the pose.
 */
import type { CloseUp, Mode, SimulationDefinition, SliceAxis, TourStep } from '../contract/schema';
import { MODE_CAMERA } from './modes';
import { boundsOfIds, centroidOf, depthOf, jointPivot, modeBounds, sliceAt } from '../lab/anchors';
import { clampPose, JOINTS, poseById, type Pose, type Side } from '../lab/joints';
import { ACTIVITIES, activityById, type Program, type Training } from '../lab/exercise';
import { disorderById } from '../lab/disorders';
import type { Fibre } from '../lab/contraction';

export type { Mode } from '../contract/schema';
export type ColourBy = 'real' | 'region' | 'nerve' | 'depth' | 'fibre';
export type BonesView = 'off' | 'ghost' | 'solid';
/** 0 shows every layer; 1 hides the superficial muscles; 2 hides the intermediate ones as well. */
export type Peel = 0 | 1 | 2;

export interface Slice {
  axis: SliceAxis;
  /** Position across what the mode shows, -1 … 1. */
  at: number;
  /** Keep the other side of the cut. */
  flip: boolean;
}
export interface JointSettings { joint: string; side: Side | 'both'; pose: Pose; preset: string | null }
export type InsidePanel = 'tension' | 'velocity' | 'tetanus' | 'units' | 'steps';
export interface InsideSettings { panel: InsidePanel; /** Sarcomere length, µm. */ length: number; /** Relative velocity, −1 … 1 (positive shortens). */ velocity: number; hz: number; fibre: Fibre; /** Motor drive, 0–100 %. */ drive: number; step: number }
export interface ExerciseSettings { activity: string | null; /** Demand in units of the power at VO₂max. */ demand: number; minutes: number; trained: boolean; program: Program; weeks: number; hours: number; repeated: boolean }
export interface InjurySettings { id: string; grade: 1 | 2 | 3; day: number; ck: number; mrc: number; sex: 'female' | 'male' }

export interface LabState {
  mode: Mode;
  selected: string | null;
  hovered: string | null;
  visibleLayers: ReadonlySet<string>;
  isolate: boolean;
  labels: boolean;
  colourBy: ColourBy;
  peel: Peel;
  bones: BonesView;
  slice: Slice;
  /** Animations (close-ups, the sliding filaments) running. */
  playing: boolean;
  closeUp: CloseUp | null;
  joints: JointSettings;
  inside: InsideSettings;
  exercise: ExerciseSettings;
  injury: InjurySettings;
  tourIndex: number;
  /** A camera move the scene should perform; the nonce makes repeat requests distinct. */
  camera: { preset: string; focus: readonly string[]; nonce: number; around?: readonly number[] };
}

export type LabAction =
  | { type: 'select'; id: string | null }
  | { type: 'hover'; id: string | null }
  | { type: 'toggle-layer'; layer: string }
  | { type: 'set-isolate'; value: boolean }
  | { type: 'set-labels'; value: boolean }
  | { type: 'set-colour-by'; value: ColourBy }
  | { type: 'set-peel'; value: Peel }
  | { type: 'set-bones'; value: BonesView }
  | { type: 'set-slice'; axis?: SliceAxis; at?: number; flip?: boolean }
  | { type: 'set-mode'; mode: Mode }
  | { type: 'set-playing'; value: boolean }
  | { type: 'set-close-up'; value: CloseUp | null }
  | { type: 'set-joint'; joint?: string; side?: Side | 'both' }
  | { type: 'set-movement'; key: string; value: number }
  | { type: 'set-pose'; preset: string }
  | { type: 'set-inside'; value: Partial<InsideSettings> }
  | { type: 'set-exercise'; value: Partial<ExerciseSettings> }
  | { type: 'set-activity'; id: string }
  | { type: 'set-injury'; value: Partial<InjurySettings> }
  | { type: 'tour-go'; index: number }
  | { type: 'camera'; preset: string; focus?: readonly string[] }
  | { type: 'reset' };

const NO_SLICE: Slice = { axis: 'off', at: 0, flip: false };
export const DEFAULT_JOINTS: JointSettings = { joint: 'elbow', side: 'left', pose: {}, preset: 'anatomical' };
export const DEFAULT_INSIDE: InsideSettings = { panel: 'tension', length: 2.2, velocity: 0, hz: 20, fibre: 'fast', drive: 30, step: 0 };
export const DEFAULT_EXERCISE: ExerciseSettings = { activity: '10k', demand: 0.84, minutes: 38, trained: false, program: 'none', weeks: 12, hours: 48, repeated: false };
export const DEFAULT_INJURY: InjurySettings = { id: 'hamstring', grade: 2, day: 0, ck: 150, mrc: 5, sex: 'female' };

export function initialState(def: SimulationDefinition): LabState {
  return {
    mode: 'explore',
    selected: null,
    hovered: null,
    visibleLayers: new Set(def.layers.filter((l) => l.visibleByDefault).map((l) => l.id)),
    isolate: false,
    labels: false,
    colourBy: 'real',
    peel: 0,
    bones: 'off',
    slice: NO_SLICE,
    playing: true,
    closeUp: null,
    joints: DEFAULT_JOINTS,
    inside: DEFAULT_INSIDE,
    exercise: DEFAULT_EXERCISE,
    injury: DEFAULT_INJURY,
    tourIndex: 0,
    camera: { preset: def.defaultCamera, focus: [], nonce: 1 },
  };
}

/** Ids that a selection or tour step highlights: a group stands for its members. */
export function highlightedIds(def: SimulationDefinition, ids: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const id of ids) {
    const s = def.structures.find((x) => x.id === id);
    if (!s) continue;
    if (s.kind === 'group') s.members?.forEach((m) => out.add(m));
    else out.add(id);
  }
  return out;
}

export const currentStep = (def: SimulationDefinition, state: LabState): TourStep | undefined => (state.mode === 'tour' ? def.tour[state.tourIndex] : undefined);

/** The mode in effect: in a tour, the step's (Anatomy if it names none). */
export function effectiveMode(def: SimulationDefinition, state: LabState): Exclude<Mode, 'tour'> {
  if (state.mode === 'tour') return currentStep(def, state)?.mode ?? 'explore';
  return state.mode;
}
/** The pose in effect: a tour step's named pose, or the learner's (only in the movement view). */
export function effectivePose(def: SimulationDefinition, state: LabState): Pose {
  const s = currentStep(def, state);
  if (s) return s.pose ? poseById(s.pose)?.pose ?? {} : {};
  return state.mode === 'movement' ? state.joints.pose : {};
}
export function effectiveInside(def: SimulationDefinition, state: LabState): InsideSettings {
  const s = currentStep(def, state);
  if (!s) return state.inside;
  const t = s.inside;
  return { ...DEFAULT_INSIDE, hz: t?.hz ?? DEFAULT_INSIDE.hz, fibre: t?.fibre ?? DEFAULT_INSIDE.fibre, length: t?.length ?? DEFAULT_INSIDE.length, drive: t?.drive ?? DEFAULT_INSIDE.drive };
}
export function effectiveExercise(def: SimulationDefinition, state: LabState): ExerciseSettings {
  const s = currentStep(def, state);
  if (!s) return state.exercise;
  const t = s.exercise;
  const a = t ? activityById(t.activity) : undefined;
  return { ...DEFAULT_EXERCISE, ...(a ? { activity: a.id, demand: a.demand, minutes: a.minutes } : {}), trained: t?.trained ?? false, program: t?.program ?? 'none', weeks: t?.weeks ?? DEFAULT_EXERCISE.weeks };
}
export function effectiveInjury(def: SimulationDefinition, state: LabState): InjurySettings {
  const s = currentStep(def, state);
  if (!s?.injury) return state.injury;
  return { ...DEFAULT_INJURY, id: s.injury.id, grade: (s.injury.grade as 1 | 2 | 3 | undefined) ?? 2, day: s.injury.day ?? 0 };
}

/** The structures currently in focus: the selection, or the tour step's. */
export function focusIds(def: SimulationDefinition, state: LabState): string[] {
  if (state.mode === 'tour') return [...(currentStep(def, state)?.focus ?? [])];
  if (state.selected) return [state.selected];
  if (state.mode === 'injury') return disorderById(state.injury.id)?.sites ?? [];
  return [];
}

export function effectiveCloseUp(def: SimulationDefinition, state: LabState): CloseUp | null {
  if (state.mode === 'tour') return currentStep(def, state)?.closeUp ?? null;
  return state.closeUp;
}
/** Whether highlighted structures are tinted: a tour step can turn it off (cut views). */
export function effectiveTint(def: SimulationDefinition, state: LabState): boolean {
  return state.mode === 'tour' ? currentStep(def, state)?.tint !== false : true;
}
export function effectiveColourBy(def: SimulationDefinition, state: LabState): ColourBy {
  if (state.mode === 'tour') return currentStep(def, state)?.colourBy ?? 'real';
  return state.colourBy;
}
export function effectivePeel(def: SimulationDefinition, state: LabState): Peel {
  if (state.mode === 'tour') return (currentStep(def, state)?.peel as Peel | undefined) ?? 0;
  return state.peel;
}
export function effectiveBones(def: SimulationDefinition, state: LabState): BonesView {
  if (state.mode === 'tour') return currentStep(def, state)?.bones ?? 'off';
  // Movement shows the bones the muscles pull on.
  return state.bones;
}
const AXES: Record<Exclude<SliceAxis, 'off'>, 0 | 1 | 2> = { sagittal: 0, axial: 1, coronal: 2 };
/** The cut in effect: a tour step's (through the middle of a structure, if it names one); otherwise the learner's. */
export function effectiveSlice(def: SimulationDefinition, state: LabState): Slice {
  if (state.mode === 'tour') {
    const s = currentStep(def, state);
    if (!s?.slice || s.slice.axis === 'off') return NO_SLICE;
    const ax = AXES[s.slice.axis];
    const through = s.slice.through ? (boundsOfIds(def, [s.slice.through]) ? centroidOf(def, s.slice.through)[ax] : null) : null;
    const at = through !== null ? sliceAt(modeBounds(def, s.mode ?? 'explore'), ax, through) : s.slice.at ?? 0;
    return { axis: s.slice.axis, at, flip: false };
  }
  return state.slice;
}

const DEPTH_RANK = { superficial: 1, intermediate: 2, deep: 3 } as const;
/**
 * Whether a mesh structure is drawn. The learner's layers decide, and the peel hides the superficial
 * (then the intermediate) muscles. A highlighted structure is always shown; with isolate on, only those.
 * A magnified close-up hides the body.
 */
export function isVisible(def: SimulationDefinition, state: LabState, id: string): boolean {
  const s = def.structures.find((x) => x.id === id);
  if (!s) return false;
  if (effectiveCloseUp(def, state)) return false;
  const lit = highlightedIds(def, focusIds(def, state));
  if (lit.has(id)) return true;
  const isolate = state.mode === 'tour' ? !!currentStep(def, state)?.isolate : state.isolate;
  if (isolate && lit.size > 0) return false;
  const peel = effectivePeel(def, state);
  const depth = depthOf(id);
  if (peel > 0 && depth && DEPTH_RANK[depth] <= peel) return false;
  return state.visibleLayers.has(s.layer);
}

/**
 * The camera preset that looks at the cut face. The cut keeps the side below the plane on its axis
 * (x: the patient's right, z: the back, y: the lower part), or the side above it when flipped, so
 * the camera looks from the removed side.
 */
export function facingPreset(slice: Slice): string | null {
  switch (slice.axis) {
    case 'sagittal': return slice.flip ? 'right' : 'left';
    case 'coronal': return slice.flip ? 'posterior' : 'anterior';
    case 'axial': return slice.flip ? 'inferior' : 'superior';
    default: return null;
  }
}
/** What the cut leaves in view, for the panel's hint (+x is the patient's left). */
export function keptHalf(slice: Slice): string | null {
  switch (slice.axis) {
    case 'sagittal': return slice.flip ? 'the left side of the body' : 'the right side of the body';
    case 'coronal': return slice.flip ? 'the front half' : 'the back half';
    case 'axial': return slice.flip ? 'the upper part' : 'the lower part';
    default: return null;
  }
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const finite = (o: Record<string, unknown>) => Object.values(o).every((v) => typeof v !== 'number' || Number.isFinite(v));

/** The rig's joint key for a joint of the catalogue on a side, and how wide to frame it (metres). */
export function jointFrame(jointId: string, side: Side | 'both'): { key: string; radius: number } {
  const s = side === 'both' ? 'left' : side;
  switch (jointId) {
    case 'forearm': return { key: `radioulnar-${s}`, radius: 0.2 };
    case 'fingers': return { key: `proximal-phalanx-index-${s}-joint`, radius: 0.12 };
    case 'toes': return { key: `proximal-phalanx-toe-1-${s}`, radius: 0.12 };
    case 'neck': return { key: 'spine-c4', radius: 0.2 };
    case 'trunk': return { key: 'spine-l1', radius: 0.38 };
    case 'jaw': return { key: 'tmj', radius: 0.12 };
    default: return { key: `${jointId}-${s}`, radius: jointId === 'hip' || jointId === 'knee' || jointId === 'ankle' ? 0.3 : 0.24 };
  }
}

/** Where each disorder is best seen from. */
export const DISORDER_VIEW: Record<string, string> = {
  hamstring: 'posterior', calf: 'posterior', 'rotator-cuff': 'posterior', achilles: 'posterior', tendinopathy: 'left', compartment: 'anterior',
  rhabdomyolysis: 'anterior', duchenne: 'posterior', myotonic: 'anterior', myasthenia: 'anterior', 'lambert-eaton': 'anterior', polymyositis: 'anterior', sarcopenia: 'anterior',
};

export function makeReducer(def: SimulationDefinition) {
  const known = new Set(def.structures.map((s) => s.id));
  const layers = new Set(def.layers.map((l) => l.id));
  const presets = new Set(def.cameraPresets.map((c) => c.id));
  const cam = (state: LabState, preset: string | undefined, focus: readonly string[] = []) =>
    preset && presets.has(preset) ? { preset, focus, nonce: state.camera.nonce + 1 } : state.camera;
  const injuryCamera = (state: LabState, id: string) => cam(state, DISORDER_VIEW[id] ?? 'anterior', (disorderById(id)?.sites ?? []).filter((x) => known.has(x)));
  const stepCamera = (state: LabState, index: number): LabState['camera'] => {
    const s = def.tour[index];
    if (!s) return state.camera;
    return cam(state, s.camera ?? MODE_CAMERA[s.mode ?? 'explore'], s.frame === 'mode' || s.closeUp ? [] : s.focus);
  };

  return function reduce(state: LabState, action: LabAction): LabState {
    switch (action.type) {
      case 'select': {
        if (action.id !== null && !known.has(action.id)) return state;
        const selected = action.id === state.selected ? null : action.id;
        return { ...state, selected, isolate: selected ? state.isolate : false, closeUp: selected ? null : state.closeUp };
      }
      case 'hover':
        return action.id === state.hovered || (action.id !== null && !known.has(action.id)) ? state : { ...state, hovered: action.id };
      case 'toggle-layer': {
        if (!layers.has(action.layer)) return state;
        const next = new Set(state.visibleLayers);
        if (next.has(action.layer)) next.delete(action.layer); else next.add(action.layer);
        return { ...state, visibleLayers: next };
      }
      case 'set-isolate':
        return { ...state, isolate: action.value };
      case 'set-labels':
        return { ...state, labels: action.value };
      case 'set-colour-by':
        return action.value === state.colourBy ? state : { ...state, colourBy: action.value };
      case 'set-peel':
        return action.value === state.peel ? state : { ...state, peel: action.value };
      case 'set-bones':
        return action.value === state.bones ? state : { ...state, bones: action.value };
      case 'set-slice': {
        const at = action.at === undefined || !Number.isFinite(action.at) ? state.slice.at : clamp(action.at, -1, 1);
        const axis = action.axis ?? state.slice.axis;
        const fresh = action.axis !== undefined && action.axis !== state.slice.axis && action.at === undefined;
        const slice = { axis, at: fresh ? 0 : at, flip: action.flip ?? state.slice.flip };
        const turned = axis !== 'off' && (axis !== state.slice.axis || slice.flip !== state.slice.flip);
        return turned ? { ...state, slice, camera: cam(state, facingPreset(slice) ?? undefined) } : { ...state, slice };
      }
      case 'set-mode': {
        if (action.mode === state.mode) return state;
        if (action.mode === 'tour') return { ...state, mode: 'tour', tourIndex: 0, selected: null, isolate: false, playing: true, closeUp: null, camera: stepCamera(state, 0) };
        const camera = action.mode === 'injury' ? injuryCamera(state, state.injury.id) : cam(state, MODE_CAMERA[action.mode]);
        // The movement view shows the bones the muscles pull on, the others only the muscles (the learner's choice stands).
        const bones: BonesView = action.mode === 'movement' && state.bones === 'off' ? 'ghost' : state.bones;
        return { ...state, mode: action.mode, playing: true, selected: null, closeUp: null, bones, slice: state.mode === 'tour' ? NO_SLICE : state.slice, camera };
      }
      case 'set-playing':
        return { ...state, playing: action.value };
      case 'set-close-up':
        return { ...state, closeUp: action.value, selected: action.value ? null : state.selected, camera: { ...state.camera, focus: [], nonce: state.camera.nonce + 1 } };
      case 'set-joint': {
        const joint = action.joint && JOINTS.some((j) => j.id === action.joint) ? action.joint : state.joints.joint;
        const side = action.side ?? state.joints.side;
        const f = jointFrame(joint, side);
        const camera = action.joint && presets.has('oblique') ? { preset: 'oblique', focus: [], nonce: state.camera.nonce + 1, around: [...jointPivot(f.key), f.radius] } : state.camera;
        return { ...state, joints: { ...state.joints, joint, side }, selected: null, camera };
      }
      case 'set-movement': {
        if (!Number.isFinite(action.value)) return state;
        const keys = action.key.endsWith('-both') ? [action.key.replace(/-both$/, '-left'), action.key.replace(/-both$/, '-right')] : [action.key];
        const pose = clampPose({ ...state.joints.pose, ...Object.fromEntries(keys.map((k) => [k, action.value])) });
        if (!keys.every((k) => k in pose)) return state;
        return { ...state, joints: { ...state.joints, pose, preset: null } };
      }
      case 'set-pose': {
        const p = poseById(action.preset);
        return p ? { ...state, joints: { ...state.joints, pose: clampPose(p.pose), preset: p.id } } : state;
      }
      case 'set-inside': {
        const v = { ...state.inside, ...action.value };
        if (!finite(v as unknown as Record<string, unknown>)) return state;
        return { ...state, inside: { ...v, length: clamp(v.length, 1.2, 3.8), velocity: clamp(v.velocity, -1, 1), hz: clamp(Math.round(v.hz), 1, 100), drive: clamp(v.drive, 0, 100), step: Math.max(0, Math.round(v.step)) } };
      }
      case 'set-exercise': {
        const v = { ...state.exercise, ...action.value };
        if (!finite(v as unknown as Record<string, unknown>)) return state;
        const custom = (action.value.demand !== undefined || action.value.minutes !== undefined) && action.value.activity === undefined;
        return { ...state, exercise: { ...v, activity: custom ? null : v.activity, demand: clamp(v.demand, 0.1, 5), minutes: clamp(v.minutes, 0.05, 240), weeks: clamp(Math.round(v.weeks), 0, 52), hours: clamp(Math.round(v.hours), 0, 240) } };
      }
      case 'set-activity': {
        const a = ACTIVITIES.find((x) => x.id === action.id);
        return a ? { ...state, exercise: { ...state.exercise, activity: a.id, demand: a.demand, minutes: a.minutes } } : state;
      }
      case 'set-injury': {
        const v = { ...state.injury, ...action.value };
        if (!finite(v as unknown as Record<string, unknown>) || !disorderById(v.id)) return state;
        const changed = v.id !== state.injury.id;
        const next: InjurySettings = { id: v.id, grade: clamp(Math.round(v.grade), 1, 3) as 1 | 2 | 3, day: clamp(Math.round(v.day), 0, 180), ck: clamp(Math.round(v.ck), 0, 200000), mrc: clamp(Math.round(v.mrc), 0, 5), sex: v.sex };
        return { ...state, injury: next, selected: changed ? null : state.selected, camera: changed ? injuryCamera(state, v.id) : state.camera };
      }
      case 'tour-go': {
        const index = clamp(action.index, 0, def.tour.length - 1);
        if (!def.tour[index]) return state;
        return { ...state, mode: 'tour', tourIndex: index, closeUp: null, camera: stepCamera(state, index) };
      }
      case 'camera':
        if (!presets.has(action.preset)) return state;
        return { ...state, camera: { preset: action.preset, focus: action.focus ?? [], nonce: state.camera.nonce + 1 } };
      case 'reset': {
        const fresh = initialState(def);
        return { ...fresh, camera: { ...fresh.camera, nonce: state.camera.nonce + 1 } };
      }
    }
  };
}

export type { Training };

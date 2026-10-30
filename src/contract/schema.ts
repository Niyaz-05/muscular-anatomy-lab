/**
 * The simulation contract (muscular edition). A SimulationDefinition is plain, serialisable data: it
 * names an approved asset by id, lists the structures and layers a learner can work with, and
 * declares the learning content (tour, objectives, sources). The runtime renders any definition that
 * passes these schemas and the cross-reference checks in validate.ts. Nothing in here may carry a URL
 * (except https source links), a file path or code.
 */
import { z } from 'zod';
import { POSES } from '../lab/joints';
import { ACTIVITIES } from '../lab/exercise';
import { DISORDERS } from '../lab/disorders';

/** Lower-case kebab-case ids keep definitions portable and safe to use as DOM/URL keys. */
export const Id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'ids are lower-case kebab-case').max(64);
const Text = (max: number) => z.string().trim().min(1).max(max);
const Vec3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const oneOf = <T extends string>(ids: readonly T[], what: string) => z.string().refine((v): v is T => (ids as readonly string[]).includes(v), { message: `unknown ${what}` }) as unknown as z.ZodType<T>;

export const Source = z.object({
  id: Id,
  citation: Text(400),
  url: z.url({ protocol: /^https$/ }).optional(),
  license: Text(80).optional(),
});
export type Source = z.infer<typeof Source>;

export const AssetRef = z.object({
  /** Key into the approved asset registry (assets.ts); never a path or URL. */
  id: Id,
  role: z.enum(['anatomy-model']),
});

export const Layer = z.object({
  id: Id,
  label: Text(60),
  description: Text(300),
  visibleByDefault: z.boolean(),
});
export type Layer = z.infer<typeof Layer>;

export const Plexus = z.enum(['cranial', 'cervical', 'brachial', 'thoracic', 'lumbar', 'sacral', 'spinal', 'none']);
export type Plexus = z.infer<typeof Plexus>;

/** What a muscle is and does: attachments, nerve supply, actions (movement ids with a direction) and blood supply. */
export const MuscleFacts = z.object({
  name: Text(80),
  region: Text(60),
  origin: Text(400),
  insertion: Text(400),
  nerve: Text(240),
  roots: Text(40),
  plexus: Plexus,
  /** `elbow-flex+*, forearm-pron-`: movement ids from the joint catalogue, direction, `*` for a prime mover. */
  actions: Text(240),
  blood: Text(240),
  /** Typical share of slow-twitch fibres, 0–100. */
  slow: z.number().min(0).max(100).optional(),
});
export type MuscleFacts = z.infer<typeof MuscleFacts>;

export const CloseUp = z.enum(['sarcomere', 'nmj', 'fibre-types', 'spindle', 'tendon', 'fascicle']);
export type CloseUp = z.infer<typeof CloseUp>;

export const AnatomicalStructure = z.object({
  id: Id,
  label: Text(80),
  synonyms: z.array(Text(80)).max(14),
  layer: Id,
  /** mesh: a node of the same id exists in the model. group: no geometry; stands for `members`. */
  kind: z.enum(['mesh', 'group']),
  members: z.array(Id).min(1).max(64).optional(),
  side: z.enum(['right', 'left', 'midline']),
  /** Group this part belongs to (for example a phalanx belongs to its hand). */
  organ: Id.optional(),
  summary: Text(400),
  function: Text(900),
  muscle: MuscleFacts.optional(),
  related: z.array(Id).max(12),
  /** What the 3D model does and does not show for this structure. */
  modelNote: Text(500).optional(),
  /** A magnified close-up of its tissue. */
  closeUp: CloseUp.optional(),
  sources: z.array(Id).min(1).max(6),
});
export type AnatomicalStructure = z.infer<typeof AnatomicalStructure>;

export const CameraPreset = z.object({
  id: Id,
  label: Text(40),
  /** Unit-ish vector from the model centre towards the camera, in model axes. */
  direction: Vec3,
  up: Vec3.optional(),
});
export type CameraPreset = z.infer<typeof CameraPreset>;

export const SliceAxis = z.enum(['off', 'sagittal', 'coronal', 'axial']);
export type SliceAxis = z.infer<typeof SliceAxis>;

export const Mode = z.enum(['explore', 'movement', 'inside', 'exercise', 'injury', 'tour']);
export type Mode = z.infer<typeof Mode>;

export const TourStep = z.object({
  id: Id,
  title: Text(80),
  text: Text(900),
  focus: z.array(Id).max(24),
  camera: Id.optional(),
  mode: Mode.exclude(['tour']).optional(),
  /** Movement view: a named pose. */
  pose: oneOf(POSES.map((p) => p.id), 'pose').optional(),
  /** Inside a muscle: stimulation rate (Hz), fibre type and sarcomere length (µm). */
  inside: z.object({ hz: z.number().min(1).max(100).optional(), fibre: z.enum(['slow', 'fast']).optional(), length: z.number().min(1.2).max(3.8).optional(), drive: z.number().min(0).max(100).optional() }).optional(),
  /** Exercise view: the activity and the training. */
  exercise: z.object({ activity: oneOf(ACTIVITIES.map((a) => a.id), 'activity'), trained: z.boolean().optional(), program: z.enum(['none', 'strength', 'endurance', 'both']).optional(), weeks: z.number().min(0).max(52).optional() }).optional(),
  /** Injuries view: the disorder, its grade and the days since onset. */
  injury: z.object({ id: oneOf(DISORDERS.map((d) => d.id), 'disorder'), grade: z.number().int().min(1).max(3).optional(), day: z.number().min(0).max(180).optional() }).optional(),
  closeUp: CloseUp.optional(),
  /** Cut the model for this step: axis and position (-1 … 1), or through the middle of a structure. */
  slice: z.object({ axis: SliceAxis, at: z.number().min(-1).max(1).optional(), through: Id.optional() }).optional(),
  colourBy: z.enum(['real', 'region', 'nerve', 'depth', 'fibre']).optional(),
  /** Peel the body: 0 shows every layer, 1 hides the superficial muscles, 2 also the intermediate ones. */
  peel: z.number().int().min(0).max(2).optional(),
  /** The skeleton behind the muscles. */
  bones: z.enum(['off', 'ghost', 'solid']).optional(),
  /** What the camera frames: the focus structures (default), or the mode's whole view. */
  frame: z.enum(['focus', 'mode']).optional(),
  /** Show only the focus structures. */
  isolate: z.boolean().optional(),
  /** Tint the focus structures (default); off for cut views, where the tissue's own colours matter. */
  tint: z.boolean().optional(),
});
export type TourStep = z.infer<typeof TourStep>;

export const LearningObjective = z.object({ id: Id, text: Text(200) });

export const SimulationDefinition = z.object({
  schemaVersion: z.literal(1),
  id: Id,
  title: Text(100),
  domain: z.enum(['biology']),
  simulationType: z.enum(['3d-anatomy']),
  audience: Text(120),
  summary: Text(600),
  learningObjectives: z.array(LearningObjective).min(1).max(16),
  assets: z.array(AssetRef).min(1).max(2),
  layers: z.array(Layer).min(1).max(24),
  structures: z.array(AnatomicalStructure).min(1).max(800),
  cameraPresets: z.array(CameraPreset).min(1).max(12),
  defaultCamera: Id,
  tour: z.array(TourStep).max(40),
  sources: z.array(Source).min(1).max(60),
  disclaimers: z.array(Text(400)).min(1).max(6),
});
export type SimulationDefinition = z.infer<typeof SimulationDefinition>;

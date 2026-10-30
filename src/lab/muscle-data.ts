/**
 * The muscle knowledge base: the table in content/muscle-table.ts parsed into typed records, the
 * nerve groups the model is coloured by, and how a pose or movement turns into the roles muscles play
 * (prime mover, assistant, antagonist).
 */
import { REGION_TABLES } from './content/muscle-table';
import type { Pose } from './joints';

export interface MuscleAction {
  /** Movement id from joints.ts (`elbow-flex`, `neck-rot`, …). */
  movement: string;
  /** +1 takes the slider towards its maximum end, −1 towards its minimum (for the left-hand muscle). */
  sign: 1 | -1;
  prime: boolean;
}

/** The families of nerve the model is coloured by. */
export type Plexus = 'cranial' | 'cervical' | 'brachial' | 'thoracic' | 'lumbar' | 'sacral' | 'spinal' | 'none';
export const PLEXUS: Record<Plexus, { label: string; colour: string; text: string }> = {
  cranial: { label: 'Cranial nerves', colour: '#7c5cc4', text: 'Nerves III, IV, V, VI, VII, X, XI and XII leave the brainstem: the eye, jaw, face, tongue, larynx and neck muscles.' },
  cervical: { label: 'Cervical plexus (C1–C4)', colour: '#2fa4b8', text: 'The loops of the upper four cervical ventral rami: the deep neck muscles, the strap muscles (ansa cervicalis) and the phrenic nerve to the diaphragm.' },
  brachial: { label: 'Brachial plexus (C5–T1)', colour: '#e0803a', text: 'Five ventral rami form trunks, divisions and cords that give the nerves of the shoulder girdle, arm, forearm and hand (axillary, musculocutaneous, radial, median, ulnar).' },
  thoracic: { label: 'Thoracic ventral rami (T1–T12)', colour: '#cdb82f', text: 'The intercostal and subcostal nerves, which also supply the muscles of the abdominal wall.' },
  lumbar: { label: 'Lumbar plexus (L1–L4)', colour: '#49a35f', text: 'The femoral and obturator nerves: the hip flexors, the quadriceps and the adductors.' },
  sacral: { label: 'Sacral plexus (L4–S4)', colour: '#c8443b', text: 'The sciatic nerve (tibial and common fibular parts), the gluteal nerves and the pudendal nerve: the buttock, hamstrings, leg, foot and pelvic floor.' },
  spinal: { label: 'Dorsal rami of the spinal nerves', colour: '#4a73c4', text: 'The dorsal rami supply the deep muscles of the back (the erector spinae and transversospinal muscles) segment by segment.' },
  none: { label: 'No nerve (not a muscle)', colour: '#a8a29e', text: 'Tendons and fibrous structures carry no motor nerve of their own.' },
};

export const REGION_LABEL: Record<string, string> = {
  eye: 'Eye (extraocular)', 'tongue-larynx': 'Tongue, palate and larynx', face: 'Face and jaw', neck: 'Neck', back: 'Back', thorax: 'Chest and ribs', abdomen: 'Abdominal wall',
  'pelvic-floor': 'Pelvic floor', shoulder: 'Shoulder', arm: 'Arm', forearm: 'Forearm', hand: 'Hand', hip: 'Hip and buttock', thigh: 'Thigh', leg: 'Leg', foot: 'Foot',
};

export interface MuscleInfo {
  name: string;
  region: string;
  origin: string;
  insertion: string;
  nerve: string;
  roots: string;
  plexus: Plexus;
  actions: MuscleAction[];
  blood: string;
  /** Typical share of slow-twitch (type I) fibres, 0–100, or null where there is no muscle tissue. */
  slow: number | null;
  note: string;
}

/** The nerve family of a nerve description. */
export function plexusOf(nerve: string, roots: string): Plexus {
  const n = nerve.toLowerCase();
  if (n === '-' || n === '') return 'none';
  if (/dorsal ram|suboccipital/.test(n)) return 'spinal';
  if (/oculomotor|trochlear nerve|abducens|facial|trigeminal|\(v3\)|vagus|hypoglossal|accessory nerve|laryngeal|nerve to mylohyoid|nerve to the (medial|lateral) pterygoid|masseteric|deep temporal|c1 (fibres|via)/.test(n)) return 'cranial';
  if (/ansa cervicalis|phrenic|ventral rami? of c[1-4]|ventral ramus of c1|ventral rami of the cervical/.test(n)) return 'cervical';
  if (/axillary|musculocutaneous|radial|median|ulnar|thoracodorsal|pectoral|suprascapular|subscapular|dorsal scapular|long thoracic|nerve to the subclavius|interosseous|ventral rami of c[5-8]|ventral rami of c3–c8|ventral ramus of c1/.test(n)) return 'brachial';
  if (/intercostal|ventral rami of t[0-9]/.test(n)) return 'thoracic';
  if (/femoral|obturator nerve|ventral rami of l1|ventral rami of t12–l4/.test(n)) return 'lumbar';
  if (/sciatic|gluteal|tibial|fibular|plantar|pudendal|piriformis|nerve to (the )?(obturator internus|quadratus femoris|levator ani)|ventral rami of s/.test(n)) return 'sacral';
  const r = roots.toLowerCase();
  if (/^v|^x|^i|^vi/.test(r) && !/^c|^t|^l|^s/.test(r)) return 'cranial';
  return 'none';
}

/** `elbow-flex+*, forearm-pron-` → actions; `-` → none. */
export function parseActions(text: string): MuscleAction[] {
  if (text.trim() === '-') return [];
  return text.split(',').map((t) => {
    const m = /^\s*([a-z]+(?:-[a-z]+)*)([+-])(\*?)\s*$/.exec(t);
    if (!m) throw new Error(`bad action "${t}"`);
    return { movement: m[1]!, sign: m[2] === '+' ? 1 : -1, prime: m[3] === '*' };
  });
}

function parse(): Map<string, MuscleInfo> {
  const out = new Map<string, MuscleInfo>();
  for (const [region, table] of Object.entries(REGION_TABLES)) {
    for (const line of table.split('\n').map((l) => l.trim()).filter(Boolean)) {
      const f = line.split(' | ');
      if (f.length !== 9) throw new Error(`muscle table: ${f.length} fields in "${line.slice(0, 50)}"`);
      const [name, origin, insertion, nerve, roots, actions, blood, slow, note] = f as [string, string, string, string, string, string, string, string, string];
      out.set(name, {
        name, region, origin, insertion, nerve, roots, plexus: plexusOf(nerve, roots), actions: parseActions(actions), blood,
        slow: slow === '-' ? null : Number(slow), note,
      });
    }
  }
  return out;
}
export const MUSCLES = parse();
export const muscleInfo = (name: string) => MUSCLES.get(name);

// ── Roles in a movement ────────────────────────────────────────────────────

export type Role = 'prime' | 'assist' | 'antagonist';
export const ROLE_TEXT: Record<Role, string> = { prime: 'Prime mover', assist: 'Assists', antagonist: 'Antagonist (lengthens)' };

/** Movements with a side in their key (the limbs); the rest are midline movements of the trunk, neck and jaw. */
const MIRRORED = /^(neck|trunk)-(side|rot)$/;

/**
 * The role each muscle plays for a pose. A pose angle away from the anatomical position (more than 3°)
 * asks for the muscles that move that way: the prime movers and assistants of that direction, and their
 * antagonists. Limb muscles answer only to their own side's keys; for the trunk and neck the side and
 * rotation signs are mirrored for muscles on the right. A muscle's strongest role wins.
 */
export function rolesForPose(pose: Pose, muscles: Iterable<{ id: string; muscle: string; side: 'left' | 'right' | 'midline' }>): Map<string, Role> {
  const rank: Record<Role, number> = { antagonist: 1, assist: 2, prime: 3 };
  const roles = new Map<string, Role>();
  const active = Object.entries(pose).filter(([, v]) => Math.abs(v) >= 3);
  if (!active.length) return roles;
  for (const m of muscles) {
    const info = MUSCLES.get(m.muscle);
    if (!info) continue;
    let best: Role | null = null;
    for (const a of info.actions) {
      const limb = !/^(neck|trunk|jaw)/.test(a.movement);
      const key = limb ? `${a.movement}-${m.side}` : a.movement;
      const angle = pose[key];
      if (angle === undefined || !active.some(([k]) => k === key)) continue;
      const flip = MIRRORED.test(a.movement) && m.side === 'right' ? -1 : 1;
      const same = Math.sign(angle) === a.sign * flip;
      const role: Role = same ? (a.prime ? 'prime' : 'assist') : 'antagonist';
      if (!best || rank[role] > rank[best]) best = role;
    }
    if (best) roles.set(m.id, best);
  }
  return roles;
}

/** The movement's contraction type for a muscle: shortening against the load, lengthening under it, or fixed. */
export type Contraction = 'concentric' | 'eccentric' | 'isometric';
export const contractionOf = (lengthChangePct: number, active: boolean): Contraction => (!active || Math.abs(lengthChangePct) < 0.5 ? 'isometric' : lengthChangePct < 0 ? 'concentric' : 'eccentric');

// ── Words for the actions ──────────────────────────────────────────────────
import { JOINTS, movementById } from './joints';
const clean = (s: string) => s.replace(/\s*\d+\s*(°|%|mm)?$/, '').replace(/\s*\(%\)$/, '');
/** `elbow-flex+*, forearm-pron-` as readable actions: joint, movement and whether it is a prime mover. */
export function describeActions(actions: string, side: 'left' | 'right' | 'midline' = 'left'): { joint: string; movement: string; prime: boolean }[] {
  return parseActions(actions).map((a) => {
    const m = movementById(a.movement);
    const joint = JOINTS.find((j) => j.movements.some((x) => x.id === a.movement));
    if (!m || !joint) return { joint: a.movement, movement: a.sign > 0 ? 'positive' : 'negative', prime: a.prime };
    const flip = MIRRORED.test(a.movement) && side === 'right' ? -1 : 1;
    const name = a.movement === 'grip' ? (a.sign > 0 ? 'flexion of the fingers' : 'extension of the fingers') : clean(a.sign * flip > 0 ? m.maxName : m.minName);
    return { joint: joint.name.replace(/\s*\(.*\)$/, ''), movement: name, prime: a.prime };
  });
}

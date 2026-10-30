/**
 * The muscular lab's layers and structures, built from the structure list the extractor used
 * (src/lab/source/muscles.source.json: one entry per BodyParts3D part or modelled muscle) and the
 * knowledge table (muscle-table.ts). A muscle in several parts (the heads of biceps, the parts of
 * deltoid) becomes a group of its parts; functional groups (hamstrings, rotator cuff, …) collect muscles
 * that work together.
 */
import spec from '../source/muscles.source.json';
import type { AnatomicalStructure, Layer } from '../../contract/schema';
import { MUSCLES, PLEXUS, REGION_LABEL } from '../muscle-data';
import modelled from '../generated/muscles.json';

interface Src { id: string; muscle: string; muscleName: string; part: string | null; layer: string; side: 'left' | 'right' | 'midline'; bp3d?: string[]; generated?: string }
const SOURCE = spec.structures as unknown as Src[];
const NOTES = ((modelled.structures as unknown as Record<string, unknown>).$modelled ?? {}) as Record<string, string>;

export const LAYERS: Layer[] = [
  { id: 'face', label: 'Face and jaw', description: 'The muscles of mastication and of facial expression.', visibleByDefault: true },
  { id: 'eye', label: 'Eye (extraocular)', description: 'The six muscles that move each eyeball and the levator of the upper lid.', visibleByDefault: true },
  { id: 'tongue-larynx', label: 'Tongue, palate and larynx', description: 'The muscles of the tongue, soft palate and larynx.', visibleByDefault: true },
  { id: 'neck', label: 'Neck', description: 'The sternocleidomastoid, scalenes, the hyoid muscles (suprahyoid and infrahyoid) and the deep neck flexors.', visibleByDefault: true },
  { id: 'back', label: 'Back', description: 'The trapezius, latissimus dorsi, rhomboids, the erector spinae and the deep muscles of the spine.', visibleByDefault: true },
  { id: 'thorax', label: 'Chest and ribs', description: 'The pectorals, serratus anterior, the intercostals and the diaphragm.', visibleByDefault: true },
  { id: 'abdomen', label: 'Abdominal wall', description: 'The rectus abdominis and the three flat muscles of the abdominal wall.', visibleByDefault: true },
  { id: 'pelvic-floor', label: 'Pelvic floor', description: 'The levator ani, coccygeus and the perineal muscles.', visibleByDefault: true },
  { id: 'shoulder', label: 'Shoulder', description: 'The deltoid, the rotator cuff, teres major and coracobrachialis.', visibleByDefault: true },
  { id: 'arm', label: 'Arm', description: 'Biceps brachii, brachialis, triceps and anconeus.', visibleByDefault: true },
  { id: 'forearm', label: 'Forearm', description: 'The flexors, extensors, pronators and supinator.', visibleByDefault: true },
  { id: 'hand', label: 'Hand', description: 'The thenar, hypothenar, lumbrical and interosseous muscles.', visibleByDefault: true },
  { id: 'hip', label: 'Hip and buttock', description: 'The gluteals, the lateral rotators, iliacus, psoas and the tensor fasciae latae.', visibleByDefault: true },
  { id: 'thigh', label: 'Thigh', description: 'The quadriceps, hamstrings, adductors, sartorius and the iliotibial tract.', visibleByDefault: true },
  { id: 'leg', label: 'Leg', description: 'The calf muscles, the muscles of the front of the leg and the fibulares.', visibleByDefault: true },
  { id: 'foot', label: 'Foot', description: 'The intrinsic muscles of the sole and the back of the foot.', visibleByDefault: true },
];

const SOURCES_MUSCLE = ['openstax-muscle', 'grays', 'bp3d', 'kendall'];
const SOURCES_MODELLED = ['openstax-muscle', 'grays', 'kendall'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).replace(/[ ,;]+\S*$/, '')}…`);
const sided = (side: string) => (side === 'midline' ? '' : ` (${side})`);

/** Everyday and Latin names people search by. */
const ALIASES: Record<string, string[]> = {
  'biceps brachii': ['biceps', 'bicep', 'guns'], 'triceps brachii': ['triceps', 'tricep'], deltoid: ['delts', 'shoulder muscle'], 'pectoralis major': ['pecs', 'pectorals', 'chest'],
  'latissimus dorsi': ['lats', 'lat'], trapezius: ['traps', 'trap'], 'rectus abdominis': ['abs', 'six pack', 'sixpack', 'abdominals'], 'external oblique': ['obliques', 'oblique'],
  'gluteus maximus': ['butt', 'bum'], 'gluteus medius': [], 'rectus femoris': [], 'vastus lateralis': [], 'vastus medialis': ['teardrop'],
  'vastus intermedius': [], 'biceps femoris': [], semitendinosus: [], semimembranosus: [],
  gastrocnemius: [], soleus: [], 'calcaneal tendon': ['achilles', 'achilles tendon', 'heel cord'], 'tibialis anterior': ['shin muscle', 'shin'],
  sternocleidomastoid: ['scm', 'neck muscle'], masseter: ['jaw muscle', 'chewing muscle'], temporalis: ['temple muscle'], diaphragm: ['breathing muscle', 'phrenic'], 'quadratus lumborum': ['ql'],
  'iliacus': [], 'psoas major': ['psoas'], 'tensor fasciae latae': ['tfl'], 'iliotibial tract': ['it band', 'itb', 'iliotibial band'],
  supraspinatus: [], infraspinatus: [], 'teres minor': [], subscapularis: [],
  'orbicularis oculi': ['eyelid muscle', 'blink'], 'zygomaticus major': ['smile muscle', 'smiling'], 'orbicularis oris': ['kissing muscle', 'lip muscle'], platysma: ['neck skin muscle'],
 'longissimus thoracis': ['back muscle'], 'iliocostalis lumborum': [], 'spinalis thoracis': [],
  'flexor carpi radialis': ['wrist flexor'], 'extensor carpi radialis brevis': ['wrist extensor', 'tennis elbow'], 'palmaris longus': ['palmaris'], 'external anal sphincter': ['anal sphincter'],
  'linea alba': ['white line'], 'levator ani': ['pelvic floor', 'kegel'], 'serratus anterior': ['boxer muscle', 'serratus'], 'rhomboid major': [], 'rhomboid minor': [],
};

function structureOf(s: Src): AnatomicalStructure {
  const info = MUSCLES.get(s.muscleName);
  if (!info) throw new Error(`no knowledge-table entry for "${s.muscleName}"`);
  const label = `${cap(s.muscleName)}${s.part ? `, ${s.part}` : ''}${sided(s.side)}`;
  const isTendon = info.slow === null;
  const origin = info.origin, insertion = info.insertion;
  const summary = isTendon
    ? clip(`${cap(s.part === 'tendon' ? `The tendon of ${s.muscleName}` : cap(s.muscleName))}: ${info.note.split('. ')[0]!.replace(/\.$/, '')}.`, 400)
    : clip(`${cap(origin)} to ${lowerFirst(insertion)}.`, 400);
  const out: AnatomicalStructure = {
    id: s.id, label, synonyms: [...new Set([s.muscleName, ...(ALIASES[s.muscleName] ?? [])])].filter((x) => x !== label.toLowerCase()).slice(0, 14),
    layer: s.layer, kind: 'mesh', side: s.side, summary, function: clip(info.note, 900), related: [], sources: s.generated ? SOURCES_MODELLED : SOURCES_MUSCLE,
    muscle: {
      name: s.muscleName, region: REGION_LABEL[s.layer] ?? s.layer, origin, insertion, nerve: info.nerve, roots: info.roots, plexus: info.plexus,
      actions: info.actions.map((a) => `${a.movement}${a.sign > 0 ? '+' : '-'}${a.prime ? '*' : ''}`).join(', ') || '-', blood: info.blood, slow: info.slow ?? undefined,
    },
  };
  if (s.generated) out.modelNote = clip(NOTES[s.generated] ?? 'Modelled in code between its real attachments: BodyParts3D 4.0 does not include this muscle.', 500);
  return out;
}

const meshes = SOURCE.map(structureOf);

/** Heads and parts of one muscle become a group; each part names it as its organ. */
const byMuscle = new Map<string, Src[]>();
for (const s of SOURCE) byMuscle.set(s.muscle, [...(byMuscle.get(s.muscle) ?? []), s]);
const partGroups: AnatomicalStructure[] = [];
const meshIds = new Set(SOURCE.map((s) => s.id));
for (const [muscleKey, parts] of byMuscle) {
  if (parts.length < 2 && parts[0]!.muscle === parts[0]!.id) continue;
  // A muscle and its own part (superior oblique and its trochlea) would share an id: the group takes a suffix.
  const id = meshIds.has(muscleKey) ? `${muscleKey}-with-parts` : muscleKey;
  const first = parts[0]!;
  const info = MUSCLES.get(first.muscleName)!;
  partGroups.push({
    id, label: `${cap(first.muscleName)}${sided(first.side)}`, synonyms: [...(ALIASES[first.muscleName] ?? [])].slice(0, 14), layer: first.layer, kind: 'group', members: parts.map((p) => p.id), side: first.side,
    summary: clip(`${cap(info.origin)} to ${lowerFirst(info.insertion)}.`, 400), function: clip(info.note, 900), related: [], sources: SOURCES_MUSCLE,
    muscle: { name: first.muscleName, region: REGION_LABEL[first.layer] ?? first.layer, origin: info.origin, insertion: info.insertion, nerve: info.nerve, roots: info.roots, plexus: info.plexus,
      actions: info.actions.map((a) => `${a.movement}${a.sign > 0 ? '+' : '-'}${a.prime ? '*' : ''}`).join(', ') || '-', blood: info.blood, slow: info.slow ?? undefined },
  });
  for (const p of parts) meshes.find((m) => m.id === p.id)!.organ = id;
}

// ── Functional groups ──────────────────────────────────────────────────────
interface FG { id: string; label: string; layer: string; names: string[]; summary: string; function: string; synonyms?: string[]; midline?: boolean }
const FUNCTIONAL: FG[] = [
  { id: 'quadriceps', label: 'Quadriceps femoris', layer: 'thigh', names: ['rectus femoris', 'vastus lateralis', 'vastus medialis', 'vastus intermedius'], synonyms: ['quads', 'quadriceps'], summary: 'The four muscles on the front of the thigh that share one tendon to the tibial tuberosity.', function: 'The only extensors of the knee; rectus femoris also flexes the hip. All four are supplied by the femoral nerve (L2–L4). Walking downstairs and sitting down are eccentric quadriceps work.' },
  { id: 'hamstrings', label: 'Hamstrings', layer: 'thigh', names: ['biceps femoris', 'semitendinosus', 'semimembranosus'], synonyms: ['hamstring', 'hammy'], summary: 'The muscles on the back of the thigh from the ischial tuberosity to the leg bones.', function: 'They extend the hip and flex the knee, and the tibial part of the sciatic nerve supplies them. They brake the swing of the leg in sprinting, which is why they tear there.' },
  { id: 'adductors', label: 'Adductors of the thigh', layer: 'thigh', names: ['adductor longus', 'adductor brevis', 'adductor magnus', 'adductor minimus', 'gracilis', 'pectineus'], summary: 'The muscles of the medial thigh.', function: 'They draw the thigh towards the midline and help flex or extend it; the obturator nerve (L2–L4) supplies most. Groin strain is usually the adductor longus.' },
  { id: 'gluteals', label: 'Gluteal muscles', layer: 'hip', names: ['gluteus maximus', 'gluteus medius', 'gluteus minimus', 'tensor fasciae latae'], synonyms: ['glutes'], summary: 'The muscles of the buttock.', function: 'Maximus extends the hip; medius and minimus abduct it and level the pelvis in walking; tensor fasciae latae tenses the iliotibial tract.' },
  { id: 'lateral-rotators', label: 'Lateral rotators of the hip', layer: 'hip', names: ['piriformis', 'obturator internus', 'obturator externus', 'gemellus superior', 'gemellus inferior', 'quadratus femoris'], summary: 'The deep muscles behind the hip joint.', function: 'They turn the thigh outwards and hold the femoral head in the acetabulum; the sciatic nerve passes behind them.' },
  { id: 'iliopsoas', label: 'Iliopsoas', layer: 'hip', names: ['iliacus', 'psoas major'], synonyms: ['hip flexors', 'hip flexor'], summary: 'Iliacus and psoas major, joined at the lesser trochanter.', function: 'The strongest hip flexors; psoas also flexes the lumbar spine.' },
  { id: 'triceps-surae', label: 'Triceps surae (calf)', layer: 'leg', names: ['gastrocnemius', 'soleus', 'calcaneal tendon'], synonyms: ['calf', 'calf muscles'], summary: 'Gastrocnemius and soleus, which share the calcaneal tendon.', function: 'They plantarflex the ankle: gastrocnemius for fast push-off, soleus for standing and walking; their pump returns blood from the leg.' },
  { id: 'leg-extensors', label: 'Anterior compartment of the leg', layer: 'leg', names: ['tibialis anterior', 'extensor digitorum longus', 'extensor hallucis longus', 'fibularis tertius'], summary: 'The dorsiflexors of the ankle and extensors of the toes.', function: 'The deep fibular nerve (L4–S1) supplies them; they lift the foot in the swing phase and lower it at heel strike. Their weakness gives foot drop.' },
  { id: 'fibulares', label: 'Lateral compartment (fibulares)', layer: 'leg', names: ['fibularis longus', 'fibularis brevis'], summary: 'The evertors of the foot.', function: 'Supplied by the superficial fibular nerve; they steady the ankle against inversion sprains.' },
  { id: 'rotator-cuff', label: 'Rotator cuff', layer: 'shoulder', names: ['supraspinatus', 'infraspinatus', 'teres minor', 'subscapularis'], synonyms: ['cuff', 'SITS'], summary: 'Supraspinatus, infraspinatus, teres minor and subscapularis (SITS).', function: 'Their tendons blend with the shoulder capsule and hold the humeral head in the shallow glenoid while the deltoid and others move the arm.' },
  { id: 'erector-spinae', label: 'Erector spinae', layer: 'back', names: ['iliocostalis cervicis', 'iliocostalis thoracis', 'iliocostalis lumborum', 'longissimus capitis', 'longissimus cervicis', 'longissimus thoracis', 'spinalis', 'spinalis thoracis'], synonyms: ['spinal erectors', 'sacrospinalis'], summary: 'Three columns (iliocostalis, longissimus, spinalis) on either side of the spine.', function: 'They extend and side-bend the spine and keep the trunk upright; the dorsal rami of the spinal nerves supply them. Long hours of sitting and lifting overload them.' },
  { id: 'transversospinal', label: 'Transversospinal muscles', layer: 'back', names: ['semispinalis capitis', 'semispinalis cervicis', 'semispinalis thoracis', 'cervical rotator', 'thoracic rotator', 'lumbar rotator'], summary: 'The oblique deep muscles between the transverse and spinous processes.', function: 'They rotate and extend the spine and are rich in muscle spindles, so they act as position sensors.' },
  { id: 'scapular-muscles', label: 'Muscles of the scapula', layer: 'back', names: ['trapezius', 'rhomboid major', 'rhomboid minor', 'levator scapulae', 'serratus anterior'], summary: 'The muscles that position the scapula on the chest wall.', function: 'They retract, elevate and rotate the scapula and fix it as a base for the arm; the serratus anterior and trapezius together rotate it upwards.' },
  { id: 'suboccipital', label: 'Suboccipital muscles', layer: 'back', names: ['obliquus capitis inferior', 'obliquus capitis superior', 'rectus capitis posterior major', 'rectus capitis posterior minor'], summary: 'Four small muscles between the skull, the atlas and the axis.', function: 'They make the fine movements of nodding and turning the head; the suboccipital nerve (dorsal ramus of C1) supplies them and the vertebral artery runs over the atlas through their triangle.' },
  { id: 'intercostals', label: 'Intercostal muscles', layer: 'thorax', names: ['external intercostal', 'internal intercostal', 'innermost intercostal'], summary: 'Three layers between the ribs.', function: 'They keep the intercostal spaces rigid and move the ribs in breathing: the externals raise them in inspiration, the internals lower them in forced expiration.' },
  { id: 'abdominal-wall', label: 'Muscles of the abdominal wall', layer: 'abdomen', names: ['rectus abdominis', 'external oblique', 'internal oblique', 'transversus abdominis'], summary: 'The rectus abdominis and the three flat muscles.', function: 'They flex and rotate the trunk, compress the abdomen (breathing out, defecation, childbirth) and brace the spine.' },
  { id: 'scalenes', label: 'Scalene muscles', layer: 'neck', names: ['scalenus anterior', 'scalenus medius', 'scalenus posterior'], summary: 'Three muscles from the cervical spine to the first two ribs.', function: 'They bend the neck and raise the upper ribs in inspiration; the brachial plexus and subclavian artery pass between the anterior and middle scalene.' },
  { id: 'suprahyoid', label: 'Suprahyoid muscles', layer: 'neck', names: ['digastric', 'mylohyoid', 'geniohyoid', 'stylohyoid', 'intermediate tendon'], summary: 'The muscles from the skull and jaw to the hyoid bone.', function: 'They raise the hyoid in swallowing and help open the jaw.' },
  { id: 'infrahyoid', label: 'Infrahyoid (strap) muscles', layer: 'neck', names: ['sternohyoid', 'sternothyroid', 'thyrohyoid', 'omohyoid'], summary: 'The strap muscles below the hyoid bone.', function: 'They depress the hyoid and larynx after swallowing; the ansa cervicalis (C1–C3) supplies them.' },
  { id: 'mastication', label: 'Muscles of mastication', layer: 'face', names: ['masseter', 'temporalis', 'medial pterygoid', 'lateral pterygoid'], summary: 'Four pairs of muscles that move the mandible.', function: 'All are supplied by the mandibular nerve (V3) from the first pharyngeal arch; three close the jaw and the lateral pterygoid opens it.' },
  { id: 'facial-expression', label: 'Muscles of facial expression', layer: 'face', names: ['occipitofrontalis', 'orbicularis oculi', 'orbicularis oris', 'zygomaticus major', 'buccinator', 'platysma'], synonyms: ['mimetic muscles'], summary: 'Flat muscles in the skin of the face and scalp.', function: 'The facial nerve (VII) from the second pharyngeal arch supplies them; unlike most muscles they insert into skin. Facial palsy flattens one side of the face.' },
  { id: 'extraocular', label: 'Extraocular muscles', layer: 'eye', names: ['superior rectus', 'inferior rectus', 'medial rectus', 'lateral rectus', 'superior oblique', 'inferior oblique'], synonyms: ['eye movers', 'LR6 SO4'], summary: 'The six muscles that turn the eyeball.', function: 'Three cranial nerves: the abducens (VI) supplies the lateral rectus, the trochlear (IV) the superior oblique and the oculomotor (III) the rest (LR6 SO4 AO3).' },
  { id: 'flexors-forearm', label: 'Flexors of the forearm', layer: 'forearm', names: ['pronator teres', 'flexor carpi radialis', 'palmaris longus', 'flexor carpi ulnaris', 'flexor digitorum superficialis', 'flexor digitorum profundus', 'flexor pollicis longus', 'pronator quadratus'], summary: 'The anterior compartment of the forearm.', function: 'They flex the wrist and fingers and pronate the forearm; the median nerve supplies all but the flexor carpi ulnaris and the ulnar half of the profundus.' },
  { id: 'extensors-forearm', label: 'Extensors of the forearm', layer: 'forearm', names: ['brachioradialis', 'extensor carpi radialis longus', 'extensor carpi radialis brevis', 'extensor digitorum', 'extensor digiti minimi', 'extensor carpi ulnaris', 'supinator', 'abductor pollicis longus', 'extensor pollicis longus', 'extensor indicis'], summary: 'The posterior compartment of the forearm.', function: 'They extend the wrist and fingers and supinate the forearm; the radial nerve supplies them.' },
  { id: 'thenar', label: 'Thenar muscles', layer: 'hand', names: ['abductor pollicis brevis', 'flexor pollicis brevis', 'opponens pollicis'], synonyms: ['thumb muscles', 'ball of the thumb'], summary: 'The muscles of the ball of the thumb.', function: 'They abduct, flex and oppose the thumb; the recurrent branch of the median nerve supplies them, so carpal tunnel syndrome wastes them.' },
  { id: 'hypothenar', label: 'Hypothenar muscles', layer: 'hand', names: ['abductor digiti minimi of hand', 'flexor digiti minimi brevis of hand', 'opponens digiti minimi of hand'], summary: 'The muscles of the ball of the little finger.', function: 'They abduct, flex and oppose the little finger; the deep branch of the ulnar nerve supplies them.' },
  { id: 'pelvic-floor-muscles', label: 'Muscles of the pelvic floor', layer: 'pelvic-floor', names: ['levator ani', 'coccygeus', 'superficial perineal', 'external anal sphincter'], summary: 'The muscular sling that closes the pelvic outlet.', function: 'They support the pelvic organs, keep continence and stretch in childbirth; the pudendal nerve and the sacral roots S2–S4 supply them.' },
  { id: 'larynx', label: 'Intrinsic muscles of the larynx', layer: 'tongue-larynx', names: ['aryepiglotticus', 'lateral crico-arytenoid', 'oblique arytenoid', 'transverse arytenoid', 'cricothyroid', 'posterior crico-arytenoid', 'thyro-arytenoid', 'vocalis'], summary: 'The small muscles that move the laryngeal cartilages.', function: 'They open, close and tension the vocal folds; all but the cricothyroid are supplied by the recurrent laryngeal nerve, which hooks round the aortic arch on the left and the subclavian artery on the right.' },
];

const functionalGroups: AnatomicalStructure[] = [];
const byName = new Map<string, Src[]>();
for (const s of SOURCE) byName.set(s.muscleName, [...(byName.get(s.muscleName) ?? []), s]);
for (const fg of FUNCTIONAL) {
  const bySide = new Map<string, string[]>();
  for (const n of fg.names) for (const s of byName.get(n) ?? []) bySide.set(s.side, [...(bySide.get(s.side) ?? []), s.id]);
  for (const [side, members] of bySide) {
    if (side === 'midline' && bySide.size > 1) {
      // Midline structures (orbicularis oris) join both sides' groups.
      continue;
    }
    const all = side === 'midline' ? members : [...members, ...(bySide.get('midline') ?? [])];
    if (all.length > 64) throw new Error(`group ${fg.id} has ${all.length} members`);
    functionalGroups.push({
      id: side === 'midline' ? fg.id : `${fg.id}-${side}`, label: `${fg.label}${sided(side)}`, synonyms: fg.synonyms ?? [], layer: fg.layer, kind: 'group', members: all, side: side as 'left' | 'right' | 'midline',
      summary: fg.summary, function: fg.function, related: [], sources: SOURCES_MUSCLE,
    });
  }
}

export const STRUCTURES: AnatomicalStructure[] = [...meshes, ...partGroups, ...functionalGroups];
export const NERVE_KEY = Object.entries(PLEXUS).map(([id, p]) => ({ id, ...p }));

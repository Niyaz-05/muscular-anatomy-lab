#!/usr/bin/env node
/**
 * Writes src/lab/source/muscles.source.json: every BodyParts3D muscle part, named, sided and grouped
 * into its muscle by the rules below, with its region layer. Parts of one muscle ("Long head of
 * biceps brachii", "Clavicular part of deltoid") become separate structures grouped under the muscle.
 * The heart's papillary muscles are left out (cardiac muscle). Muscles that BodyParts3D 4.0 lacks
 * (latissimus dorsi, the abdominal wall but the external oblique, quadratus lumborum, the muscles of
 * mastication but the suprahyoids, and the facial muscles but the platysma) are modelled in
 * tools/extract-muscles.mjs and listed here as `generated`.
 *
 *   node tools/make-muscles.mjs <human-atlas public/models dir>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [humanDir] = process.argv.slice(2);
if (!humanDir) { console.error('Usage: node tools/make-muscles.mjs <human-atlas public/models dir>'); process.exit(2); }
const atlas = JSON.parse(fs.readFileSync(path.join(humanDir, 'atlas.json'), 'utf8'));
const kebab = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const keep = (p) => (p.system === 'muscular' && !/papillary/i.test(p.name))
  || (p.system === 'skeletal' && /fibularis|tibialis|subscapularis|levator scapulae|iliotibial|tensor fasciae/i.test(p.name))
  || (p.system === 'connective' && /tensor fasciae|calcaneal tendon|linea alba|tendinous arch of levator ani|trochlea of|intermediate tendon/i.test(p.name));

/** Region layer by the muscle's name. */
const REGIONS = [
  ['eye', /rectus$|superior oblique|inferior oblique|levator palpebrae|trochlea/],
  ['tongue-larynx', /glossus|veli palatini|uvular|arytenoid|aryepiglott|vocalis|cricothyroid|crico-arytenoid/],
  ['neck', /sternocleidomastoid|scalenus|hyoid|thyroid|digastric|mylohyoid|geniohyoid|longus colli|longus capitis|rectus capitis anterior|rectus capitis lateralis|platysma|intermediate tendon|anterior cervical intertransversarii/],
  ['back', /trapezius|rhomboid|levator scapulae|serratus posterior|iliocostalis|longissimus|spinalis|semispinalis|rotator|multifidus|splenius|obliquus capitis|rectus capitis posterior|interspinal|intertransvers|levatores costarum/],
  ['thorax', /pectoralis|serratus anterior|subclavius|intercostal|transversus thoracis|diaphragm/],
  ['abdomen', /external oblique|linea alba/],
  ['pelvic-floor', /coccygeus|iliococcygeus|pubococcygeus|puborectalis|anal sphincter|perineal|levator ani/],
  ['shoulder', /deltoid|supraspinatus|infraspinatus|teres major|teres minor|subscapularis|coracobrachialis/],
  ['arm', /biceps brachii|brachialis$|triceps|anconeus/],
  ['hand', /of hand|pollicis brevis|opponens pollicis|adductor pollicis|lumbricals of hand|interossei of hand|palmar interossei|dorsal interossei of hand/],
  ['forearm', /carpi|pronator|supinator|brachioradialis|palmaris|digitorum superficialis|digitorum profundus|pollicis longus|extensor digitorum$|digiti minimi$|extensor indicis|abductor pollicis longus|extensor pollicis/],
  ['foot', /of foot|hallucis brevis|abductor hallucis|adductor hallucis|digitorum brevis|flexor accessorius|extensor hallucis brevis/],
  ['hip', /gluteus|piriformis|obturator|gemellus|quadratus femoris|iliacus|psoas|tensor fasciae/],
  ['thigh', /vastus|rectus femoris|biceps femoris|semitendinosus|semimembranosus|adductor (longus|brevis|magnus|minimus)|gracilis|sartorius|pectineus|iliotibial/],
  ['leg', /tibialis|fibularis|extensor digitorum longus|extensor hallucis longus|gastrocnemius|soleus|plantaris|popliteus|flexor digitorum longus|flexor hallucis longus|calcaneal tendon/],
];
const regionOf = (muscle) => { for (const [r, re] of REGIONS) if (re.test(muscle)) return r; throw new Error(`no region for "${muscle}"`); };

/** Split a part name into its muscle and the part ("Long head of biceps brachii" → biceps brachii, long head). */
function parse(name) {
  let side = null;
  let n = name.replace(/\b(left|right)\b/i, (m) => { side = m.toLowerCase(); return ''; }).replace(/\s+/g, ' ').trim();
  n = n.replace(/^set of /i, '').replace(/ muscle$/i, '');
  if (/^tendon of /i.test(n)) return { side, muscle: n.replace(/^tendon of /i, ''), part: 'tendon' };
  if (/^trochlea of /i.test(n)) return { side, muscle: n.replace(/^trochlea of /i, ''), part: 'trochlea' };
  if (/^tendinous arch of /i.test(n)) return { side, muscle: 'levator ani', part: 'tendinous arch' };
  if (/^(iliococcygeus|pubococcygeus|puborectalis)$/i.test(n)) return { side, muscle: 'levator ani', part: n.toLowerCase() };
  const m = /^(.+?) (head|part) of (.+)$/i.exec(n);
  if (m) return { side, muscle: m[3], part: `${m[1]} ${m[2]}`.toLowerCase() };
  return { side, muscle: n, part: null };
}

const parts = new Map();
const seen = new Set();
for (const p of atlas.parts.filter(keep)) {
  const key = `${p.name.toLowerCase()}|${p.vertexCount}|${p.bounds.flat().map((x) => x.toFixed(4)).join(',')}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const { side: named, muscle, part } = parse(p.name);
  const cx = (p.bounds[0][0] + p.bounds[1][0]) / 2;
  const byCentroid = Math.abs(cx) < 0.012 ? 'midline' : cx > 0 ? 'left' : 'right';
  // BodyParts3D mislabels the sides of a few parts (its left flexor pollicis brevis lies on the right): trust the position when it is clear.
  const side = named && !(Math.abs(cx) > 0.02 && byCentroid !== named) ? named : byCentroid;
  const mid = kebab(muscle);
  const id = `${mid}${part ? `-${kebab(part)}` : ''}${side === 'midline' ? '' : `-${side}`}`;
  const prev = parts.get(id);
  if (prev) { prev.bp3d.push(p.id); continue; }
  parts.set(id, { id, muscle: `${mid}${side === 'midline' ? '' : `-${side}`}`, muscleName: muscle.toLowerCase(), part, layer: regionOf(muscle.toLowerCase()), side, ...(side === 'midline' ? { sideCheck: false } : {}), bp3d: [p.id] });
}

// BodyParts3D is not always symmetric: a muscle split into parts on one side only (longus colli) is merged into
// one mesh on both sides, and a muscle present on one side only (the digastric's intermediate tendon) is left out,
// so every left structure has its right partner.
const sidedByName = new Map();
for (const st of parts.values()) if (st.side !== 'midline') {
  const e = sidedByName.get(st.muscleName) ?? { left: [], right: [] };
  e[st.side].push(st); sidedByName.set(st.muscleName, e);
}
const asymmetric = [];
for (const [name, { left, right }] of sidedByName) {
  const key = (list) => list.map((x) => x.part ?? '').sort().join('|');
  if (!left.length || !right.length) { for (const st of [...left, ...right]) { parts.delete(st.id); asymmetric.push(`${st.id} (dropped: no partner)`); } continue; }
  if (key(left) === key(right)) continue;
  for (const [side, list] of [['left', left], ['right', right]]) {
    const id = `${kebab(name)}-${side}`;
    const merged = { ...list[0], id, muscle: id, part: null, bp3d: list.flatMap((x) => x.bp3d) };
    for (const st of list) parts.delete(st.id);
    parts.set(id, merged);
    asymmetric.push(`${id} (merged ${list.length} parts)`);
  }
}
if (asymmetric.length) console.log('Source asymmetries handled:', asymmetric.join('; '));

// Muscles BodyParts3D 4.0 does not have: modelled between their real attachments.
const GEN = [
  ['latissimus dorsi', 'back'], ['quadratus lumborum', 'back'],
  ['rectus abdominis', 'abdomen'], ['internal oblique', 'abdomen'], ['transversus abdominis', 'abdomen'],
  ['masseter', 'face'], ['temporalis', 'face'], ['medial pterygoid', 'face'], ['lateral pterygoid', 'face'],
  ['occipitofrontalis', 'face'], ['orbicularis oculi', 'face'], ['orbicularis oris', 'face'], ['zygomaticus major', 'face'], ['buccinator', 'face'],
];
for (const [name, layer] of GEN) for (const side of ['left', 'right']) {
  if (name === 'orbicularis oris' && side === 'right') continue;
  const sided = name !== 'orbicularis oris';
  const id = `${kebab(name)}${sided ? `-${side}` : ''}`;
  parts.set(id, { id, muscle: id, muscleName: name, part: null, layer, side: sided ? side : 'midline', ...(sided ? {} : { sideCheck: false }), generated: kebab(name) });
}

const list = [...parts.values()];
// A muscle split into parts gets a group; a muscle of one part is its own structure.
const groups = new Map();
for (const s of list) groups.set(s.muscle, [...(groups.get(s.muscle) ?? []), s.id]);
for (const s of list) if (groups.get(s.muscle).length === 1 && s.part === null) s.muscle = s.id;
const out = { note: 'Generated by tools/make-muscles.mjs. bp3d: BodyParts3D part ids; generated: modelled in tools/extract-muscles.mjs.', structures: list };
fs.writeFileSync(path.join(root, 'src/lab/source/muscles.source.json'), JSON.stringify(out, null, 1) + '\n');
const byLayer = {};
for (const s of list) byLayer[s.layer] = (byLayer[s.layer] ?? 0) + 1;
console.log(`${list.length} muscle structures in ${[...groups.keys()].length} muscles`, byLayer);

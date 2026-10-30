/**
 * Exercise physiology: which energy system powers an effort, how long it can last, which motor units
 * it needs, how muscle adapts to training, and delayed-onset muscle soreness. Teaching models with
 * textbook shapes and typical numbers (people vary widely).
 *
 * Power is in units of the aerobic power at VO₂max, so 1.0 is exactly the highest rate oxygen can
 * supply and a sprint is about 4 (the anaerobic systems supply the rest).
 */

export interface Activity { id: string; label: string; demand: number; minutes: number; text: string }
export const ACTIVITIES: Activity[] = [
  { id: 'lift', label: 'Heavy lift (1 rep)', demand: 4.5, minutes: 0.1, text: 'Maximal effort for a few seconds: ATP and phosphocreatine, with almost no oxygen needed, and nearly every motor unit.' },
  { id: 'sprint', label: '100 m sprint', demand: 4, minutes: 0.18, text: 'About 10 s: phosphocreatine and fast glycolysis supply most of the energy; the oxygen system has hardly started.' },
  { id: '400', label: '400 m run', demand: 2.1, minutes: 0.8, text: 'About 50 s: glycolysis dominates and lactate and hydrogen ions build up, which is why the last 100 m hurts.' },
  { id: '1500', label: '1500 m run', demand: 1.2, minutes: 3.8, text: 'About 4 min above VO₂max demand: the oxidative system supplies most energy, glycolysis the rest.' },
  { id: '10k', label: '10 km run', demand: 0.84, minutes: 38, text: 'About critical power for a trained runner: oxidative metabolism dominates, with a slow drift upwards in effort; an untrained runner could hold this pace for only a few minutes.' },
  { id: 'marathon', label: 'Marathon', demand: 0.75, minutes: 180, text: 'Oxidative metabolism using fat and carbohydrate; glycogen runs low after about 90–120 min (the wall).' },
  { id: 'walk', label: 'Walking', demand: 0.3, minutes: 60, text: 'Slow-twitch fibres and fat oxidation, sustained for hours.' },
];
export const activityById = (id: string) => ACTIVITIES.find((a) => a.id === id);

export type Training = 'untrained' | 'trained';
/** Critical power (fraction of VO₂max power) and the anaerobic work capacity W′ (VO₂max-minutes). */
const CP: Record<Training, number> = { untrained: 0.7, trained: 0.82 };
const WPRIME: Record<Training, number> = { untrained: 1.1, trained: 1.5 };
const OX_TAU_S: Record<Training, number> = { untrained: 40, trained: 22 };
/** Phosphocreatine and glycolytic stores (VO₂max-minutes) and their top rates; together they are W′. */
const PCR = { store: 0.22, rate: 3.2 };
const GLY = { rate: 2.3 };

export interface EnergyResult {
  /** Seconds, and the share of the demand each system supplies (fractions of the demand). */
  t: number[];
  pcr: number[];
  glycolysis: number[];
  oxidative: number[];
  /** Fraction of the demand actually delivered (falls once the anaerobic stores are empty). */
  delivered: number[];
  /** Seconds until the effort cannot be held, or null if it can be held for the whole duration. */
  exhaustedAtS: number | null;
}
/**
 * Energy from the three systems over an effort of constant demand. The oxidative system rises with a
 * time constant (the oxygen deficit); what it cannot supply comes first from phosphocreatine, then from
 * glycolysis; when both stores are empty the delivered power falls to what oxygen can give.
 */
export function energyDuring(demand: number, minutes: number, training: Training = 'untrained', points = 120): EnergyResult {
  const total = minutes * 60;
  const dt = Math.max(0.25, total / 2400);
  const wPrime = WPRIME[training];
  const gStore = wPrime - PCR.store;
  let pStore = PCR.store, gLeft = gStore, ox = 0.12;
  const sample = Math.max(1, Math.round(2400 / points));
  const r: EnergyResult = { t: [], pcr: [], glycolysis: [], oxidative: [], delivered: [], exhaustedAtS: null };
  const oxCeiling = Math.min(demand, 1);
  const tau = OX_TAU_S[training];
  const cp = CP[training];
  for (let i = 0, time = 0; time <= total + 1e-9; i++, time += dt) {
    ox += ((oxCeiling - ox) * dt) / tau;
    const rest = Math.max(0, demand - ox);
    const fromP = Math.min(rest, PCR.rate, pStore / (dt / 60));
    pStore -= fromP * (dt / 60);
    const fromG = Math.min(rest - fromP, GLY.rate, gLeft / (dt / 60));
    // Below critical power the glycolytic share is small and slowly replenished by lactate use.
    gLeft = Math.max(0, gLeft - fromG * (dt / 60)) + (demand < cp ? 0.1 * (dt / 60) : 0);
    gLeft = Math.min(gLeft, gStore);
    const delivered = ox + fromP + fromG;
    if (r.exhaustedAtS === null && delivered < demand * 0.97 && demand > oxCeiling) r.exhaustedAtS = time;
    if (i % sample === 0) {
      r.t.push(time);
      r.pcr.push(fromP / demand); r.glycolysis.push(fromG / demand); r.oxidative.push(ox / demand);
      r.delivered.push(Math.min(1, delivered / demand));
    }
  }
  return r;
}
/** Which system supplies most of the energy over the whole effort. */
export function dominantSystem(r: EnergyResult): 'phosphocreatine' | 'glycolysis' | 'oxidative' {
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const p = sum(r.pcr), g = sum(r.glycolysis), o = sum(r.oxidative);
  return o >= p && o >= g ? 'oxidative' : g >= p ? 'glycolysis' : 'phosphocreatine';
}
/** Critical-power estimate of the time an effort can be held (minutes), or Infinity at or below critical power. */
export function timeToExhaustionMin(demand: number, training: Training): number {
  const over = demand - CP[training];
  return over <= 0 ? Infinity : WPRIME[training] / over;
}
/** Minutes to exhaust glycogen at a demand (the wall): about two hours at 75 % of VO₂max. */
export const glycogenMinutes = (demand: number) => (demand < 0.4 ? Infinity : 120 * Math.pow(0.75 / demand, 2.2));

// ── Which fibres an effort uses ────────────────────────────────────────────
/** Drive (0–100 % of the maximal command) a demand needs: weak for walking, maximal for a sprint. */
export const driveFor = (demand: number) => Math.min(100, Math.max(3, 100 * Math.pow(Math.min(demand, 4) / 4, 0.8)));

// ── Adaptation to training ─────────────────────────────────────────────────
export type Program = 'none' | 'strength' | 'endurance' | 'both';
export const PROGRAMS: { id: Program; label: string; text: string }[] = [
  { id: 'none', label: 'No training', text: 'Muscle is use-it-or-lose-it: without loading it slowly wastes.' },
  { id: 'strength', label: 'Strength (heavy loads)', text: 'Few repetitions at 70–90 % of one-repetition maximum, 2–3 times a week.' },
  { id: 'endurance', label: 'Endurance (long, steady)', text: 'Long efforts at 60–80 % of VO₂max, 3–5 times a week.' },
  { id: 'both', label: 'Both (concurrent)', text: 'Strength and endurance together: both adaptations, each a little blunted (the interference effect).' },
];
export interface Adaptation {
  /** Percent change from baseline. */
  strength: number; fibreArea: number; neural: number; mitochondria: number; capillaries: number; vo2max: number;
  /** Shift in fibre types: change in the share of type IIx (falls) and type IIa (rises), percentage points. */
  iix: number; iia: number;
}
/**
 * Typical changes after `weeks` of a program, from exponential approaches to a plateau: neural drive
 * (fast: the first weeks of strength gains are mostly learning to recruit), fibre size (slow), and the
 * oxidative machinery. Plateaus follow reviews of 8–24-week studies in healthy adults.
 */
export function adaptation(program: Program, weeks: number): Adaptation {
  const w = Math.max(0, weeks);
  const approach = (tau: number) => 1 - Math.exp(-w / tau);
  const interference = program === 'both' ? 0.75 : 1;
  const s = program === 'strength' || program === 'both';
  const e = program === 'endurance' || program === 'both';
  const neural = s ? 22 * approach(4) : 0;
  const fibreArea = s ? 14 * approach(14) * interference : e ? 2 * approach(12) : 0;
  return {
    neural: r1(neural * interference),
    fibreArea: r1(fibreArea),
    strength: r1(s ? (1 + (neural * interference) / 100) * (1 + fibreArea / 100) * 100 - 100 + 0.35 * fibreArea : 0),
    mitochondria: r1(e ? 45 * approach(8) * (program === 'both' ? 0.85 : 1) : s ? 4 * approach(8) : 0),
    capillaries: r1(e ? 22 * approach(10) * (program === 'both' ? 0.85 : 1) : s ? 4 * approach(12) : 0),
    vo2max: r1(e ? 18 * approach(10) * (program === 'both' ? 0.85 : 1) : 0),
    iix: r1(s || e ? -9 * approach(9) : 0),
    iia: r1(s || e ? 7 * approach(9) : 0),
  };
}
const r1 = (x: number) => Math.round(x * 10) / 10;

/** Untrained muscle over a long layoff: percent of the trained gain kept after `weeks` without training. */
export const detraining = (weeks: number) => Math.exp(-Math.max(0, weeks) / 18);

// ── Delayed-onset muscle soreness ──────────────────────────────────────────
/**
 * Soreness (0–10) after unaccustomed eccentric work: it starts a few hours later, peaks at 24–72 h and
 * fades over about a week. A bout repeated within weeks gives 50–80 % less (the repeated-bout effect).
 */
export function domsAt(hours: number, load = 1, repeated = false): number {
  if (hours <= 0) return 0;
  const peakH = 48, k = 2.2;
  const shape = Math.pow(hours / peakH, k) * Math.exp(k * (1 - hours / peakH));
  return Math.min(10, 8 * load * shape * (repeated ? 0.3 : 1));
}
export const DOMS_TEXT = 'Eccentric contractions (lengthening under load, such as running downhill) damage Z-discs and the sarcolemma more than concentric ones; the damage and the inflammation that clears it make the muscle tender and weak. It is not caused by lactate, which clears within an hour. Soreness is a poor guide to how much muscle grew.';

// ── Fatigue ────────────────────────────────────────────────────────────────
/** What limits an effort, by its duration: a list for the panel. */
export const FATIGUE_FACTORS: { upToMin: number; text: string }[] = [
  { upToMin: 0.2, text: 'Phosphocreatine runs low, and at the highest firing rates the action potential fails to keep up (central and neuromuscular fatigue).' },
  { upToMin: 2, text: 'Hydrogen ions and inorganic phosphate from fast glycolysis interfere with calcium release and the cross-bridges.' },
  { upToMin: 15, text: 'Oxygen supply (cardiac output and muscle blood flow) and the build-up of metabolites limit the pace.' },
  { upToMin: Infinity, text: 'Glycogen depletion, dehydration, heat and the brain’s perception of effort limit long efforts.' },
];
export const limitingFactor = (minutes: number) => FATIGUE_FACTORS.find((f) => minutes <= f.upToMin)!.text;

// ── Which muscles an effort uses ───────────────────────────────────────────
const RUN = { 'rectus femoris': 1, 'vastus lateralis': 1, 'vastus medialis': 1, 'vastus intermedius': 1, 'biceps femoris': 0.9, semitendinosus: 0.8, semimembranosus: 0.8, 'gluteus maximus': 1, 'gluteus medius': 0.6, gastrocnemius: 0.9, soleus: 1, 'tibialis anterior': 0.6, iliacus: 0.7, 'psoas major': 0.7, 'rectus abdominis': 0.3 } as Record<string, number>;
export const WORKING: Record<string, Record<string, number>> = {
  lift: { 'gluteus maximus': 1, 'biceps femoris': 0.9, semitendinosus: 0.8, semimembranosus: 0.8, 'vastus lateralis': 0.8, 'vastus medialis': 0.8, 'rectus femoris': 0.6, 'longissimus thoracis': 1, 'iliocostalis lumborum': 1, trapezius: 0.8, 'latissimus dorsi': 0.7, 'flexor digitorum profundus': 0.7, 'flexor digitorum superficialis': 0.7, 'rectus abdominis': 0.4, 'transversus abdominis': 0.5 },
  sprint: { ...RUN, 'biceps femoris': 1, 'gluteus maximus': 1, gastrocnemius: 1 },
  '400': RUN, '1500': RUN, '10k': RUN, marathon: { ...RUN, 'gluteus maximus': 0.7 },
  walk: { 'gluteus medius': 0.8, 'gluteus maximus': 0.4, 'vastus lateralis': 0.4, 'vastus medialis': 0.4, 'rectus femoris': 0.3, soleus: 0.8, gastrocnemius: 0.5, 'tibialis anterior': 0.6, iliacus: 0.4, 'psoas major': 0.4 },
};
/** The activity whose muscles a demand uses (the chosen one, or the nearest by demand for a custom effort). */
export function activityFor(id: string | null, demand: number): string {
  if (id && WORKING[id]) return id;
  if (demand >= 3.5) return 'sprint';
  if (demand >= 1.6) return '400';
  if (demand >= 1.05) return '1500';
  if (demand >= 0.6) return '10k';
  return 'walk';
}

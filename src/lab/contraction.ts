/**
 * How a muscle makes force: the length–tension curve, the force–velocity curve, a twitch summing into
 * a tetanus, the order in which motor units are recruited, and the steps of excitation–contraction
 * coupling and the cross-bridge cycle. Teaching models with textbook shapes and typical numbers.
 */

// ── Length–tension ─────────────────────────────────────────────────────────
/** Sarcomere length in µm at which thick and thin filaments just stop overlapping (3.65) and where force is maximal (2.0–2.25). */
export const SARCOMERE = { optimalLow: 2.0, optimalHigh: 2.25, zeroLong: 3.65, zeroShort: 1.27, rest: 2.2 } as const;

/**
 * Active force (0–1 of maximum) against sarcomere length, after Gordon, Huxley and Julian (1966) for
 * frog muscle: a plateau where every cross-bridge can reach actin, a linear fall as the filaments are
 * pulled apart, and a steep loss when thin filaments collide in the middle of the sarcomere.
 */
export function activeForce(lengthUm: number): number {
  const L = lengthUm;
  if (L <= SARCOMERE.zeroShort || L >= SARCOMERE.zeroLong) return 0;
  if (L < 1.67) return (0.84 * (L - SARCOMERE.zeroShort)) / (1.67 - SARCOMERE.zeroShort);
  if (L < SARCOMERE.optimalLow) return 0.84 + (0.16 * (L - 1.67)) / (SARCOMERE.optimalLow - 1.67);
  if (L <= SARCOMERE.optimalHigh) return 1;
  return (SARCOMERE.zeroLong - L) / (SARCOMERE.zeroLong - SARCOMERE.optimalHigh);
}
/** Passive force (0–1 of maximum active force): titin and connective tissue resist stretch beyond rest length. */
export function passiveForce(lengthUm: number): number {
  const over = Math.max(0, lengthUm - 2.4);
  return Math.min(1.5, 0.02 * (Math.exp(2.4 * over) - 1));
}
// ── Force–velocity ─────────────────────────────────────────────────────────
/** Hill's curvature a/F0 for a typical muscle. */
export const HILL_K = 0.25;
/**
 * Force (fraction of isometric maximum) at a relative velocity u = v/vmax: positive u shortens (concentric)
 * and follows Hill's hyperbola; negative u lengthens (eccentric) and rises to about 1.8 times the isometric force.
 */
export function forceAtVelocity(u: number): number {
  if (u >= 1) return 0;
  if (u >= 0) return (1 - u) / (1 + u / HILL_K);
  return 1.8 - 0.8 * Math.exp(8 * u);
}
/** Mechanical power (fraction of F0·vmax): peaks near a third of vmax. */
export const powerAtVelocity = (u: number) => (u > 0 ? u * forceAtVelocity(u) : 0);
export const OPTIMAL_VELOCITY = (() => { let best = 0, at = 0; for (let u = 0; u <= 1; u += 0.005) { const p = powerAtVelocity(u); if (p > best) { best = p; at = u; } } return at; })();

// ── Twitch, summation and tetanus ──────────────────────────────────────────
export type Fibre = 'slow' | 'fast';
/** Calcium decay and force rise time constants (s): slow-twitch fibres release and take up calcium more slowly. */
const KINETICS: Record<Fibre, { ca: number; rise: number }> = { slow: { ca: 0.07, rise: 0.05 }, fast: { ca: 0.022, rise: 0.017 } };

/**
 * Force over time for a train of stimuli at `hz`, as a fraction of the force of a long, fused tetanus.
 * Each stimulus adds a pulse of calcium that decays; activation is a cooperative (Hill, n = 2) function
 * of it; force follows activation with a time constant. At low rates the twitches stay separate; as the
 * rate rises they fuse (unfused tetanus, then fused tetanus).
 */
export function stimulusTrace(hz: number, fibre: Fibre, durationMs = 600, stepMs = 2, startMs = 40): { t: number[]; force: number[]; pulses: number[] } {
  const k = KINETICS[fibre];
  const dt = stepMs / 1000;
  const period = hz > 0 ? 1 / hz : Infinity;
  const steps = Math.round(durationMs / stepMs);
  let ca = 0, f = 0, next = startMs / 1000;
  const t: number[] = [], force: number[] = [], pulses: number[] = [];
  const act = (c: number) => (c * c) / (c * c + 0.64);
  for (let i = 0; i <= steps; i++) {
    const time = i * dt;
    while (time + 1e-9 >= next && next < durationMs / 1000) { ca += 0.5; pulses.push(Math.round(next * 1000)); next += period; }
    ca *= Math.exp(-dt / k.ca);
    f += ((act(ca) - f) * dt) / k.rise;
    t.push(Math.round(time * 1000)); force.push(f);
  }
  // Normalise to a long 100 Hz tetanus of the same fibre type.
  const ref = referenceTetanus(fibre);
  return { t, force: force.map((x) => Math.min(1.05, x / ref)), pulses };
}
const refCache: Partial<Record<Fibre, number>> = {};
function referenceTetanus(fibre: Fibre): number {
  const cached = refCache[fibre];
  if (cached !== undefined) return cached;
  const k = KINETICS[fibre], dt = 0.002;
  let ca = 0, f = 0, next = 0.04;
  const act = (c: number) => (c * c) / (c * c + 0.64);
  for (let i = 0; i < 400; i++) {
    const time = i * dt;
    while (time + 1e-9 >= next) { ca += 0.5; next += 0.01; }
    ca *= Math.exp(-dt / k.ca);
    f += ((act(ca) - f) * dt) / k.rise;
  }
  return (refCache[fibre] = f);
}
/** Ripple of the plateau (peak-to-trough over mean) for the last 200 ms: 0 = fully fused. */
export function ripple(trace: { t: number[]; force: number[] }): number {
  const tail = trace.force.slice(Math.floor(trace.force.length * 0.66));
  const mean = tail.reduce((a, b) => a + b, 0) / tail.length;
  return mean > 0 ? (Math.max(...tail) - Math.min(...tail)) / mean : 0;
}
export type Summation = 'twitch' | 'summation' | 'unfused tetanus' | 'fused tetanus';
export function summationState(hz: number, fibre: Fibre, trace = stimulusTrace(hz, fibre)): Summation {
  if (hz < 2) return 'twitch';
  const r = ripple(trace);
  const plateau = Math.max(...trace.force);
  if (r > 0.55 && plateau < 0.6) return 'summation';
  return r > 0.08 ? 'unfused tetanus' : 'fused tetanus';
}
export const FUSION_HZ: Record<Fibre, string> = { slow: 'about 15–30 Hz', fast: 'about 50–100 Hz' };

// ── Motor units and the size principle ─────────────────────────────────────
export type UnitType = 'S' | 'FR' | 'FF';
export const UNIT_TEXT: Record<UnitType, { label: string; text: string; colour: string }> = {
  S: { label: 'Slow (type I)', text: 'Small motor neurons, few fibres, slow myosin and many mitochondria: weak but fatigue-resistant; used first and for posture.', colour: '#c8443b' },
  FR: { label: 'Fast, fatigue-resistant (type IIa)', text: 'Medium units with fast myosin and both aerobic and glycolytic metabolism: strong and fairly fatigue-resistant.', colour: '#e8a33a' },
  FF: { label: 'Fast, fatigable (type IIx)', text: 'The largest motor neurons and most fibres, fast myosin, glycolytic: the strongest and fastest, tiring in seconds; recruited last, for sprints and jumps.', colour: '#f0d9b5' },
};
export interface MotorUnits { types: UnitType[]; thresholds: number[]; force: number[] }
/** `n` motor units of a muscle with the given share of slow fibres: thresholds and force grow exponentially (Henneman's size principle). */
export function motorUnits(slowPct: number, n = 100): MotorUnits {
  const nS = Math.round((slowPct / 100) * n), nFR = Math.round(((n - nS) * 0.45));
  const types: UnitType[] = Array.from({ length: n }, (_, i) => (i < nS ? 'S' : i < nS + nFR ? 'FR' : 'FF'));
  // Thresholds rise exponentially from the smallest unit (about 0 % of maximal drive) to the largest (100 %).
  const range = 100;
  const th = Array.from({ length: n }, (_, i) => (100 * (Math.pow(range, i / (n - 1)) - 1)) / (range - 1));
  const force = th.map((x) => 0.2 + (x / 100) ** 0.9 * 4);
  const total = force.reduce((a, b) => a + b, 0);
  return { types, thresholds: th, force: force.map((x) => x / total) };
}
/** Which units are recruited at a drive (0–100 % of the maximal voluntary command) and the force they give. */
export function recruit(units: MotorUnits, drivePct: number): { active: boolean[]; count: number; forcePct: number; byType: Record<UnitType, number> } {
  const active = units.thresholds.map((t) => t <= drivePct + 1e-9);
  // Rate coding adds force from active units as drive rises past their threshold.
  let force = 0;
  const byType: Record<UnitType, number> = { S: 0, FR: 0, FF: 0 };
  active.forEach((a, i) => {
    if (!a) return;
    const rate = Math.min(1, 0.45 + (0.55 * (drivePct - units.thresholds[i]!)) / Math.max(10, 100 - units.thresholds[i]!));
    force += units.force[i]! * rate;
    byType[units.types[i]!]++;
  });
  return { active, count: active.filter(Boolean).length, forcePct: Math.min(100, (force / maxForce(units)) * 100), byType };
}
function maxForce(units: MotorUnits) { return units.force.reduce((a, b) => a + b, 0); }

// ── Steps ──────────────────────────────────────────────────────────────────
export const ECC_STEPS = [
  { id: 'ap', title: 'Action potential', text: 'A motor neuron fires; the action potential runs down its axon to the neuromuscular junction.' },
  { id: 'ach', title: 'Acetylcholine release', text: 'Calcium entering the terminal makes vesicles fuse and release acetylcholine (ACh) into the synaptic cleft.' },
  { id: 'epp', title: 'End-plate potential', text: 'ACh opens nicotinic receptors on the motor end plate; sodium enters and the end-plate potential triggers a muscle action potential. Acetylcholinesterase then breaks the ACh down.' },
  { id: 'tt', title: 'Down the T-tubules', text: 'The action potential spreads along the sarcolemma and into the transverse tubules, where voltage sensors (DHP receptors) change shape.' },
  { id: 'ca', title: 'Calcium release', text: 'The sensors open ryanodine receptors in the sarcoplasmic reticulum; calcium floods the sarcoplasm.' },
  { id: 'tnc', title: 'Troponin–tropomyosin shift', text: 'Calcium binds troponin C, which moves tropomyosin off the myosin-binding sites on actin.' },
  { id: 'cb', title: 'Cross-bridge cycling', text: 'Myosin heads bind actin and pull: the thin filaments slide towards the middle of the sarcomere (the sliding-filament mechanism).' },
  { id: 'relax', title: 'Relaxation', text: 'SERCA pumps return calcium to the reticulum using ATP; troponin lets go and tropomyosin covers the sites again.' },
] as const;

export const CROSSBRIDGE_STEPS = [
  { id: 'attach', title: 'Attachment', text: 'The myosin head, with ADP and phosphate bound, attaches to a site on actin (once calcium has uncovered it).' },
  { id: 'power', title: 'Power stroke', text: 'Phosphate, then ADP, is released and the head pivots, pulling the thin filament about 5–10 nm towards the M line.' },
  { id: 'detach', title: 'Detachment', text: 'A new ATP binds the head, which lets go of actin. Without ATP the heads stay attached: rigor mortis.' },
  { id: 'cock', title: 'Re-cocking', text: 'The myosin ATPase splits ATP to ADP and phosphate; the energy returns the head to its cocked position, ready to bind again further along.' },
] as const;

/** Maximum isometric force from the physiological cross-sectional area: about 25–40 N per cm² (here 30). */
export const SPECIFIC_TENSION_N_PER_CM2 = 30;
export const maxForceN = (pcsaCm2: number) => pcsaCm2 * SPECIFIC_TENSION_N_PER_CM2;

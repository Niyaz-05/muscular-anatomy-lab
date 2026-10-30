import { useId, useMemo } from 'react';
import { useLab } from '../app/LabContext';
import { effectivePose } from '../app/state';
import { JOINTS, keyOf, POSES, type Movement } from '../lab/joints';
import { contractionOf, ROLE_TEXT, rolesForPose, type Role } from '../lab/muscle-data';
import * as THREE from 'three';
import { flatten, pathLengthChangePct } from '../lab/skinning';
import { geometryOf, SKIN_BONES } from '../lab/anchors';
import { poseMatrices } from '../lab/rig';
import { skinData } from '../viewer/MuscleModel';
import { ROLE_COLOUR } from '../viewer/palette';
import {
  activeForce, CROSSBRIDGE_STEPS, ECC_STEPS, forceAtVelocity, FUSION_HZ, motorUnits, OPTIMAL_VELOCITY, passiveForce, powerAtVelocity, recruit, SARCOMERE, stimulusTrace, summationState, UNIT_TEXT, type UnitType,
} from '../lab/contraction';
import {
  ACTIVITIES, activityById, adaptation, dominantSystem, domsAt, DOMS_TEXT, driveFor, energyDuring, glycogenMinutes, limitingFactor, PROGRAMS, timeToExhaustionMin,
} from '../lab/exercise';
import { CK_ULN, DISORDERS, disorderById, healingPhaseAt, KIND_LABEL, MUSCLE_HEALING, MRC, mrcReading, readCk, strengthAt } from '../lab/disorders';
import { Legend, LineChart } from './Chart';
import { Check, CloseUpButtons, f0, f1, f2, Head, Radios, Slider } from './widgets';

// ── Movement ───────────────────────────────────────────────────────────────
/** A movement's value in words: the name of the end it is towards, and the angle. */
export function describe(m: Movement, v: number): string {
  if (m.id === 'grip') return v === 0 ? 'open' : `${f0(v)} % of a fist`;
  if (m.id === 'jaw-open') return v === 0 ? 'closed' : `${f0(v)} mm`;
  if (v === 0) return 'neutral (0°)';
  const word = (v > 0 ? m.maxName : m.minName).replace(/\s*\d+\s*(°|%|mm)?$/, '').replace(/\s*\(%\)$/, '');
  return `${word} ${f0(Math.abs(v))}°`;
}

const ROLE_ORDER: Role[] = ['prime', 'assist', 'antagonist'];

export function MovementPanel() {
  const { def, state, dispatch } = useLab();
  const j = JOINTS.find((x) => x.id === state.joints.joint) ?? JOINTS[0]!;
  const limb = j.movements.some((m) => m.limb);
  const side = state.joints.side;
  const preset = POSES.find((p) => p.id === state.joints.preset);
  const pose = effectivePose(def, state);
  const valueOf = (m: Movement) => state.joints.pose[keyOf(m, side === 'both' ? 'left' : side)] ?? 0;
  const id = useId();

  const poseKey = JSON.stringify(pose);
  const rows = useMemo(() => {
    // The bone matrices of this pose, computed here: the model applies the same pose after this panel renders.
    const mats = poseMatrices(SKIN_BONES, pose);
    const bones = flatten(SKIN_BONES.map((b) => mats.get(b) ?? new THREE.Matrix4()));
    const muscles = def.structures.filter((s) => s.kind === 'mesh' && s.muscle);
    const roles = rolesForPose(pose, muscles.map((s) => ({ id: s.id, muscle: s.muscle!.name, side: s.side })));
    const seen = new Set<string>();
    const out: { id: string; label: string; role: Role; change: number | null }[] = [];
    for (const s of muscles) {
      const role = roles.get(s.id);
      const key = `${s.muscle!.name}|${s.side}`;
      if (!role || seen.has(key)) continue;
      seen.add(key);
      const part = skinData.parts.get(s.id);
      const axis = geometryOf(def)[s.id]?.axes?.[0];
      const change = part && axis ? pathLengthChangePct(part.rest, part.skin, axis, bones) : null;
      out.push({ id: s.id, label: s.label.replace(/, (.*) \(/, ' ('), role, change });
    }
    return out.sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.label.localeCompare(b.label));
  // The pose is keyed by its text; skinData fills in once the model has loaded.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, poseKey, skinData.parts.size]);

  return (
    <section className="sheet movement-panel" aria-label="Movement" data-joint={j.id} data-pose={state.joints.preset ?? 'custom'}>
      <Head title="Movement" />
      <p className="small">Move a joint or choose a pose: the bones turn, the muscles bend with them, and the muscles that move the joint light up by role.</p>
      <h3 className="group-title">Poses</h3>
      <Radios label="Pose" options={POSES.map((p) => ({ id: p.id, label: p.label }))} value={state.joints.preset ?? ''} onChange={(p) => dispatch({ type: 'set-pose', preset: p })} />
      {preset && <p className="small">{preset.text}</p>}
      <h3 className="group-title">Move a joint</h3>
      <div className="field">
        <label htmlFor={`${id}-j`} className="small">Joint</label>
        <select id={`${id}-j`} value={j.id} onChange={(e) => dispatch({ type: 'set-joint', joint: e.target.value })}>
          {JOINTS.filter((x) => x.movements.length > 0).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </div>
      {limb && <Radios label="Side" options={[{ id: 'left' as const, label: 'Left' }, { id: 'right' as const, label: 'Right' }, { id: 'both' as const, label: 'Both' }]} value={side} onChange={(s) => dispatch({ type: 'set-joint', side: s })} />}
      {j.movements.map((m) => {
        const v = valueOf(m);
        const key = m.limb ? `${m.id}-${side}` : m.id;
        return (
          <div key={m.id} data-movement={m.id} data-value={v}>
            <Slider label={m.label} min={m.min} max={m.max} step={1} value={v} text={describe(m, v)} onChange={(x) => dispatch({ type: 'set-movement', key, value: x })} />
            <p className="muted small range-note">Normal range: {m.minName} to {m.maxName}</p>
          </div>
        );
      })}
      <h3 className="group-title">What the muscles do</h3>
      <Legend items={ROLE_ORDER.map((r) => ({ label: ROLE_TEXT[r], colour: ROLE_COLOUR[r] }))} />
      {rows.length === 0 ? (
        <p className="muted small">Move a joint by more than 3° to see which muscles produce and oppose the movement.</p>
      ) : (
        <ul className="role-list small" aria-label="Muscles in this movement">
          {rows.map((r) => (
            <li key={r.id} data-role={r.role}>
              <button type="button" onClick={() => dispatch({ type: 'select', id: r.id })}>
                <span className="dot" aria-hidden="true" style={{ background: ROLE_COLOUR[r.role] }} />
                <span className="role-name">{r.label}</span>
                {r.change !== null && Math.abs(r.change) >= 0.5 && <span className="tag" title="Change in the muscle’s length along its axis, from the posed model">{r.change > 0 ? '+' : '−'}{f1(Math.abs(r.change))} % · {r.role === 'antagonist' ? (r.change > 0 ? 'lengthens' : 'shortens') : contractionOf(r.change, true)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {rows.length > 0 && <p className="muted small">The percentage is the change in the muscle’s length along its axis in the posed model. Prime movers shorten (concentric) when the joint moves against load; the same muscle lengthens while it controls a movement with gravity (eccentric).</p>}
      <div className="field">
        <span className="group-title">Bones</span>
        <Radios label="Show the skeleton" options={[{ id: 'off' as const, label: 'Off' }, { id: 'ghost' as const, label: 'Ghost' }, { id: 'solid' as const, label: 'Solid' }]} value={state.bones} onChange={(v) => dispatch({ type: 'set-bones', value: v })} />
      </div>
      <button type="button" className="secondary" onClick={() => dispatch({ type: 'set-pose', preset: 'anatomical' })}>Back to the anatomical position</button>
    </section>
  );
}

// ── Inside a muscle ────────────────────────────────────────────────────────
const range = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));

export function InsidePanel() {
  const { state, dispatch } = useLab();
  const s = state.inside;
  const set = (value: Partial<typeof s>) => dispatch({ type: 'set-inside', value });
  const sel = state.selected ? state.selected : null;
  const slow = useSelectedSlow(sel);
  const units = useMemo(() => motorUnits(slow), [slow]);
  const trace = useMemo(() => stimulusTrace(s.hz, s.fibre), [s.hz, s.fibre]);
  const sum = summationState(s.hz, s.fibre, trace);
  const rec = recruit(units, s.drive);
  const steps = [...ECC_STEPS, ...CROSSBRIDGE_STEPS.map((c) => ({ ...c, id: `cb-${c.id}`, title: `Cross-bridge: ${c.title}` }))];
  const step = steps[Math.min(s.step, steps.length - 1)]!;
  const lenState = s.length < 1.67 ? 'Ascending limb: the thin filaments overlap each other and crowd the middle, so force falls steeply.' : s.length < SARCOMERE.optimalLow ? 'Nearly optimal: a small loss as thin filaments begin to overlap.' : s.length <= SARCOMERE.optimalHigh ? 'The plateau: every myosin head can reach actin, so force is maximal.' : s.length < SARCOMERE.zeroLong ? 'Descending limb: fewer heads reach actin as the filaments are drawn apart.' : 'No overlap: no active force is possible.';
  const velocity = s.velocity;
  const fv = forceAtVelocity(velocity);
  return (
    <section className="sheet inside-panel" aria-label="Inside a muscle" data-inside={s.panel}>
      <Head title="Inside a muscle" />
      <Radios label="What to explore" options={[{ id: 'tension' as const, label: 'Length–tension' }, { id: 'velocity' as const, label: 'Force–velocity' }, { id: 'tetanus' as const, label: 'Twitch to tetanus' }, { id: 'units' as const, label: 'Motor units' }, { id: 'steps' as const, label: 'Steps' }]} value={s.panel} onChange={(p) => set({ panel: p })} />

      {s.panel === 'tension' && (
        <>
          <p className="small">How much force a muscle can make depends on how long its sarcomeres are, because that sets how many myosin heads can reach actin.</p>
          <Slider label="Sarcomere length" min={1.2} max={3.8} step={0.01} value={s.length} text={`${f2(s.length)} µm`} onChange={(v) => set({ length: v })} />
          <LineChart label="Active and passive force against sarcomere length" xMax={2.6} xTicks={[1.2, 2, 2.6, 3.2, 3.8].map((x) => ({ at: x - 1.2, text: `${x}` }))} yLeft={{ min: 0, max: 1.1, ticks: [0, 0.5, 1], unit: 'force ÷ max' }} cursor={s.length - 1.2}
            series={[{ label: 'Active', colour: '#c8443b', values: range(1.2, 3.8, 120).map(activeForce) }, { label: 'Passive', colour: '#4a73c4', values: range(1.2, 3.8, 120).map((x) => Math.min(1.1, passiveForce(x))), dashed: true }]} />
          <Legend items={[{ label: 'Active (cross-bridges)', colour: '#c8443b' }, { label: 'Passive (titin, connective tissue)', colour: '#4a73c4' }]} />
          <dl className="readout">
            <div><dt>Active force</dt><dd>{f0(activeForce(s.length) * 100)} % of maximum</dd></div>
            <div><dt>Passive force</dt><dd>{f0(passiveForce(s.length) * 100)} %</dd></div>
          </dl>
          <p className="small" aria-live="polite">{lenState}</p>
          <p className="muted small">In the body, a muscle works close to the plateau through most of a joint’s range because of how it is attached; at the extremes (a deep squat, a full stretch) it loses force.</p>
        </>
      )}

      {s.panel === 'velocity' && (
        <>
          <p className="small">A muscle makes less force the faster it shortens (Hill, 1938), and more when it is being lengthened under load.</p>
          <Slider label="Velocity" min={-1} max={1} step={0.01} value={velocity} text={velocity > 0.02 ? `shortening ${f0(velocity * 100)} % of vmax` : velocity < -0.02 ? `lengthening ${f0(-velocity * 100)} % of vmax` : 'isometric'} onChange={(v) => set({ velocity: v })} />
          <LineChart label="Force and power against velocity" xMax={2} xTicks={[-1, -0.5, 0, 0.5, 1].map((x) => ({ at: x + 1, text: `${x}` }))} yLeft={{ min: 0, max: 1.9, ticks: [0, 1, 1.8], unit: 'force ÷ F₀' }} cursor={velocity + 1}
            series={[{ label: 'Force', colour: '#c8443b', values: range(-1, 1, 120).map(forceAtVelocity) }, { label: 'Power', colour: '#4a73c4', values: range(-1, 1, 120).map((u) => powerAtVelocity(u) * 4), dashed: true }]} />
          <Legend items={[{ label: 'Force', colour: '#c8443b' }, { label: 'Power (scaled)', colour: '#4a73c4' }]} />
          <dl className="readout">
            <div><dt>Force</dt><dd>{f0(fv * 100)} % of isometric</dd></div>
            <div><dt>Power</dt><dd>{f0(powerAtVelocity(velocity) * 400)} % of the best a muscle gives (peaks near {f0(OPTIMAL_VELOCITY * 100)} % of vmax)</dd></div>
            <div><dt>Contraction</dt><dd>{velocity > 0.02 ? 'Concentric (shortening)' : velocity < -0.02 ? 'Eccentric (lengthening)' : 'Isometric'}</dd></div>
          </dl>
          <p className="muted small">This is why a heavy lift is slow, why you can lower a weight you cannot raise, and why the best sprinting and jumping happen at a third of the muscle’s top speed.</p>
        </>
      )}

      {s.panel === 'tetanus' && (
        <>
          <p className="small">One nerve impulse gives a brief twitch. Impulses that arrive before the muscle has relaxed add up (summation) until the twitches fuse into a smooth tetanus.</p>
          <Radios label="Fibre type" options={[{ id: 'slow' as const, label: 'Slow (type I)' }, { id: 'fast' as const, label: 'Fast (type II)' }]} value={s.fibre} onChange={(v) => set({ fibre: v })} />
          <Slider label="Stimulation rate" min={1} max={100} step={1} value={s.hz} text={`${s.hz} Hz`} onChange={(v) => set({ hz: v })} />
          <LineChart label="Force against time for a train of stimuli" xMax={600} xTicks={[0, 150, 300, 450, 600].map((x) => ({ at: x, text: `${x} ms` }))} yLeft={{ min: 0, max: 1.1, ticks: [0, 0.5, 1], unit: 'force ÷ tetanus' }} marks={trace.pulses.length <= 6 ? trace.pulses.map((p) => ({ at: p, text: '' })) : undefined}
            series={[{ label: 'Force', colour: s.fibre === 'slow' ? '#9b1d1d' : '#e07a6a', values: trace.force }]} />
          <dl className="readout">
            <div><dt>Result</dt><dd data-summation={sum}>{sum.charAt(0).toUpperCase() + sum.slice(1)}</dd></div>
            <div><dt>Peak force</dt><dd>{f0(Math.max(...trace.force) * 100)} % of a full tetanus</dd></div>
            <div><dt>Fuses at</dt><dd>{FUSION_HZ[s.fibre]}</dd></div>
          </dl>
          <p className="muted small">Slow fibres release and re-take calcium slowly, so they fuse at low rates; fast fibres need 50–100 Hz. Motor neurons fire at 8–50 Hz in life; the nervous system controls force by recruiting units and by changing their rate. A sustained tetanus without rest is what tetanus infection and strychnine cause.</p>
        </>
      )}

      {s.panel === 'units' && (
        <>
          <p className="small">A motor neuron and the fibres it supplies form a motor unit. The nervous system recruits units from the smallest to the largest as the drive increases (Henneman’s size principle).</p>
          {sel && slow !== 50 ? <p className="muted small">Using the fibre mix of the selected muscle ({slow} % slow).</p> : <p className="muted small">Select a muscle to use its fibre mix; showing 50 % slow.</p>}
          <Slider label="Motor drive" min={0} max={100} step={1} value={s.drive} text={`${f0(s.drive)} % of maximal`} onChange={(v) => set({ drive: v })} />
          <div className="unit-grid" role="img" aria-label={`${rec.count} of ${units.types.length} motor units recruited`}>
            {units.types.map((t, i) => <span key={i} className={`unit ${rec.active[i] ? 'on' : 'off'}`} style={{ background: rec.active[i] ? UNIT_TEXT[t].colour : undefined }} title={UNIT_TEXT[t].label} />)}
          </div>
          <Legend items={(['S', 'FR', 'FF'] as UnitType[]).map((t) => ({ label: UNIT_TEXT[t].label, colour: UNIT_TEXT[t].colour }))} />
          <dl className="readout">
            <div><dt>Units recruited</dt><dd>{rec.count} of {units.types.length} (slow {rec.byType.S}, fast-resistant {rec.byType.FR}, fast-fatigable {rec.byType.FF})</dd></div>
            <div><dt>Force</dt><dd>{f0(rec.forcePct)} % of maximal</dd></div>
          </dl>
          <p className="muted small">The first units are small and slow and make little force; the last are large and fast and make most of it. That is why gentle effort uses only fatigue-resistant fibres and a sprint recruits everything.</p>
          <CloseUpButtons ids={['fibre-types']} />
        </>
      )}

      {s.panel === 'steps' && (
        <>
          <p className="small">From nerve impulse to force: eight steps of excitation–contraction coupling, then the cross-bridge cycle.</p>
          <ol className="flow-steps">
            {steps.map((t, i) => (
              <li key={t.id} className={i === s.step ? 'is-current' : undefined}>
                <button type="button" className="link" aria-current={i === s.step ? 'step' : undefined} onClick={() => set({ step: i })}>{i + 1}. {t.title}</button>
              </li>
            ))}
          </ol>
          <p className="phase" aria-live="polite"><span className="dot" aria-hidden="true" style={{ background: '#c8443b' }} /> <span>{step.text}</span></p>
          <div className="row tour-nav">
            <button type="button" className="secondary" disabled={s.step === 0} onClick={() => set({ step: s.step - 1 })}>← Back</button>
            <button type="button" className="primary" disabled={s.step >= steps.length - 1} onClick={() => set({ step: s.step + 1 })}>Next →</button>
          </div>
        </>
      )}
      <h3 className="group-title">Zoom in</h3>
      <CloseUpButtons ids={['fascicle', 'sarcomere', 'nmj', 'spindle', 'tendon']} />
    </section>
  );
}
function useSelectedSlow(id: string | null): number {
  const { def } = useLab();
  const s = id ? def.structures.find((x) => x.id === id) : null;
  return s?.muscle?.slow ?? 50;
}

// ── Exercise and fatigue ───────────────────────────────────────────────────
export function ExercisePanel() {
  const { state, dispatch } = useLab();
  const e = state.exercise;
  const set = (value: Partial<typeof e>) => dispatch({ type: 'set-exercise', value });
  const training = e.trained ? 'trained' : 'untrained';
  const result = useMemo(() => energyDuring(e.demand, e.minutes, training), [e.demand, e.minutes, training]);
  const dominant = dominantSystem(result);
  const tte = timeToExhaustionMin(e.demand, training);
  const wall = glycogenMinutes(e.demand);
  const drive = driveFor(e.demand);
  const units = useMemo(() => motorUnits(50), []);
  const rec = recruit(units, drive);
  const act = e.activity ? activityById(e.activity) : undefined;
  const ad = adaptation(e.program, e.weeks);
  const spanMin = e.minutes;
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ at: f * result.t[result.t.length - 1]!, text: spanMin < 2 ? `${f1(f * spanMin * 60)} s` : `${f0(f * spanMin)} min` }));
  const dTicks = [0, 24, 48, 96, 168, 240];
  return (
    <section className="sheet exercise-panel" aria-label="Exercise and fatigue" data-activity={e.activity ?? 'custom'}>
      <Head title="Exercise and fatigue" />
      <p className="small">Choose an effort: the muscles that do the work light up, and the energy systems that power it are charted.</p>
      <Radios label="Activity" options={ACTIVITIES.map((a) => ({ id: a.id, label: a.label }))} value={e.activity ?? ''} onChange={(a) => dispatch({ type: 'set-activity', id: a })} />
      {act && <p className="small">{act.text}</p>}
      <Slider label="Intensity" min={0.1} max={5} step={0.05} value={e.demand} text={`${f0(e.demand * 100)} % of the power at VO₂max`} onChange={(v) => set({ demand: v })} />
      <Slider label="Duration" min={0.05} max={240} step={0.05} value={e.minutes} text={e.minutes < 2 ? `${f0(e.minutes * 60)} s` : `${f0(e.minutes)} min`} onChange={(v) => set({ minutes: v })} />
      <Radios label="Training status" options={[{ id: 'untrained', label: 'Untrained' }, { id: 'trained', label: 'Endurance-trained' }]} value={training} onChange={(v) => set({ trained: v === 'trained' })} />
      <LineChart label="Share of the energy from each system over the effort" xMax={result.t[result.t.length - 1]!} xTicks={xTicks} yLeft={{ min: 0, max: 1, ticks: [0, 0.5, 1], unit: 'share of demand' }}
        series={[{ label: 'Phosphocreatine', colour: '#e8a33a', values: result.pcr }, { label: 'Glycolysis', colour: '#9a70d8', values: result.glycolysis }, { label: 'Oxidative', colour: '#3fb8a0', values: result.oxidative }, { label: 'Delivered', colour: '#888', values: result.delivered, dashed: true }]} />
      <Legend items={[{ label: 'Phosphocreatine (ATP–PCr)', colour: '#e8a33a' }, { label: 'Anaerobic glycolysis', colour: '#9a70d8' }, { label: 'Oxidative', colour: '#3fb8a0' }]} />
      <dl className="readout">
        <div><dt>Main energy system</dt><dd data-system={dominant}>{dominant === 'phosphocreatine' ? 'ATP and phosphocreatine' : dominant === 'glycolysis' ? 'Anaerobic glycolysis' : 'Oxidative (aerobic)'}</dd></div>
        <div><dt>Can it be held?</dt><dd data-hold={Number.isFinite(tte) ? 'limited' : 'sustained'}>{Number.isFinite(tte) ? `About ${tte < 1 ? `${f0(tte * 60)} s` : `${f1(tte)} min`} (critical-power model)` : 'Yes: below critical power'}{Number.isFinite(wall) && wall < 600 ? `; glycogen lasts about ${f0(wall)} min` : ''}</dd></div>
        <div><dt>Limit at this duration</dt><dd>{limitingFactor(e.minutes)}</dd></div>
        <div><dt>Motor drive</dt><dd>{f0(drive)} %: {rec.count} of 100 units ({rec.byType.S} slow, {rec.byType.FR} fast-resistant, {rec.byType.FF} fast-fatigable)</dd></div>
      </dl>
      <p className="muted small">The oxygen system takes about a minute to reach full output, so the first seconds come from phosphocreatine and glycolysis (the oxygen deficit). Above critical power the anaerobic store (W′) drains until the effort has to stop.</p>

      <h3 className="group-title">Training</h3>
      <Radios label="Training program" options={PROGRAMS.map((p) => ({ id: p.id, label: p.label }))} value={e.program} onChange={(p) => set({ program: p })} />
      <p className="small">{PROGRAMS.find((p) => p.id === e.program)?.text}</p>
      <Slider label="Weeks of training" min={0} max={52} step={1} value={e.weeks} text={`${e.weeks} weeks`} onChange={(v) => set({ weeks: v })} />
      <dl className="readout" data-program={e.program}>
        <div><dt>Strength</dt><dd>{ad.strength > 0 ? '+' : ''}{f0(ad.strength)} %</dd></div>
        <div><dt>Neural drive</dt><dd>{ad.neural > 0 ? '+' : ''}{f0(ad.neural)} %</dd></div>
        <div><dt>Fibre cross-section</dt><dd>{ad.fibreArea > 0 ? '+' : ''}{f1(ad.fibreArea)} %</dd></div>
        <div><dt>Mitochondria</dt><dd>{ad.mitochondria > 0 ? '+' : ''}{f0(ad.mitochondria)} %</dd></div>
        <div><dt>Capillaries per fibre</dt><dd>{ad.capillaries > 0 ? '+' : ''}{f0(ad.capillaries)} %</dd></div>
        <div><dt>VO₂max</dt><dd>{ad.vo2max > 0 ? '+' : ''}{f0(ad.vo2max)} %</dd></div>
        <div><dt>Type IIx → IIa</dt><dd>{f1(ad.iix)} / +{f1(ad.iia)} points</dd></div>
      </dl>
      <p className="muted small">Early strength gains are mostly neural (learning to recruit and fire the muscle); fibres enlarge more slowly. Endurance training adds mitochondria and capillaries; doing both blunts each a little (the interference effect).</p>

      <h3 className="group-title">Soreness (DOMS)</h3>
      <Slider label="Hours after unaccustomed eccentric exercise" min={0} max={240} step={1} value={e.hours} text={`${e.hours} h`} onChange={(v) => set({ hours: v })} />
      <Check label="A repeat of the same exercise within weeks" checked={e.repeated} onChange={(v) => set({ repeated: v })} />
      <LineChart label="Muscle soreness over the days after exercise" xMax={240} xTicks={dTicks.map((t) => ({ at: t, text: `${t} h` }))} yLeft={{ min: 0, max: 10, ticks: [0, 5, 10], unit: 'soreness' }} cursor={e.hours}
        series={[{ label: 'Soreness', colour: '#c8443b', values: range(0, 240, 120).map((h) => domsAt(h, 1, e.repeated)) }]} />
      <p className="small">Now: {f1(domsAt(e.hours, 1, e.repeated))} out of 10.</p>
      <p className="muted small">{DOMS_TEXT}</p>
      <CloseUpButtons ids={['fibre-types']} />
    </section>
  );
}

// ── Injuries and disorders ─────────────────────────────────────────────────
export function InjuryPanel() {
  const { def, state, dispatch } = useLab();
  const v = state.injury;
  const d = disorderById(v.id) ?? DISORDERS[0]!;
  const set = (value: Partial<typeof v>) => dispatch({ type: 'set-injury', value });
  const phase = healingPhaseAt(v.day);
  const ck = readCk(v.ck, v.sex);
  const mrc = mrcReading(v.mrc);
  const rd = d.returnDays;
  const strength = d.graded && rd ? strengthAt(v.day, v.grade, rd) : null;
  const kinds = [...new Set(DISORDERS.map((x) => x.kind))];
  return (
    <section className="sheet injury-panel" aria-label="Injuries and disorders" data-disorder={d.id}>
      <Head title="Injuries and disorders" />
      <div className="field">
        <label htmlFor="disorder" className="small">Condition</label>
        <select id="disorder" value={d.id} onChange={(e) => set({ id: e.target.value })}>
          {kinds.map((k) => <optgroup key={k} label={KIND_LABEL[k]}>{DISORDERS.filter((x) => x.kind === k).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</optgroup>)}
        </select>
      </div>
      <p className="lead">{d.summary}</p>
      <p className="chip-row"><span className="chip-static">{KIND_LABEL[d.kind]}</span>{d.ck && <span className="chip-static">CK: {d.ck}</span>}</p>
      <ul className="chips">
        {d.sites.map((s) => { const st = def.structures.find((x) => x.id === s); return st ? <li key={s}><button type="button" onClick={() => dispatch({ type: 'select', id: s })}>{st.label}</button></li> : null; })}
      </ul>
      <h3 className="group-title">What happens</h3>
      <p className="small">{d.mechanism}</p>
      <h3 className="group-title">What you find</h3>
      <ul className="small facts">{d.features.map((f) => <li key={f}>{f}</li>)}</ul>
      <h3 className="group-title">How it is tested</h3>
      <p className="small">{d.test}</p>
      <h3 className="group-title">Course</h3>
      <p className="small">{d.course}</p>

      {d.graded && rd && (
        <>
          <h3 className="group-title">Recovery</h3>
          <Radios label="Grade" options={[{ id: 1 as const, label: 'Grade I' }, { id: 2 as const, label: 'Grade II' }, { id: 3 as const, label: 'Grade III' }]} value={v.grade} onChange={(g) => set({ grade: g })} />
          <p className="small">{v.grade === 1 ? 'A few fibres torn: mild pain, little loss of strength.' : v.grade === 2 ? 'A partial tear: a clear loss of strength and function, with bruising.' : 'A complete rupture: no useful function; often surgical.'}</p>
          <Slider label="Days since the injury" min={0} max={180} step={1} value={v.day} text={`${v.day} days`} onChange={(x) => set({ day: x })} />
          <LineChart label="Strength regained over the days after the injury" xMax={180} xTicks={[0, 30, 60, 90, 120, 180].map((t) => ({ at: t, text: `${t} d` }))} yLeft={{ min: 0, max: 1, ticks: [0, 0.5, 1], unit: 'strength' }} cursor={v.day}
            marks={MUSCLE_HEALING.slice(1).map((p) => ({ at: p.fromDay, text: '' }))}
            series={[{ label: 'Strength', colour: '#3fb8a0', values: range(0, 180, 120).map((t) => strengthAt(t, v.grade, rd)) }]} />
          <dl className="readout">
            <div><dt>Strength now</dt><dd>{f0((strength ?? 1) * 100)} % of normal</dd></div>
            <div><dt>Phase</dt><dd data-phase={phase.id}>{phase.label}</dd></div>
            <div><dt>Typical return to play</dt><dd>about {rd[v.grade - 1]} days</dd></div>
          </dl>
          <p className="small">{phase.text}</p>
        </>
      )}

      <details className="more" open>
        <summary>Two bedside numbers</summary>
        <h3 className="group-title">Creatine kinase (CK)</h3>
        <div className="test-form">
          <div className="field"><label htmlFor="ck" className="small">Serum CK (U/L)</label><input id="ck" type="number" min={0} max={200000} step={10} value={v.ck} onChange={(e) => set({ ck: Number(e.target.value) })} /></div>
          <Radios label="Sex" options={[{ id: 'female' as const, label: 'Female' }, { id: 'male' as const, label: 'Male' }]} value={v.sex} onChange={(x) => set({ sex: x })} />
        </div>
        <div className="test-result" data-ck={ck.flag}><strong>{ck.band}</strong> · {f1(ck.times)} × the upper limit ({CK_ULN[v.sex]} U/L). <span className="small">{ck.text}</span></div>
        <h3 className="group-title">Power (MRC grade)</h3>
        <Slider label="Medical Research Council grade" min={0} max={5} step={1} value={v.mrc} text={`${v.mrc} / 5: ${mrc.label}`} onChange={(x) => set({ mrc: x })} />
        <p className="small">{mrc.text}</p>
        <details className="more"><summary>All grades</summary><dl className="closeup-parts small">{MRC.map((g) => <div key={g.grade}><dt>{g.grade}: {g.label}</dt><dd>{g.text}</dd></div>)}</dl></details>
      </details>
      <p className="muted small">Source: {d.source}</p>
      <p className="muted small">For learning only: a suspected muscle injury or weakness needs a doctor.</p>
    </section>
  );
}

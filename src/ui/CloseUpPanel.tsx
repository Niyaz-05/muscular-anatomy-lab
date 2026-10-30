import { useId } from 'react';
import { useLab } from '../app/LabContext';
import { effectiveCloseUp, effectiveInside } from '../app/state';
import type { CloseUp } from '../contract/schema';
import { activeForce } from '../lab/contraction';

export const CLOSE_UP_LABEL: Record<CloseUp, string> = {
  sarcomere: 'the sarcomere', nmj: 'the neuromuscular junction', 'fibre-types': 'fibre types and motor units', spindle: 'spindle and tendon organ', tendon: 'the tendon–bone junction', fascicle: 'muscle, fascicle and fibre',
};

const TEXT: Record<CloseUp, { title: string; body: string; parts: [string, string][] }> = {
  sarcomere: {
    title: 'The sarcomere', body: 'The contractile unit of skeletal muscle, between two Z discs: about 2.2 µm at rest. Thin actin filaments hang from the Z discs; thick myosin filaments sit in the middle. Drag the length slider: the filaments never shorten, they slide.',
    parts: [
      ['A band', 'The length of the thick filaments (1.6 µm): constant, however long the sarcomere.'],
      ['I band and H zone', 'The I band (thin filaments alone) and the H zone (thick filaments alone) shrink as the sarcomere shortens and vanish at full contraction.'],
      ['Cross-bridges', 'Myosin heads bind actin, pivot and release, each cycle moving the thin filament 5–10 nm; they can reach only where thick and thin filaments overlap.'],
      ['Length–tension', 'Force is greatest at 2.0–2.25 µm, where every head can reach actin; stretched far apart there are no heads in reach, and over-shortened the thin filaments collide.'],
    ],
  },
  nmj: {
    title: 'The neuromuscular junction', body: 'Where a motor neuron’s terminal meets a muscle fibre: the one synapse in the body that never fails to fire the muscle when the nerve fires.',
    parts: [
      ['Axon terminal', 'Packed with vesicles of acetylcholine; voltage-gated calcium channels open on the action potential and the vesicles fuse and release.'],
      ['Synaptic cleft', 'About 50 nm wide; acetylcholinesterase in it breaks ACh down within a millisecond, so one nerve impulse gives one muscle impulse.'],
      ['Motor end plate', 'Folds of the sarcolemma crowded with nicotinic receptors (ligand-gated sodium channels); the end-plate potential always exceeds threshold (a safety factor of 3–4).'],
      ['When it fails', 'Antibodies against the receptors (myasthenia gravis), against the calcium channels (Lambert–Eaton), botulinum toxin (stops release) or curare (blocks the receptors).'],
    ],
  },
  'fibre-types': {
    title: 'Fibre types and motor units', body: 'A cross-section of a muscle. One motor neuron supplies all the fibres of its unit, and they are scattered among others (the mosaic), so a unit pulls evenly across the muscle. The drive slider recruits units from the smallest up.',
    parts: [
      ['Type I (slow, oxidative)', 'Rich in mitochondria, myoglobin and capillaries (dark red); slow myosin; fatigue-resistant: posture and endurance.'],
      ['Type IIa (fast, oxidative-glycolytic)', 'Fast myosin with aerobic and glycolytic metabolism; fairly fatigue-resistant; trainable towards either type.'],
      ['Type IIx (fast, glycolytic)', 'Few mitochondria and little myoglobin (pale); the strongest and fastest, and tiring in seconds.'],
      ['Size principle', 'Motor neurons are recruited in order of size, small to large (Henneman): slow units first, fast units only when much force is needed.'],
    ],
  },
  spindle: {
    title: 'The muscle spindle and the tendon organ', body: 'Two sensors with opposite jobs. A spindle lies in parallel with the muscle fibres and reports length; a Golgi tendon organ lies in series with the tendon and reports tension.',
    parts: [
      ['Muscle spindle', 'A capsule of specialised intrafusal fibres. Ia afferents wind round their middle and fire when they are stretched (the knee-jerk reflex: the tap stretches the quadriceps and it contracts).'],
      ['Gamma motor neurons', 'Tighten the ends of the intrafusal fibres so the spindle stays sensitive as the muscle shortens (alpha–gamma coactivation).'],
      ['Golgi tendon organ', 'Ib afferents weave between collagen bundles and fire when the muscle pulls hard; they inhibit the muscle’s own motor neurons (the inverse myotatic reflex), protecting the tendon.'],
      ['Why they matter', 'Together they give the brain a continuous report of position and force (proprioception) and set the tone of the muscle.'],
    ],
  },
  tendon: {
    title: 'The tendon–bone junction', body: 'The load of a muscle passes through four tissues before it reaches the bone. Each is stiffer than the one before it, which spreads the stress.',
    parts: [
      ['Myotendinous junction', 'The muscle fibre ends in finger-like folds that interlock with collagen, enlarging the area that transmits force: the most common site of a muscle strain.'],
      ['Tendon', 'Parallel bundles of type I collagen with sparse tenocytes; it stores and returns elastic energy (the Achilles returns about 35 % of running’s energy), with a poor blood supply.'],
      ['Fibrocartilage', 'Uncalcified then calcified fibrocartilage form a gradient from tendon to bone (the enthesis); it is where tendon avulsion and enthesopathy occur.'],
      ['Bone', 'The attachment is anchored in the cortex; sustained load strengthens the tendon and the bone beneath it.'],
    ],
  },
  fascicle: {
    title: 'Muscle, fascicle and fibre', body: 'A muscle is built in nested bundles, each wrapped in connective tissue that carries the force to the tendon.',
    parts: [
      ['Epimysium and perimysium', 'The epimysium wraps the whole muscle and the perimysium wraps each fascicle (a bundle of 10–100 fibres); vessels and nerves run in them.'],
      ['Muscle fibre', 'A single multinucleate cell, 10–100 µm across and up to several centimetres long, wrapped in endomysium; satellite cells beside it repair it.'],
      ['Myofibril', 'A cylinder 1 µm across inside the fibre, a chain of sarcomeres end to end; the striations are the sarcomeres lined up.'],
      ['Titin', 'A giant spring-like protein anchoring thick filaments to the Z disc; it keeps the sarcomere centred and gives passive stiffness.'],
    ],
  },
};

/** The explanation beside a close-up, with its own controls, and the way back to the body. */
export function CloseUpPanel() {
  const { def, state, dispatch } = useLab();
  const id = useId();
  const close = effectiveCloseUp(def, state);
  const inside = effectiveInside(def, state);
  if (!close) return null;
  const t = TEXT[close];
  const touring = state.mode === 'tour';
  return (
    <section className="sheet closeup-panel" aria-labelledby={`${id}-title`} data-close-up={close}>
      <div className="detail-head">
        <div>
          <p className="eyebrow">Close-up</p>
          <h2 id={`${id}-title`} className="panel-title">{t.title}</h2>
        </div>
        {!touring && <button type="button" className="secondary" onClick={() => dispatch({ type: 'set-close-up', value: null })}>Back to the body</button>}
      </div>
      <p className="small">{t.body}</p>
      {close === 'sarcomere' && (
        <div className="field slider-field">
          <label htmlFor={`${id}-len`} className="small"><span>Sarcomere length</span> <strong>{inside.length.toFixed(2)} µm · {Math.round(activeForce(inside.length) * 100)} % force</strong></label>
          <input id={`${id}-len`} type="range" min={1.4} max={3.6} step={0.05} value={inside.length} disabled={touring} onChange={(e) => dispatch({ type: 'set-inside', value: { length: Number(e.target.value) } })} />
        </div>
      )}
      {close === 'fibre-types' && (
        <div className="field slider-field">
          <label htmlFor={`${id}-drive`} className="small"><span>Motor drive</span> <strong>{Math.round(inside.drive)} % of maximal</strong></label>
          <input id={`${id}-drive`} type="range" min={0} max={100} step={1} value={inside.drive} disabled={touring} onChange={(e) => dispatch({ type: 'set-inside', value: { drive: Number(e.target.value) } })} />
        </div>
      )}
      <dl className="closeup-parts small">{t.parts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <p className="muted small">Drawn in code at textbook proportions, not a scan; the parts are simplified and not to scale with each other.</p>
    </section>
  );
}

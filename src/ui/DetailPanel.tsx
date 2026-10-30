import { useLab } from '../app/LabContext';
import { depthOf } from '../lab/anchors';
import { describeActions, PLEXUS } from '../lab/muscle-data';
import { DEPTH_TEXT } from '../viewer/palette';

const shortLabel = (label: string) => label.replace(/ \((right|left)\)$/, '');
const FIBRE = (slow: number) => (slow >= 65 ? 'mostly slow-twitch (postural, endurance)' : slow >= 45 ? 'a mixed fibre type' : 'mostly fast-twitch (power)');

/** Context-sensitive explanation of the selected structure, with its sources and model notes. */
export function DetailPanel() {
  const { def, state, dispatch } = useLab();
  const s = state.selected ? def.structures.find((x) => x.id === state.selected) : null;

  if (!s) return null; // details appear only after something is selected

  const sources = s.sources.map((id) => def.sources.find((x) => x.id === id)).filter((x) => x !== undefined);
  const layer = def.layers.find((l) => l.id === s.layer);
  const organ = s.organ ? def.structures.find((x) => x.id === s.organ) : undefined;
  const roleLabel = s.kind === 'group' ? 'Group' : layer?.label;

  return (
    <section className="sheet detail-panel" aria-live="polite" aria-labelledby="detail-title">
      <div className="detail-head">
        <div>
          <p className="eyebrow">{roleLabel}</p>
          <h2 id="detail-title" className="panel-title">{s.label}</h2>
        </div>
        <button type="button" className="ghost" onClick={() => dispatch({ type: 'select', id: null })} aria-label="Clear selection">✕</button>
      </div>
      <p className="chip-row">
        {organ && <button type="button" className="chip-static" onClick={() => dispatch({ type: 'select', id: organ.id })}>{organ.label}</button>}
        {s.side !== 'midline' && <span className="chip-static">{s.side === 'left' ? 'Left' : 'Right'} side of the body</span>}
      </p>
      <p className="lead">{s.summary}</p>
      <h3 className="group-title">Function</h3>
      <p>{s.function}</p>
      {s.muscle && (
        <dl className="readout muscle-facts" data-plexus={s.muscle.plexus}>
          <div><dt>Origin</dt><dd>{s.muscle.origin}</dd></div>
          <div><dt>Insertion</dt><dd>{s.muscle.insertion}</dd></div>
          {s.muscle.nerve !== '-' && <div><dt>Nerve</dt><dd><span className="dot" aria-hidden="true" style={{ background: PLEXUS[s.muscle.plexus].colour }} /> {s.muscle.nerve}{s.muscle.roots !== '-' ? ` (${s.muscle.roots})` : ''}</dd></div>}
          {s.muscle.actions !== '-' && <div><dt>Actions</dt><dd>{describeActions(s.muscle.actions, s.side).map((a) => <span key={`${a.joint}${a.movement}`} className={`chip-static${a.prime ? ' is-prime' : ''}`} title={a.prime ? 'Prime mover' : 'Assists'}>{a.joint}: {a.movement}{a.prime ? ' ★' : ''}</span>)}</dd></div>}
          <div><dt>Blood supply</dt><dd>{s.muscle.blood}</dd></div>
          {s.muscle.slow !== undefined && <div><dt>Fibre mix</dt><dd>about {s.muscle.slow} % slow-twitch: {FIBRE(s.muscle.slow)}</dd></div>}
          {depthOf(s.id) && <div><dt>Layer</dt><dd>{DEPTH_TEXT[depthOf(s.id)!]}</dd></div>}
        </dl>
      )}
      {s.kind === 'group' && s.members && (
        <>
          <h3 className="group-title">{s.members.length === 1 ? 'Shown on' : `${s.members.length} parts`}</h3>
          <ul className="chips">
            {s.members.map((m) => {
              const ms = def.structures.find((x) => x.id === m);
              return ms ? <li key={m}><button type="button" onClick={() => dispatch({ type: 'select', id: m })}>{shortLabel(ms.label)}</button></li> : null;
            })}
          </ul>
        </>
      )}
      {s.related.length > 0 && (
        <>
          <h3 className="group-title">Related</h3>
          <ul className="chips">
            {s.related.map((r) => {
              const rs = def.structures.find((x) => x.id === r);
              return rs ? (
                <li key={r}><button type="button" onClick={() => dispatch({ type: 'select', id: r })}>{rs.label}</button></li>
              ) : null;
            })}
          </ul>
        </>
      )}
      <div className="row">
        <label className="check">
          <input type="checkbox" checked={state.isolate} onChange={(e) => dispatch({ type: 'set-isolate', value: e.target.checked })} />
          Isolate
        </label>
        <button type="button" className="secondary" onClick={() => dispatch({ type: 'camera', preset: state.camera.preset, focus: [s.id] })}>Zoom to</button>
      </div>
      <details className="more">
        <summary>Model note &amp; sources</summary>
        {s.modelNote && <p className="model-note">{s.modelNote}</p>}
        <ol className="sources small">
          {sources.map((src) => (
            <li key={src.id}>{src.url ? <a href={src.url} target="_blank" rel="noopener noreferrer">{src.citation}</a> : src.citation}</li>
          ))}
        </ol>
      </details>
    </section>
  );
}

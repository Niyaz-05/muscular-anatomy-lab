import { useEffect, useRef } from 'react';
import { useLab } from '../app/LabContext';
import { LAYER_COLOUR } from '../viewer/palette';

/**
 * Source, scope and credits, kept off the main screen. The BodyParts3D and HuBMAP attribution
 * required by CC BY 4.0 lives here and is reachable from the ⓘ button and the "Source & credits" link.
 */
export function AboutSheet({ onClose }: { onClose: () => void }) {
  const { def } = useLab();
  const title = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    title.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="about-sheet glass" role="dialog" aria-modal="true" aria-labelledby="about-title" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="ghost sheet-close" onClick={onClose} aria-label="Close">✕</button>
        <p className="eyebrow">Source &amp; scope</p>
        <h2 id="about-title" className="sheet-title" tabIndex={-1} ref={title}>About this lab</h2>
        <p>An interactive 3D lab of the human muscular system for university anatomy and physiology. {def.summary}</p>

        <h3 className="group-title">You will learn to</h3>
        <ul className="objectives">{def.learningObjectives.map((o) => <li key={o.id}>{o.text}</li>)}</ul>

        <h3 className="group-title">Colours</h3>
        <p className="small muted">
          “Real” shows dark red muscle (each a little different so neighbours can be told apart) and pale tendons. “Regions” gives each region a colour;
          “Nerve” colours by the nerve family that supplies the muscle; “Depth” by superficial, intermediate or deep; “Fibres” by the typical share of slow-twitch fibres.
          In Movement, prime movers are red, assistants orange and antagonists blue; in Injuries the affected muscles are crimson.
        </p>
        <p className="legend-row">{def.layers.map((l) => <span key={l.id}><span className="dot" style={{ background: LAYER_COLOUR[l.id] }} aria-hidden="true" /> {l.label}</span>)}</p>

        <h3 className="group-title">Simulations</h3>
        <ul className="small">
          <li><strong>Movement:</strong> the bones turn about measured joint centres (normal ranges from the AAOS tables); each muscle vertex follows its two nearest bones, so muscles bend with the skeleton. A muscle’s role is read from its actions in the table (prime mover, assistant, antagonist) and its length change from the movement of its ends.</li>
          <li><strong>Inside a muscle:</strong> the length–tension curve (Gordon, Huxley and Julian 1966), the Hill force–velocity curve (1938), a twitch summing to a tetanus from a calcium-activation model, and recruitment by the size principle (Henneman 1965); six close-ups drawn in code.</li>
          <li><strong>Exercise:</strong> three energy systems with an oxygen-uptake delay and the critical-power model (Monod and Scherrer 1965; Jones 2010), the muscles each activity uses, typical training adaptations (Hughes 2018) and delayed-onset soreness (Cheung 2003; McHugh 2003).</li>
          <li><strong>Injuries and disorders:</strong> thirteen conditions on the real muscles with typical presentation, course and return times (Ekstrand 2012), with readers for creatine kinase and the MRC power grade (MRC 1976).</li>
        </ul>

        <h3 className="group-title">The 3D model</h3>
        <p className="small">
          <strong>Muscles:</strong> <a href="https://doi.org/10.1093/nar/gkn613" target="_blank" rel="noopener noreferrer">BodyParts3D 4.0</a> (Database Center for Life Science), CC BY 4.0: about 400 parts of one adult male, grouped into muscles here, simplified and bound to the bones.
          <strong> Modelled in code:</strong> the latissimus dorsi, rectus abdominis, internal oblique, transversus abdominis, quadratus lumborum, masseter, temporalis, medial and lateral pterygoids, occipitofrontalis, orbicularis oculi and oris, zygomaticus major and buccinator are missing from BodyParts3D 4.0 (checked against its official parts list); they are shaped from their real attachments on this body’s bones and carry a “modelled” note.
          <strong> Skeleton:</strong> the same lab’s BodyParts3D bones (with the HuBMAP coccyx and knee ligaments), shown behind the muscles and used as the rig. Every close-up is drawn in code. Full provenance and hashes: <code>ATTRIBUTION.md</code>.
        </p>

        <h3 className="group-title">Limits</h3>
        <ul className="small">{def.disclaimers.map((d) => <li key={d}>{d}</li>)}</ul>
      </section>
    </div>
  );
}

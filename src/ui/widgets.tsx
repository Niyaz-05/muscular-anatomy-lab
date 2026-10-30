import { useId } from 'react';
import { useLab } from '../app/LabContext';
import type { CloseUp } from '../contract/schema';
import { CLOSE_UP_LABEL } from './CloseUpPanel';

export function Radios<T extends string | number>({ label, options, value, onChange }: { label: string; options: readonly { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="seg-toggle wrap" role="radiogroup" aria-label={label}>
      {options.map((o) => <button key={String(o.id)} type="button" role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)}>{o.label}</button>)}
    </div>
  );
}
export function Slider({ label, min, max, step, value, onChange, text }: { label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void; text: string }) {
  const id = useId();
  return (
    <div className="field slider-field">
      <label htmlFor={id} className="small"><span>{label}</span> <strong>{text}</strong></label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} aria-valuetext={text} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}
export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <label className="check"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />{label}</label>;
}
export function Head({ title }: { title: string }) {
  const id = useId();
  return <div className="detail-head"><h2 id={id} className="panel-title">{title}</h2></div>;
}
export function CloseUpButtons({ ids }: { ids: CloseUp[] }) {
  const { dispatch } = useLab();
  return <div className="button-row">{ids.map((c) => <button key={c} type="button" className="secondary" onClick={() => dispatch({ type: 'set-close-up', value: c })}>Close-up: {CLOSE_UP_LABEL[c]}</button>)}</div>;
}
export const f0 = (x: number) => Math.round(x).toLocaleString('en-GB');
export const f1 = (x: number) => x.toFixed(1);
export const f2 = (x: number) => x.toFixed(2);

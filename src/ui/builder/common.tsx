import type { ReactNode } from 'react';
import { listModels } from '@/models/registry';
import type { Design } from '@/models/types';

export type Update = (fn: (d: Design) => void) => void;

export interface StepProps {
  design: Design;
  update: Update;
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  testid,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  testid?: string;
}) {
  return (
    <div className="bd-field" data-testid={testid}>
      <span className="bd-label" id={`seg-${label}`}>
        {label}
      </span>
      <div className="bd-seg" role="radiogroup" aria-labelledby={`seg-${label}`}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            disabled={o.disabled}
            data-testid={testid ? `${testid}-${o.value}` : undefined}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  testid,
  display,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
  testid?: string;
  display?: string;
  hint?: string;
}) {
  return (
    <label className="ctl bd-field" title={hint}>
      <span className="ctl-label">
        {label}
        <output>{display ?? `${Number(value.toFixed(2))}${unit ? ` ${unit}` : ''}`}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        data-testid={testid}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function Dots({ label, n }: { label: string; n: number }) {
  return (
    <span className="bd-dots" role="img" aria-label={`${label}: ${n} of 5`} title={`${label}: ${n}/5`}>
      <span className="bd-dots-label" aria-hidden="true">
        {label}
      </span>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= n ? 'on' : ''} aria-hidden="true" />
      ))}
    </span>
  );
}

export function ModelCard({
  name,
  summary,
  selected,
  disabled,
  note,
  onSelect,
  testid,
  children,
}: {
  name: string;
  summary: string;
  selected: boolean;
  disabled?: boolean;
  note?: string;
  onSelect: () => void;
  testid: string;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`bd-card${selected ? ' sel' : ''}${disabled ? ' dim' : ''}`}
      aria-pressed={selected}
      disabled={disabled && !selected}
      data-testid={testid}
      onClick={onSelect}
    >
      <strong>{name}</strong>
      <span className="bd-card-sum">{summary}</span>
      {children}
      {note && <span className="bd-card-note">{note}</span>}
    </button>
  );
}

export function MetalSelect({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const metals = listModels('metal');
  const cur = metals.find((m) => m.id === value);
  const families = [...new Set(metals.map((m) => m.family))];
  return (
    <div className="bd-field bd-metal">
      <label className="bd-label" htmlFor={id}>
        {label}
      </label>
      <div className="bd-metal-row">
        <span className="bd-dot" style={{ background: cur?.color ?? 'transparent' }} aria-hidden="true" />
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          {families.map((f) => (
            <optgroup key={f} label={f.replace('-', ' ')}>
              {metals
                .filter((m) => m.family === f)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </div>
    </div>
  );
}

export function FinishSelect({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="bd-field">
      <label className="bd-label" htmlFor={id}>
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {listModels('finish').map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
    </div>
  );
}

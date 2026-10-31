import type { Control, Params } from '@/models/types';

/** Renders a model's `controls` and reports value changes. Missing values fall back to `defaults`. */
export function ParamControls({
  controls,
  values,
  defaults,
  onChange,
}: {
  controls: Control[];
  values: Params;
  defaults: Params;
  onChange: (key: string, value: number | string | boolean) => void;
}) {
  if (controls.length === 0) return <p className="muted">This part has no extra options.</p>;
  return (
    <div className="controls">
      {controls.map((c) => {
        const v = values[c.key] ?? defaults[c.key];
        const id = `ctl-${c.key}`;
        if (c.type === 'number') {
          const n = typeof v === 'number' ? v : c.min;
          return (
            <label key={c.key} className="ctl" htmlFor={id} title={c.help}>
              <span className="ctl-label">
                {c.label}
                <output>
                  {Number(n.toFixed(2))}
                  {c.unit ? ` ${c.unit}` : ''}
                </output>
              </span>
              <input id={id} type="range" min={c.min} max={c.max} step={c.step} value={n} onChange={(e) => onChange(c.key, Number(e.target.value))} />
            </label>
          );
        }
        if (c.type === 'select') {
          return (
            <label key={c.key} className="ctl" htmlFor={id} title={c.help}>
              <span className="ctl-label">{c.label}</span>
              <select id={id} value={String(v ?? c.options[0]?.value)} onChange={(e) => onChange(c.key, e.target.value)}>
                {c.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          );
        }
        return (
          <label key={c.key} className="ctl ctl-toggle" htmlFor={id} title={c.help}>
            <input id={id} type="checkbox" checked={Boolean(v)} onChange={(e) => onChange(c.key, e.target.checked)} />
            <span>{c.label}</span>
          </label>
        );
      })}
    </div>
  );
}

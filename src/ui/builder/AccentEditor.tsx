import { findModel, listModels } from '@/models/registry';
import type { AccentStoneSpec } from '@/models/types';
import { Slider } from './common';

/** Edits one accent-stone spec (halo melee, side stones, pave). */
export function AccentEditor({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: AccentStoneSpec;
  onChange: (patch: Partial<AccentStoneSpec>) => void;
}) {
  const gems = listModels('gem');
  const gem = findModel('gem', value.material);
  return (
    <div className="controls">
      <div className="bd-field">
        <label className="bd-label" htmlFor={`${idPrefix}-gem`}>
          Material
        </label>
        <select
          id={`${idPrefix}-gem`}
          value={value.material}
          onChange={(e) => {
            const g = findModel('gem', e.target.value);
            onChange({ material: e.target.value, color: g?.defaultColor ?? value.color });
          }}
        >
          {[false, true].map((lab) => (
            <optgroup key={String(lab)} label={lab ? 'Lab-grown and synthetic' : 'Natural'}>
              {gems
                .filter((g) => g.lab === lab)
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div className="bd-field">
        <span className="bd-label">Color</span>
        <div className="bd-swatches" role="group" aria-label="Accent color">
          {(gem?.colors ?? []).map((c) => (
            <button
              key={c.id}
              type="button"
              className="swatch"
              style={{ background: c.hex }}
              aria-pressed={value.color === c.id}
              aria-label={c.name}
              title={c.name}
              onClick={() => onChange({ color: c.id })}
            />
          ))}
        </div>
      </div>
      <div className="bd-field">
        <label className="bd-label" htmlFor={`${idPrefix}-cut`}>
          Cut
        </label>
        <select id={`${idPrefix}-cut`} value={value.cut} onChange={(e) => onChange({ cut: e.target.value })}>
          {listModels('cut').map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <Slider label="Stone size" value={value.sizeMm} min={0.8} max={4} step={0.1} unit="mm" onChange={(v) => onChange({ sizeMm: v })} />
    </div>
  );
}

import { findModel, listModels } from '@/models/registry';
import { dimsFromCarat } from '@/models/stoneMath';
import type { StepProps } from './common';
import { ModelCard, Slider } from './common';

const MIN_CT = 0.25;
const MAX_CT = 5;
const toT = (ct: number) => (100 * Math.log(ct / MIN_CT)) / Math.log(MAX_CT / MIN_CT);
const fromT = (t: number) => {
  const ct = MIN_CT * Math.pow(MAX_CT / MIN_CT, t / 100);
  return Number((ct < 1 ? Math.round(ct * 20) / 20 : Math.round(ct * 10) / 10).toFixed(2));
};

export function StoneStep({ design, update }: StepProps) {
  const c = design.engagement.center;
  const gem = findModel('gem', c.material);
  const cut = findModel('cut', c.cut);
  const gems = listModels('gem');
  const cuts = listModels('cut');
  const clarities = [...listModels('clarity')].sort((a, b) => a.rank - b.rank);
  const grades = listModels('color-grade');
  const diamondLike = grades.length > 0 && (c.colorGrade !== undefined || !!gem?.colors.some((x) => x.id === 'colorless'));
  let dims = '';
  if (gem && cut) {
    const d = dimsFromCarat(cut, gem, c);
    dims = `${d.length.toFixed(2)} × ${d.width.toFixed(2)} × ${d.depth.toFixed(2)} mm`;
  }
  return (
    <div className="controls" data-testid="panel-stone">
      <div className="bd-field">
        <label className="bd-label" htmlFor="st-gem">
          Gem material
        </label>
        <select
          id="st-gem"
          value={c.material}
          onChange={(e) =>
            update((d) => {
              const g = findModel('gem', e.target.value);
              if (!g) return;
              const s = d.engagement.center;
              s.material = g.id;
              if (!g.colors.some((x) => x.id === s.color)) s.color = g.defaultColor;
              if (g.colors.some((x) => x.id === 'colorless') && grades[0]) s.colorGrade = s.colorGrade ?? grades[0].id;
              else delete s.colorGrade;
            })
          }
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
        {gem && <p className="muted bd-small">{gem.summary}</p>}
      </div>

      <div className="bd-field">
        <span className="bd-label">Color</span>
        <div className="bd-swatches" role="group" aria-label="Stone color">
          {(gem?.colors ?? []).map((col) => (
            <button
              key={col.id}
              type="button"
              className="swatch"
              style={{ background: col.hex }}
              aria-pressed={c.color === col.id}
              aria-label={col.name}
              title={col.name}
              data-testid={`swatch-${col.id}`}
              onClick={() => update((d) => void (d.engagement.center.color = col.id))}
            />
          ))}
        </div>
      </div>

      <div className="bd-field">
        <span className="bd-label">Cut</span>
        <div className="bd-cards" role="group" aria-label="Cut">
          {cuts.map((k) => (
            <ModelCard
              key={k.id}
              testid={`card-cut-${k.id}`}
              name={k.name}
              summary={k.summary}
              selected={c.cut === k.id}
              onSelect={() =>
                update((d) => {
                  const s = d.engagement.center;
                  s.cut = k.id;
                  if (s.aspect !== undefined) s.aspect = Math.min(k.aspectRange[1], Math.max(k.aspectRange[0], s.aspect));
                })
              }
            />
          ))}
        </div>
      </div>

      <Slider
        label="Carat"
        value={toT(c.carat)}
        min={0}
        max={100}
        step={0.5}
        display={`${c.carat.toFixed(2)} ct${dims ? ` · ${dims}` : ''}`}
        testid="carat-slider"
        onChange={(t) => update((d) => void (d.engagement.center.carat = fromT(t)))}
      />

      {cut && cut.aspectRange[0] !== cut.aspectRange[1] && (
        <Slider
          label="Aspect ratio (length : width)"
          value={c.aspect ?? cut.defaultAspect}
          min={cut.aspectRange[0]}
          max={cut.aspectRange[1]}
          step={0.01}
          testid="aspect-slider"
          onChange={(v) => update((d) => void (d.engagement.center.aspect = v))}
        />
      )}

      <div className="bd-field">
        <label className="bd-label" htmlFor="st-clarity">
          Clarity
        </label>
        <select id="st-clarity" value={c.clarity} onChange={(e) => update((d) => void (d.engagement.center.clarity = e.target.value))}>
          {clarities.map((k) => (
            <option key={k.id} value={k.id}>
              {k.code} · {k.name}
            </option>
          ))}
        </select>
      </div>

      {diamondLike && (
        <div className="bd-field">
          <label className="bd-label" htmlFor="st-grade">
            Color grade
          </label>
          <select id="st-grade" value={c.colorGrade ?? grades[0]?.id} onChange={(e) => update((d) => void (d.engagement.center.colorGrade = e.target.value))}>
            {grades.map((g) => (
              <option key={g.id} value={g.id}>
                {g.letters} · {g.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

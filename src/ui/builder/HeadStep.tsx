import { getModel, listModels } from '@/models/registry';
import { Segmented, Slider, type StepProps } from './common';
import { PartPicker, ratingDots } from './PartStep';

export function HeadStep({ design, update }: StepProps) {
  const e = design.engagement;
  const heads = listModels('head');
  const cutName = (() => {
    try {
      return getModel('cut', e.center.cut).name;
    } catch {
      return e.center.cut;
    }
  })();
  const p = e.placement;
  const setP = <K extends keyof typeof p>(k: K, v: (typeof p)[K]) =>
    update((d) => void (d.engagement.placement[k] = v));
  return (
    <div className="controls" data-testid="panel-head">
      <PartPicker
        kind="Head styles"
        models={heads}
        selectedId={e.head.id}
        testPrefix="card-head"
        params={e.head.params}
        onSelect={(m) =>
          update((d) => {
            d.engagement.head.id = m.id;
            d.engagement.head.params = {};
          })
        }
        onParam={(k, v) => update((d) => void (d.engagement.head.params[k] = v))}
        incompatible={(m) =>
          m.fitsCuts === 'all' || m.fitsCuts.includes(e.center.cut)
            ? undefined
            : `Not made for ${cutName} stones`
        }
        extra={(m) => (
          <>
            <span className="bd-card-extra">{m.extraStones === '0' ? 'No extra stones' : m.extraStones}</span>
            {ratingDots(m)}
          </>
        )}
      />
      <fieldset className="bd-group">
        <legend>Placement</legend>
        <div className="controls">
          <Segmented
            label="Orientation"
            testid="orientation"
            value={p.orientation}
            options={[
              { value: 'north-south', label: 'North–south' },
              { value: 'east-west', label: 'East–west' },
            ]}
            onChange={(v) => setP('orientation', v)}
          />
          <Slider
            label="Raise (setting height)"
            value={p.raise}
            min={0}
            max={5}
            step={0.1}
            unit="mm"
            onChange={(v) => setP('raise', v)}
          />
          <Slider
            label="Tilt"
            value={p.tilt}
            min={-25}
            max={25}
            step={1}
            unit="°"
            onChange={(v) => setP('tilt', v)}
          />
          <Slider
            label="Rotate"
            value={p.rotate}
            min={-45}
            max={45}
            step={1}
            unit="°"
            onChange={(v) => setP('rotate', v)}
          />
          <Slider
            label="Offset along band"
            value={p.offset}
            min={-4}
            max={4}
            step={0.1}
            unit="mm"
            onChange={(v) => setP('offset', v)}
          />
        </div>
      </fieldset>
    </div>
  );
}

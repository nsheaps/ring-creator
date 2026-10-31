import { listModels } from '@/models/registry';
import { defaultBand } from '@/state/defaults';
import { MetalSelect, Slider, type StepProps } from './common';
import { PartPicker } from './PartStep';

export function BandStep({ design, update }: StepProps) {
  const b = design.band;
  return (
    <div className="controls" data-testid="panel-band">
      <label className="ctl ctl-toggle">
        <input
          type="checkbox"
          data-testid="toggle-band"
          checked={!!b}
          onChange={(e) =>
            update((d) => {
              d.band = e.target.checked ? (d.band ?? defaultBand()) : null;
            })
          }
        />
        <span>Include matching band</span>
      </label>
      {b ? (
        <>
          <PartPicker
            kind="Band styles"
            models={listModels('band')}
            selectedId={b.style}
            testPrefix="card-band"
            params={b.params}
            onSelect={(m) =>
              update((d) => {
                if (!d.band) return;
                d.band.style = m.id;
                d.band.params = {};
              })
            }
            onParam={(k, v) => update((d) => void (d.band && (d.band.params[k] = v)))}
            extra={(m) => (
              <span className="bd-card-extra">
                {m.audience === 'any' ? 'Any wearer' : m.audience === 'men' ? 'Men’s' : 'Women’s'}
                {m.hasStones ? ' · stones' : ''}
                {m.contourCapable ? ' · contour' : ''}
              </span>
            )}
          />
          <Slider
            label="Width"
            value={b.widthMm}
            min={1.2}
            max={8}
            step={0.1}
            unit="mm"
            testid="band-width"
            onChange={(v) => update((d) => void (d.band && (d.band.widthMm = v)))}
          />
          <Slider
            label="Thickness"
            value={b.thicknessMm}
            min={1}
            max={3.2}
            step={0.1}
            unit="mm"
            testid="band-thickness"
            onChange={(v) => update((d) => void (d.band && (d.band.thicknessMm = v)))}
          />
          {/mixed|inlay/.test(b.style) && (
            <MetalSelect
              id="bd-metal2"
              label="Second metal (inlay / two-tone)"
              value={b.metal2}
              onChange={(v) => update((d) => void (d.band && (d.band.metal2 = v)))}
            />
          )}
        </>
      ) : (
        <p className="muted">Engagement ring only. Turn the band on to choose a style.</p>
      )}
    </div>
  );
}

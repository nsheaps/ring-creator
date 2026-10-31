import { innerDiameterMm } from '@/models/stoneMath';
import { Segmented, type StepProps } from './common';

const SIZES = Array.from({ length: 21 }, (_, i) => 3 + i * 0.5);

export function FitStep({ design, update }: StepProps) {
  return (
    <div className="controls" data-testid="panel-fit">
      <div className="bd-field">
        <label className="bd-label" htmlFor="fit-size">
          Ring size (US)
        </label>
        <select
          id="fit-size"
          data-testid="select-ring-size"
          value={design.ringSizeUS}
          onChange={(e) => update((d) => void (d.ringSizeUS = Number(e.target.value)))}
        >
          {SIZES.map((s) => (
            <option key={s} value={s}>
              {s} · {innerDiameterMm(s).toFixed(1)} mm
            </option>
          ))}
        </select>
      </div>
      {design.band ? (
        <Segmented
          label="Band fit"
          testid="band-fit"
          value={design.band.fit}
          options={[
            { value: 'auto', label: 'Auto' },
            { value: 'flush', label: 'Flush' },
            { value: 'contour', label: 'Contour' },
          ]}
          onChange={(v) => update((d) => void (d.band && (d.band.fit = v)))}
        />
      ) : (
        <p className="muted bd-small">
          Add a matching band to choose how it sits against the engagement ring.
        </p>
      )}
      <p className="muted bd-small">
        Auto lets contour-capable bands curve around the head; flush keeps the band straight.
      </p>
    </div>
  );
}

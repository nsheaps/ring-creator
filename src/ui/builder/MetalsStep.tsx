import { listModels } from '@/models/registry';
import { FinishSelect, MetalSelect, type StepProps } from './common';

export function metalsDiffer(design: StepProps['design']): boolean {
  const e = design.engagement;
  const set = new Set([e.head.metal, e.shank.metal]);
  if (design.band) {
    set.add(design.band.metal);
    if (/mixed|inlay/.test(design.band.style)) set.add(design.band.metal2);
  }
  return set.size > 1;
}

export function MetalsStep({ design, update }: StepProps) {
  const e = design.engagement;
  const b = design.band;
  const metals = listModels('metal');
  const matchAll = (id: string) =>
    update((d) => {
      d.engagement.head.metal = id;
      d.engagement.shank.metal = id;
      if (d.band) {
        d.band.metal = id;
        d.band.metal2 = id;
      }
    });
  return (
    <div className="controls" data-testid="panel-metals">
      {metalsDiffer(design) && (
        <p>
          <span className="chip" data-testid="chip-mixed">
            Mixed metals
          </span>{' '}
          <span className="muted bd-small">
            Different metals meet at the head and band, so ask your jeweler about solder lines and wear.
          </span>
        </p>
      )}
      <MetalSelect
        id="mt-head"
        label="Head metal"
        value={e.head.metal}
        onChange={(v) => update((d) => void (d.engagement.head.metal = v))}
      />
      <MetalSelect
        id="mt-shank"
        label="Shank metal"
        value={e.shank.metal}
        onChange={(v) => update((d) => void (d.engagement.shank.metal = v))}
      />
      {b ? (
        <>
          <MetalSelect
            id="mt-band"
            label="Band metal"
            value={b.metal}
            onChange={(v) => update((d) => void (d.band && (d.band.metal = v)))}
          />
          <MetalSelect
            id="mt-band2"
            label="Band accent metal"
            value={b.metal2}
            onChange={(v) => update((d) => void (d.band && (d.band.metal2 = v)))}
          />
        </>
      ) : (
        <p className="muted bd-small">Turn on the matching band in the Band step to choose its metals.</p>
      )}
      <div className="bd-field">
        <span className="bd-label">Match all to</span>
        <div className="bd-swatches" role="group" aria-label="Match all metals to">
          {metals.map((m) => (
            <button
              key={m.id}
              type="button"
              className="swatch"
              style={{ background: m.color }}
              aria-label={`Match all to ${m.name}`}
              title={`Match all to ${m.name}`}
              data-testid={`match-${m.id}`}
              onClick={() => matchAll(m.id)}
            />
          ))}
        </div>
      </div>
      <FinishSelect
        id="mt-fin"
        label="Engagement ring finish"
        value={e.finish}
        onChange={(v) => update((d) => void (d.engagement.finish = v))}
      />
      {b && (
        <FinishSelect
          id="mt-fin-b"
          label="Band finish"
          value={b.finish}
          onChange={(v) => update((d) => void (d.band && (d.band.finish = v)))}
        />
      )}
    </div>
  );
}

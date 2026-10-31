import type { StepProps } from './common';
import { AccentEditor } from './AccentEditor';

export function AccentsStep({ design, update }: StepProps) {
  return (
    <div className="controls" data-testid="panel-accents">
      <fieldset className="bd-group">
        <legend>Engagement ring accents</legend>
        <p className="muted bd-small">Used by halos, side stones and pavé on the head or shank.</p>
        <AccentEditor idPrefix="ac-e" value={design.engagement.accentStone} onChange={(patch) => update((d) => void Object.assign(d.engagement.accentStone, patch))} />
      </fieldset>
      {design.band ? (
        <fieldset className="bd-group">
          <legend>Band accents</legend>
          <AccentEditor idPrefix="ac-b" value={design.band.accentStone} onChange={(patch) => update((d) => void (d.band && Object.assign(d.band.accentStone, patch)))} />
        </fieldset>
      ) : (
        <p className="muted bd-small">Add a matching band to set its accent stones.</p>
      )}
    </div>
  );
}

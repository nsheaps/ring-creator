import { listModels } from '@/models/registry';
import type { StepProps } from './common';
import { PartPicker, shankDots } from './PartStep';

export function ShankStep({ design, update }: StepProps) {
  const s = design.engagement.shank;
  return (
    <div data-testid="panel-shank">
      <PartPicker
        kind="Shank styles"
        models={listModels('shank')}
        selectedId={s.id}
        testPrefix="card-shank"
        params={s.params}
        onSelect={(m) =>
          update((d) => {
            d.engagement.shank.id = m.id;
            d.engagement.shank.params = {};
          })
        }
        onParam={(k, v) => update((d) => void (d.engagement.shank.params[k] = v))}
        extra={(m) => (
          <>
            {m.hasStones && <span className="bd-card-extra">Set with stones</span>}
            {shankDots(m)}
          </>
        )}
      />
    </div>
  );
}

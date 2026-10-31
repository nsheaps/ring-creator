import { listModels } from '@/models/registry';
import type { BandStyleModel, HeadModel, ShankModel, Params } from '@/models/types';
import { ParamControls } from '@/ui/Controls';
import { Dots, ModelCard, type StepProps } from './common';

type Part = HeadModel | ShankModel | BandStyleModel;

/** Card grid + parameter controls shared by the Head, Shank and Band steps. */
export function PartPicker<T extends Part>({
  kind,
  models,
  selectedId,
  testPrefix,
  onSelect,
  params,
  onParam,
  incompatible,
  extra,
}: {
  kind: string;
  models: T[];
  selectedId: string;
  testPrefix: string;
  onSelect: (m: T) => void;
  params: Params;
  onParam: (key: string, v: number | string | boolean) => void;
  incompatible?: (m: T) => string | undefined;
  extra?: (m: T) => React.ReactNode;
}) {
  const sel = models.find((m) => m.id === selectedId);
  return (
    <div className="controls">
      <div className="bd-cards" role="group" aria-label={kind}>
        {models.map((m) => {
          const note = incompatible?.(m);
          return (
            <ModelCard
              key={m.id}
              testid={`${testPrefix}-${m.id}`}
              name={m.name}
              summary={m.summary}
              selected={m.id === selectedId}
              disabled={!!note}
              note={note}
              onSelect={() => onSelect(m)}
            >
              {extra?.(m)}
            </ModelCard>
          );
        })}
      </div>
      {sel && (
        <fieldset className="bd-group">
          <legend>{sel.name} options</legend>
          <ParamControls controls={sel.controls} values={params} defaults={sel.params} onChange={onParam} />
        </fieldset>
      )}
    </div>
  );
}

export function ratingDots(m: HeadModel) {
  return (
    <span className="bd-rates">
      <Dots label="Protection" n={m.protection} />
      <Dots label="Brilliance" n={m.brilliance} />
      <Dots label="Upkeep" n={m.upkeep} />
    </span>
  );
}

export function shankDots(m: ShankModel) {
  return (
    <span className="bd-rates">
      <Dots label="Comfort" n={m.comfort} />
      <Dots label="Durability" n={m.durability} />
    </span>
  );
}

export { listModels };
export type { StepProps };

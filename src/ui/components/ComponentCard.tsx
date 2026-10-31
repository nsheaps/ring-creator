import { useState } from 'react';
import { asset } from '@/router';
import type { Model } from '@/models/types';

/** CI-generated picture of a component; hides itself when the file is not there. */
export function ShotImage({ model, className }: { model: Model; className?: string }) {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  return (
    <img
      className={className}
      src={asset(`screenshots/components/${model.kind}/${model.id}.png`)}
      alt={`${model.name}, rendered`}
      loading="lazy"
      onError={() => setOk(false)}
    />
  );
}

export function ComponentCard({ model }: { model: Model }) {
  return (
    <a className="card rf-card" href={`#/components/${model.kind}/${model.id}`} data-testid={`component-card-${model.id}`}>
      <div className="rf-card-shot">
        <ShotImage model={model} />
      </div>
      <h3>{model.name}</h3>
      <p className="muted">{model.summary}</p>
    </a>
  );
}

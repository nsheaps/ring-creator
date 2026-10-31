import { useEffect } from 'react';
import { findModel } from '@/models/registry';
import type { ModelKind } from '@/models/types';
import { exampleDesigns } from '@/models/data/examples';
import { ModelViewer } from '@/ui/ModelViewer';
import { DesignViewer } from '@/ui/DesignViewer';
import { useRoute } from '@/router';

/** Screenshot harness: `#/shot/<kind>/<id>` or `#/shot/example/<id>`. Not linked from the UI; scripts/capture-screenshots.ts drives it. */
export default function Shot() {
  const { path } = useRoute();
  const [, kind, id] = path;
  useEffect(() => {
    document.body.style.margin = '0';
    const w = window as unknown as { __shotReady?: boolean };
    w.__shotReady = false;
    const t = window.setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => (w.__shotReady = true))), 900);
    return () => window.clearTimeout(t);
  }, [kind, id]);

  let body = <p style={{ color: '#fff' }}>Unknown shot</p>;
  if (kind === 'example') {
    const ex = exampleDesigns.find((d) => d.id === id);
    if (ex) body = <DesignViewer design={ex} view={ex.view ?? (ex.band ? 'set' : 'ring')} />;
  } else if (kind) {
    const model = findModel(kind as ModelKind, id ?? '');
    if (model) body = <ModelViewer model={model} autoRotate={false} />;
  }
  return (
    <div id="shot" style={{ width: 720, height: 540 }}>
      <div style={{ width: '100%', height: '100%', display: 'grid' }}>{body}</div>
    </div>
  );
}

import { useEffect, useRef } from 'react';
import { findModel } from '@/models/registry';
import type { ModelKind } from '@/models/types';
import { exampleDesigns } from '@/models/data/examples';
import { ModelViewer } from '@/ui/ModelViewer';
import { DesignViewer, type DesignViewerHandle } from '@/ui/DesignViewer';
import type { CameraPreset } from '@/scene/RingViewer';
import { decodeDesign } from '@/state/store';
import { useRoute } from '@/router';

/**
 * Screenshot harness (not linked from the UI; scripts/capture-screenshots.ts and scripts/render.ts drive it).
 *   #/shot/<kind>/<id>                       one component model
 *   #/shot/example/<id>                      one example ring
 *   #/shot/design?d=<encodeDesign()>         any design
 * Query: cam=3/4|front|top|side, focus=1 (zoom on the stone/setting), view=ring|band|set, size=WxH
 */
export default function Shot() {
  const { path, query } = useRoute();
  const [, kind, id] = path;
  const ref = useRef<DesignViewerHandle>(null);
  // Example and design shots default to a close three-quarter view on the stone so rings are easy to tell apart.
  const isDesign = kind === 'example' || kind === 'design';
  const viewParam = query.get('view');
  const exView = kind === 'example' ? exampleDesigns.find((d) => d.id === id)?.view : undefined;
  const bandOnly = (viewParam ?? exView) === 'band';
  const cam = (query.get('cam') as CameraPreset | null) ?? (isDesign ? '3/4' : null);
  const focus = query.has('focus') ? query.get('focus') === '1' : isDesign && !bandOnly;
  const size = (query.get('size') ?? '720x540').split('x').map(Number);
  const [w, h] = [size[0] || 720, size[1] || 540];

  useEffect(() => {
    document.body.style.margin = '0';
    const win = window as unknown as { __shotReady?: boolean };
    win.__shotReady = false;
    const started = performance.now();
    let t = 0;
    const settle = () =>
      window.setTimeout(
        () => requestAnimationFrame(() => requestAnimationFrame(() => (win.__shotReady = true))),
        300,
      );
    const tick = () => {
      // Wait for the viewer to have built its content (heavy rings can take a while), then frame it.
      const waited = performance.now() - started;
      if (cam) ref.current?.preset(cam);
      const framed = !focus || (ref.current?.focusHead(true) ?? false);
      if (framed || waited > 15000) settle();
      else t = window.setTimeout(tick, 150);
    };
    t = window.setTimeout(tick, 900);
    return () => window.clearTimeout(t);
  }, [kind, id, cam, focus]);

  let body = <p style={{ color: '#fff' }}>Unknown shot</p>;
  const view = (query.get('view') as 'ring' | 'band' | 'set' | null) ?? undefined;
  if (kind === 'example') {
    const ex = exampleDesigns.find((d) => d.id === id);
    if (ex)
      body = <DesignViewer ref={ref} design={ex} view={view ?? ex.view ?? (ex.band ? 'set' : 'ring')} />;
  } else if (kind === 'design') {
    const d = decodeDesign(query.get('d') ?? '');
    if (d) body = <DesignViewer ref={ref} design={d} view={view ?? (d.band ? 'set' : 'ring')} />;
  } else if (kind) {
    const model = findModel(kind as ModelKind, id ?? '');
    if (model) body = <ModelViewer model={model} autoRotate={false} />;
  }
  return (
    <div id="shot" style={{ width: w, height: h }}>
      <div style={{ width: '100%', height: '100%', display: 'grid' }}>{body}</div>
    </div>
  );
}

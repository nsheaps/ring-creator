import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RingView } from '@/geometry/assemble';
import { exampleDesigns } from '@/models/data/examples';
import { findModel } from '@/models/registry';
import type { Design, Model, ModelKind } from '@/models/types';
import { asset } from '@/router';
import { defaultDesign } from '@/state/defaults';
import { encodeDesign } from '@/state/store';
import { DesignViewer, type DesignViewerHandle } from '@/ui/DesignViewer';
import { ModelViewer, designForModel } from '@/ui/ModelViewer';
import type { EmbedSpec } from './embed';
import { acquireSlot } from './slots';

const VIEWS: RingView[] = ['ring', 'band', 'set'];
const asView = (v: string | undefined, fallback: RingView): RingView =>
  VIEWS.includes(v as RingView) ? (v as RingView) : fallback;

interface Resolved {
  design: Design;
  view: RingView;
  poster?: string;
  title: string;
  /** Component embeds on kinds without a ring context (a bare stone). */
  model?: Model;
}

export function resolveEmbed(spec: EmbedSpec): Resolved | null {
  const a = spec.attrs;
  if (spec.kind === 'ring') {
    const ex = exampleDesigns.find((d) => d.id === spec.target);
    if (!ex) return null;
    return {
      design: ex,
      view: asView(a.view, 'set'),
      poster: asset(`screenshots/examples/${ex.id}.png`),
      title: ex.name,
    };
  }
  if (spec.kind === 'component') {
    const [kind, id] = spec.target.split(':');
    const model = findModel(kind as ModelKind, id) as Model | undefined;
    if (!model) return null;
    const setup = designForModel(model);
    return {
      design: setup?.design ?? defaultDesign(model.name),
      view: asView(a.view, setup?.view ?? 'ring'),
      poster: asset(`screenshots/components/${model.kind}/${model.id}.png`),
      title: model.name,
      model: setup ? undefined : model,
    };
  }
  const d = defaultDesign(a.name ?? 'Embedded ring');
  const e = d.engagement;
  const ok = (k: ModelKind, v: string | undefined) => (v && findModel(k, v) ? v : undefined);
  const head = ok('head', a.head);
  if (head) e.head.id = head;
  const shank = ok('shank', a.shank);
  if (shank) e.shank.id = shank;
  const metal = ok('metal', a.metal);
  if (metal) e.head.metal = e.shank.metal = metal;
  const cut = ok('cut', a.cut);
  if (cut) e.center.cut = cut;
  const gem = ok('gem', a.gem);
  if (gem) e.center.material = gem;
  if (a.carat && Number.isFinite(Number(a.carat))) e.center.carat = Number(a.carat);
  return { design: d, view: asView(a.view, 'ring'), title: a.name ?? 'Example design' };
}

export function LiveEmbed({ spec }: { spec: EmbedSpec }) {
  const resolved = useMemo(() => resolveEmbed(spec), [spec]);
  const box = useRef<HTMLDivElement>(null);
  const handle = useRef<DesignViewerHandle>(null);
  const id = useRef(Symbol('embed'));
  const [active, setActive] = useState(false);
  const [posterOk, setPosterOk] = useState(true);
  const release = useRef<(() => void) | null>(null);

  const wake = useCallback(() => {
    release.current?.();
    release.current = acquireSlot(id.current, () => setActive(false));
    setActive(true);
  }, []);
  const sleep = useCallback(() => {
    release.current?.();
    release.current = null;
    setActive(false);
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) (en.isIntersecting ? wake : sleep)();
      },
      { rootMargin: '80px', threshold: 0.2 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      release.current?.();
      release.current = null;
    };
  }, [wake, sleep]);

  if (!resolved) {
    return (
      <p className="muted" role="note">
        (3D preview unavailable: unknown {spec.kind} “{spec.target}”)
      </p>
    );
  }
  const caption = spec.attrs.caption ?? resolved.title;
  const builderHref = `#/build?d=${encodeDesign(resolved.design)}`;

  return (
    <figure className="live-embed-box" data-testid="live-embed" data-active={active ? 'true' : 'false'}>
      <div ref={box} className="live-embed-stage">
        {active ? (
          resolved.model ? (
            <ModelViewer model={resolved.model} />
          ) : (
            <DesignViewer ref={handle} design={resolved.design} view={resolved.view} autoRotate refit />
          )
        ) : (
          <button
            type="button"
            className="live-embed-poster"
            onClick={wake}
            aria-label={`Spin ${caption} in 3D`}
          >
            {resolved.poster && posterOk && (
              <img src={resolved.poster} alt="" loading="lazy" onError={() => setPosterOk(false)} />
            )}
            <span className="live-embed-cta">Spin it</span>
          </button>
        )}
      </div>
      <figcaption>
        <span>{caption}</span>
        <span className="live-embed-actions">
          {active && !resolved.model && (
            <>
              <button type="button" className="btn" onClick={() => handle.current?.focusHead()}>
                Focus stone
              </button>
              <button type="button" className="btn" onClick={() => handle.current?.resetView()}>
                Reset
              </button>
            </>
          )}
          <a href={builderHref}>Open in builder</a>
        </span>
      </figcaption>
    </figure>
  );
}

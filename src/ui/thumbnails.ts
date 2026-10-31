import type { Design } from '@/models/types';
import { assembleDesign, type RingView } from '@/geometry/assemble';
import { RingViewer } from '@/scene/RingViewer';

/**
 * Shared offscreen renderer: one WebGL context renders every thumbnail, one at a time, and is
 * released shortly after the queue drains. Results are cached as small PNG data URLs.
 */
const OUT_W = 300;
const OUT_H = 225;
const cache = new Map<string, string>();
let host: HTMLDivElement | null = null;
let viewer: RingViewer | null = null;
let idleTimer: number | undefined;
let chain: Promise<unknown> = Promise.resolve();

export function thumbKey(design: Design, view: RingView = 'set'): string {
  return JSON.stringify([design.engagement, design.band, design.ringSizeUS, view]);
}

export function cachedThumbnail(design: Design, view: RingView = 'set'): string | undefined {
  return cache.get(thumbKey(design, view));
}

function release(): void {
  viewer?.dispose();
  viewer = null;
  host?.remove();
  host = null;
}

function ensure(): RingViewer {
  if (viewer) return viewer;
  host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  Object.assign(host.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: '480px',
    height: '360px',
    pointerEvents: 'none',
  });
  document.body.appendChild(host);
  viewer = new RingViewer(host, {});
  return viewer;
}

function render(design: Design, view: RingView): string {
  try {
    const v = ensure();
    const v2 = view === 'band' && !design.band ? 'ring' : view;
    v.setContent(assembleDesign(design, v2).group, true);
    v.snapshot(); // renders the frame; preserveDrawingBuffer keeps it readable
    const canvas = document.createElement('canvas');
    canvas.width = OUT_W;
    canvas.height = OUT_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(v.renderer.domElement, 0, 0, OUT_W, OUT_H);
    return canvas.toDataURL('image/png');
  } catch {
    return '';
  }
}

/** Resolves to a PNG data URL ('' when WebGL or a builder is unavailable). Cached per geometry. */
export function thumbnailFor(design: Design, view: RingView = 'set'): Promise<string> {
  const key = thumbKey(design, view);
  const hit = cache.get(key);
  if (hit !== undefined) return Promise.resolve(hit);
  const job = chain.then(
    () =>
      new Promise<string>((resolve) => {
        const again = cache.get(key);
        if (again !== undefined) return resolve(again);
        // Yield to the browser between jobs so scrolling stays responsive.
        requestAnimationFrame(() => {
          window.clearTimeout(idleTimer);
          const out = render(design, view);
          cache.set(key, out);
          idleTimer = window.setTimeout(release, 1500);
          resolve(out);
        });
      }),
  );
  chain = job.catch(() => undefined);
  return job;
}

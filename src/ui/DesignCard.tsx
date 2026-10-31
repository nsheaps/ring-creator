import { useRef, type ReactNode } from 'react';
import type { Design } from '@/models/types';
import { DesignViewer } from './DesignViewer';
import { useInView, useLiveSlot } from './home/inView';
import { useThumbnail } from './home/useThumbnail';
import { cutName, formatPrice, headName, metalNames } from './home/describe';
import '../pages/browse.css';

type CardDesign = Design & { blurb?: string; priceUsd?: number | null; category?: string };

interface Props {
  design: CardDesign;
  href?: string;
  /** Allow a live 3D viewer when in view and a slot is free (otherwise a rendered thumbnail). */
  live?: boolean;
  /** Pre-rendered thumbnail (e.g. from saved designs). */
  thumb?: string;
  actions?: ReactNode;
  headingLevel?: 2 | 3;
  testId?: string;
}

/** Card with a lazily rendered 3D preview. At most MAX_LIVE cards hold a WebGL context at once. */
export function DesignCard({
  design,
  href,
  live = false,
  thumb,
  actions,
  headingLevel = 3,
  testId = 'design-card',
}: Props) {
  const media = useRef<HTMLDivElement>(null);
  const visible = useInView(media);
  const slot = useLiveSlot(live && visible);
  const rendered = useThumbnail(design, visible && !thumb);
  const img = thumb || rendered;
  const H = headingLevel === 2 ? 'h2' : 'h3';
  const source = design.source;
  return (
    <article className="card dcard" data-testid={testId}>
      <div className="dcard-media" ref={media}>
        {img && <img src={img} alt={`Preview of ${design.name}`} width={300} height={225} loading="lazy" />}
        {!img && !slot && <span className="muted dcard-ph">{visible ? 'Rendering…' : '◆'}</span>}
        {slot && (
          <DesignViewer
            design={design}
            view={design.band ? 'set' : 'ring'}
            className="dcard-viewer"
            refit
            closeUp
          />
        )}
      </div>
      <div className="dcard-body">
        <H className="dcard-title">{href ? <a href={`#${href}`}>{design.name}</a> : design.name}</H>
        {design.blurb && <p className="muted dcard-blurb">{design.blurb}</p>}
        <p className="dcard-chips">
          <span className="chip">{cutName(design)}</span>
          <span className="chip">{headName(design)}</span>
          {metalNames(design).map((m) => (
            <span className="chip" key={m}>
              {m}
            </span>
          ))}
        </p>
        <p className="dcard-foot">
          <strong>{formatPrice(design.priceUsd)}</strong>
          {source && (
            <a href={source.url} target="_blank" rel="noopener noreferrer">
              {source.name} ↗
            </a>
          )}
        </p>
        {actions && <div className="dcard-actions">{actions}</div>}
      </div>
    </article>
  );
}

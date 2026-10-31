import { useRef, useState, type RefObject } from 'react';
import type { RingView } from '@/geometry/assemble';
import type { CameraPreset } from '@/scene/RingViewer';
import { findModel } from '@/models/registry';
import type { Design } from '@/models/types';
import { DesignViewer, type DesignViewerHandle } from '@/ui/DesignViewer';

const VIEWS: { id: RingView; label: string }[] = [
  { id: 'ring', label: 'Ring' },
  { id: 'band', label: 'Band' },
  { id: 'set', label: 'Set' },
];
const PRESETS: { id: CameraPreset; label: string }[] = [
  { id: '3/4', label: '3/4' },
  { id: 'front', label: 'Front' },
  { id: 'top', label: 'Top' },
  { id: 'side', label: 'Side' },
];

interface Info {
  triangles: number;
  centerLengthMm: number;
  centerWidthMm: number;
  centerDepthMm: number;
}

export interface ViewportHandle {
  snapshot(): string;
}

export function Viewport({
  design,
  viewerRef,
  onSnapshotDownload,
}: {
  design: Design;
  viewerRef: RefObject<DesignViewerHandle>;
  onSnapshotDownload: (url: string) => void;
}) {
  const [view, setView] = useState<RingView>('set');
  const [rotate, setRotate] = useState(false);
  const [info, setInfo] = useState<Info | null>(null);
  const lastInfo = useRef<string>('');
  const hasBand = !!design.band;
  const effective: RingView = !hasBand && view !== 'ring' ? 'ring' : view;
  const e = design.engagement;
  const name = (kind: 'metal' | 'gem' | 'cut', id: string) => findModel(kind, id)?.name ?? id;
  const metals = [...new Set([e.head.metal, e.shank.metal, ...(design.band ? [design.band.metal] : [])])].map(
    (m) => name('metal', m),
  );

  return (
    <section className="bd-viewport" aria-label="3D preview">
      <div className="bd-toolbar">
        <div className="bd-seg" role="radiogroup" aria-label="View">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={effective === v.id}
              disabled={v.id !== 'ring' && !hasBand}
              data-testid={`view-${v.id}`}
              onClick={() => setView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="bd-seg" role="group" aria-label="Camera">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              data-testid={`cam-${p.id.replace('/', '')}`}
              onClick={() => viewerRef.current?.preset(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label className="bd-check">
          <input
            type="checkbox"
            checked={rotate}
            onChange={(ev) => setRotate(ev.target.checked)}
            data-testid="auto-rotate"
          />
          Auto-rotate
        </label>
        <button
          type="button"
          className="btn"
          data-testid="btn-snapshot"
          onClick={() => {
            const url = viewerRef.current?.snapshot();
            if (url) onSnapshotDownload(url);
          }}
        >
          Snapshot
        </button>
      </div>
      <DesignViewer
        ref={viewerRef}
        design={design}
        view={effective}
        autoRotate={rotate}
        className="bd-viewer"
        onInfo={(i) => {
          const k = `${i.triangles}|${i.centerLengthMm.toFixed(2)}|${i.centerWidthMm.toFixed(2)}|${i.centerDepthMm.toFixed(2)}`;
          if (k === lastInfo.current) return;
          lastInfo.current = k;
          setInfo(i);
        }}
      />
      <dl className="bd-summary" data-testid="spec-summary">
        <div>
          <dt>Stone</dt>
          <dd>
            {e.center.carat.toFixed(2)} ct {name('gem', e.center.material)}, {name('cut', e.center.cut)}
          </dd>
        </div>
        {info && (
          <div>
            <dt>Size</dt>
            <dd>
              {info.centerLengthMm.toFixed(1)} × {info.centerWidthMm.toFixed(1)} ×{' '}
              {info.centerDepthMm.toFixed(1)} mm
            </dd>
          </div>
        )}
        <div>
          <dt>Metals</dt>
          <dd>{metals.join(', ')}</dd>
        </div>
        <div>
          <dt>Ring size</dt>
          <dd>US {design.ringSizeUS}</dd>
        </div>
      </dl>
    </section>
  );
}

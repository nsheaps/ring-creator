import { useEffect, useImperativeHandle, useRef, forwardRef, useState } from 'react';
import type { Design } from '@/models/types';
import { assembleDesign, type RingView } from '@/geometry/assemble';
import { RingViewer, type CameraPreset } from '@/scene/RingViewer';

export interface DesignViewerHandle {
  snapshot(): string;
  preset(p: CameraPreset): void;
  setPanMode(on: boolean): void;
  resetView(): void;
  focusHead(instant?: boolean): boolean;
}

interface Props {
  design: Design;
  view?: RingView;
  autoRotate?: boolean;
  className?: string;
  /** Reframe the camera when the design changes (default false: keeps the user's angle). */
  refit?: boolean;
  /** Start on a close three-quarter view of the stone and setting (cards, previews). */
  closeUp?: boolean;
  onInfo?: (info: {
    triangles: number;
    centerLengthMm: number;
    centerWidthMm: number;
    centerDepthMm: number;
  }) => void;
}

/** 3D viewer for a complete Design. Falls back to a message when WebGL or a builder is unavailable. */
export const DesignViewer = forwardRef<DesignViewerHandle, Props>(function DesignViewer(
  { design, view = 'set', autoRotate = false, className, refit = false, closeUp = false, onInfo },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<RingViewer | null>(null);
  const first = useRef(true);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    snapshot: () => viewer.current?.snapshot() ?? '',
    preset: (p) => viewer.current?.setPreset(p),
    setPanMode: (on) => viewer.current?.setPanMode(on),
    resetView: () => viewer.current?.resetView(),
    focusHead: (instant) => viewer.current?.focusHead(instant) ?? false,
  }));

  useEffect(() => {
    if (!host.current) return;
    try {
      viewer.current = new RingViewer(host.current, { autoRotate });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'WebGL is not available in this browser.');
      return;
    }
    return () => {
      viewer.current?.dispose();
      viewer.current = null;
      first.current = true;
    };
  }, []);

  useEffect(() => {
    viewer.current?.setAutoRotate(autoRotate);
  }, [autoRotate]);

  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    try {
      const { group, info } = assembleDesign(design, view);
      const fit = first.current || refit;
      v.setContent(group, fit);
      if (fit && closeUp && view !== 'band') {
        v.setPreset('3/4');
        v.focusHead(true);
      }
      first.current = false;
      setError(null);
      onInfo?.({
        triangles: info.triangles,
        centerLengthMm: info.centerDims.length,
        centerWidthMm: info.centerDims.width,
        centerDepthMm: info.centerDims.depth,
      });
      (window as unknown as { __ringReady?: number }).__ringReady = Date.now();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [design, view, refit, closeUp]);

  return (
    <div className={`viewer ${className ?? ''}`} data-testid="viewer">
      <div ref={host} className="viewer-canvas" />
      <div className="viewer-hint" aria-hidden="true">
        drag: rotate · right-drag / two fingers: pan · scroll: zoom · double-click: focus
      </div>
      {error && (
        <div className="viewer-error" role="alert">
          <strong>Can’t draw this ring.</strong>
          <span>{error}</span>
        </div>
      )}
    </div>
  );
});

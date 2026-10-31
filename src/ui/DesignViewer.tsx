import { useEffect, useImperativeHandle, useRef, forwardRef, useState } from 'react';
import type { Design } from '@/models/types';
import { assembleDesign, type RingView } from '@/geometry/assemble';
import { RingViewer, type CameraPreset } from '@/scene/RingViewer';

export interface DesignViewerHandle {
  snapshot(): string;
  preset(p: CameraPreset): void;
}

interface Props {
  design: Design;
  view?: RingView;
  autoRotate?: boolean;
  className?: string;
  /** Reframe the camera when the design changes (default false: keeps the user's angle). */
  refit?: boolean;
  onInfo?: (info: { triangles: number; centerLengthMm: number; centerWidthMm: number; centerDepthMm: number }) => void;
}

/** 3D viewer for a complete Design. Falls back to a message when WebGL or a builder is unavailable. */
export const DesignViewer = forwardRef<DesignViewerHandle, Props>(function DesignViewer(
  { design, view = 'set', autoRotate = false, className, refit = false, onInfo },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<RingViewer | null>(null);
  const first = useRef(true);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    snapshot: () => viewer.current?.snapshot() ?? '',
    preset: (p) => viewer.current?.setPreset(p),
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
      v.setContent(group, first.current || refit);
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
  }, [design, view, refit]);

  return (
    <div className={`viewer ${className ?? ''}`} data-testid="viewer">
      <div ref={host} className="viewer-canvas" />
      {error && (
        <div className="viewer-error" role="alert">
          <strong>Can’t draw this ring.</strong>
          <span>{error}</span>
        </div>
      )}
    </div>
  );
});

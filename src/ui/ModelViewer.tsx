import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { buildStone } from '@/geometry/assemble';
import { findModel, listModels } from '@/models/registry';
import { dimsFromCarat } from '@/models/stoneMath';
import type { Design, Model } from '@/models/types';
import { gemMaterials } from '@/scene/materials';
import { RingViewer } from '@/scene/RingViewer';
import { defaultDesign } from '@/state/defaults';
import { DesignViewer } from './DesignViewer';

/** Builds a Design that shows `model` off. Returns null for kinds drawn as a bare stone. */
export function designForModel(model: Model): { design: Design; view: 'ring' | 'band' | 'set' } | null {
  const d = defaultDesign(model.name);
  d.band = d.band ? { ...d.band } : d.band;
  const e = d.engagement;
  switch (model.kind) {
    case 'head':
      e.head.id = model.id;
      return { design: d, view: 'ring' };
    case 'shank':
      e.shank.id = model.id;
      return { design: d, view: 'ring' };
    case 'band':
      if (d.band) d.band.style = model.id;
      return { design: d, view: 'band' };
    case 'metal':
      e.head.metal = e.shank.metal = model.id;
      if (d.band) d.band.metal = model.id;
      return { design: d, view: 'set' };
    case 'finish':
      e.finish = model.id;
      if (d.band) d.band.finish = model.id;
      return { design: d, view: 'set' };
    case 'gem':
      e.center.material = model.id;
      e.center.color = model.defaultColor;
      delete e.center.colorGrade;
      d.band = null;
      return { design: d, view: 'ring' };
    default:
      return null;
  }
}

function StoneView({ model, autoRotate }: { model: Model; autoRotate: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<RingViewer | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    };
  }, []);

  useEffect(() => viewer.current?.setAutoRotate(autoRotate), [autoRotate]);

  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    try {
      const diamond = findModel('gem', 'diamond') ?? listModels('gem')[0];
      const cut =
        model.kind === 'cut' ? model : (findModel('cut', 'round-brilliant') ?? listModels('cut')[0]);
      if (!diamond || !cut) throw new Error('No stone models are registered.');
      const clarity = model.kind === 'clarity' ? model : findModel('clarity', 'vs1');
      const grade = model.kind === 'color-grade' ? model : findModel('color-grade', 'd-f');
      const dims = dimsFromCarat(cut, diamond, { carat: 1 });
      const built = buildStone(cut, dims);
      const color = diamond.colors.find((c) => c.id === diamond.defaultColor) ?? diamond.colors[0];
      const [outer, inner] = gemMaterials(diamond, color.hex, clarity, grade?.tint, grade?.tintStrength ?? 0, cut.builder === 'step');
      const geo = built.geometry.clone();
      const g = new THREE.Group();
      const a = new THREE.Mesh(geo, inner);
      const b = new THREE.Mesh(geo, outer);
      a.renderOrder = 1;
      b.renderOrder = 2;
      g.add(a, b);
      v.camera.position.set(14, 30, 26);
      v.setContent(g, true);
      setError(null);
      (window as unknown as { __ringReady?: number }).__ringReady = Date.now();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [model]);

  return (
    <div className="viewer" data-testid="viewer">
      <div ref={host} className="viewer-canvas" />
      {error && (
        <div className="viewer-error" role="alert">
          <strong>Can’t draw this component.</strong>
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

/** Renders ONE model in 3D, in the context that shows it best. */
export function ModelViewer({ model, autoRotate = true }: { model: Model; autoRotate?: boolean }) {
  const setup = useMemo(() => designForModel(model), [model]);
  if (!setup) return <StoneView model={model} autoRotate={autoRotate} />;
  return <DesignViewer design={setup.design} view={setup.view} autoRotate={autoRotate} refit />;
}

export default ModelViewer;

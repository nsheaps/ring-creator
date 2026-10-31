import * as THREE from 'three';
import { bandBuilders, headBuilders, shankBuilders, stoneBuilders } from './builders';
import { mergeFlat } from './helpers';
import type {
  BandCtx,
  BuiltStone,
  ContourSpec,
  HeadCtx,
  Part,
  PartSlot,
  ResolvedAccent,
  ResolvedStone,
  ShankCtx,
  StoneBuildOptions,
} from './types';
import { getModel } from '@/models/registry';
import { dimsFromCarat, innerDiameterMm, type StoneDims } from '@/models/stoneMath';
import type { AccentStoneSpec, BandSpec, CutModel, Design, Id, Params, StoneSpec } from '@/models/types';
import { gemMaterials, metalMaterial } from '@/scene/materials';

export type RingView = 'ring' | 'band' | 'set';

const stoneCache = new Map<string, BuiltStone>();

export function buildStone(cut: CutModel, dims: StoneDims, opts: StoneBuildOptions = {}): BuiltStone {
  const key = `${cut.id}|${dims.length.toFixed(3)}|${dims.width.toFixed(3)}|${dims.depth.toFixed(3)}|${opts.detail ?? 'full'}`;
  const hit = stoneCache.get(key);
  if (hit) return hit;
  const fn = stoneBuilders.get(cut.builder);
  if (!fn) throw new Error(`No stone builder "${cut.builder}" for cut "${cut.id}"`);
  const built = fn(dims, cut.params, opts);
  if (stoneCache.size > 400) stoneCache.clear();
  stoneCache.set(key, built);
  return built;
}

export function resolveCenter(spec: StoneSpec): ResolvedStone {
  const gem = getModel('gem', spec.material);
  const cut = getModel('cut', spec.cut);
  const color =
    gem.colors.find((c) => c.id === spec.color) ??
    gem.colors.find((c) => c.id === gem.defaultColor) ??
    gem.colors[0];
  const dims = dimsFromCarat(cut, gem, spec);
  return { gem, colorHex: color.hex, cut, dims, carat: spec.carat, built: buildStone(cut, dims) };
}

export function resolveAccent(spec: AccentStoneSpec): ResolvedAccent {
  const gem = getModel('gem', spec.material);
  const cut = getModel('cut', spec.cut);
  const color =
    gem.colors.find((c) => c.id === spec.color) ??
    gem.colors.find((c) => c.id === gem.defaultColor) ??
    gem.colors[0];
  return { gem, colorHex: color.hex, cut, sizeMm: spec.sizeMm };
}

const stoneFactory =
  () =>
  (cutId: Id, dims: StoneDims, opts?: StoneBuildOptions): BuiltStone =>
    buildStone(getModel('cut', cutId), dims, opts);

function mergeParams(base: Params, over: Params | undefined): Params {
  return { ...base, ...(over ?? {}) };
}

export interface AssembledRing {
  group: THREE.Group;
  /** Handy numbers for UI summaries and docs. */
  info: {
    centerDims: StoneDims;
    innerRadius: number;
    seatY: number;
    girdleY: number;
    triangles: number;
  };
}

function bboxOf(parts: Part[], filter?: (x: number, y: number, z: number) => boolean): THREE.Box3 {
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (const p of parts) {
    const pos = p.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      if (!filter || filter(v.x, v.y, v.z)) box.expandByPoint(v);
    }
  }
  return box;
}

/**
 * Roll angle (about the finger axis) that centres the parts' extent along the band. Parts are in the stone frame;
 * `rot` turns them into the ring's orientation and the girdle sits at ring y = girdleY. 0 when already centred.
 */
function centringRoll(parts: Part[], rot: THREE.Matrix4, girdleY: number): number {
  const e = rot.elements; // ring x = e[0] * x + e[4] * y + e[8] * z
  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of parts) {
    const pos = p.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      xs.push(e[0] * pos.getX(i) + e[4] * pos.getY(i) + e[8] * pos.getZ(i));
      ys.push(girdleY + pos.getY(i));
    }
  }
  let a = 0;
  for (let k = 0; k < 4; k++) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    let lo = 0;
    let hi = 0;
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i] * c - ys[i] * s;
      if (x < xs[lo] * c - ys[lo] * s) lo = i;
      if (x > xs[hi] * c - ys[hi] * s) hi = i;
    }
    const mid = (xs[lo] * c - ys[lo] * s + xs[hi] * c - ys[hi] * s) / 2;
    if (k === 0 && Math.abs(mid) < 0.3) return 0;
    const rho = (Math.hypot(xs[lo], ys[lo]) + Math.hypot(xs[hi], ys[hi])) / 2;
    a += Math.asin(Math.max(-0.5, Math.min(0.5, mid / Math.max(1, rho))));
  }
  return a;
}

function transformParts(parts: Part[], m: THREE.Matrix4): Part[] {
  return parts.map((p) => {
    const g = p.geometry.clone();
    g.applyMatrix4(m);
    return { ...p, geometry: g };
  });
}

interface Engagement {
  parts: Part[];
  seatY: number;
  girdleY: number;
  shankHalfWidth: number;
  headHalfZ: number;
  headHalfAlongBand: number;
}

function buildEngagement(design: Design, center: ResolvedStone): Engagement {
  const e = design.engagement;
  const innerRadius = innerDiameterMm(design.ringSizeUS) / 2;
  const accent = resolveAccent(e.accentStone);
  const headModel = getModel('head', e.head.id);
  const shankModel = getModel('shank', e.shank.id);
  const headFn = headBuilders.get(headModel.builder);
  const shankFn = shankBuilders.get(shankModel.builder);
  if (!headFn) throw new Error(`No head builder "${headModel.builder}"`);
  if (!shankFn) throw new Error(`No shank builder "${shankModel.builder}"`);

  const eastWest = e.placement.orientation === 'east-west';
  const alongBand = (eastWest ? center.dims.length : center.dims.width) / 2 + 0.9;
  const alongFinger = (eastWest ? center.dims.width : center.dims.length) / 2 + 0.9;

  const shankCtx: ShankCtx = {
    innerRadius,
    center,
    accent,
    params: mergeParams(shankModel.params, e.shank.params),
    headHalfAlongBand: alongBand,
    headHalfAlongFinger: alongFinger,
    stone: stoneFactory(),
  };
  const shank = shankFn(shankCtx);

  const raise = Math.max(0, e.placement.raise);
  const baseDrop = raise + center.built.pavilionDepth + center.built.girdleThickness / 2;
  const girdleY = shank.seatY + baseDrop;
  const shankHalfWidth = Math.max(
    0.5,
    bboxOf(
      shank.parts.filter((p) => p.slot === 'shank-metal'),
      (_x, y) => y < 0,
    ).max.z,
  );

  const headCtx: HeadCtx = {
    center,
    accent,
    params: mergeParams(headModel.params, e.head.params),
    baseDrop,
    shankWidth: shank.topWidth,
    bandAxis: eastWest ? [1, 0] : [0, 1],
    stone: stoneFactory(),
    innerRadius,
    seatRadius: shank.seatY,
  };
  const headParts = headFn(headCtx);

  const centerPart: Part = { slot: 'center-stone', geometry: center.built.geometry, label: 'center stone' };
  // stone-frame -> ring-frame
  const rot = new THREE.Matrix4().makeRotationY(((eastWest ? 0 : 90) + e.placement.rotate) * (Math.PI / 180));
  const place = new THREE.Matrix4().makeTranslation(e.placement.offset, girdleY, 0).multiply(rot);
  const tilt = new THREE.Matrix4()
    .makeTranslation(0, shank.seatY, 0)
    .multiply(new THREE.Matrix4().makeRotationX(-e.placement.tilt * (Math.PI / 180)))
    .multiply(new THREE.Matrix4().makeTranslation(0, -shank.seatY, 0));
  // Asymmetric heads (toi-et-moi, bypass) are centred on the finger: roll the head around the finger axis so the
  // middle of its extent along the band sits on top. Rolling (not sliding) keeps every seat on the shank's curve.
  const angle = centringRoll([centerPart, ...headParts], rot, girdleY);
  const roll = angle !== 0 ? new THREE.Matrix4().makeRotationZ(angle) : new THREE.Matrix4();
  const M = roll.multiply(tilt.multiply(place));
  const placed = transformParts([centerPart, ...headParts], M);
  const headBox = bboxOf(
    placed.filter((p) => p.slot === 'head-metal' || p.slot === 'accent-stone' || p.slot === 'center-stone'),
  );
  return {
    parts: [...shank.parts, ...placed],
    seatY: shank.seatY,
    girdleY,
    shankHalfWidth,
    headHalfZ: Math.max(Math.abs(headBox.min.z), Math.abs(headBox.max.z)),
    headHalfAlongBand: alongBand,
  };
}

/**
 * The engagement ring's parts in the ring frame (shank, head metal, centre and accent stones), before materials are
 * assigned. Used by tests and tools that need to inspect geometry per slot.
 */
export function engagementParts(design: Design): { parts: Part[]; seatY: number; girdleY: number } {
  const e = buildEngagement(design, resolveCenter(design.engagement.center));
  return { parts: e.parts, seatY: e.seatY, girdleY: e.girdleY };
}

function buildBand(design: Design, band: BandSpec, contour: ContourSpec | undefined): Part[] {
  const style = getModel('band', band.style);
  const fn = bandBuilders.get(style.builder);
  if (!fn) throw new Error(`No band builder "${style.builder}"`);
  const ctx: BandCtx = {
    innerRadius: innerDiameterMm(design.ringSizeUS) / 2,
    params: mergeParams(style.params, band.params),
    widthMm: band.widthMm,
    thicknessMm: band.thicknessMm,
    accent: resolveAccent(band.accentStone),
    contour: style.contourCapable ? contour : undefined,
    stone: stoneFactory(),
  };
  return fn(ctx);
}

const slotMetal = (design: Design, slot: PartSlot): Id | null => {
  switch (slot) {
    case 'head-metal':
      return design.engagement.head.metal;
    case 'shank-metal':
      return design.engagement.shank.metal;
    case 'band-metal':
      return design.band?.metal ?? null;
    case 'band-metal2':
      return design.band?.metal2 ?? null;
    default:
      return null;
  }
};

export function assembleDesign(design: Design, view: RingView = 'set'): AssembledRing {
  const center = resolveCenter(design.engagement.center);
  const innerRadius = innerDiameterMm(design.ringSizeUS) / 2;
  const wantRing = view !== 'band' || !design.band;
  const wantBand = !!design.band && view !== 'ring';

  let eng: Engagement | null = null;
  let engParts: Part[] = [];
  if (wantRing) {
    eng = buildEngagement(design, center);
    engParts = eng.parts;
  }

  let bandParts: Part[] = [];
  let bandZ = 0;
  if (wantBand && design.band) {
    const style = getModel('band', design.band.style);
    const needInfo = eng ?? buildEngagement(design, center);
    const shankHalf = needInfo.shankHalfWidth;
    const wantContour =
      design.band.fit === 'contour' || (design.band.fit === 'auto' && style.contourCapable && view === 'set');
    let contour: ContourSpec | undefined;
    if (wantContour && view === 'set') {
      const retreat = Math.min(6, Math.max(0, needInfo.headHalfZ - shankHalf - 0.1));
      const halfAngle = Math.min(1.1, Math.max(0.35, (needInfo.headHalfAlongBand + 2.5) / (innerRadius + 2)));
      contour = { retreatMm: retreat, halfAngle, direction: 1 };
    }
    bandParts = buildBand(design, design.band, contour);
    bandZ = view === 'set' ? shankHalf + design.band.widthMm / 2 + 0.15 : 0;
  }

  const pivotShift = view === 'set' && wantBand ? -bandZ / 2 : 0;
  const group = new THREE.Group();
  let tris = 0;
  const add = (parts: Part[], dz: number) => {
    const bySlot = new Map<PartSlot, THREE.BufferGeometry[]>();
    for (const p of parts) {
      const g = p.geometry.clone();
      g.translate(0, 0, dz);
      const list = bySlot.get(p.slot) ?? [];
      list.push(g);
      bySlot.set(p.slot, list);
    }
    for (const [slot, geos] of bySlot) {
      const merged = mergeFlat(geos);
      geos.forEach((g) => g.dispose());
      tris += merged.attributes.position ? merged.attributes.position.count / 3 : 0;
      group.add(...meshesFor(design, slot, merged, center));
    }
  };
  add(engParts, pivotShift);
  add(bandParts, bandZ + pivotShift);

  return {
    group,
    info: {
      centerDims: center.dims,
      innerRadius,
      seatY: eng?.seatY ?? innerRadius,
      girdleY: eng?.girdleY ?? innerRadius,
      triangles: Math.round(tris),
    },
  };
}

function meshesFor(
  design: Design,
  slot: PartSlot,
  geo: THREE.BufferGeometry,
  center: ResolvedStone,
): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  if (slot === 'center-stone' || slot === 'accent-stone' || slot === 'band-stone') {
    const spec =
      slot === 'center-stone'
        ? null
        : slot === 'accent-stone'
          ? design.engagement.accentStone
          : (design.band?.accentStone ?? design.engagement.accentStone);
    const gem = slot === 'center-stone' ? center.gem : getModel('gem', spec!.material);
    const colorHex =
      slot === 'center-stone'
        ? center.colorHex
        : (gem.colors.find((c) => c.id === spec!.color) ?? gem.colors[0]).hex;
    const clarity =
      slot === 'center-stone' ? getModel('clarity', design.engagement.center.clarity) : undefined;
    const grade =
      slot === 'center-stone' && design.engagement.center.colorGrade
        ? getModel('color-grade', design.engagement.center.colorGrade)
        : undefined;
    const isDiamondLike = ['diamond', 'lab-diamond', 'moissanite'].includes(gem.id);
    const [outer, inner] = gemMaterials(
      gem,
      colorHex,
      clarity,
      isDiamondLike && /^(near-)?colorless$/.test(design.engagement.center.color) ? grade?.tint : undefined,
      grade?.tintStrength ?? 0,
    );
    const innerMesh = new THREE.Mesh(geo, inner);
    const outerMesh = new THREE.Mesh(geo, outer);
    outerMesh.renderOrder = 2;
    innerMesh.renderOrder = 1;
    out.push(innerMesh, outerMesh);
  } else {
    const metalId = slotMetal(design, slot);
    if (!metalId) return out;
    const metal = getModel('metal', metalId);
    const finishId =
      slot === 'band-metal' || slot === 'band-metal2' ? design.band?.finish : design.engagement.finish;
    const finish = finishId ? getModel('finish', finishId) : undefined;
    out.push(new THREE.Mesh(geo, metalMaterial(metal, finish)));
  }
  return out;
}

export function disposeGroup(group: THREE.Object3D): void {
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
  });
}

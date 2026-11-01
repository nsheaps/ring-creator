import { resolveCenter } from '@/geometry/assemble';
import { findModel, getModel } from '@/models/registry';
import { dimsFromCarat } from '@/models/stoneMath';
import type { Design, Id, Params } from '@/models/types';
import {
  collectParts,
  effectiveScope,
  type ExportPart,
  type ExportScope,
  type Piece,
  type PartRole,
} from './collect';
import { components, solidVolume } from './meshMath';
import { gramsToDwt, mm3ToCarats, mm3ToGrams, ringSize, type RingSizeRow } from './units';

export interface MetalPartSpec {
  partId: string;
  label: string;
  piece: Piece;
  role: PartRole;
  metalId: Id;
  metalName: string;
  purity: string;
  density: number;
  finish: string;
  volumeMm3: number;
  grams: number;
  dwt: number;
  /** Separate solid pieces in the mesh (prongs, rails, beads...). */
  solids: number;
  pricePerGramUsd: number;
}

export interface MetalTotal {
  metalId: Id;
  metalName: string;
  grams: number;
  dwt: number;
  volumeMm3: number;
  /** Indicative metal value only (grams x the model's price per gram). */
  valueUsd: number;
}

export interface StoneGroupSpec {
  piece: Piece;
  role: 'center' | 'accent' | 'band-stone';
  gemId: Id;
  gemName: string;
  colorName: string;
  cutId: Id;
  cutName: string;
  count: number;
  /** Length x width x depth, mm (center: from the design; accents: estimated from the mesh volume). */
  lengthMm: number;
  widthMm: number;
  depthMm: number;
  caratEach: number;
  caratTotal: number;
  sg: number;
  /** Nominal carat of the design (center stone only). */
  nominalCarat?: number;
}

export interface PieceSpec {
  piece: Piece;
  name: string;
  /** Style name: head + shank for the engagement ring, band style for the band. */
  style: string;
  finish: string;
  /** Radial thickness at the palm (6 o'clock), mm. */
  palmThicknessMm: number;
  /** Width along the finger at the palm, mm. */
  palmWidthMm: number;
  /** Width along the finger at the top (under the head / at 12 o'clock), mm. */
  topWidthMm: number;
  /** Outside diameter at the palm side (inner diameter + 2 x palm thickness), mm. */
  outerDiameterMm: number;
  /** Overall bounding box of the piece (x across, y height, z along the finger), mm. */
  overallMm: [number, number, number];
  /** Height of the highest point above the finger (inner top), mm. Engagement only, 0 for bands. */
  headHeightMm: number;
  /** Height of the stone table above the shank's top surface, mm. Engagement only. */
  settingHeightMm: number;
  metalGrams: number;
  metalDwt: number;
  triangles: number;
}

export interface SettingSpec {
  headId: Id;
  headName: string;
  settingType: string;
  extraStones: string;
  prongCount: number | null;
  prongDiameterMm: number | null;
  prongStyle: string | null;
  galleryRails: number | null;
  sideProngs: number | null;
  orientation: string;
  raiseMm: number;
  tiltDeg: number;
  rotateDeg: number;
}

export interface CenterStoneSpec {
  gemName: string;
  colorName: string;
  cutName: string;
  carat: number;
  meshCarat: number;
  lengthMm: number;
  widthMm: number;
  depthMm: number;
  depthPct: number;
  crownHeightMm: number;
  pavilionDepthMm: number;
  girdleThicknessMm: number;
  clarity: string;
  colorGrade: string;
  sg: number;
}

export interface RingSpec {
  designId: string;
  name: string;
  scope: ExportScope;
  /** ISO date taken from the design (keeps exports deterministic). */
  date: string;
  size: RingSizeRow;
  pieces: PieceSpec[];
  metals: MetalPartSpec[];
  metalTotals: MetalTotal[];
  stones: StoneGroupSpec[];
  center: CenterStoneSpec | null;
  setting: SettingSpec | null;
  totals: {
    metalGrams: number;
    metalDwt: number;
    stoneCount: number;
    stoneCarats: number;
    metalValueUsd: number;
  };
  mixedMetal: boolean;
}

const num = (p: Params, k: string): number | null => (typeof p[k] === 'number' ? (p[k] as number) : null);
const str = (p: Params, k: string): string | null => (typeof p[k] === 'string' ? (p[k] as string) : null);

function settingType(headId: Id, tags: string[], builder: string): string {
  const t = `${builder} ${tags.join(' ')} ${headId}`;
  if (/bezel/.test(t)) return /half/.test(t) ? 'Half bezel' : 'Bezel';
  if (/tension/.test(t)) return 'Tension';
  if (/halo/.test(t)) return 'Halo (prong-set center, pave melee)';
  if (/three|trilogy|five|side/.test(t)) return 'Multi-stone prong';
  if (/flush|gypsy/.test(t)) return 'Flush';
  if (/cluster/.test(t)) return 'Cluster';
  if (/prong|claw/.test(t)) return 'Prong';
  return 'Custom setting';
}

function colorName(gemId: Id, colorId: Id): string {
  const gem = findModel('gem', gemId);
  return gem?.colors.find((c) => c.id === colorId)?.name ?? colorId;
}

function measurePiece(design: Design, piece: Piece, parts: ExportPart[]): PieceSpec {
  const r = ringSize(design.ringSizeUS).diameterMm / 2;
  const metal = parts.filter((p) => p.kind === 'metal');
  const shankLike = metal.filter((p) => p.role !== 'head');
  let minY = Infinity;
  let palmZmin = Infinity,
    palmZmax = -Infinity,
    topZmin = Infinity,
    topZmax = -Infinity,
    shankTop = -Infinity;
  const all = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  let tris = 0;
  for (const p of parts) {
    const a = p.positions;
    tris += a.length / 9;
    for (let i = 0; i < a.length; i += 3)
      for (let k = 0; k < 3; k++) {
        if (a[i + k] < all.min[k]) all.min[k] = a[i + k];
        if (a[i + k] > all.max[k]) all.max[k] = a[i + k];
      }
  }
  for (const p of shankLike) {
    const a = p.positions;
    for (let i = 0; i < a.length; i += 3) {
      const x = a[i],
        y = a[i + 1],
        z = a[i + 2];
      if (Math.abs(x) < 1.2 && y < 0 && y < minY) minY = y;
      if (y < -r * 0.75) {
        palmZmin = Math.min(palmZmin, z);
        palmZmax = Math.max(palmZmax, z);
      }
      if (y > r * 0.75) {
        topZmin = Math.min(topZmin, z);
        topZmax = Math.max(topZmax, z);
      }
      if (Math.abs(x) < 0.6 && y > 0 && y > shankTop) shankTop = y;
    }
  }
  const palmThickness = Number.isFinite(minY) ? Math.max(0, -minY - r) : 0;
  const centerPart = parts.find((p) => p.role === 'center');
  let stoneTop = -Infinity;
  if (centerPart)
    for (let i = 1; i < centerPart.positions.length; i += 3)
      stoneTop = Math.max(stoneTop, centerPart.positions[i]);
  const grams = metal.reduce((s, p) => {
    const m = findModel('metal', p.materialId);
    return s + mm3ToGrams(solidVolume(p.positions), m?.density ?? 0);
  }, 0);
  const finishId = piece === 'engagement' ? design.engagement.finish : (design.band?.finish ?? '');
  const style =
    piece === 'engagement'
      ? `${findModel('head', design.engagement.head.id)?.name ?? design.engagement.head.id} on ${
          findModel('shank', design.engagement.shank.id)?.name ?? design.engagement.shank.id
        } shank`
      : (findModel('band', design.band?.style ?? '')?.name ?? design.band?.style ?? '');
  return {
    piece,
    name: piece === 'engagement' ? 'Engagement ring' : 'Wedding band',
    style,
    finish: findModel('finish', finishId)?.name ?? finishId,
    palmThicknessMm: palmThickness,
    palmWidthMm: Number.isFinite(palmZmin) ? palmZmax - palmZmin : 0,
    topWidthMm: Number.isFinite(topZmin) ? topZmax - topZmin : 0,
    outerDiameterMm: 2 * r + 2 * palmThickness,
    overallMm: [all.max[0] - all.min[0], all.max[1] - all.min[1], all.max[2] - all.min[2]],
    headHeightMm: piece === 'engagement' ? Math.max(0, all.max[1] - r) : 0,
    settingHeightMm:
      piece === 'engagement' && Number.isFinite(stoneTop) && Number.isFinite(shankTop)
        ? stoneTop - shankTop
        : 0,
    metalGrams: grams,
    metalDwt: gramsToDwt(grams),
    triangles: Math.round(tris),
  };
}

function metalPartSpecs(design: Design, parts: ExportPart[]): MetalPartSpec[] {
  return parts
    .filter((p) => p.kind === 'metal')
    .map((p) => {
      const m = getModel('metal', p.materialId);
      const comps = components(p.positions);
      const vol = comps.reduce((s, c) => s + c.volume, 0);
      const finishId = p.piece === 'engagement' ? design.engagement.finish : (design.band?.finish ?? '');
      const grams = mm3ToGrams(vol, m.density);
      return {
        partId: p.id,
        label: p.label,
        piece: p.piece,
        role: p.role,
        metalId: m.id,
        metalName: m.name,
        purity: m.purity,
        density: m.density,
        finish: findModel('finish', finishId)?.name ?? finishId,
        volumeMm3: vol,
        grams,
        dwt: gramsToDwt(grams),
        solids: comps.length,
        pricePerGramUsd: m.pricePerGramUsd,
      };
    });
}

function stoneGroups(design: Design, parts: ExportPart[]): StoneGroupSpec[] {
  const out: StoneGroupSpec[] = [];
  for (const p of parts) {
    if (p.kind !== 'stone') continue;
    if (p.role === 'center') {
      const c = design.engagement.center;
      const resolved = resolveCenter(c);
      const vol = solidVolume(p.positions);
      out.push({
        piece: p.piece,
        role: 'center',
        gemId: c.material,
        gemName: resolved.gem.name,
        colorName: colorName(c.material, c.color),
        cutId: c.cut,
        cutName: resolved.cut.name,
        count: 1,
        lengthMm: resolved.dims.length,
        widthMm: resolved.dims.width,
        depthMm: resolved.dims.depth,
        caratEach: mm3ToCarats(vol, resolved.gem.density),
        caratTotal: mm3ToCarats(vol, resolved.gem.density),
        sg: resolved.gem.density,
        nominalCarat: c.carat,
      });
      continue;
    }
    const spec = p.role === 'band-stone' ? design.band?.accentStone : design.engagement.accentStone;
    if (!spec) continue;
    const gem = getModel('gem', p.role === 'band-stone' ? p.materialId : spec.material);
    const cut = getModel('cut', spec.cut);
    const groups = new Map<string, { count: number; vol: number }>();
    for (const comp of components(p.positions)) {
      if (comp.volume < 1e-4) continue;
      const key = comp.volume.toPrecision(2);
      const g = groups.get(key) ?? { count: 0, vol: 0 };
      g.count++;
      g.vol += comp.volume;
      groups.set(key, g);
    }
    const sorted = [...groups.values()].sort((a, b) => b.vol / b.count - a.vol / a.count);
    for (const g of sorted) {
      const each = mm3ToCarats(g.vol / g.count, gem.density);
      const dims = dimsFromCarat(cut, gem, { carat: each });
      out.push({
        piece: p.piece,
        role: p.role === 'band-stone' ? 'band-stone' : 'accent',
        gemId: gem.id,
        gemName: gem.name,
        colorName: colorName(gem.id, gem.id === spec.material ? spec.color : gem.defaultColor),
        cutId: cut.id,
        cutName: cut.name,
        count: g.count,
        lengthMm: dims.length,
        widthMm: dims.width,
        depthMm: dims.depth,
        caratEach: each,
        caratTotal: each * g.count,
        sg: gem.density,
      });
    }
  }
  return out;
}

function settingSpec(design: Design): SettingSpec {
  const e = design.engagement;
  const head = getModel('head', e.head.id);
  const p: Params = { ...head.params, ...e.head.params };
  const hasProngs = num(p, 'prongCount') !== null || num(p, 'prongWidth') !== null;
  return {
    headId: head.id,
    headName: head.name,
    settingType: settingType(head.id, head.tags, head.builder),
    extraStones: head.extraStones,
    prongCount: num(p, 'prongCount'),
    prongDiameterMm: hasProngs ? (num(p, 'prongWidth') ?? null) : null,
    prongStyle: str(p, 'prongStyle'),
    galleryRails: num(p, 'galleryRails'),
    sideProngs: num(p, 'sideProngs'),
    orientation: e.placement.orientation,
    raiseMm: e.placement.raise,
    tiltDeg: e.placement.tilt,
    rotateDeg: e.placement.rotate,
  };
}

function centerSpec(design: Design, meshCarat: number): CenterStoneSpec {
  const c = design.engagement.center;
  const r = resolveCenter(c);
  return {
    gemName: r.gem.name,
    colorName: colorName(c.material, c.color),
    cutName: r.cut.name,
    carat: c.carat,
    meshCarat,
    lengthMm: r.dims.length,
    widthMm: r.dims.width,
    depthMm: r.dims.depth,
    depthPct: (r.dims.depth / r.dims.width) * 100,
    crownHeightMm: r.built.crownHeight,
    pavilionDepthMm: r.built.pavilionDepth,
    girdleThicknessMm: r.built.girdleThickness,
    clarity: findModel('clarity', c.clarity)?.code ?? c.clarity,
    colorGrade: c.colorGrade ? (findModel('color-grade', c.colorGrade)?.letters ?? c.colorGrade) : '-',
    sg: r.gem.density,
  };
}

/** Everything a jeweler needs to quote and make the design: dimensions, weights, stones, setting. Deterministic. */
export function computeSpec(design: Design, scope: ExportScope = 'set'): RingSpec {
  const s = effectiveScope(design, scope);
  const pieces: Piece[] = s === 'set' ? ['engagement', 'band'] : [s];
  const pieceParts = pieces.map((piece) => ({ piece, parts: collectParts(design, piece) }));
  const allParts = pieceParts.flatMap((x) => x.parts);
  const metals = metalPartSpecs(design, allParts);
  const stones = stoneGroups(design, allParts);
  const totalsByMetal = new Map<Id, MetalTotal>();
  for (const m of metals) {
    const t = totalsByMetal.get(m.metalId) ?? {
      metalId: m.metalId,
      metalName: m.metalName,
      grams: 0,
      dwt: 0,
      volumeMm3: 0,
      valueUsd: 0,
    };
    t.grams += m.grams;
    t.dwt += m.dwt;
    t.volumeMm3 += m.volumeMm3;
    t.valueUsd += m.grams * m.pricePerGramUsd;
    totalsByMetal.set(m.metalId, t);
  }
  const metalTotals = [...totalsByMetal.values()];
  const center = stones.find((x) => x.role === 'center');
  const hasEng = pieces.includes('engagement');
  const metalGrams = metals.reduce((a, m) => a + m.grams, 0);
  return {
    designId: design.id,
    name: design.name,
    scope: s,
    date: design.updatedAt,
    size: ringSize(design.ringSizeUS),
    pieces: pieceParts.map((x) => measurePiece(design, x.piece, x.parts)),
    metals,
    metalTotals,
    stones,
    center: hasEng ? centerSpec(design, center?.caratEach ?? 0) : null,
    setting: hasEng ? settingSpec(design) : null,
    totals: {
      metalGrams,
      metalDwt: gramsToDwt(metalGrams),
      stoneCount: stones.reduce((a, x) => a + x.count, 0),
      stoneCarats: stones.reduce((a, x) => a + x.caratTotal, 0),
      metalValueUsd: metalTotals.reduce((a, x) => a + x.valueUsd, 0),
    },
    mixedMetal: metalTotals.length > 1,
  };
}

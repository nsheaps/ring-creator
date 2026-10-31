import { findModel } from '@/models/registry';
import type { Design, MetalModel } from '@/models/types';
import type { RingSpec } from './spec';
import { fmt, gramsToDwt } from './units';

export interface NoteSection {
  title: string;
  lines: string[];
}

/** Casting guidance derived from the metal model's family and purity (no hard-coded metal list). */
export function castingAdvice(metal: MetalModel): string {
  switch (metal.family) {
    case 'yellow':
    case 'rose':
    case 'white':
      return `${metal.name}: cast in ${metal.purity} ${metal.family} casting grain with deoxidiser; flask ~ 650-700 °C; allow ~1.5-2 % shrinkage.`;
    case 'platinum-group':
      return `${metal.name}: ${metal.purity}; cast Pt950/Ru or Pd950/Ru by induction in a high-temperature investment (centrifugal or tilt caster); allow ~2 % shrinkage.`;
    case 'silver':
      return `${metal.name}: cast 925 sterling with a fire-scale resistant (germanium or deox) alloy; flask ~ 600 °C.`;
    case 'industrial':
    case 'dark':
      return `${metal.name}: not suited to lost-wax casting; machine from tube or bar (CNC turning / milling). Treat the STL as the machining target.`;
    default:
      return `${metal.name}: confirm casting alloy with your caster.`;
  }
}

/** Jeweler notes: sizing, tolerances, stone seats, prongs, casting, finish and engraving. */
export function jewelerNotes(design: Design, spec: RingSpec): NoteSection[] {
  const sections: NoteSection[] = [];
  const size = spec.size;
  sections.push({
    title: 'Sizing',
    lines: [
      `US size ${size.us}: inner diameter ${fmt(size.diameterMm)} mm, inner circumference ${fmt(size.circumferenceMm)} mm.`,
      'Tolerance on inner diameter: +/- 0.10 mm after finishing. Size the finished ring on a calibrated mandrel.',
      ...spec.pieces.map(
        (p) =>
          `${p.name}: comfort and wide profiles (width >= 6 mm) wear about a quarter size smaller; consider sizing up. Palm width ${fmt(p.palmWidthMm)} mm.`,
      ),
    ],
  });
  sections.push({
    title: 'Tolerances',
    lines: [
      'Model units are millimetres at 1:1. Scale for casting shrinkage only if your caster asks for it (typically +1.5 to +2 %).',
      'Minimum wall: 0.8 mm in gold, 0.6 mm in platinum. Minimum prong wire 0.7 mm after clean-up.',
      'General dimensional tolerance +/- 0.05 mm on stone seats, +/- 0.1 mm elsewhere.',
      ...spec.pieces.map(
        (p) =>
          `${p.name}: palm thickness ${fmt(p.palmThicknessMm)} mm, palm width ${fmt(p.palmWidthMm)} mm, top width ${fmt(p.topWidthMm)} mm.`,
      ),
    ],
  });
  if (spec.center && spec.setting) {
    const c = spec.center;
    const st = spec.setting;
    const prongLines: string[] = [];
    if (st.prongCount !== null)
      prongLines.push(
        `${st.prongCount} prongs${st.prongDiameterMm !== null ? `, wire diameter ${fmt(st.prongDiameterMm)} mm` : ''}${
          st.prongStyle ? `, ${st.prongStyle} tips` : ''
        }${st.galleryRails !== null ? `, ${st.galleryRails} gallery rail(s)` : ''}.`,
      );
    if (st.prongDiameterMm !== null)
      prongLines.push(
        `Cut bearings (notches) about ${fmt(st.prongDiameterMm / 3)} mm deep (one third of the wire) at girdle height.`,
      );
    if (st.sideProngs !== null) prongLines.push(`${st.sideProngs} prongs per side stone.`);
    sections.push({
      title: 'Center stone seat',
      lines: [
        `${c.gemName} ${c.cutName}, ${fmt(c.carat)} ct, ${fmt(c.lengthMm)} x ${fmt(c.widthMm)} x ${fmt(c.depthMm)} mm (depth ${fmt(c.depthPct, 1)} %), clarity ${c.clarity}, color ${c.colorGrade}.`,
        `Crown height ${fmt(c.crownHeightMm)} mm, girdle ${fmt(c.girdleThicknessMm)} mm, pavilion depth ${fmt(c.pavilionDepthMm)} mm: seat depth below the girdle >= ${fmt(c.pavilionDepthMm + 0.1)} mm to clear the culet.`,
        `Setting: ${st.headName} (${st.settingType}); ${st.orientation}; raise ${fmt(st.raiseMm)} mm above the shank, tilt ${fmt(st.tiltDeg, 0)}°, rotation ${fmt(st.rotateDeg, 0)}°.`,
        ...prongLines,
        'Measure the actual stone before cutting seats; the model uses estimated proportions from the carat weight.',
      ],
    });
  }
  const accents = spec.stones.filter((s) => s.role !== 'center');
  if (accents.length)
    sections.push({
      title: 'Accent stones',
      lines: accents.map(
        (s) =>
          `${s.count} x ${s.gemName} ${s.cutName} ~${fmt(s.lengthMm)} mm (${fmt(s.caratEach, 3)} ct each, ${fmt(s.caratTotal, 3)} ct total), ${s.piece === 'band' ? 'band' : 'engagement ring'}. Seat depth ~${fmt(s.depthMm * 0.65)} mm.`,
      ),
    });
  const castLines = spec.metalTotals.map((t) => {
    const m = findModel('metal', t.metalId);
    return m ? castingAdvice(m) : t.metalName;
  });
  sections.push({
    title: 'Casting and metal',
    lines: [
      ...castLines,
      ...spec.metalTotals.map(
        (t) =>
          `${t.metalName}: ~${fmt(t.grams)} g (${fmt(gramsToDwt(t.grams))} dwt) finished; order ~15 % extra for sprues and button.`,
      ),
      spec.mixedMetal
        ? 'Mixed metals: cast each metal separately (one STL per metal is in the pack) and join by laser welding or a solder suited to both alloys.'
        : 'Single metal throughout.',
      'Weights are computed from the 3D mesh volume and can differ by roughly 10 % from a cast and finished piece.',
    ],
  });
  sections.push({
    title: 'Finish',
    lines: spec.pieces
      .map((p) => `${p.name}: ${p.finish}.`)
      .concat(
        spec.metalTotals.some((t) => /white/i.test(t.metalName))
          ? ['White gold: rhodium plate after final polish.']
          : [],
      ),
  });
  sections.push({
    title: 'Engraving',
    lines: [
      design.notes ? `Customer notes: ${design.notes}` : 'No engraving specified.',
      ...spec.pieces.map(
        (p) =>
          `${p.name}: usable inside width ~${fmt(Math.max(0, p.palmWidthMm - 0.8))} mm; keep engraving >= 0.4 mm from the edges and <= 0.2 mm deep.`,
      ),
    ],
  });
  return sections;
}

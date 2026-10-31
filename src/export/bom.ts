import type { RingSpec } from './spec';
import { fmt } from './units';

export interface BomRow {
  item: string;
  piece: string;
  material: string;
  description: string;
  qty: number;
  size: string;
  /** Per item: carats for stones, grams for metal. */
  each: string;
  /** Total carats or grams. */
  total: string;
  unit: 'ct' | 'g';
  dwt: string;
}

const pieceName = (p: string): string => (p === 'engagement' ? 'Engagement ring' : 'Wedding band');

/** Bill of materials: one row per metal part and per stone group. */
export function bomRows(spec: RingSpec): BomRow[] {
  const rows: BomRow[] = [];
  for (const m of spec.metals)
    rows.push({
      item: m.label.replace(/^[^:]+:\s*/, ''),
      piece: pieceName(m.piece),
      material: m.metalName,
      description: `${m.purity}; ${m.finish} finish; ${fmt(m.volumeMm3, 1)} mm³ at ${fmt(m.density, 1)} g/cm³`,
      qty: 1,
      size: '',
      each: fmt(m.grams),
      total: fmt(m.grams),
      unit: 'g',
      dwt: fmt(m.dwt),
    });
  for (const s of spec.stones)
    rows.push({
      item: s.role === 'center' ? 'Center stone' : s.role === 'accent' ? 'Accent stone' : 'Band stone',
      piece: pieceName(s.piece),
      material: `${s.gemName} (${s.colorName})`,
      description: `${s.cutName}; SG ${fmt(s.sg)}${s.nominalCarat !== undefined ? `; specified ${fmt(s.nominalCarat)} ct` : ''}`,
      qty: s.count,
      size: `${fmt(s.lengthMm)} x ${fmt(s.widthMm)} x ${fmt(s.depthMm)} mm`,
      each: fmt(s.nominalCarat ?? s.caratEach, 3),
      total: fmt(s.nominalCarat !== undefined ? s.nominalCarat * s.count : s.caratTotal, 3),
      unit: 'ct',
      dwt: '',
    });
  return rows;
}

const CSV_HEADER = [
  'item',
  'piece',
  'material',
  'description',
  'qty',
  'size',
  'each',
  'total',
  'unit',
  'dwt',
] as const;

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** RFC 4180 CSV with a header row, CRLF line endings. */
export function bomCsv(spec: RingSpec): string {
  const lines = [CSV_HEADER.join(',')];
  for (const r of bomRows(spec)) lines.push(CSV_HEADER.map((k) => csvCell(r[k])).join(','));
  return lines.join('\r\n') + '\r\n';
}

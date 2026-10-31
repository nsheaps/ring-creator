import { innerDiameterMm } from '@/models/stoneMath';

/** One pennyweight (dwt) in grams. 20 dwt = 1 troy ounce = 31.1034768 g. */
export const GRAMS_PER_DWT = 1.55517384;
/** One metric carat in grams. */
export const GRAMS_PER_CARAT = 0.2;

export const gramsToDwt = (g: number): number => g / GRAMS_PER_DWT;
export const dwtToGrams = (dwt: number): number => dwt * GRAMS_PER_DWT;

/** mm³ of material with the given density (g/cm³) to grams. */
export const mm3ToGrams = (mm3: number, density: number): number => (mm3 / 1000) * density;
/** mm³ of a gem with the given specific gravity to carats. */
export const mm3ToCarats = (mm3: number, sg: number): number => mm3ToGrams(mm3, sg) / GRAMS_PER_CARAT;

export interface RingSizeRow {
  us: number;
  diameterMm: number;
  circumferenceMm: number;
}

export function ringSize(us: number): RingSizeRow {
  const d = innerDiameterMm(us);
  return { us, diameterMm: d, circumferenceMm: Math.PI * d };
}

/** US sizes 3 to 13 in half sizes, with inner diameter and circumference (mm). */
export function ringSizeTable(from = 3, to = 13, step = 0.5): RingSizeRow[] {
  const rows: RingSizeRow[] = [];
  for (let s = from; s <= to + 1e-9; s += step) rows.push(ringSize(Math.round(s * 100) / 100));
  return rows;
}

export const fmt = (n: number, digits = 2): string => (Number.isFinite(n) ? n.toFixed(digits) : '-');

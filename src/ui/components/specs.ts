import { listModels } from '@/models/registry';
import type { Model, ModelKind } from '@/models/types';

export const KINDS: ModelKind[] = ['cut', 'head', 'shank', 'band', 'gem', 'metal', 'finish', 'clarity', 'color-grade'];

const HIDDEN = new Set(['kind', 'id', 'name', 'summary', 'description', 'tags', 'pros', 'cons', 'bestFor', 'related', 'controls', 'params', 'colors', 'builder']);

const LABELS: Record<string, string> = {
  pricePerGramUsd: 'Price per gram',
  priceHintPerCaratUsd: 'Price per carat (about 1 ct)',
  mohs: 'Mohs hardness',
  ior: 'Refractive index',
  density: 'Density',
  volumeFactor: 'Volume factor',
  defaultAspect: 'Default length / width',
  aspectRange: 'Aspect range',
  defaultDepthPct: 'Default depth',
  facetStyle: 'Facet style',
  facetCount: 'Facets',
  vulnerableCorners: 'Vulnerable corners',
  fitsCuts: 'Fits cuts',
  extraStones: 'Extra stones',
  hasStones: 'Carries stones',
  contourCapable: 'Can contour',
  roughnessAdd: 'Added roughness',
  tintStrength: 'Tint strength',
  eyeClean: 'Eye clean',
  lab: 'Lab grown',
};

export function labelFor(key: string): string {
  if (LABELS[key]) return LABELS[key];
  const s = key.replace(/([A-Z])/g, ' $1').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const RATING_KEYS = new Set(['durability', 'protection', 'brilliance', 'upkeep', 'comfort']);
const UNITS: Record<string, string> = { density: 'g/cm³', pricePerGramUsd: '$/g' };

export interface SpecRow {
  key: string;
  label: string;
  /** Plain text value (or the number for ratings). */
  text: string;
  rating?: number;
  swatch?: string;
}

const fmtNum = (n: number) => String(Number(n.toFixed(3)));

export function formatValue(key: string, v: unknown): string {
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') {
    if (key === 'defaultDepthPct') return `${fmtNum(v * 100)}%`;
    if (key === 'pricePerGramUsd') return `$${fmtNum(v)}/g`;
    return UNITS[key] ? `${fmtNum(v)} ${UNITS[key]}` : fmtNum(v);
  }
  if (Array.isArray(v)) {
    if (key === 'priceHintPerCaratUsd') return `$${v[0]} to $${v[1]}`;
    return v.map((x) => formatValue(key, x)).join(key === 'aspectRange' ? ' to ' : ', ');
  }
  if (v === 'all') return 'All cuts';
  return String(v);
}

export function specRows(model: Model): SpecRow[] {
  const rows: SpecRow[] = [];
  for (const [key, v] of Object.entries(model)) {
    if (HIDDEN.has(key) || v === undefined || v === null) continue;
    if (RATING_KEYS.has(key) && typeof v === 'number') {
      rows.push({ key, label: labelFor(key), text: `${v} of 5`, rating: v });
    } else if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) {
      rows.push({ key, label: labelFor(key), text: v, swatch: v });
    } else {
      rows.push({ key, label: labelFor(key), text: formatValue(key, v) });
    }
  }
  return rows;
}

/** Find a model of any kind by id (first match in KINDS order). */
export function findAny(id: string): Model | undefined {
  for (const k of KINDS) {
    const m = (listModels(k) as Model[]).find((x) => x.id === id);
    if (m) return m;
  }
  return undefined;
}

export function matches(m: Model, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return `${m.name} ${m.summary} ${m.id} ${m.tags.join(' ')}`.toLowerCase().includes(s);
}

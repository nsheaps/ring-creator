/**
 * Converts the research records in data/research/rings-*.json into typed example designs:
 *   bun run catalog:build  ->  src/models/data/examples/rings.ts (generated, committed)
 * Records only carry what the source stated; gaps are filled with the nearest sensible default and
 * flagged in `blurb`. Facts only: no copied prose or images.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import '../src/models/data';
import { findModel, getModel, listModels } from '../src/models/registry';
import { defaultBand, defaultEngagement } from '../src/state/defaults';
import type { BandSpec, Design, EngagementSpec } from '../src/models/types';

interface RStone {
  material: string | null;
  cut: string | null;
  carat: number | null;
  colorName: string | null;
  clarity: string | null;
}
interface RRing {
  id: string;
  name: string;
  category: string;
  source: { name: string; url: string };
  priceUsd: number | null;
  kind: string;
  engagement: {
    stone: RStone;
    head: string | null;
    shank: string | null;
    metals: string[] | null;
    finish: string | null;
    accents: string[] | null;
    orientation: string | null;
  } | null;
  band: {
    style: string | null;
    metals: string[] | null;
    stones: string | null;
    widthMm: number | null;
  } | null;
  notes: string | null;
}

const dir = 'data/research';
const records: RRing[] = readdirSync(dir)
  .filter((f) => /^rings-\d+\.json$/.test(f))
  .sort()
  .flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as RRing[]);

const METAL_ALIAS: Record<string, string> = { 'yellow-gold-24k': 'yellow-gold-18k' };
const metalId = (m: string | undefined, fallback: string): string => {
  const id = m ? (METAL_ALIAS[m] ?? m) : fallback;
  return findModel('metal', id) ? id : fallback;
};

function gemColor(material: string, name: string | null): string {
  const gem = getModel('gem', material);
  const n = (name ?? '').toLowerCase();
  if (!n) return gem.defaultColor;
  const direct = gem.colors.find(
    (c) => n.includes(c.id.replace(/-/g, ' ')) || n.includes(c.name.toLowerCase()),
  );
  if (direct) return direct.id;
  const words: [RegExp, string][] = [
    [/salt/, 'salt-and-pepper'],
    [/black/, 'black'],
    [/padparadscha/, 'padparadscha'],
    [/teal|blue-green/, 'teal'],
    [/ceylon|royal/, 'royal-blue'],
    [/blue/, 'blue'],
    [/pink/, 'pink'],
    [/yellow/, 'yellow'],
    [/champagne|brown/, 'champagne'],
    [/green/, 'green'],
    [/peach|salmon/, 'peach'],
    [/red/, 'red'],
    [/purple|violet/, 'purple'],
  ];
  for (const [re, id] of words) if (re.test(n) && gem.colors.some((c) => c.id === id)) return id;
  if (/^[d-f]\b|colorless/.test(n) && gem.colors.some((c) => c.id === 'colorless')) return 'colorless';
  if (/^[g-m]/.test(n) && gem.colors.some((c) => c.id === 'near-colorless')) return 'near-colorless';
  return gem.defaultColor;
}

function gradeFor(name: string | null): string {
  const l = (name ?? '').trim().toLowerCase()[0] ?? 'f';
  if ('def'.includes(l)) return 'd-f';
  if ('ghij'.includes(l)) return 'g-j';
  if ('klm'.includes(l)) return 'k-m';
  return /[n-r]/.test(l) ? 'n-r' : 'd-f';
}

const HEAD_ALIAS: Record<string, string> = { 'halo-oval': 'halo-oval' };
function engagementFrom(r: RRing): EngagementSpec {
  const e = r.engagement!;
  const base = defaultEngagement();
  const material = e.stone.material && findModel('gem', e.stone.material) ? e.stone.material : 'diamond';
  const cut = e.stone.cut && findModel('cut', e.stone.cut) ? e.stone.cut : 'round-brilliant';
  const headId =
    e.head && findModel('head', HEAD_ALIAS[e.head] ?? e.head)
      ? (HEAD_ALIAS[e.head] ?? e.head)
      : 'solitaire-4-prong';
  const shankId = e.shank && findModel('shank', e.shank) ? e.shank : 'plain-round';
  const headMetal = metalId(e.metals?.[0], 'white-gold-14k');
  const shankMetal = metalId(e.metals?.[1] ?? e.metals?.[0], headMetal);
  const clarity = (e.stone.clarity ?? 'vs1').toLowerCase().replace(/\s/g, '');
  const carat =
    e.stone.carat && e.stone.carat >= 0.2 && e.stone.carat <= 10
      ? e.stone.carat
      : material === 'diamond'
        ? 1
        : 1.5;
  const accentMaterial = ['diamond', 'lab-diamond', 'moissanite'].includes(material) ? material : 'diamond';
  const finish = e.finish && findModel('finish', e.finish) ? e.finish : 'polished';
  return {
    ...base,
    center: {
      material,
      color: gemColor(material, e.stone.colorName),
      cut,
      carat,
      clarity: findModel('clarity', clarity) ? clarity : 'vs1',
      colorGrade: ['diamond', 'lab-diamond', 'moissanite'].includes(material)
        ? gradeFor(e.stone.colorName)
        : undefined,
    },
    accentStone: {
      material: accentMaterial,
      color: getModel('gem', accentMaterial).defaultColor,
      cut: 'round-brilliant',
      sizeMm: headId.includes('halo') || headId === 'cluster' ? 1.2 : 1.6,
    },
    head: { id: headId, metal: headMetal, params: {} },
    shank: { id: shankId, metal: shankMetal, params: {} },
    placement: {
      ...base.placement,
      orientation: e.orientation === 'east-west' ? 'east-west' : 'north-south',
      raise: headId.startsWith('bezel') || headId === 'flush-gypsy' ? 0.2 : 1.2,
    },
    finish,
  };
}

function bandFrom(r: RRing, fallbackMetal: string): BandSpec {
  const b = r.band!;
  const base = defaultBand();
  const style = b.style && findModel('band', b.style) ? b.style : 'plain-comfort';
  const m0 = metalId(b.metals?.[0], fallbackMetal);
  const m1 = metalId(b.metals?.[1], 'rose-gold-14k');
  const mens = style.startsWith('mens');
  return {
    ...base,
    style,
    metal: m0,
    metal2: m1,
    widthMm: b.widthMm && b.widthMm >= 1.2 && b.widthMm <= 10 ? b.widthMm : mens ? 6 : 2.6,
    thicknessMm: mens ? 2.2 : 1.8,
  };
}

const families = new Set<string>();
const out = records.map((r) => {
  const now = '2026-10-31T00:00:00.000Z';
  const engagement = r.engagement ? engagementFrom(r) : { ...defaultEngagement() };
  if (!r.engagement && r.band?.metals?.[0]) {
    const m = metalId(r.band.metals[0], 'white-gold-14k');
    engagement.head.metal = m;
    engagement.shank.metal = m;
  }
  const band = r.band ? bandFrom(r, engagement.shank.metal) : null;
  const view = r.engagement ? (band ? 'set' : 'ring') : 'band';
  const family = r.engagement
    ? `${engagement.head.id} / ${engagement.shank.id} / ${engagement.center.cut}`
    : `band: ${band?.style}`;
  families.add(family);
  const gaps: string[] = [];
  if (r.engagement && !r.engagement.head) gaps.push('head');
  if (r.engagement && !r.engagement.shank) gaps.push('shank');
  if (r.engagement && !r.engagement.stone.carat) gaps.push('carat');
  const design: Design & Record<string, unknown> = {
    version: 1,
    id: r.id,
    name: r.name,
    createdAt: now,
    updatedAt: now,
    ringSizeUS: 6.5,
    engagement,
    band,
    source: r.source,
    tags: [r.category, r.kind],
    category: r.category,
    blurb:
      (r.notes ?? '') +
      (gaps.length ? ` (Not stated by the source, so the model uses a default ${gaps.join(', ')}.)` : ''),
    priceUsd: r.priceUsd,
    designFamily: family,
    view,
  };
  return design;
});

const header = `// GENERATED by scripts/build-examples.ts from data/research/rings-*.json. Do not edit by hand; re-run \`bun run catalog:build\`.\n// ${out.length} example rings, ${families.size} distinct design families.\nimport type { ExampleDesign } from './types';\n\n`;
writeFileSync(
  'src/models/data/examples/rings.ts',
  `${header}export const rings: ExampleDesign[] = ${JSON.stringify(out, null, 1)};\n`,
);
console.log(
  `wrote ${out.length} examples, ${families.size} design families, ${listModels('head').length} heads known`,
);

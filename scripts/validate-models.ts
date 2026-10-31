/** Data-contract gate: every model has a builder, every example ring resolves, vocabulary is covered, counts meet the demo bar. */
import { readFileSync } from 'node:fs';
import '../src/models/data';
import { bandBuilders, headBuilders, shankBuilders, stoneBuilders } from '../src/geometry/builders';
import { findModel, KIND_LABELS, listModels } from '../src/models/registry';
import { exampleDesigns } from '../src/models/data/examples';
import type { ModelKind } from '../src/models/types';

const errors: string[] = [];
const err = (m: string) => errors.push(m);

for (const m of listModels('cut'))
  if (!stoneBuilders.has(m.builder)) err(`cut ${m.id}: missing stone builder "${m.builder}"`);
for (const m of listModels('head'))
  if (!headBuilders.has(m.builder)) err(`head ${m.id}: missing builder "${m.builder}"`);
for (const m of listModels('shank'))
  if (!shankBuilders.has(m.builder)) err(`shank ${m.id}: missing builder "${m.builder}"`);
for (const m of listModels('band'))
  if (!bandBuilders.has(m.builder)) err(`band ${m.id}: missing builder "${m.builder}"`);

for (const kind of Object.keys(KIND_LABELS) as ModelKind[]) {
  for (const m of listModels(kind)) {
    if (!m.summary || m.summary.length < 10) err(`${kind} ${m.id}: summary too short`);
    if (!m.description || m.description.length < 80) err(`${kind} ${m.id}: description too short`);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(m.id)) err(`${kind} ${m.id}: id must be kebab-case`);
    if ('controls' in m)
      for (const c of m.controls)
        if (!(c.key in m.params)) err(`${kind} ${m.id}: control "${c.key}" has no default in params`);
  }
}

// vocabulary coverage
const vocab = readFileSync('docs/specs/vocabulary.md', 'utf8');
const section = (title: string): string[] => {
  const re = new RegExp(`## ${title}[^\\n]*\\n([\\s\\S]*?)(?:\\n## |$)`);
  const body = vocab.match(re)?.[1] ?? '';
  return body.split(/[\s,]+/).filter((s) => /^[a-z0-9][a-z0-9-]+$/.test(s) && s !== 'melee');
};
const checks: [string, ModelKind][] = [
  ['Stone materials', 'gem'],
  ['Cuts', 'cut'],
  ['Heads', 'head'],
  ['Shanks', 'shank'],
  ['Metals', 'metal'],
  ['Finishes', 'finish'],
  ['Wedding band styles', 'band'],
];
for (const [title, kind] of checks)
  for (const id of section(title)) if (!findModel(kind, id)) err(`vocabulary ${kind} "${id}" has no model`);

// examples
const families = new Set<string>();
for (const d of exampleDesigns) {
  const e = d.engagement;
  if (!findModel('gem', e.center.material)) err(`${d.id}: gem ${e.center.material}`);
  const gem = findModel('gem', e.center.material);
  if (gem && !gem.colors.some((c) => c.id === e.center.color))
    err(`${d.id}: color ${e.center.color} not in ${gem.id}`);
  if (!findModel('cut', e.center.cut)) err(`${d.id}: cut ${e.center.cut}`);
  if (!findModel('head', e.head.id)) err(`${d.id}: head ${e.head.id}`);
  if (!findModel('shank', e.shank.id)) err(`${d.id}: shank ${e.shank.id}`);
  if (!findModel('metal', e.head.metal) || !findModel('metal', e.shank.metal)) err(`${d.id}: metal`);
  if (d.band && (!findModel('band', d.band.style) || !findModel('metal', d.band.metal))) err(`${d.id}: band`);
  families.add(d.designFamily);
}
if (exampleDesigns.length < 100) err(`need >= 100 example rings, have ${exampleDesigns.length}`);
if (families.size < 15) err(`need >= 15 unique design families, have ${families.size}`);
if (new Set(exampleDesigns.map((d) => d.id)).size !== exampleDesigns.length) err('duplicate example ids');

if (errors.length) {
  console.error(errors.map((e) => `  ✗ ${e}`).join('\n'));
  console.error(`\n${errors.length} problem(s)`);
  process.exit(1);
}
const counts = (Object.keys(KIND_LABELS) as ModelKind[])
  .map((k) => `${listModels(k).length} ${k}`)
  .join(', ');
console.log(`ok: ${counts}; ${exampleDesigns.length} examples in ${families.size} design families`);

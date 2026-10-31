import type {
  BandStyleModel,
  ClarityModel,
  ColorGradeModel,
  CutModel,
  FinishModel,
  GemModel,
  HeadModel,
  Id,
  MetalModel,
  Model,
  ModelKind,
  ShankModel,
} from './types';

type ByKind = {
  metal: MetalModel;
  finish: FinishModel;
  gem: GemModel;
  clarity: ClarityModel;
  'color-grade': ColorGradeModel;
  cut: CutModel;
  head: HeadModel;
  shank: ShankModel;
  band: BandStyleModel;
};

const store: { [K in ModelKind]: Map<Id, ByKind[K]> } = {
  metal: new Map(),
  finish: new Map(),
  gem: new Map(),
  clarity: new Map(),
  'color-grade': new Map(),
  cut: new Map(),
  head: new Map(),
  shank: new Map(),
  band: new Map(),
};

export function registerModels(models: readonly Model[]): void {
  for (const m of models) {
    const map = store[m.kind] as Map<Id, Model>;
    if (map.has(m.id)) throw new Error(`Duplicate ${m.kind} model id "${m.id}"`);
    map.set(m.id, m);
  }
}

export function listModels<K extends ModelKind>(kind: K): ByKind[K][] {
  return [...store[kind].values()] as ByKind[K][];
}

export function findModel<K extends ModelKind>(kind: K, id: Id): ByKind[K] | undefined {
  return store[kind].get(id) as ByKind[K] | undefined;
}

export function getModel<K extends ModelKind>(kind: K, id: Id): ByKind[K] {
  const m = findModel(kind, id);
  if (!m) throw new Error(`Unknown ${kind} model "${id}"`);
  return m;
}

export const KIND_LABELS: Record<ModelKind, string> = {
  metal: 'Metals',
  finish: 'Finishes',
  gem: 'Gemstones',
  clarity: 'Clarity grades',
  'color-grade': 'Color grades',
  cut: 'Stone cuts',
  head: 'Heads & mounts',
  shank: 'Shanks',
  band: 'Wedding band styles',
};

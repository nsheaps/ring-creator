import type { StoneDims } from '@/models/stoneMath';
import type { CutModel } from '@/models/types';
import { stoneBuilders } from '../builders';
import type { BuiltStone, StoneBuildOptions } from '../types';
import './brilliant';
import './step';
import './rose';
import './cabochon';

export { buildBrilliant } from './brilliant';
export { buildStep } from './step';
export { buildRose } from './rose';
export { buildCabochon } from './cabochon';
export { makeShape, shoelaceXZ } from './shapes';

/** Builder keys registered by this area (CutModel.builder must be one of these). */
export const STONE_BUILDER_KEYS = ['brilliant', 'step', 'rose', 'cabochon'] as const;

/** Evicted / cleared entries are not disposed (a scene may still hold them); GC frees them. */

/** Builds a stone for a cut model (uncached). Throws if the cut's builder is not registered. */
export function buildStoneUncached(cut: CutModel, dims: StoneDims, opts: StoneBuildOptions = {}): BuiltStone {
  const fn = stoneBuilders.get(cut.builder);
  if (!fn) throw new Error(`No stone builder "${cut.builder}" for cut "${cut.id}"`);
  return fn(dims, cut.params, opts);
}

const MAX_CACHE = 400;
const cache = new Map<string, BuiltStone>();
const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Memoised stone builder, keyed by cut id + dims rounded to 0.01 mm + detail. The returned BuiltStone is SHARED:
 * never mutate its geometry in place (clone() before applyMatrix4, or use instanceGeometry which clones).
 */
export function buildStoneByCut(cut: CutModel, dims: StoneDims, opts: StoneBuildOptions = {}): BuiltStone {
  const rd: StoneDims = { length: r2(dims.length), width: r2(dims.width), depth: r2(dims.depth) };
  const detail = opts.detail ?? 'full';
  const key = `${cut.id}|${rd.length}|${rd.width}|${rd.depth}|${detail}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key); // refresh LRU position
    cache.set(key, hit);
    return hit;
  }
  const built = buildStoneUncached(cut, rd, { detail });
  cache.set(key, built);
  if (cache.size > MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      cache.delete(oldest);
    }
  }
  return built;
}

export function clearStoneCache(): void {
  cache.clear();
}

export function stoneCacheSize(): number {
  return cache.size;
}

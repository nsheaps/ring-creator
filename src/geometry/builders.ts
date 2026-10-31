import type { BandBuilder, HeadBuilder, ShankBuilder, StoneBuilder } from './types';

/** Builder registries. Each geometry module registers its builders on import (see src/geometry/index.ts). */
export const stoneBuilders = new Map<string, StoneBuilder>();
export const headBuilders = new Map<string, HeadBuilder>();
export const shankBuilders = new Map<string, ShankBuilder>();
export const bandBuilders = new Map<string, BandBuilder>();

export function registerStoneBuilder(key: string, fn: StoneBuilder): void {
  stoneBuilders.set(key, fn);
}
export function registerHeadBuilder(key: string, fn: HeadBuilder): void {
  headBuilders.set(key, fn);
}
export function registerShankBuilder(key: string, fn: ShankBuilder): void {
  shankBuilders.set(key, fn);
}
export function registerBandBuilder(key: string, fn: BandBuilder): void {
  bandBuilders.set(key, fn);
}

import type { AccentStoneSpec, BandSpec, Design, EngagementSpec } from '@/models/types';

export const defaultAccent: AccentStoneSpec = {
  material: 'diamond',
  color: 'colorless',
  cut: 'round-brilliant',
  sizeMm: 1.4,
};

export function defaultEngagement(): EngagementSpec {
  return {
    center: {
      material: 'diamond',
      color: 'colorless',
      cut: 'round-brilliant',
      carat: 1,
      clarity: 'vs1',
      colorGrade: 'd-f',
    },
    accentStone: { ...defaultAccent },
    head: { id: 'solitaire-4-prong', metal: 'white-gold-14k', params: {} },
    shank: { id: 'plain-round', metal: 'white-gold-14k', params: {} },
    placement: { orientation: 'north-south', raise: 1.2, tilt: 0, rotate: 0, offset: 0 },
    finish: 'polished',
  };
}

export function defaultBand(): BandSpec {
  return {
    style: 'plain-comfort',
    metal: 'white-gold-14k',
    metal2: 'rose-gold-14k',
    finish: 'polished',
    params: {},
    widthMm: 2.6,
    thicknessMm: 1.8,
    accentStone: { ...defaultAccent, sizeMm: 1.5 },
    fit: 'auto',
  };
}

export function newId(): string {
  return `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function defaultDesign(name = 'My ring'): Design {
  const now = new Date().toISOString();
  return {
    version: 1,
    id: newId(),
    name,
    createdAt: now,
    updatedAt: now,
    ringSizeUS: 6.5,
    engagement: defaultEngagement(),
    band: defaultBand(),
  };
}

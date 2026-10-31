import type { Design } from '@/models/types';

/** A curated example ring shown in the gallery. Extends a full Design with catalogue metadata. */
export interface ExampleDesign extends Design {
  id: string;
  category: string;
  blurb: string;
  priceUsd?: number | null;
  source?: { name: string; url: string };
  designFamily: string;
  /** Which view best shows this example: bands-only items default to 'band'. */
  view?: 'ring' | 'band' | 'set';
}

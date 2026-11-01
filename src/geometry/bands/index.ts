/** Registers every wedding-band builder (importing this module is enough). Builder keys equal the band style ids. */
import './plainBands';
import './stoneBands';
import './patternBands';

export const BAND_BUILDER_KEYS = [
  'plain-comfort',
  'plain-flat',
  'knife-edge',
  'milgrain-band',
  'half-eternity',
  'full-eternity',
  'three-quarter-eternity',
  'channel-band',
  'pave-band',
  'shared-prong',
  'bezel-band',
  'contour-curved',
  'chevron',
  'notched',
  'stacker-trio',
  'twisted-band',
  'braided-band',
  'vine-band',
  'bamboo-band',
  'art-deco-band',
  'mixed-metal-band',
  'mens-classic',
  'mens-hammered',
  'mens-inlay',
] as const;

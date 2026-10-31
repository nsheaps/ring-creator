/**
 * Model schema. Everything a user can pick (metals, gems, cuts, heads, shanks, bands...) is a *model*:
 * a plain data object. Adding a model = adding an entry to a file in src/models/data/.
 * Geometry comes from named builders (src/geometry) driven by each model's `params`.
 */
export type Id = string;
export type ParamValue = number | string | boolean;
export type Params = Record<string, ParamValue>;

export interface NumberControl {
  type: 'number';
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
  help?: string;
}
export interface SelectControl {
  type: 'select';
  key: string;
  label: string;
  options: { value: string; label: string }[];
  help?: string;
}
export interface ToggleControl {
  type: 'toggle';
  key: string;
  label: string;
  help?: string;
}
export type Control = NumberControl | SelectControl | ToggleControl;

export interface ModelBase {
  id: Id;
  name: string;
  /** One sentence, plain text. */
  summary: string;
  /** Markdown, 2-4 short paragraphs: what it is, look, history, who it suits. User-facing. */
  description: string;
  tags: string[];
  pros?: string[];
  cons?: string[];
  bestFor?: string[];
  /** Ids of related models (any kind) for "see also". */
  related?: Id[];
}

export type MetalFamily = 'yellow' | 'white' | 'rose' | 'platinum-group' | 'silver' | 'industrial' | 'dark';
export interface MetalModel extends ModelBase {
  kind: 'metal';
  family: MetalFamily;
  purity: string; // e.g. "58.3% gold (14k)"
  color: string; // base hex
  roughness: number; // polished look
  metalness: number;
  density: number; // g/cm3
  mohs: number;
  hypoallergenic: boolean;
  pricePerGramUsd: number; // rough 2026 spot-derived price, informational
  durability: 1 | 2 | 3 | 4 | 5;
  maintenance: string;
}

export interface FinishModel extends ModelBase {
  kind: 'finish';
  /** Added to the metal's roughness (0 = mirror polish). */
  roughnessAdd: number;
  /** 0..1 amount of micro-surface noise / bump. */
  bump: number;
}

export interface GemColor {
  id: Id;
  name: string;
  hex: string;
  rarity?: 'common' | 'uncommon' | 'rare';
}
export interface GemModel extends ModelBase {
  kind: 'gem';
  lab: boolean;
  ior: number;
  mohs: number;
  density: number; // specific gravity, g/cm3
  dispersion: number; // fire, 0..0.2
  colors: GemColor[];
  defaultColor: Id;
  transparency: 'transparent' | 'translucent' | 'opaque';
  durability: 1 | 2 | 3 | 4 | 5;
  birthstone?: string;
  priceHintPerCaratUsd: [number, number]; // typical retail range at ~1 ct
}

export interface ClarityModel extends ModelBase {
  kind: 'clarity';
  code: string; // FL, IF, VVS1, VVS2, VS1, VS2, SI1, SI2, I1
  rank: number; // 0 best
  /** 0..1 how visible inclusions look in the 3D preview (cloudiness / specks). */
  haze: number;
  eyeClean: boolean;
}

export interface ColorGradeModel extends ModelBase {
  kind: 'color-grade';
  letters: string; // "D-F"
  /** Body tint blended into colorless stones, hex. */
  tint: string;
  tintStrength: number; // 0..1
}

export interface CutModel extends ModelBase {
  kind: 'cut';
  builder: string; // key in stone builder registry
  params: Params;
  /** ct = volumeFactor * L * W * D * (SG / 3.52). Standard gemological estimation constants. */
  volumeFactor: number;
  defaultAspect: number; // length / width
  aspectRange: [number, number];
  defaultDepthPct: number; // depth / width, in 0..1.
  facetStyle: 'brilliant' | 'step' | 'rose' | 'mixed' | 'smooth';
  facetCount: number;
  /** Does it have sharp corners that need protecting? (prong sites) */
  vulnerableCorners: number;
}

export interface HeadModel extends ModelBase {
  kind: 'head';
  builder: string;
  params: Params;
  controls: Control[];
  fitsCuts: Id[] | 'all';
  /** Number of extra stones the head adds, for display. */
  extraStones: string; // "0", "2 side stones", "pave halo (~30)"
  protection: 1 | 2 | 3 | 4 | 5;
  brilliance: 1 | 2 | 3 | 4 | 5;
  upkeep: 1 | 2 | 3 | 4 | 5; // 5 = easy to clean
}

export interface ShankModel extends ModelBase {
  kind: 'shank';
  builder: string;
  params: Params;
  controls: Control[];
  /** Does it carry its own stones (pave, channel)? */
  hasStones: boolean;
  comfort: 1 | 2 | 3 | 4 | 5;
  durability: 1 | 2 | 3 | 4 | 5;
}

export interface BandStyleModel extends ModelBase {
  kind: 'band';
  builder: string;
  params: Params;
  controls: Control[];
  hasStones: boolean;
  /** Can bend around an engagement head (contour / curved)? */
  contourCapable: boolean;
  /** Typical user: bride's band or men's. */
  audience: 'women' | 'men' | 'any';
}

export type Model =
  | MetalModel
  | FinishModel
  | GemModel
  | ClarityModel
  | ColorGradeModel
  | CutModel
  | HeadModel
  | ShankModel
  | BandStyleModel;
export type ModelKind = Model['kind'];

// ---------- User designs ----------

export interface StoneSpec {
  material: Id; // GemModel id
  color: Id; // GemColor id
  cut: Id;
  carat: number;
  clarity: Id; // ClarityModel id
  colorGrade?: Id; // ColorGradeModel id (diamond-like)
  /** Overrides cut.defaultAspect. */
  aspect?: number;
  depthPct?: number;
}

export interface AccentStoneSpec {
  material: Id;
  color: Id;
  cut: Id;
  /** Diameter / length in mm of each accent stone (halo melee, side stones, pave). */
  sizeMm: number;
}

export interface PlacementSpec {
  orientation: 'north-south' | 'east-west';
  /** mm of clearance between the shank top and the stone's culet (setting height). */
  raise: number;
  /** degrees, tilts stone toward the fingertip (+) or knuckle (-). */
  tilt: number;
  /** degrees, rotates the stone about its vertical axis (diamond / kite alignments). */
  rotate: number;
  /** mm, slides the stone along the band direction (bypass / asymmetric). */
  offset: number;
}

export interface EngagementSpec {
  center: StoneSpec;
  accentStone: AccentStoneSpec;
  head: { id: Id; metal: Id; params: Params };
  shank: { id: Id; metal: Id; params: Params };
  /** Metal for accent-stone pave and the like when set in the shank. Same as shank by default. */
  placement: PlacementSpec;
  finish: Id;
}

export interface BandSpec {
  style: Id;
  metal: Id;
  /** Second metal for two-tone / inlay styles. */
  metal2: Id;
  finish: Id;
  params: Params;
  widthMm: number;
  thicknessMm: number;
  accentStone: AccentStoneSpec;
  /** 'auto': contour-capable styles bend around the engagement head. */
  fit: 'auto' | 'flush' | 'contour';
}

export interface Design {
  version: 1;
  id: string;
  name: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  ringSizeUS: number;
  engagement: EngagementSpec;
  /** null = engagement ring only. */
  band: BandSpec | null;
  /** Optional provenance for example rings. */
  source?: { name: string; url: string };
  tags?: string[];
}

import type * as THREE from 'three';
import type { StoneDims } from '@/models/stoneMath';
import type { CutModel, GemModel, Id, Params } from '@/models/types';

/**
 * COORDINATE FRAMES (all units millimetres)
 *
 * Ring frame:  the finger axis is +Z, ring centre at origin, the "top" of the ring (where the stone sits)
 *              is +Y, the band tangent at the top is +X. A shank is a loop in the XY plane around Z.
 *              theta is measured from +X towards +Y, so the top is theta = PI/2.
 *
 * Stone frame: origin at the stone's girdle centre. Length along +X, width along +Z, table facing +Y,
 *              culet at -Y. (Heads are built in the stone frame; the assembler moves them.)
 */

export type PartSlot =
  | 'center-stone'
  | 'accent-stone' // halo melee, side stones, shank pave stones
  | 'head-metal'
  | 'shank-metal'
  | 'band-metal'
  | 'band-metal2'
  | 'band-stone'
  | 'band-stone2'; // every other stone of an alternating band (param `alternate` names its gem)

export interface Part {
  slot: PartSlot;
  geometry: THREE.BufferGeometry;
  /** Human label for debugging / docs. */
  label?: string;
}

/** Girdle outline in the stone frame (x,z), counter-clockwise seen from +Y. */
export interface Outline {
  points: [number, number][];
  /** Indices into points of the corners (prong sites for corner-protecting heads). */
  corners: number[];
}

export interface BuiltStone {
  /** Non-indexed, flat-shaded faceted geometry in the stone frame, girdle at y=0, table at y=+crownHeight, culet at y=-pavilionDepth. */
  geometry: THREE.BufferGeometry;
  outline: Outline;
  crownHeight: number;
  pavilionDepth: number;
  girdleThickness: number;
}

export interface StoneBuildOptions {
  /** 'low' = cheap version (fewer facets) for melee / pave. Must stay recognisably the same cut. */
  detail?: 'full' | 'low';
}

export type StoneBuilder = (dims: StoneDims, params: Params, opts: StoneBuildOptions) => BuiltStone;

export interface ResolvedStone {
  gem: GemModel;
  colorHex: string;
  cut: CutModel;
  dims: StoneDims;
  carat: number;
  built: BuiltStone;
}

export interface ResolvedAccent {
  gem: GemModel;
  colorHex: string;
  cut: CutModel;
  sizeMm: number;
}

/** Everything a head builder needs. Build in the stone frame; the stone's girdle plane is y = 0. */
export interface HeadCtx {
  center: ResolvedStone;
  accent: ResolvedAccent;
  /** Resolved params: model defaults merged with user overrides. */
  params: Params;
  /** Distance from the girdle plane DOWN to the top surface of the shank at the stone's centre (always > 0). Heads must reach y = -baseDrop to join the shank. */
  baseDrop: number;
  /** Axial width (along the finger, ring Z) of the shank at the top of the ring. */
  shankWidth: number;
  /** Unit vector in the stone frame (x,z) along the band tangent at the top (ring +X). (1,0) for east-west, (0,1) for north-south. */
  bandAxis: [number, number];
  /** Create (and cache) a stone for side stones / halos: cut id + dims -> BuiltStone. */
  stone(cutId: Id, dims: StoneDims, opts?: StoneBuildOptions): BuiltStone;
  /** Ring inner radius, mm. */
  innerRadius: number;
  /** Radius of the shank's top surface at the seat (the shank's seatY), mm. Optional: heads fall back to innerRadius + 1.8. */
  seatRadius?: number;
  /** Set when the shank's ends stop on the shoulders for the head to grow out of (bypass shank, `ends: 'blade'`). */
  shankEnds?: ShankEnds;
}

export interface ShankCtx {
  innerRadius: number;
  center: ResolvedStone;
  accent: ResolvedAccent;
  params: Params;
  /** Half extents of the head footprint at the shank top, along the band (X) and along the finger (Z). Use for cathedral rise, split starts, etc. */
  headHalfAlongBand: number;
  headHalfAlongFinger: number;
  stone(cutId: Id, dims: StoneDims, opts?: StoneBuildOptions): BuiltStone;
}

export interface ShankResult {
  parts: Part[];
  /** y of the top surface of the shank at theta = PI/2 (the head seat) */
  seatY: number;
  /** axial width (Z) at the top */
  topWidth: number;
  /** Open ends that stop on the shoulders so a head (the swept blades) can continue them seamlessly. */
  ends?: ShankEnds;
}

/**
 * Where a shank's two open ends stop, in the ring frame. The end on the +X shoulder is described; the other end is
 * its point reflection through the finger axis (at -X, -z).
 */
export interface ShankEnds {
  /** angle (radians) from the top of the ring at which the +X end stops */
  angle: number;
  /** z of the +X end's centre line */
  z: number;
  /** closed cross section of the end as (z offset from the centre line, radius) pairs */
  profile: [number, number][];
}

export interface BandCtx {
  innerRadius: number;
  params: Params;
  widthMm: number;
  thicknessMm: number;
  accent: ResolvedAccent;
  /** When set the band must curve/notch away from the engagement ring's head around theta = PI/2. */
  contour?: ContourSpec;
  /** z centre of the band (the assembler sets it so the band sits next to the engagement shank). Builders should build centred on z = 0; the assembler translates. */
  stone(cutId: Id, dims: StoneDims, opts?: StoneBuildOptions): BuiltStone;
}

export interface ContourSpec {
  /** How far (mm) the band must retreat along Z (away from the engagement ring) at theta = PI/2. */
  retreatMm: number;
  /** Half angle (radians) either side of the top over which the band deviates. */
  halfAngle: number;
  /** +1 or -1: which way the band moves along Z. */
  direction: 1 | -1;
}

export type HeadBuilder = (ctx: HeadCtx) => Part[];
export type ShankBuilder = (ctx: ShankCtx) => ShankResult;
export type BandBuilder = (ctx: BandCtx) => Part[];

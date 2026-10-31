import * as THREE from 'three';
import { assembleDesign, disposeGroup, resolveCenter, type RingView } from '@/geometry/assemble';
import { findModel, getModel } from '@/models/registry';
import type { Design, Id, MetalModel } from '@/models/types';
import { metalMaterial } from '@/scene/materials';

/** What to export: the engagement ring, the wedding band, or both as worn. */
export type ExportScope = 'engagement' | 'band' | 'set';

export type PartRole = 'shank' | 'head' | 'band' | 'band2' | 'center' | 'accent' | 'band-stone';
export type Piece = 'engagement' | 'band';

/** One exportable mesh: flat triangle soup in the ring frame, millimetres. */
export interface ExportPart {
  /** Stable id, e.g. "engagement-shank". */
  id: string;
  label: string;
  piece: Piece;
  role: PartRole;
  kind: 'metal' | 'stone';
  /** Metal model id (metal parts) or gem model id (stones). */
  materialId: Id;
  /** Display name of the material, e.g. "14k yellow gold" / "Diamond". */
  materialName: string;
  colorHex: string;
  roughness: number;
  metalness: number;
  opacity: number;
  /** x,y,z per vertex, 3 vertices per triangle. */
  positions: Float32Array;
}

export const scopeView = (scope: ExportScope): RingView =>
  scope === 'engagement' ? 'ring' : scope === 'band' ? 'band' : 'set';

export function scopeAvailable(design: Design, scope: ExportScope): boolean {
  return scope === 'engagement' || !!design.band;
}

/** Normalises a requested scope against the design (no band => engagement). */
export function effectiveScope(design: Design, scope: ExportScope): ExportScope {
  return scopeAvailable(design, scope) ? scope : 'engagement';
}

function flatPositions(mesh: THREE.Mesh): Float32Array {
  mesh.updateMatrixWorld(true);
  let g = mesh.geometry as THREE.BufferGeometry;
  if (g.index) g = g.toNonIndexed();
  const src = g.getAttribute('position');
  const out = new Float32Array(src.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < src.count; i++) {
    v.fromBufferAttribute(src, i).applyMatrix4(mesh.matrixWorld);
    out[i * 3] = v.x;
    out[i * 3 + 1] = v.y;
    out[i * 3 + 2] = v.z;
  }
  return out;
}

/**
 * The assembler renders each gem slot as two meshes sharing one geometry (inner mirror shell, then outer shell)
 * and each metal slot as one mesh. Group them structurally so the result does not depend on material classes.
 */
interface Slot {
  mesh: THREE.Mesh;
  gem: boolean;
}
function slotsOf(meshes: THREE.Mesh[]): Slot[] {
  const out: Slot[] = [];
  for (let i = 0; i < meshes.length; i++) {
    const next = meshes[i + 1];
    if (next && next.geometry === meshes[i].geometry) {
      out.push({ mesh: next, gem: true });
      i++;
    } else out.push({ mesh: meshes[i], gem: false });
  }
  return out;
}

function metalOf(mat: THREE.Material, candidates: { id: Id; finish?: Id }[]): MetalModel | null {
  for (const c of candidates) {
    const metal = findModel('metal', c.id);
    if (!metal) continue;
    const finish = c.finish ? findModel('finish', c.finish) : undefined;
    if (metalMaterial(metal, finish) === mat) return metal;
  }
  // Fallback: compare base colour (e.g. if the material cache was flushed in between).
  const std = mat as THREE.MeshStandardMaterial;
  for (const c of candidates) {
    const metal = findModel('metal', c.id);
    if (metal && std.color && std.color.getHexString() === new THREE.Color(metal.color).getHexString())
      return metal;
  }
  return null;
}

interface Classified {
  role: PartRole;
  kind: 'metal' | 'stone';
  materialId: Id;
  mesh: THREE.Mesh;
}

function classifyEngagement(design: Design, meshes: THREE.Mesh[]): Classified[] {
  const e = design.engagement;
  const center = resolveCenter(e.center);
  const centerCount = center.built.geometry.getAttribute('position').count;
  const out: Classified[] = [];
  let seenCenter = false;
  for (const { mesh, gem } of slotsOf(meshes)) {
    const mat = mesh.material as THREE.Material;
    if (gem) {
      const count = (mesh.geometry as THREE.BufferGeometry).getAttribute('position').count;
      if (!seenCenter && count === centerCount) {
        seenCenter = true;
        out.push({ role: 'center', kind: 'stone', materialId: e.center.material, mesh });
      } else out.push({ role: 'accent', kind: 'stone', materialId: e.accentStone.material, mesh });
      continue;
    }
    const cands = [
      { id: e.shank.metal, finish: e.finish },
      { id: e.head.metal, finish: e.finish },
    ];
    const metal = metalOf(mat, seenCenter ? [...cands].reverse() : cands);
    // The assembler emits shank parts first and the (placed) centre stone before the head's metal.
    const role: PartRole =
      e.head.metal !== e.shank.metal && metal
        ? metal.id === e.head.metal
          ? 'head'
          : 'shank'
        : seenCenter
          ? 'head'
          : 'shank';
    out.push({
      role,
      kind: 'metal',
      materialId: metal?.id ?? (role === 'head' ? e.head.metal : e.shank.metal),
      mesh,
    });
  }
  return out;
}

function classifyBand(design: Design, meshes: THREE.Mesh[]): Classified[] {
  const b = design.band;
  if (!b) return [];
  const out: Classified[] = [];
  let metalSeen = 0;
  for (const { mesh, gem } of slotsOf(meshes)) {
    const mat = mesh.material as THREE.Material;
    if (gem) {
      out.push({ role: 'band-stone', kind: 'stone', materialId: b.accentStone.material, mesh });
      continue;
    }
    const metal = metalOf(mat, [
      { id: b.metal, finish: b.finish },
      { id: b.metal2, finish: b.finish },
    ]);
    const role: PartRole =
      b.metal !== b.metal2 && metal
        ? metal.id === b.metal2
          ? 'band2'
          : 'band'
        : metalSeen > 0
          ? 'band2'
          : 'band';
    metalSeen++;
    out.push({ role, kind: 'metal', materialId: metal?.id ?? (role === 'band2' ? b.metal2 : b.metal), mesh });
  }
  return out;
}

const ROLE_LABEL: Record<PartRole, string> = {
  shank: 'Shank',
  head: 'Head / setting',
  band: 'Band',
  band2: 'Band second metal',
  center: 'Center stone',
  accent: 'Accent stones',
  'band-stone': 'Band stones',
};

function toPart(design: Design, piece: Piece, c: Classified, index: number): ExportPart {
  const mat = c.mesh.material as THREE.MeshStandardMaterial;
  const name =
    c.kind === 'metal'
      ? (findModel('metal', c.materialId)?.name ?? c.materialId)
      : (findModel('gem', c.materialId)?.name ?? c.materialId);
  const color = mat.color ? `#${mat.color.getHexString()}` : '#cccccc';
  void design;
  return {
    id: `${piece}-${c.role}${index > 0 ? `-${index + 1}` : ''}`,
    label: `${piece === 'engagement' ? 'Engagement' : 'Band'}: ${ROLE_LABEL[c.role]}`,
    piece,
    role: c.role,
    kind: c.kind,
    materialId: c.materialId,
    materialName: name,
    colorHex: color,
    roughness: mat.roughness ?? 0.2,
    metalness: mat.metalness ?? (c.kind === 'metal' ? 1 : 0),
    opacity: mat.transparent ? (mat.opacity ?? 1) : 1,
    positions: flatPositions(c.mesh),
  };
}

function meshesOf(group: THREE.Group): THREE.Mesh[] {
  return group.children.filter((o): o is THREE.Mesh => (o as THREE.Mesh).isMesh === true);
}

function finish(design: Design, piece: Piece, list: Classified[]): ExportPart[] {
  const counts = new Map<string, number>();
  return list.map((c) => {
    const n = counts.get(c.role) ?? 0;
    counts.set(c.role, n + 1);
    return toPart(design, piece, c, n);
  });
}

/**
 * Builds the design's geometry for a scope and labels every mesh with its piece, role and material.
 * Positions are in the ring frame (mm). For 'set', the pieces sit as worn (band beside the engagement ring).
 */
export function collectParts(design: Design, scope: ExportScope): ExportPart[] {
  const s = effectiveScope(design, scope);
  const view = scopeView(s);
  const { group } = assembleDesign(design, view);
  const meshes = meshesOf(group);
  let parts: ExportPart[];
  if (s === 'engagement') parts = finish(design, 'engagement', classifyEngagement(design, meshes));
  else if (s === 'band') parts = finish(design, 'band', classifyBand(design, meshes));
  else {
    // In 'set' the engagement meshes come first; count them from a ring-only assembly.
    const ring = assembleDesign(design, 'ring');
    const n = meshesOf(ring.group).length;
    disposeGroup(ring.group);
    parts = [
      ...finish(design, 'engagement', classifyEngagement(design, meshes.slice(0, n))),
      ...finish(design, 'band', classifyBand(design, meshes.slice(n))),
    ];
  }
  disposeGroup(group);
  return parts;
}

/** Look up a metal by id (throws on unknown ids, like the registry). */
export const metalModel = (id: Id): MetalModel => getModel('metal', id);

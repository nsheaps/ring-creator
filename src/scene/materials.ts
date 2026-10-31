import * as THREE from 'three';
import type { ClarityModel, FinishModel, GemModel, MetalModel } from '@/models/types';

const cache = new Map<string, THREE.Material>();

export function metalMaterial(metal: MetalModel, finish?: FinishModel): THREE.MeshStandardMaterial {
  const key = `m:${metal.id}:${finish?.id ?? 'p'}`;
  const hit = cache.get(key);
  if (hit) return hit as THREE.MeshStandardMaterial;
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(metal.color),
    metalness: metal.metalness,
    roughness: Math.min(1, metal.roughness + (finish?.roughnessAdd ?? 0)),
    envMapIntensity: 1.25,
  });
  cache.set(key, mat);
  return mat;
}

/** Two shells: transparent glossy outside + mirrored inside faces for brilliance. Returns [outer, inner]. */
export function gemMaterials(
  gem: GemModel,
  colorHex: string,
  clarity?: ClarityModel,
  tintHex?: string,
  tintStrength = 0,
): [THREE.MeshPhysicalMaterial, THREE.MeshStandardMaterial] {
  const key = `g:${gem.id}:${colorHex}:${clarity?.id ?? ''}:${tintHex ?? ''}`;
  const hit = cache.get(key) as THREE.MeshPhysicalMaterial | undefined;
  const hit2 = cache.get(key + ':in') as THREE.MeshStandardMaterial | undefined;
  if (hit && hit2) return [hit, hit2];
  const base = new THREE.Color(colorHex);
  if (tintHex && tintStrength > 0) base.lerp(new THREE.Color(tintHex), tintStrength);
  const opaque = gem.transparency === 'opaque';
  const translucent = gem.transparency === 'translucent';
  const haze = clarity?.haze ?? 0;
  const outer = new THREE.MeshPhysicalMaterial({
    color: base.clone().lerp(new THREE.Color('#ffffff'), opaque ? 0 : 0.35),
    metalness: 0,
    roughness: 0.03 + haze * 0.25,
    transparent: !opaque,
    opacity: opaque ? 1 : translucent ? 0.85 : 0.62 + haze * 0.2,
    envMapIntensity: 2.4,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    ior: Math.min(2.4, gem.ior),
    specularIntensity: 1,
    flatShading: true,
    side: THREE.FrontSide,
    depthWrite: opaque,
  });
  const inner = new THREE.MeshStandardMaterial({
    color: base.clone().multiplyScalar(opaque ? 1 : 1.15),
    metalness: opaque ? 0.1 : 0.92,
    roughness: opaque ? 0.35 : 0.04 + haze * 0.3,
    envMapIntensity: 1.9,
    flatShading: true,
    side: THREE.BackSide,
  });
  cache.set(key, outer);
  cache.set(key + ':in', inner);
  return [outer, inner];
}

export function disposeMaterialCache(): void {
  cache.forEach((m) => m.dispose());
  cache.clear();
}

import type { ExportPart } from './collect';
import { triangleCount } from './meshMath';

const STL_HEADER = 80;

/**
 * Binary STL (little-endian) of the given parts, millimetres, with per-triangle normals.
 * Intended for metal parts (casting / printing); stones are never included by the callers.
 */
export function toStl(parts: ExportPart[], title = 'ring-creator'): Uint8Array {
  const n = parts.reduce((s, p) => s + triangleCount(p.positions), 0);
  const buf = new ArrayBuffer(STL_HEADER + 4 + n * 50);
  const dv = new DataView(buf);
  const head = `Ring Creator STL, units mm: ${title}`.slice(0, STL_HEADER);
  for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i) & 0x7f);
  dv.setUint32(STL_HEADER, n, true);
  let o = STL_HEADER + 4;
  for (const p of parts) {
    const a = p.positions;
    for (let t = 0; t + 8 < a.length; t += 9) {
      const ux = a[t + 3] - a[t],
        uy = a[t + 4] - a[t + 1],
        uz = a[t + 5] - a[t + 2];
      const vx = a[t + 6] - a[t],
        vy = a[t + 7] - a[t + 1],
        vz = a[t + 8] - a[t + 2];
      let nx = uy * vz - uz * vy,
        ny = uz * vx - ux * vz,
        nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      dv.setFloat32(o, nx, true);
      dv.setFloat32(o + 4, ny, true);
      dv.setFloat32(o + 8, nz, true);
      o += 12;
      for (let k = 0; k < 9; k++) {
        dv.setFloat32(o, a[t + k], true);
        o += 4;
      }
      dv.setUint16(o, 0, true);
      o += 2;
    }
  }
  return new Uint8Array(buf);
}

/** Reads the triangle count from a binary STL. */
export function stlTriangleCount(stl: Uint8Array): number {
  return new DataView(stl.buffer, stl.byteOffset, stl.byteLength).getUint32(STL_HEADER, true);
}

const mtlName = (p: ExportPart): string => `${p.kind}_${p.materialId}`.replace(/[^A-Za-z0-9_-]/g, '_');

function rgb(hex: string): string {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => (c / 255).toFixed(4)).join(' ');
}

/** Wavefront OBJ (+ MTL): one object per part, materials named by metal / gem, millimetres. */
export function toObj(parts: ExportPart[], mtlFile = 'ring.mtl'): { obj: string; mtl: string } {
  const out: string[] = ['# Ring Creator OBJ, units: millimetres', `mtllib ${mtlFile}`];
  let base = 1;
  for (const p of parts) {
    out.push(`o ${p.id}`, `usemtl ${mtlName(p)}`);
    const a = p.positions;
    for (let i = 0; i + 2 < a.length; i += 3)
      out.push(`v ${a[i].toFixed(4)} ${a[i + 1].toFixed(4)} ${a[i + 2].toFixed(4)}`);
    const n = triangleCount(a);
    for (let t = 0; t < n; t++) {
      const v = base + t * 3;
      out.push(`f ${v} ${v + 1} ${v + 2}`);
    }
    base += n * 3;
  }
  const seen = new Set<string>();
  const mtl: string[] = ['# Ring Creator materials'];
  for (const p of parts) {
    const name = mtlName(p);
    if (seen.has(name)) continue;
    seen.add(name);
    mtl.push(
      '',
      `newmtl ${name}`,
      `# ${p.materialName}`,
      `Kd ${rgb(p.colorHex)}`,
      `Ks ${p.kind === 'metal' ? rgb(p.colorHex) : '1.0000 1.0000 1.0000'}`,
      `Ns ${Math.round((1 - Math.min(1, p.roughness)) * 900 + 50)}`,
      `d ${p.kind === 'stone' ? Math.min(1, Math.max(0.3, p.opacity)).toFixed(2) : '1.00'}`,
      `illum ${p.kind === 'stone' ? 4 : 3}`,
    );
  }
  return { obj: out.join('\n') + '\n', mtl: mtl.join('\n') + '\n' };
}

/** glTF material name for a part, e.g. "metal: 14k Yellow Gold" or "gem: Diamond". */
export const gltfMaterialName = (p: ExportPart): string =>
  `${p.kind === 'metal' ? 'metal' : 'gem'}: ${p.materialName}`;

/**
 * GLB (binary glTF 2.0) via three's GLTFExporter, lazily imported. Materials are named by metal / gem,
 * meshes by part id. Units are metres in glTF, so positions are scaled from mm.
 */
export async function toGlb(parts: ExportPart[], name = 'ring'): Promise<ArrayBuffer> {
  const THREE = await import('three');
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  const scene = new THREE.Scene();
  scene.name = name;
  const root = new THREE.Group();
  root.name = name;
  root.scale.setScalar(0.001);
  scene.add(root);
  const mats = new Map<string, InstanceType<typeof THREE.MeshPhysicalMaterial>>();
  for (const p of parts) {
    const key = `${p.kind}|${p.materialId}|${p.colorHex}`;
    let mat = mats.get(key);
    if (!mat) {
      mat = new THREE.MeshPhysicalMaterial({
        name: gltfMaterialName(p),
        color: new THREE.Color(p.colorHex),
        metalness: p.kind === 'metal' ? Math.max(0.8, p.metalness) : 0,
        roughness: Math.min(1, Math.max(0, p.roughness)),
        transparent: p.kind === 'stone' && p.opacity < 1,
        opacity: p.kind === 'stone' ? Math.max(0.3, p.opacity) : 1,
      });
      if (p.kind === 'stone') mat.ior = 1.5;
      mats.set(key, mat);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p.positions, 3));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = p.id;
    root.add(mesh);
  }
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(scene, { binary: true });
  if (!(result instanceof ArrayBuffer)) throw new Error('GLTFExporter did not return a binary GLB');
  root.traverse((o) => {
    const m = o as InstanceType<typeof THREE.Mesh>;
    if (m.isMesh) m.geometry.dispose();
  });
  mats.forEach((m) => m.dispose());
  return result;
}

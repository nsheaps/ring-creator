import { beforeAll, describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import '@/models/data';
import { defaultDesign } from '@/state/defaults';
import { collectParts } from '@/export/collect';
import { buildDrawing, drawingToSvg } from '@/export/drawing';
import { stlTriangleCount, toGlb, toObj, toStl } from '@/export/mesh';
import { computeSpec } from '@/export/spec';
import { exportFile, jewelerPack } from '@/export';

// GLTFExporter reads its Blob with FileReader, which Node lacks.
beforeAll(() => {
  const g = globalThis as unknown as { FileReader?: unknown };
  if (g.FileReader) return;
  class NodeFileReader {
    result: ArrayBuffer | string | null = null;
    onload: (() => void) | null = null;
    onloadend: (() => void) | null = null;
    readAsArrayBuffer(b: Blob) {
      void b.arrayBuffer().then((buf) => {
        this.result = buf;
        this.onload?.();
        this.onloadend?.();
      });
    }
    readAsDataURL(b: Blob) {
      void b.arrayBuffer().then((buf) => {
        this.result = `data:${b.type};base64,${Buffer.from(buf).toString('base64')}`;
        this.onload?.();
        this.onloadend?.();
      });
    }
  }
  g.FileReader = NodeFileReader;
});

const design = defaultDesign();

describe('mesh exporters', () => {
  it('STL holds exactly the metal triangles', () => {
    const metal = collectParts(design, 'engagement').filter((p) => p.kind === 'metal');
    const tris = metal.reduce((s, p) => s + p.positions.length / 9, 0);
    const stl = toStl(metal, design.name);
    expect(stlTriangleCount(stl)).toBe(tris);
    expect(stl.byteLength).toBe(84 + 50 * tris);
    expect(tris).toBeGreaterThan(100);
  });

  it('OBJ has one vertex per corner and a material per metal/gem', () => {
    const parts = collectParts(design, 'set');
    const { obj, mtl } = toObj(parts);
    const tris = parts.reduce((s, p) => s + p.positions.length / 9, 0);
    expect(obj.split('\n').filter((l) => l.startsWith('f ')).length).toBe(tris);
    expect(obj.split('\n').filter((l) => l.startsWith('v ')).length).toBe(tris * 3);
    expect(mtl).toContain('newmtl metal_');
    expect(mtl).toContain('newmtl stone_');
  });

  it('GLB starts with the glTF magic and names materials by metal and gem', async () => {
    const glb = new Uint8Array(await toGlb(collectParts(design, 'engagement'), design.name));
    const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
    expect(dv.getUint32(0, true)).toBe(0x46546c67); // 'glTF'
    expect(dv.getUint32(4, true)).toBe(2);
    expect(dv.getUint32(8, true)).toBe(glb.byteLength);
    const jsonLen = dv.getUint32(12, true);
    const gltf = JSON.parse(new TextDecoder().decode(glb.slice(20, 20 + jsonLen))) as {
      materials: { name: string }[];
    };
    const names = gltf.materials.map((m) => m.name);
    expect(names.some((n) => n.startsWith('metal: '))).toBe(true);
    expect(names.some((n) => n.startsWith('gem: '))).toBe(true);
  });
});

describe('technical drawing', () => {
  it('is well-formed SVG with three views, dimensions and a title block', () => {
    const spec = computeSpec(design, 'set');
    const svg = drawingToSvg(buildDrawing(design, 'set', spec));
    expect(svg.startsWith('<?xml')).toBe(true);
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    for (const t of ['FRONT', 'SIDE', 'TOP', 'DESIGN', 'SCALE', '10 mm']) expect(svg).toContain(t);
    expect((svg.match(/<path /g) ?? []).length).toBeGreaterThanOrEqual(3);
    // Balanced tags: every opened element closes or self-closes.
    const opens = (svg.match(/<(svg|title|text)[\s>]/g) ?? []).length;
    const closes = (svg.match(/<\/(svg|title|text)>/g) ?? []).length;
    expect(opens).toBe(closes);
    expect(svg).not.toMatch(/NaN|Infinity|undefined/);
  });
});

describe('files and the jeweler pack', () => {
  it('exports PDF and CSV', async () => {
    const pdf = await exportFile(design, 'pdf', 'set');
    const bytes = pdf.data as Uint8Array;
    expect(strFromU8(bytes.slice(0, 5))).toBe('%PDF-');
    expect(pdf.name.endsWith('.pdf')).toBe(true);
    const csv = await exportFile(design, 'csv', 'engagement');
    expect(String(csv.data).split('\r\n')[0]).toContain('item,piece');
  });

  it('zips every file, deterministically', async () => {
    const a = await jewelerPack(design, 'set');
    const files = unzipSync(a);
    const names = Object.keys(files);
    for (const n of [
      'spec.json',
      'bom.csv',
      'drawing.svg',
      'spec-sheet.pdf',
      'model.glb',
      'model.obj',
      'model.mtl',
      'stl/engagement.stl',
      'README.txt',
    ])
      expect(names).toContain(n);
    if (design.band) expect(names).toContain('stl/band.stl');
    expect(names.some((n) => n.endsWith('.json') && n !== 'spec.json')).toBe(true);
    const b = await jewelerPack(design, 'set');
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
});

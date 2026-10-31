/**
 * Jeweler-grade export. Everything runs in the browser and is deterministic for a given design.
 * Heavy dependencies (three's GLTFExporter, jsPDF, fflate) are imported on demand.
 *
 * Public API:
 *   computeSpec(design, scope)          -> RingSpec (dimensions, weights, stones, setting)
 *   bomRows(spec) / bomCsv(spec)        -> bill of materials
 *   ringSize(us) / ringSizeTable()      -> sizing, gramsToDwt / dwtToGrams
 *   exportFile(design, format, scope)   -> { name, mime, data } for one format
 *   jewelerPack(design, scope, opts)    -> ZIP with everything
 */
import type { Design } from '@/models/types';
import { bomCsv } from './bom';
import { collectParts, effectiveScope, type ExportScope } from './collect';
import { buildDrawing, drawingToSvg } from './drawing';
import { toGlb, toObj, toStl } from './mesh';
import { buildPdf } from './pdf';
import { computeSpec, type RingSpec } from './spec';
import type { ExportFormat } from './formats';

export { bomCsv, bomRows, type BomRow } from './bom';
export { collectParts, effectiveScope, scopeAvailable, type ExportPart, type ExportScope } from './collect';
export { buildDrawing, drawingToSvg, type Drawing } from './drawing';
export { toGlb, toObj, toStl, stlTriangleCount } from './mesh';
export { jewelerNotes, castingAdvice } from './notes';
export { buildPdf } from './pdf';
export { computeSpec, type RingSpec } from './spec';
export { EXPORT_FORMATS, type ExportFormat } from './formats';
export { dwtToGrams, gramsToDwt, ringSize, ringSizeTable, GRAMS_PER_DWT } from './units';

export interface ExportedFile {
  name: string;
  mime: string;
  data: Uint8Array | string;
}

export interface ExportOptions {
  /** Viewer snapshot (PNG data URL) for the PDF and the pack. */
  renderDataUrl?: string;
}

export function fileSlug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'ring'
  );
}

const scopeSuffix = (s: ExportScope): string => (s === 'set' ? 'set' : s === 'band' ? 'band' : 'engagement');

/** ZIP timestamps come from the design so the archive is byte-for-byte reproducible. */
function zipDate(design: Design): Date {
  const d = new Date(design.updatedAt);
  return Number.isNaN(d.getTime()) || d.getUTCFullYear() < 1981 ? new Date(Date.UTC(2020, 0, 1)) : d;
}

async function zip(design: Design, files: Record<string, Uint8Array | string>): Promise<Uint8Array> {
  const { zipSync, strToU8 } = await import('fflate');
  const mtime = zipDate(design);
  const entries: Record<string, [Uint8Array, { mtime: Date }]> = {};
  for (const name of Object.keys(files).sort()) {
    const v = files[name];
    entries[name] = [typeof v === 'string' ? strToU8(v) : v, { mtime }];
  }
  return zipSync(entries, { level: 6, mtime });
}

const json = (design: Design): string => JSON.stringify(design, null, 2) + '\n';

/** Exports one format. For 'obj' the OBJ and MTL are zipped together. */
export async function exportFile(
  design: Design,
  format: ExportFormat,
  scope: ExportScope = 'set',
  opts: ExportOptions = {},
): Promise<ExportedFile> {
  const s = effectiveScope(design, scope);
  const base = `${fileSlug(design.name)}-${scopeSuffix(s)}`;
  switch (format) {
    case 'json':
      return { name: `${fileSlug(design.name)}.json`, mime: 'application/json', data: json(design) };
    case 'csv':
      return { name: `${base}-bom.csv`, mime: 'text/csv', data: bomCsv(computeSpec(design, s)) };
    case 'svg': {
      const spec = computeSpec(design, s);
      return {
        name: `${base}-drawing.svg`,
        mime: 'image/svg+xml',
        data: drawingToSvg(buildDrawing(design, s, spec)),
      };
    }
    case 'stl':
      return {
        name: `${base}.stl`,
        mime: 'model/stl',
        data: toStl(
          collectParts(design, s).filter((p) => p.kind === 'metal'),
          design.name,
        ),
      };
    case 'glb':
      return {
        name: `${base}.glb`,
        mime: 'model/gltf-binary',
        data: new Uint8Array(await toGlb(collectParts(design, s), design.name)),
      };
    case 'obj': {
      const { obj, mtl } = toObj(collectParts(design, s), `${base}.mtl`);
      return {
        name: `${base}-obj.zip`,
        mime: 'application/zip',
        data: await zip(design, { [`${base}.obj`]: obj, [`${base}.mtl`]: mtl }),
      };
    }
    case 'pdf': {
      const spec = computeSpec(design, s);
      return {
        name: `${base}-spec.pdf`,
        mime: 'application/pdf',
        data: await buildPdf(design, spec, buildDrawing(design, s, spec), opts),
      };
    }
    case 'zip':
      return {
        name: `${base}-jeweler-pack.zip`,
        mime: 'application/zip',
        data: await jewelerPack(design, s, opts),
      };
  }
}

function dataUrlBytes(url: string): Uint8Array | null {
  const m = /^data:image\/png;base64,(.+)$/.exec(url);
  if (!m) return null;
  const bin = atob(m[1]);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function readme(design: Design, spec: RingSpec, files: string[]): string {
  return [
    `Ring Creator jeweler pack: ${design.name}`,
    `Scope: ${spec.scope}. Ring size US ${spec.size.us} (inner diameter ${spec.size.diameterMm.toFixed(2)} mm).`,
    'All model files are in millimetres (GLB in metres, per the glTF standard).',
    '',
    'Files:',
    ...files.map((f) => `  ${f}`),
    '',
    'STL files hold metal only, one per piece and, for mixed metals, one per metal, ready for printing a casting pattern.',
    'Weights and carats are estimates from the 3D model; confirm against the actual stones before cutting seats.',
    '',
  ].join('\n');
}

/** Builds the "jeweler pack" ZIP: design JSON, spec JSON, BOM CSV, SVG drawing, PDF, GLB, OBJ+MTL and STLs. */
export async function jewelerPack(
  design: Design,
  scope: ExportScope = 'set',
  opts: ExportOptions = {},
): Promise<Uint8Array> {
  const s = effectiveScope(design, scope);
  const slugName = fileSlug(design.name);
  const spec = computeSpec(design, s);
  const drawing = buildDrawing(design, s, spec);
  const parts = collectParts(design, s);
  const files: Record<string, Uint8Array | string> = {};
  files[`${slugName}.json`] = json(design);
  files['spec.json'] = JSON.stringify(spec, null, 2) + '\n';
  files['bom.csv'] = bomCsv(spec);
  files['drawing.svg'] = drawingToSvg(drawing);
  files['spec-sheet.pdf'] = await buildPdf(design, spec, drawing, opts);
  files['model.glb'] = new Uint8Array(await toGlb(parts, design.name));
  const { obj, mtl } = toObj(parts, 'model.mtl');
  files['model.obj'] = obj;
  files['model.mtl'] = mtl;
  const pieces = s === 'set' ? (['engagement', 'band'] as const) : ([s] as const);
  for (const piece of pieces) {
    // Each piece in its own frame (not offset as worn) so it can be printed / cast on its own.
    const metal = collectParts(design, piece).filter((p) => p.kind === 'metal');
    files[`stl/${piece}.stl`] = toStl(metal, `${design.name} ${piece}`);
    const metals = [...new Set(metal.map((p) => p.materialId))];
    if (metals.length > 1)
      for (const m of metals)
        files[`stl/${piece}-${m}.stl`] = toStl(
          metal.filter((p) => p.materialId === m),
          `${design.name} ${piece} ${m}`,
        );
  }
  const png = opts.renderDataUrl ? dataUrlBytes(opts.renderDataUrl) : null;
  if (png) files['render.png'] = png;
  files['README.txt'] = readme(design, spec, Object.keys(files).sort());
  return zip(design, files);
}

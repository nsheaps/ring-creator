import type { jsPDF as JsPdf } from 'jspdf';
import type { Design } from '@/models/types';
import { bomRows } from './bom';
import type { Drawing } from './drawing';
import { arrowHead } from './drawing';
import { jewelerNotes } from './notes';
import type { RingSpec } from './spec';
import { fmt } from './units';

export interface PdfOptions {
  /** PNG/JPEG data URL of a render of the design (e.g. the viewer snapshot). Optional. */
  renderDataUrl?: string;
}

/** jsPDF's built-in Helvetica only covers WinAnsi; map a few characters it lacks. */
const safe = (s: string): string =>
  s
    .replace(/…/g, '...')
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7e\xa0-\xff]/g, '?');

function hexRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Draws a renderer-neutral Drawing onto the current jsPDF page (units mm). */
export function drawToPdf(doc: JsPdf, d: Drawing): void {
  for (const p of d.prims) {
    switch (p.t) {
      case 'shape': {
        doc.setFillColor(...hexRgb(p.fill));
        doc.setDrawColor(...hexRgb(p.stroke));
        doc.setLineWidth(p.width);
        const ops: { op: string; c: number[] }[] = [];
        for (const loop of p.loops) {
          loop.forEach(([x, y], i) => ops.push({ op: i === 0 ? 'm' : 'l', c: [x, y] }));
          ops.push({ op: 'h', c: [] });
        }
        doc.path(ops);
        doc.fillStrokeEvenOdd();
        break;
      }
      case 'line':
        doc.setDrawColor(...hexRgb(p.stroke));
        doc.setLineWidth(p.width);
        if (p.dash) doc.setLineDashPattern(p.dash, 0);
        doc.line(p.a[0], p.a[1], p.b[0], p.b[1]);
        if (p.dash) doc.setLineDashPattern([], 0);
        break;
      case 'rect':
        doc.setDrawColor(...hexRgb(p.stroke));
        doc.setLineWidth(p.width);
        if (p.fill) {
          doc.setFillColor(...hexRgb(p.fill));
          doc.rect(p.x, p.y, p.w, p.h, 'FD');
        } else doc.rect(p.x, p.y, p.w, p.h, 'S');
        break;
      case 'arrow': {
        const [a, b, c] = arrowHead(p.tip, p.from);
        doc.setFillColor(...hexRgb(p.stroke));
        doc.triangle(a[0], a[1], b[0], b[1], c[0], c[1], 'F');
        break;
      }
      case 'text': {
        if (p.leader) {
          doc.setDrawColor(31, 78, 156);
          doc.setLineWidth(0.12);
          doc.line(p.leader[0], p.leader[1], p.at[0], p.at[1]);
        }
        doc.setFont('helvetica', p.bold ? 'bold' : 'normal');
        doc.setFontSize(p.size * 2.83465); // mm -> pt
        doc.setTextColor(26, 26, 26);
        doc.text(safe(p.text), p.at[0], p.at[1], {
          align: p.anchor === 'middle' ? 'center' : p.anchor === 'end' ? 'right' : 'left',
          angle: p.rotate ? -p.rotate : 0,
        });
        break;
      }
    }
  }
}

function table(
  doc: JsPdf,
  x: number,
  y: number,
  widths: number[],
  header: string[],
  rows: string[][],
  size = 8,
): number {
  const lh = size * 0.42 + 1.4;
  doc.setFontSize(size);
  doc.setFont('helvetica', 'bold');
  doc.setFillColor(238, 238, 238);
  doc.rect(
    x,
    y - lh + 1.2,
    widths.reduce((a, b) => a + b, 0),
    lh,
    'F',
  );
  let cx = x;
  header.forEach((h, i) => {
    doc.text(safe(h), cx + 1, y);
    cx += widths[i];
  });
  doc.setFont('helvetica', 'normal');
  let yy = y;
  for (const r of rows) {
    const wrapped = r.map((c, i) => doc.splitTextToSize(safe(c), widths[i] - 2) as string[]);
    const lines = Math.max(1, ...wrapped.map((w) => w.length));
    yy += lh;
    if (yy + lines * lh > 285) {
      doc.addPage('a4', 'portrait');
      yy = 20;
    }
    cx = x;
    wrapped.forEach((w, i) => {
      doc.text(w, cx + 1, yy);
      cx += widths[i];
    });
    yy += (lines - 1) * lh * 0.85;
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.1);
    doc.line(x, yy + 1.4, x + widths.reduce((a, b) => a + b, 0), yy + 1.4);
  }
  return yy + lh;
}

function kv(doc: JsPdf, x: number, y: number, pairs: [string, string][], w: number): number {
  let yy = y;
  doc.setFontSize(9);
  for (const [k, v] of pairs) {
    doc.setFont('helvetica', 'bold');
    doc.text(safe(k), x, yy);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(safe(v), w - 34) as string[];
    doc.text(lines, x + 34, yy);
    yy += 4.6 * Math.max(1, lines.length);
  }
  return yy;
}

/**
 * Three-page PDF spec sheet: (1) summary, render and BOM; (2) the technical drawing; (3) jeweler notes.
 * jsPDF is imported on demand. Output is deterministic for a given design (creation date from the design).
 */
export async function buildPdf(
  design: Design,
  spec: RingSpec,
  drawing: Drawing,
  opts: PdfOptions = {},
): Promise<Uint8Array> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const stamp = new Date(spec.date);
  doc.setCreationDate(Number.isNaN(stamp.getTime()) ? new Date(0) : stamp);
  doc.setFileId(
    design.id
      .replace(/[^0-9a-f]/gi, '')
      .padEnd(32, '0')
      .slice(0, 32)
      .toUpperCase(),
  );
  doc.setDocumentProperties({
    title: `${design.name} - spec sheet`,
    creator: 'Ring Creator',
    subject: 'Jeweler spec sheet',
  });

  // ---- Page 1: summary
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(safe(design.name), 15, 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text(
    safe(
      `${spec.scope === 'set' ? 'Bridal set' : spec.scope === 'band' ? 'Wedding band' : 'Engagement ring'} - spec sheet - ${spec.date.slice(0, 10)}`,
    ),
    15,
    26,
  );
  doc.setTextColor(26, 26, 26);
  let imgBottom = 32;
  if (opts.renderDataUrl && /^data:image\/(png|jpeg)/.test(opts.renderDataUrl)) {
    try {
      const fmtImg = opts.renderDataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(opts.renderDataUrl, fmtImg, 15, 32, 80, 80);
      imgBottom = 114;
    } catch {
      imgBottom = 32;
    }
  }
  const pairs: [string, string][] = [
    [
      'Ring size',
      `US ${spec.size.us} (ID ${fmt(spec.size.diameterMm)} mm, C ${fmt(spec.size.circumferenceMm)} mm)`,
    ],
  ];
  if (spec.center)
    pairs.push([
      'Center stone',
      `${fmt(spec.center.carat)} ct ${spec.center.gemName} ${spec.center.cutName}, ${spec.center.colorName}, ${spec.center.clarity}, ${fmt(spec.center.lengthMm)} x ${fmt(spec.center.widthMm)} x ${fmt(spec.center.depthMm)} mm`,
    ]);
  if (spec.setting)
    pairs.push([
      'Setting',
      `${spec.setting.headName} (${spec.setting.settingType})${spec.setting.prongCount !== null ? `, ${spec.setting.prongCount} prongs` : ''}${
        spec.setting.prongDiameterMm !== null ? ` at ${fmt(spec.setting.prongDiameterMm)} mm` : ''
      }`,
    ]);
  for (const p of spec.pieces) {
    pairs.push([p.name, `${p.style}; ${p.finish} finish`]);
    pairs.push([
      '  dimensions',
      `palm ${fmt(p.palmWidthMm)} W x ${fmt(p.palmThicknessMm)} T mm, top ${fmt(p.topWidthMm)} W mm${
        p.piece === 'engagement' ? `, head ${fmt(p.headHeightMm)} mm above finger` : ''
      }`,
    ]);
    pairs.push(['  metal', `${fmt(p.metalGrams)} g (${fmt(p.metalDwt)} dwt)`]);
  }
  pairs.push([
    'Metal total',
    spec.metalTotals.map((t) => `${t.metalName}: ${fmt(t.grams)} g / ${fmt(t.dwt)} dwt`).join('; '),
  ]);
  pairs.push([
    'Stones total',
    `${spec.totals.stoneCount} stones, ${fmt(spec.totals.stoneCarats, 3)} ct (mesh estimate)`,
  ]);
  const kvX = imgBottom > 32 ? 100 : 15;
  const kvBottom = kv(doc, kvX, 36, pairs, imgBottom > 32 ? 95 : 180);
  let y = Math.max(imgBottom, kvBottom) + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Bill of materials', 15, y);
  y += 7;
  const rows = bomRows(spec).map((r) => [
    r.item,
    r.piece,
    r.material,
    r.size,
    String(r.qty),
    `${r.total} ${r.unit}`,
    r.dwt,
  ]);
  table(
    doc,
    15,
    y,
    [32, 30, 46, 34, 10, 18, 12],
    ['Item', 'Piece', 'Material', 'Size (mm)', 'Qty', 'Total', 'dwt'],
    rows,
  );
  doc.setFontSize(7);
  doc.setTextColor(110, 110, 110);
  doc.text(
    'Weights are computed from the 3D model volume x alloy density; carats from stone volume x specific gravity. Estimates, not appraisals.',
    15,
    288,
  );
  doc.setTextColor(26, 26, 26);

  // ---- Page 2: drawing
  doc.addPage('a4', 'landscape');
  drawToPdf(doc, drawing);

  // ---- Page 3: jeweler notes
  doc.addPage('a4', 'portrait');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Jeweler notes', 15, 20);
  let ny = 30;
  for (const sec of jewelerNotes(design, spec)) {
    if (ny > 265) {
      doc.addPage('a4', 'portrait');
      ny = 20;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(safe(sec.title), 15, ny);
    ny += 5.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    for (const line of sec.lines) {
      const wrapped = doc.splitTextToSize(safe(`- ${line}`), 180) as string[];
      if (ny + wrapped.length * 4.2 > 285) {
        doc.addPage('a4', 'portrait');
        ny = 20;
      }
      doc.text(wrapped, 17, ny);
      ny += wrapped.length * 4.2 + 0.6;
    }
    ny += 3;
  }
  return new Uint8Array(doc.output('arraybuffer'));
}

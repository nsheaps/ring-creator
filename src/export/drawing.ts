import type { Design } from '@/models/types';
import { collectParts, effectiveScope, type ExportPart, type ExportScope } from './collect';
import type { RingSpec } from './spec';
import { fmt } from './units';

/**
 * Orthographic technical drawing (front / side / top) as a renderer-neutral list of primitives in page
 * millimetres (A4 landscape, y down). Rendered to SVG here and to PDF in pdf.ts.
 * Silhouettes are rasterised on a fine grid, traced and simplified: deterministic and compact.
 */

export type Pt = [number, number];
export type Prim =
  | { t: 'shape'; loops: Pt[][]; fill: string; stroke: string; width: number }
  | { t: 'line'; a: Pt; b: Pt; stroke: string; width: number; dash?: number[] }
  | { t: 'rect'; x: number; y: number; w: number; h: number; stroke: string; width: number; fill?: string }
  | {
      t: 'text';
      at: Pt;
      text: string;
      size: number;
      anchor: 'start' | 'middle' | 'end';
      bold?: boolean;
      rotate?: number;
      /** Callout: draw a leader line from this point to the text. */
      leader?: Pt;
    }
  | { t: 'arrow'; tip: Pt; from: Pt; stroke: string };

export interface Drawing {
  width: number;
  height: number;
  title: string;
  prims: Prim[];
}

export const PAGE_W = 297;
export const PAGE_H = 210;
const INK = '#1a1a1a';
const DIM = '#1f4e9c';
const METAL_FILL = '#d9d9d9';
const STONE_FILL = '#ffffff';

type Projector = (x: number, y: number, z: number) => Pt; // returns (u right, v up), mm

const VIEWS: { key: 'front' | 'side' | 'top'; title: string; proj: Projector }[] = [
  { key: 'front', title: 'FRONT (along the finger)', proj: (x, y) => [x, y] },
  { key: 'side', title: 'SIDE', proj: (_x, y, z) => [-z, y] },
  { key: 'top', title: 'TOP (plan)', proj: (x, _y, z) => [x, -z] },
];

interface Mask {
  w: number;
  h: number;
  cell: number;
  u0: number;
  v0: number;
  data: Uint8Array;
}

function rasterize(
  parts: ExportPart[],
  proj: Projector,
  u0: number,
  v0: number,
  w: number,
  h: number,
  cell: number,
): Mask {
  const data = new Uint8Array(w * h);
  for (const p of parts) {
    const a = p.positions;
    for (let t = 0; t + 8 < a.length; t += 9) {
      const A = proj(a[t], a[t + 1], a[t + 2]);
      const B = proj(a[t + 3], a[t + 4], a[t + 5]);
      const C = proj(a[t + 6], a[t + 7], a[t + 8]);
      const ax = (A[0] - u0) / cell,
        ay = (A[1] - v0) / cell;
      const bx = (B[0] - u0) / cell,
        by = (B[1] - v0) / cell;
      const cx = (C[0] - u0) / cell,
        cy = (C[1] - v0) / cell;
      const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
      const maxX = Math.min(w - 1, Math.ceil(Math.max(ax, bx, cx)));
      const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
      const maxY = Math.min(h - 1, Math.ceil(Math.max(ay, by, cy)));
      if (Math.abs(area) < 1e-9) {
        // Degenerate (edge-on) triangle: mark the cells its vertices fall in.
        for (const [x, y] of [
          [ax, ay],
          [bx, by],
          [cx, cy],
        ]) {
          const i = Math.floor(x),
            j = Math.floor(y);
          if (i >= 0 && j >= 0 && i < w && j < h) data[j * w + i] = 1;
        }
        continue;
      }
      const s = area > 0 ? 1 : -1;
      for (let j = minY; j <= maxY; j++)
        for (let i = minX; i <= maxX; i++) {
          const px = i + 0.5,
            py = j + 0.5;
          const w0 = s * ((bx - px) * (cy - py) - (by - py) * (cx - px));
          const w1 = s * ((cx - px) * (ay - py) - (cy - py) * (ax - px));
          const w2 = s * ((ax - px) * (by - py) - (ay - py) * (bx - px));
          if (w0 >= -1e-6 && w1 >= -1e-6 && w2 >= -1e-6) data[j * w + i] = 1;
        }
    }
  }
  return { w, h, cell, u0, v0, data };
}

/** Pixel-edge boundary tracing: closed loops (in grid corner coordinates) with the filled side on the left. */
function trace(m: Mask): Pt[][] {
  const { w, h, data } = m;
  const at = (i: number, j: number) => (i >= 0 && j >= 0 && i < w && j < h ? data[j * w + i] : 0);
  const next = new Map<number, number[]>();
  const key = (x: number, y: number) => y * (w + 1) + x;
  const addEdge = (x0: number, y0: number, x1: number, y1: number) => {
    const k = key(x0, y0);
    const list = next.get(k);
    if (list) list.push(key(x1, y1));
    else next.set(k, [key(x1, y1)]);
  };
  for (let j = 0; j <= h; j++)
    for (let i = 0; i <= w; i++) {
      // horizontal edge between (i,j-1) and (i,j) cells, spanning x i..i+1
      if (i < w) {
        const below = at(i, j - 1),
          above = at(i, j);
        if (above && !below) addEdge(i + 1, j, i, j);
        else if (below && !above) addEdge(i, j, i + 1, j);
      }
      if (j < h) {
        const left = at(i - 1, j),
          right = at(i, j);
        if (right && !left) addEdge(i, j, i, j + 1);
        else if (left && !right) addEdge(i, j + 1, i, j);
      }
    }
  const loops: Pt[][] = [];
  const starts = [...next.keys()].sort((a, b) => a - b);
  for (const s of starts) {
    while ((next.get(s)?.length ?? 0) > 0) {
      const loop: Pt[] = [];
      let k = s;
      for (let guard = 0; guard < 4 * (w + 1) * (h + 1); guard++) {
        loop.push([k % (w + 1), Math.floor(k / (w + 1))]);
        const list = next.get(k);
        if (!list || list.length === 0) break;
        const n = list.shift()!;
        k = n;
        if (k === s) break;
      }
      if (loop.length >= 4) loops.push(loop);
    }
  }
  return loops;
}

function rdp(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const len = Math.hypot(bx - ax, by - ay) || 1e-9;
    let best = -1,
      bestD = eps;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len;
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best > 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

function simplifyLoop(loop: Pt[], eps: number): Pt[] {
  // Split the closed loop at its farthest point from the start so RDP keeps both halves' extremes.
  const s = loop[0];
  let far = 0,
    fd = -1;
  loop.forEach((p, i) => {
    const d = Math.hypot(p[0] - s[0], p[1] - s[1]);
    if (d > fd) {
      fd = d;
      far = i;
    }
  });
  const a = rdp(loop.slice(0, far + 1), eps);
  const b = rdp([...loop.slice(far), s], eps);
  return [...a, ...b.slice(1, -1)];
}

interface ViewOutline {
  metal: Pt[][];
  stone: Pt[][];
  min: Pt;
  max: Pt;
}

function outline(parts: ExportPart[], proj: Projector): ViewOutline {
  let minU = Infinity,
    minV = Infinity,
    maxU = -Infinity,
    maxV = -Infinity;
  for (const p of parts)
    for (let i = 0; i + 2 < p.positions.length; i += 3) {
      const [u, v] = proj(p.positions[i], p.positions[i + 1], p.positions[i + 2]);
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
  if (!Number.isFinite(minU)) return { metal: [], stone: [], min: [0, 0], max: [0, 0] };
  const ext = Math.max(maxU - minU, maxV - minV);
  const cell = Math.max(0.02, ext / 700);
  const u0 = minU - 2 * cell,
    v0 = minV - 2 * cell;
  const w = Math.ceil((maxU - minU) / cell) + 4;
  const h = Math.ceil((maxV - minV) / cell) + 4;
  const toMm = (loops: Pt[][]): Pt[][] =>
    loops
      .map((l) => simplifyLoop(l, 0.75))
      .filter((l) => l.length >= 3)
      .map((l) => l.map(([x, y]) => [u0 + x * cell, v0 + y * cell] as Pt));
  return {
    metal: toMm(
      trace(
        rasterize(
          parts.filter((p) => p.kind === 'metal'),
          proj,
          u0,
          v0,
          w,
          h,
          cell,
        ),
      ),
    ),
    stone: toMm(
      trace(
        rasterize(
          parts.filter((p) => p.kind === 'stone'),
          proj,
          u0,
          v0,
          w,
          h,
          cell,
        ),
      ),
    ),
    min: [minU, minV],
    max: [maxU, maxV],
  };
}

const NICE_SCALES = [6, 5, 4, 3, 2.5, 2, 1.5, 1];

/** Builds the drawing for a design and scope. Pass a precomputed spec to avoid measuring twice. */
export function buildDrawing(design: Design, scope: ExportScope, spec: RingSpec): Drawing {
  const s = effectiveScope(design, scope);
  const parts = collectParts(design, s);
  const prims: Prim[] = [];
  const outlines = VIEWS.map((v) => ({ ...v, o: outline(parts, v.proj) }));
  const maxExt = Math.max(1, ...outlines.map(({ o }) => Math.max(o.max[0] - o.min[0], o.max[1] - o.min[1])));
  const scale = NICE_SCALES.find((k) => k * maxExt <= 72) ?? 1;

  // Frame and title block
  prims.push({ t: 'rect', x: 8, y: 8, w: PAGE_W - 16, h: PAGE_H - 16, stroke: INK, width: 0.5 });
  const cellW = (PAGE_W - 16) / 3;
  const viewTop = 16;
  const viewH = 120;
  const r = spec.size.diameterMm / 2;

  outlines.forEach(({ key, title, o }, idx) => {
    const cx = 8 + cellW * idx + cellW / 2;
    const cy = viewTop + viewH / 2 + 4;
    const midU = (o.min[0] + o.max[0]) / 2,
      midV = (o.min[1] + o.max[1]) / 2;
    const P = (u: number, v: number): Pt => [cx + (u - midU) * scale, cy - (v - midV) * scale];
    prims.push({ t: 'text', at: [cx, viewTop + 2], text: title, size: 3.2, anchor: 'middle', bold: true });
    const shape = (loops: Pt[][], fill: string, width: number) => {
      if (loops.length)
        prims.push({
          t: 'shape',
          loops: loops.map((l) => l.map(([u, v]) => P(u, v))),
          fill,
          stroke: INK,
          width,
        });
    };
    shape(o.metal, METAL_FILL, 0.25);
    shape(o.stone, STONE_FILL, 0.2);
    // centre lines
    const c0 = P(0, 0);
    prims.push({
      t: 'line',
      a: [c0[0] - 4, c0[1]],
      b: [c0[0] + 4, c0[1]],
      stroke: INK,
      width: 0.1,
      dash: [1.5, 0.8],
    });
    prims.push({
      t: 'line',
      a: [c0[0], c0[1] - 4],
      b: [c0[0], c0[1] + 4],
      stroke: INK,
      width: 0.1,
      dash: [1.5, 0.8],
    });

    const bottom = P(0, o.min[1])[1];
    const top = P(0, o.max[1])[1];
    const left = P(o.min[0], 0)[0];
    const right = P(o.max[0], 0)[0];
    const hdim = (u1: number, u2: number, yPage: number, label: string, fromV?: number) => {
      const a = P(u1, fromV ?? 0),
        b = P(u2, fromV ?? 0);
      dimension(
        prims,
        [a[0], fromV === undefined ? yPage : a[1]],
        [b[0], fromV === undefined ? yPage : b[1]],
        yPage,
        label,
        'h',
      );
    };
    const vdim = (v1: number, v2: number, xPage: number, label: string) => {
      const a = P(0, v1),
        b = P(0, v2);
      dimension(prims, [xPage, a[1]], [xPage, b[1]], xPage, label, 'v');
    };
    if (key === 'front') {
      hdim(-r, r, bottom + 8, `ID ${fmt(2 * r)} (US ${spec.size.us})`, 0);
      vdim(o.min[1], o.max[1], right + 7, `${fmt(o.max[1] - o.min[1])}`);
      if (spec.center) vdim(r, o.max[1], left - 7, `${fmt(o.max[1] - r)} above finger`);
      hdim(o.min[0], o.max[0], top - 6, `${fmt(o.max[0] - o.min[0])}`);
    } else if (key === 'side') {
      hdim(o.min[0], o.max[0], bottom + 8, `${fmt(o.max[0] - o.min[0])} overall`);
      const p0 = spec.pieces[0];
      if (p0)
        prims.push(
          callout(
            P(0, o.min[1]),
            [right + 2, bottom + 2],
            `Palm: ${fmt(p0.palmWidthMm)} W x ${fmt(p0.palmThicknessMm)} T`,
          ),
        );
      vdim(o.min[1], o.max[1], right + 7, `${fmt(o.max[1] - o.min[1])}`);
    } else {
      hdim(o.min[0], o.max[0], bottom + 8, `${fmt(o.max[0] - o.min[0])}`);
      vdim(o.min[1], o.max[1], right + 7, `${fmt(o.max[1] - o.min[1])}`);
      if (spec.center)
        prims.push(
          callout(
            P(0, 0),
            [cx + 10, top - 6],
            `${fmt(spec.center.lengthMm)} x ${fmt(spec.center.widthMm)} ${spec.center.cutName}`,
          ),
        );
    }
  });

  // Scale bar (10 mm)
  const sbx = 16,
    sby = viewTop + viewH + 14;
  prims.push({
    t: 'text',
    at: [sbx, sby - 3],
    text: `Scale ${scale}:1 (on A4) - all dimensions in mm`,
    size: 2.8,
    anchor: 'start',
  });
  for (let i = 0; i < 10; i++)
    prims.push({
      t: 'rect',
      x: sbx + i * scale,
      y: sby,
      w: scale,
      h: 1.6,
      stroke: INK,
      width: 0.15,
      fill: i % 2 ? '#ffffff' : INK,
    });
  prims.push({ t: 'text', at: [sbx, sby + 5], text: '0', size: 2.4, anchor: 'middle' });
  prims.push({ t: 'text', at: [sbx + 10 * scale, sby + 5], text: '10 mm', size: 2.4, anchor: 'middle' });

  // Callout notes (left, under the views)
  const notes: string[] = [];
  if (spec.center && spec.setting) {
    notes.push(
      `Center: ${spec.center.gemName} ${spec.center.cutName} ${fmt(spec.center.carat)} ct, ${fmt(spec.center.lengthMm)} x ${fmt(spec.center.widthMm)} x ${fmt(spec.center.depthMm)} mm`,
    );
    notes.push(
      `Setting: ${spec.setting.headName}${spec.setting.prongCount !== null ? `, ${spec.setting.prongCount} prongs` : ''}${
        spec.setting.prongDiameterMm !== null ? ` Ø${fmt(spec.setting.prongDiameterMm)}` : ''
      }`,
    );
  }
  for (const p of spec.pieces)
    notes.push(
      `${p.name}: ${p.style}; palm ${fmt(p.palmWidthMm)} W x ${fmt(p.palmThicknessMm)} T; top ${fmt(p.topWidthMm)} W; ${fmt(p.metalGrams)} g`,
    );
  notes
    .slice(0, 5)
    .forEach((n, i) =>
      prims.push({ t: 'text', at: [sbx, sby + 12 + i * 4.2], text: n, size: 2.8, anchor: 'start' }),
    );

  // Title block (bottom right)
  const tbW = 110,
    tbH = 40,
    tbx = PAGE_W - 8 - tbW,
    tby = PAGE_H - 8 - tbH;
  prims.push({ t: 'rect', x: tbx, y: tby, w: tbW, h: tbH, stroke: INK, width: 0.4 });
  const rows: [string, string][] = [
    ['DESIGN', design.name],
    [
      'SCOPE',
      s === 'set' ? 'Bridal set (engagement + band)' : s === 'band' ? 'Wedding band' : 'Engagement ring',
    ],
    [
      'SIZE',
      `US ${spec.size.us} / ID ${fmt(spec.size.diameterMm)} mm / C ${fmt(spec.size.circumferenceMm)} mm`,
    ],
    ['METAL', spec.metalTotals.map((t) => `${t.metalName} ${fmt(t.grams)} g`).join(', ')],
    ['SCALE', `${scale}:1    UNITS mm    THIRD-ANGLE`],
    ['DATE', spec.date.slice(0, 10)],
    ['DRAWN', 'Ring Creator (generated)'],
  ];
  rows.forEach(([k, v], i) => {
    const y = tby + 5 + i * 5.1;
    prims.push({ t: 'text', at: [tbx + 2, y], text: k, size: 2.2, anchor: 'start', bold: true });
    prims.push({
      t: 'text',
      at: [tbx + 18, y],
      text: v.length > 62 ? `${v.slice(0, 61)}…` : v,
      size: 2.6,
      anchor: 'start',
    });
    if (i > 0) prims.push({ t: 'line', a: [tbx, y - 3.6], b: [tbx + tbW, y - 3.6], stroke: INK, width: 0.1 });
  });

  return { width: PAGE_W, height: PAGE_H, title: `${design.name} - technical drawing`, prims };
}

function dimension(prims: Prim[], a: Pt, b: Pt, at: number, label: string, dir: 'h' | 'v'): void {
  const A: Pt = dir === 'h' ? [a[0], at] : [at, a[1]];
  const B: Pt = dir === 'h' ? [b[0], at] : [at, b[1]];
  // extension lines
  prims.push({ t: 'line', a, b: A, stroke: DIM, width: 0.1 });
  prims.push({ t: 'line', a: b, b: B, stroke: DIM, width: 0.1 });
  prims.push({ t: 'line', a: A, b: B, stroke: DIM, width: 0.18 });
  prims.push({ t: 'arrow', tip: A, from: B, stroke: DIM });
  prims.push({ t: 'arrow', tip: B, from: A, stroke: DIM });
  const mid: Pt = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
  if (dir === 'h')
    prims.push({ t: 'text', at: [mid[0], mid[1] - 1], text: label, size: 2.6, anchor: 'middle' });
  else
    prims.push({
      t: 'text',
      at: [mid[0] - 0.8, mid[1]],
      text: label,
      size: 2.6,
      anchor: 'middle',
      rotate: -90,
    });
}

function callout(target: Pt, label: Pt, text: string): Prim {
  return { t: 'text', at: label, text, size: 2.6, anchor: 'start', leader: target };
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n2 = (x: number): string => (Math.round(x * 100) / 100).toString();

/** Arrow head points: a small filled triangle at `tip`, pointing away from `from`. */
export function arrowHead(tip: Pt, from: Pt, len = 1.8, half = 0.5): Pt[] {
  const dx = tip[0] - from[0],
    dy = tip[1] - from[1];
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l,
    uy = dy / l;
  const bx = tip[0] - ux * len,
    by = tip[1] - uy * len;
  return [tip, [bx - uy * half, by + ux * half], [bx + uy * half, by - ux * half]];
}

export function drawingToSvg(d: Drawing): string {
  const out: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${d.width}mm" height="${d.height}mm" viewBox="0 0 ${d.width} ${d.height}" font-family="Helvetica, Arial, sans-serif">`,
    `<title>${esc(d.title)}</title>`,
    `<rect x="0" y="0" width="${d.width}" height="${d.height}" fill="#ffffff"/>`,
  ];
  for (const p of d.prims) {
    switch (p.t) {
      case 'shape': {
        const path = p.loops.map((l) => `M${l.map(([x, y]) => `${n2(x)} ${n2(y)}`).join('L')}Z`).join('');
        out.push(
          `<path d="${path}" fill="${p.fill}" fill-rule="evenodd" stroke="${p.stroke}" stroke-width="${p.width}" stroke-linejoin="round"/>`,
        );
        break;
      }
      case 'line':
        out.push(
          `<line x1="${n2(p.a[0])}" y1="${n2(p.a[1])}" x2="${n2(p.b[0])}" y2="${n2(p.b[1])}" stroke="${p.stroke}" stroke-width="${p.width}"${
            p.dash ? ` stroke-dasharray="${p.dash.join(' ')}"` : ''
          }/>`,
        );
        break;
      case 'rect':
        out.push(
          `<rect x="${n2(p.x)}" y="${n2(p.y)}" width="${n2(p.w)}" height="${n2(p.h)}" fill="${p.fill ?? 'none'}" stroke="${p.stroke}" stroke-width="${p.width}"/>`,
        );
        break;
      case 'arrow': {
        const pts = arrowHead(p.tip, p.from);
        out.push(
          `<polygon points="${pts.map(([x, y]) => `${n2(x)},${n2(y)}`).join(' ')}" fill="${p.stroke}"/>`,
        );
        break;
      }
      case 'text': {
        const leader = p.leader;
        if (leader)
          out.push(
            `<line x1="${n2(leader[0])}" y1="${n2(leader[1])}" x2="${n2(p.at[0])}" y2="${n2(p.at[1])}" stroke="${DIM}" stroke-width="0.12"/><circle cx="${n2(leader[0])}" cy="${n2(leader[1])}" r="0.4" fill="${DIM}"/>`,
          );
        const rot = p.rotate ? ` transform="rotate(${p.rotate} ${n2(p.at[0])} ${n2(p.at[1])})"` : '';
        out.push(
          `<text x="${n2(p.at[0])}" y="${n2(p.at[1])}" font-size="${p.size}" text-anchor="${p.anchor}"${p.bold ? ' font-weight="bold"' : ''}${rot} fill="${INK}">${esc(p.text)}</text>`,
        );
        break;
      }
    }
  }
  out.push('</svg>');
  return out.join('\n') + '\n';
}

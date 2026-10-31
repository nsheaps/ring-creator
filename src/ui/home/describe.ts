import { findModel } from '@/models/registry';
import type { Design, MetalFamily } from '@/models/types';

export interface Summary {
  stone: string;
  carat: string;
  cut: string;
  clarity: string;
  head: string;
  shank: string;
  metals: string;
  band: string;
  price: string;
}

export function metalIds(d: Design): string[] {
  const ids = [d.engagement.head.metal, d.engagement.shank.metal];
  if (d.band) {
    ids.push(d.band.metal);
    const style = findModel('band', d.band.style);
    const twoTone = style ? /two|tone|inlay|mixed|duo/.test(`${style.id} ${style.tags.join(' ')}`) : false;
    if (twoTone) ids.push(d.band.metal2);
  }
  return [...new Set(ids)];
}

export function metalNames(d: Design): string[] {
  return metalIds(d).map((id) => findModel('metal', id)?.name ?? id);
}

export function metalFamilies(d: Design): MetalFamily[] {
  const out = new Set<MetalFamily>();
  for (const id of metalIds(d)) {
    const m = findModel('metal', id);
    if (m) out.add(m.family);
  }
  return [...out];
}

export function stoneLabel(d: Design): string {
  const c = d.engagement.center;
  const gem = findModel('gem', c.material);
  const color = gem?.colors.find((x) => x.id === c.color);
  const gemName = gem?.name ?? c.material;
  return color && !/colou?rless/i.test(color.name) ? `${color.name} ${gemName}` : gemName;
}

export const cutName = (d: Design): string => findModel('cut', d.engagement.center.cut)?.name ?? d.engagement.center.cut;
export const headName = (d: Design): string => findModel('head', d.engagement.head.id)?.name ?? d.engagement.head.id;
export const shankName = (d: Design): string => findModel('shank', d.engagement.shank.id)?.name ?? d.engagement.shank.id;

export function formatPrice(p: number | null | undefined): string {
  return typeof p === 'number' ? `$${Math.round(p).toLocaleString('en-US')}` : '—';
}

export function summarize(d: Design & { priceUsd?: number | null }): Summary {
  const c = d.engagement.center;
  const clarity = findModel('clarity', c.clarity)?.code ?? c.clarity;
  const grade = c.colorGrade ? findModel('color-grade', c.colorGrade)?.letters : undefined;
  const band = d.band ? `${findModel('band', d.band.style)?.name ?? d.band.style}, ${d.band.widthMm} mm` : 'None (ring only)';
  return {
    stone: stoneLabel(d),
    carat: `${c.carat.toFixed(2)} ct`,
    cut: cutName(d),
    clarity: grade ? `${clarity}, color ${grade}` : clarity,
    head: headName(d),
    shank: shankName(d),
    metals: metalNames(d).join(' + '),
    band,
    price: formatPrice(d.priceUsd),
  };
}

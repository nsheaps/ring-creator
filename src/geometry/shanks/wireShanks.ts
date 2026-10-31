/** Multi-strand shanks: twisted rope and three-strand braid. Each strand is a circle section orbiting the band centreline. */
import * as THREE from 'three';
import { registerShankBuilder } from '../builders';
import type { ShankCtx, ShankResult } from '../types';
import { TAU, circleSection, metal, num, sweep } from './common';

function twisted(ctx: ShankCtx): ShankResult {
  const p = ctx.params;
  const R = ctx.innerRadius;
  const strands = Math.round(num(p, 'strands', 2, 2, 4));
  const width = num(p, 'widthMm', 2.3, 1.4, 4);
  const thick = num(p, 'thicknessMm', 1.9, 1.2, 3);
  const twists = Math.round(num(p, 'twists', 20, 6, 40));
  const wireFrac = num(p, 'wireFraction', 0.55, 0.4, 0.75);
  // strand radius and an elliptical orbit that together fill width x thickness
  const rs = (Math.min(width, thick) * wireFrac) / 2;
  const bu = Math.max(0.05, width / 2 - rs);
  const br = Math.max(0.05, thick / 2 - rs);
  const Rc = R + br + rs;
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < strands; k++) {
    const ph = (k / strands) * TAU - Math.PI / 2; // strand 0 starts at the inner-most point at theta = 0
    parts.push(
      sweep({
        segments: twists * 16,
        profile: (th) => {
          const a = twists * th + ph;
          return circleSection(bu * Math.cos(a), Rc + br * Math.sin(a), rs, 12);
        },
      }),
    );
  }
  return { parts: [metal(parts, 'twisted shank')], seatY: R + thick, topWidth: width };
}
registerShankBuilder('twisted', twisted);

function braided(ctx: ShankCtx): ShankResult {
  const p = ctx.params;
  const R = ctx.innerRadius;
  const width = num(p, 'widthMm', 2.6, 1.6, 4.5);
  const thick = num(p, 'thicknessMm', 1.7, 1.2, 3);
  const cycles = Math.round(num(p, 'cycles', 16, 6, 30));
  const rs = num(p, 'strandMm', 0.95, 0.5, 1.6) / 2;
  const A = Math.max(0.1, width / 2 - rs);
  const B = Math.max(0.05, thick / 2 - rs);
  const Rc = R + B + rs;
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 3; k++) {
    const ph = (k / 3) * TAU;
    parts.push(
      sweep({
        segments: cycles * 18,
        profile: (th) => {
          // classic 3-strand braid: lateral sin(t), over/under sin(2t)
          const a = cycles * th + ph;
          return circleSection(A * Math.sin(a), Rc + B * Math.sin(2 * a), rs, 12);
        },
      }),
    );
  }
  return { parts: [metal(parts, 'braided shank')], seatY: R + thick, topWidth: width };
}
registerShankBuilder('braided', braided);

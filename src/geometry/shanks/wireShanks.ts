/**
 * Multi-strand shanks built from real wires (round sections perpendicular to the wire path, see helpers.wireLoop):
 *   twisted  - a rope of 2-4 round wires wound helically and touching, so the surface shows diagonal ridges;
 *   braided  - a flat three-strand plait of ribbons that cross over and under, so the top shows a chevron weave.
 */
import { registerShankBuilder } from '../builders';
import type { ShankCtx, ShankResult } from '../types';
import { braidStrands, ropeStrands } from '../helpers';
import { finish, metal, num } from './common';

function twisted(ctx: ShankCtx): ShankResult {
  const p = ctx.params;
  const R = ctx.innerRadius;
  const strands = Math.round(num(p, 'strands', 2, 2, 4));
  const width = num(p, 'widthMm', 2.3, 1.4, 4);
  const thick = num(p, 'thicknessMm', 1.9, 1.2, 3);
  const twists = Math.round(num(p, 'twists', 20, 6, 40));
  // 0.55 = wires just touching; larger wires overlap into a tighter rope
  const wire = num(p, 'wireFraction', 0.55, 0.4, 0.75) / 0.55;
  const geos = ropeStrands({ R, W: width, T: thick, strands, turns: twists, wire, budget: 42000 }).map(
    finish,
  );
  return { parts: [metal(geos, 'twisted shank')], seatY: R + thick * 0.94, topWidth: width };
}
registerShankBuilder('twisted', twisted);

function braided(ctx: ShankCtx): ShankResult {
  const p = ctx.params;
  const R = ctx.innerRadius;
  const width = num(p, 'widthMm', 2.6, 1.6, 4.5);
  const thick = num(p, 'thicknessMm', 1.7, 1.2, 3);
  const cycles = Math.round(num(p, 'cycles', 16, 6, 30));
  const ribbon = num(p, 'strandMm', 0.95, 0.5, 1.6) * 1.15;
  const geos = braidStrands({ R, W: width, T: thick, cycles, ribbon, sides: 10, budget: 42000 }).map(finish);
  return { parts: [metal(geos, 'braided shank')], seatY: R + thick * 0.9, topWidth: width };
}
registerShankBuilder('braided', braided);

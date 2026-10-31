/**
 * Render designs to PNG for visual checks (works for agents and humans).
 *   SHOT_CHROMIUM=/opt/pw-browsers/chromium npx tsx scripts/render.ts <spec> <outPrefix> [view ...]
 * <spec>: an example ring id (e.g. r1-003), a path to a Design JSON file, or  head:<id> / shank:<id> / cut:<id> / band:<id> / metal:<id> ...
 * view: cam[:focus][@view][/WxH], e.g. 3/4   side:focus   front:focus@ring   top@set/1200x900   (cam = 3/4|front|top|side)
 * Env: SHOT_DIST (build dir, default dist; build with `npx vite build --outDir <dir>`), SHOT_PORT (default random 4300-4900), SHOT_CHROMIUM.
 * Each call writes <outPrefix>-<view>.png. Always use your OWN SHOT_DIST and SHOT_PORT when several agents work at once.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { encodeDesign } from '../src/state/store';
import type { Design } from '../src/models/types';

const [spec, out, ...views] = process.argv.slice(2);
if (!spec || !out) {
  console.error('usage: render.ts <spec> <outPrefix> [view ...]');
  process.exit(2);
}
const PORT = Number(process.env.SHOT_PORT ?? 4300 + Math.floor(Math.random() * 600));
const DIST = process.env.SHOT_DIST ?? 'dist';
const BASE = process.env.RING_BASE ?? '/ring-creator/';

const server = spawn(
  'npx',
  ['vite', 'preview', '--outDir', DIST, '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
  { stdio: 'ignore' },
);
let up = false;
for (let i = 0; i < 60 && !up; i++) {
  try {
    up = (await fetch(`http://127.0.0.1:${PORT}${BASE}`)).ok;
  } catch {
    /* wait */
  }
  if (!up) await new Promise((r) => setTimeout(r, 500));
}
if (!up) {
  server.kill();
  throw new Error('preview server did not start (did you build into SHOT_DIST?)');
}

let route: string;
if (existsSync(spec))
  route = `/shot/design?d=${encodeDesign(JSON.parse(readFileSync(spec, 'utf8')) as Design)}`;
else if (spec.includes(':')) route = `/shot/${spec.replace(':', '/')}?`;
else route = `/shot/example/${spec}?`;

const browser = await chromium.launch({
  executablePath: process.env.SHOT_CHROMIUM || undefined,
  args: [
    '--use-angle=swiftshader',
    '--use-gl=angle',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--no-sandbox',
  ],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('pageerror:', e.message));
for (const v of views.length ? views : ['3/4']) {
  const m = v.match(/^([^:@/]+(?:\/\d)?)(:focus)?(?:@(ring|band|set))?(?:\/(\d+x\d+))?$/);
  if (!m) {
    console.error(`bad view "${v}"`);
    continue;
  }
  const [, cam, focus, view, size] = m;
  const q = new URLSearchParams();
  q.set('cam', cam);
  if (focus) q.set('focus', '1');
  if (view) q.set('view', view);
  if (size) q.set('size', size);
  const sep = route.includes('?') ? (route.endsWith('?') ? '' : '&') : '?';
  await page.goto('about:blank');
  await page.goto(`http://127.0.0.1:${PORT}${BASE}#${route}${sep}${q.toString()}`);
  await page.reload();
  await page.waitForFunction(
    () => (window as unknown as { __shotReady?: boolean }).__shotReady === true,
    null,
    { timeout: 40000 },
  );
  const file = `${out}-${v.replace(/[/:@]/g, '_')}.png`;
  await page.locator('#shot').screenshot({ path: file });
  console.log(file);
}
await browser.close();
server.kill();

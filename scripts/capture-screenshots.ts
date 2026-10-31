/**
 * Captures component pictures (one per model) and page screenshots from a production build.
 *   bun run build && bun run screenshots            -> writes dist/screenshots/...
 * CI runs this after `vite build`, so the deployed docs always show pictures rendered by the current code.
 * Env: SHOT_OUT (default dist/screenshots), SHOT_ONLY (comma separated kinds, e.g. "cut,head"), SHOT_PORT.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import '../src/models/data';
import { KIND_LABELS, listModels } from '../src/models/registry';
import type { ModelKind } from '../src/models/types';
import { exampleDesigns } from '../src/models/data/examples';

const PORT = Number(process.env.SHOT_PORT ?? 4173);
const BASE = process.env.RING_BASE ?? '/ring-creator/';
const OUT = process.env.SHOT_OUT ?? 'dist/screenshots';
const only = process.env.SHOT_ONLY?.split(',').filter(Boolean);
const URL_ROOT = `http://127.0.0.1:${PORT}${BASE}`;

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(URL_ROOT);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('preview server did not start');
}

async function main(): Promise<void> {
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
    stdio: 'ignore',
    env: { ...process.env, RING_BASE: BASE },
  });
  try {
    await waitForServer();
    const browser = await chromium.launch({
      args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
    });
    const ctx = await browser.newContext({ viewport: { width: 720, height: 540 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.error('pageerror:', e.message));

    const shoot = async (hash: string, file: string, selector = '#shot'): Promise<boolean> => {
      mkdirSync(join(OUT, file, '..'), { recursive: true });
      try {
        await page.goto(`${URL_ROOT}#${hash}`);
        await page.evaluate(() => ((window as unknown as { __shotReady?: boolean }).__shotReady = false));
        await page.reload();
        await page.waitForFunction(() => (window as unknown as { __shotReady?: boolean }).__shotReady === true, null, { timeout: 30000 });
        await page.locator(selector).screenshot({ path: join(OUT, file) });
        return true;
      } catch (e) {
        console.error(`FAILED ${hash}:`, (e as Error).message.split('\n')[0]);
        return false;
      }
    };

    let ok = 0;
    let fail = 0;
    const kinds = Object.keys(KIND_LABELS) as ModelKind[];
    for (const kind of kinds) {
      if (only && !only.includes(kind)) continue;
      for (const m of listModels(kind)) {
        (await shoot(`/shot/${kind}/${m.id}`, `components/${kind}/${m.id}.png`)) ? ok++ : fail++;
      }
    }
    if (!only || only.includes('examples')) {
      for (const d of exampleDesigns) {
        (await shoot(`/shot/example/${d.id}`, `examples/${d.id}.png`)) ? ok++ : fail++;
      }
    }
    if (!only || only.includes('pages')) {
      await page.setViewportSize({ width: 1280, height: 800 });
      for (const [hash, file] of [
        ['/', 'pages/home.png'],
        ['/build', 'pages/builder.png'],
        ['/gallery', 'pages/gallery.png'],
        ['/components', 'pages/components.png'],
        ['/docs', 'pages/guides.png'],
        ['/saved', 'pages/saved.png'],
      ] as const) {
        try {
          await page.goto(`${URL_ROOT}#${hash}`);
          await page.waitForTimeout(2500);
          mkdirSync(join(OUT, 'pages'), { recursive: true });
          await page.screenshot({ path: join(OUT, file) });
          ok++;
        } catch (e) {
          console.error(`FAILED page ${hash}`, (e as Error).message);
          fail++;
        }
      }
    }
    await browser.close();
    console.log(`screenshots: ${ok} ok, ${fail} failed -> ${OUT}`);
    if (fail > 0) process.exitCode = 1;
  } finally {
    server.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

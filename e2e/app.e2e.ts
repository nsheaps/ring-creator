/**
 * End-to-end checks of the P0 flows against a production build served by `vite preview`.
 *   bun run build && bun run e2e
 * Plain Node script (not @playwright/test): one line per passed check, exit code 1 on any failure.
 * Env: SHOT_CHROMIUM (browser executable for local runs), SHOT_PORT (default 4174), RING_BASE.
 */
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.env.SHOT_PORT ?? 4174);
const BASE = process.env.RING_BASE ?? '/ring-creator/';
const ROOT = `http://127.0.0.1:${PORT}${BASE}`;
const T = 30000;

let passed = 0;
const failures: string[] = [];

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

async function check(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`FAIL ${name}\n     ${(e as Error).message.split('\n').slice(0, 4).join('\n     ')}`);
  }
}

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(ROOT)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('preview server did not start (run `bun run build` first)');
}

/** Opens a page that records console errors and uncaught exceptions. */
async function open(ctx: BrowserContext): Promise<{ page: Page; errors: string[] }> {
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return { page, errors };
}

const go = async (page: Page, hash: string): Promise<void> => {
  await page.goto(`${ROOT}#${hash}`);
};

const ready = async (page: Page): Promise<void> => {
  await page.waitForFunction(
    () => typeof (window as unknown as { __ringReady?: number }).__ringReady === 'number',
    null,
    { timeout: T },
  );
};

const summary = async (page: Page): Promise<string> =>
  (await page.getByTestId('spec-summary').innerText()).replace(/\s+/g, ' ');

async function main(): Promise<void> {
  const server = spawn(
    'npx',
    ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
    { stdio: 'ignore', env: { ...process.env, RING_BASE: BASE } },
  );
  let browser: Browser | undefined;
  try {
    await waitForServer();
    browser = await chromium.launch({
      executablePath: process.env.SHOT_CHROMIUM || undefined,
      args: [
        '--use-angle=swiftshader',
        '--use-gl=angle',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
        '--no-sandbox',
      ],
    });
    const b = browser;
    const newCtx = (opts: Parameters<Browser['newContext']>[0] = {}) =>
      b.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true, ...opts });
    const ctx = await newCtx({ permissions: ['clipboard-read', 'clipboard-write'] });
    ctx.setDefaultTimeout(T);

    await check('home loads without console errors and shows the 3D canvas', async () => {
      const { page, errors } = await open(ctx);
      await go(page, '/');
      await page.getByTestId('home').waitFor();
      await page.locator('canvas').first().waitFor({ state: 'attached' });
      await page.waitForTimeout(800);
      assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
      await page.close();
    });

    // Builder state is kept for the later steps in this page.
    const { page: bp, errors: berrors } = await open(ctx);
    await go(bp, '/build');

    await check('builder renders (__ringReady) with a canvas', async () => {
      await bp.getByTestId('builder').waitFor();
      await ready(bp);
      assert((await bp.locator('canvas').count()) > 0, 'no canvas');
      assert(/ct/.test(await summary(bp)), 'summary lacks carat');
    });

    await check('changing cut, head, shank and metal updates the summary, no console errors', async () => {
      const before = await summary(bp);
      await bp.getByTestId('step-stone').click();
      const cuts = bp.locator('[data-testid^="card-cut-"]');
      const cutId = ((await cuts.nth(2).getAttribute('data-testid')) ?? '').replace('card-cut-', '');
      await cuts.nth(2).click();
      const cutName = (await cuts.nth(2).locator('strong').innerText()).trim();
      const afterCut = await summary(bp);
      assert(afterCut.includes(cutName), `summary has no "${cutName}" (${cutId}): ${afterCut}`);
      assert(afterCut !== before, 'summary unchanged after cut change');

      await bp.getByTestId('step-head').click();
      const heads = bp.locator('[data-testid^="card-head-"]:not([disabled])');
      assert((await heads.count()) > 1, 'fewer than 2 selectable heads');
      const h = heads.nth(1);
      await h.click();
      assert((await h.getAttribute('aria-pressed')) === 'true', 'head not selected');

      await bp.getByTestId('step-shank').click();
      const shanks = bp.locator('[data-testid^="card-shank-"]:not([disabled])');
      await shanks.nth(1).click();
      assert((await shanks.nth(1).getAttribute('aria-pressed')) === 'true', 'shank not selected');

      await bp.getByTestId('step-metals').click();
      const sel = bp.locator('#mt-head');
      const opts = await sel
        .locator('option')
        .evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value));
      await sel.selectOption(opts[opts.length - 1]);
      await bp.locator('#mt-shank').selectOption(opts[0]);
      await bp.getByTestId('chip-mixed').waitFor();
      const metals = await bp.locator('.bd-summary dt:text-is("Metals") + dd').innerText();
      assert(metals.includes(',') || metals.length > 0, 'metals row empty');
      await bp.waitForTimeout(500);
      assert(berrors.length === 0, `console errors: ${berrors.join(' | ')}`);
    });

    await check('carat slider changes the mm size summary', async () => {
      await bp.getByTestId('step-stone').click();
      const slider = bp.getByTestId('carat-slider');
      const readOut = async () =>
        (await bp.locator('label:has([data-testid="carat-slider"]) output').innerText()).trim();
      const setT = async (v: number) =>
        slider.evaluate((el, val) => {
          const input = el as HTMLInputElement;
          const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          set?.call(input, String(val));
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }, v);
      await setT(10);
      const small = await readOut();
      await setT(90);
      const big = await readOut();
      assert(/\d+\.\d+ ct · .*mm/.test(small) && /mm/.test(big), `readouts: ${small} / ${big}`);
      assert(small !== big, 'readout did not change');
      await bp.waitForTimeout(800);
      const sum = await summary(bp);
      assert(/×.*mm/.test(sum), `summary lacks mm size: ${sum}`);
    });

    await check('band toggle and Ring/Band/Set views', async () => {
      await bp.getByTestId('step-band').click();
      const toggle = bp.getByTestId('toggle-band');
      if (!(await toggle.isChecked())) await toggle.check();
      assert(await bp.getByTestId('view-band').isEnabled(), 'Band view disabled with band on');
      await bp
        .getByTestId(
          'card-band-' +
            (await bp.locator('[data-testid^="card-band-"]').first().getAttribute('data-testid'))!.replace(
              'card-band-',
              '',
            ),
        )
        .click();
      for (const v of ['set', 'band', 'ring']) {
        await bp.getByTestId(`view-${v}`).click();
        assert(
          (await bp.getByTestId(`view-${v}`).getAttribute('aria-checked')) === 'true',
          `${v} not active`,
        );
        assert((await bp.locator('canvas').count()) > 0, 'canvas gone');
      }
      await toggle.uncheck();
      assert(await bp.getByTestId('view-band').isDisabled(), 'Band view enabled with band off');
      assert(await bp.getByTestId('view-set').isDisabled(), 'Set view enabled with band off');
      await toggle.check();
      assert(berrors.length === 0, `console errors: ${berrors.join(' | ')}`);
    });

    let savedName = '';
    await check('save appears on #/saved and survives reload', async () => {
      savedName = `E2E Ring ${Date.now() % 100000}`;
      await bp.getByTestId('input-name').fill(savedName);
      await bp.getByTestId('btn-save').click();
      await bp.getByTestId('toast').filter({ hasText: 'Saved' }).waitFor();
      await go(bp, '/saved');
      await bp.getByTestId('saved-list').waitFor();
      assert((await bp.getByTestId('saved-item').filter({ hasText: savedName }).count()) === 1, 'not listed');
      await bp.reload();
      await bp.getByTestId('saved-list').waitFor();
      assert(
        (await bp.getByTestId('saved-item').filter({ hasText: savedName }).count()) === 1,
        'lost on reload',
      );
    });

    await check('share link opens in a fresh context with the same design', async () => {
      await go(bp, '/build');
      await ready(bp);
      await bp.getByTestId('input-name').fill('Shared E2E');
      const want = await summary(bp);
      await bp.getByTestId('btn-share').click();
      await bp
        .getByTestId('toast')
        .filter({ hasText: /Share link|Copy this link/ })
        .waitFor();
      const link = await bp.evaluate(() => navigator.clipboard.readText());
      assert(link.includes('#/build?d='), `clipboard has no share link: ${link.slice(0, 80)}`);
      const fresh = await newCtx();
      fresh.setDefaultTimeout(T);
      const { page: fp, errors } = await open(fresh);
      await fp.goto(link);
      await fp.getByTestId('toast').filter({ hasText: 'Loaded the shared design' }).waitFor();
      await ready(fp);
      assert((await fp.getByTestId('input-name').inputValue()) === 'Shared E2E', 'name differs');
      assert((await summary(fp)) === want, `summary differs: ${await summary(fp)} vs ${want}`);
      assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
      await fresh.close();
    });

    await check('export JSON round trip via import', async () => {
      await go(bp, '/build');
      await ready(bp);
      await bp.getByTestId('input-name').fill('Round Trip');
      const want = await summary(bp);
      const [dl] = await Promise.all([bp.waitForEvent('download'), bp.getByTestId('btn-export').click()]);
      const file = join(mkdtempSync(join(tmpdir(), 'ring-e2e-')), 'design.json');
      await dl.saveAs(file);
      await bp.getByTestId('btn-reset').click();
      assert((await bp.getByTestId('input-name').inputValue()) !== 'Round Trip', 'reset did not change name');
      await bp.getByTestId('input-import').setInputFiles(file);
      await bp.getByTestId('toast').filter({ hasText: 'Imported' }).waitFor();
      assert((await bp.getByTestId('input-name').inputValue()) === 'Round Trip', 'name not restored');
      assert((await summary(bp)) === want, 'summary not restored');
      // A non-design file is rejected with a message, current design unchanged.
      const bad = join(mkdtempSync(join(tmpdir(), 'ring-e2e-')), 'bad.json');
      writeFileSync(bad, '{"nope":true}');
      await bp.getByTestId('input-import').setInputFiles(bad);
      await bp.getByTestId('toast').filter({ hasText: 'not a Ring Creator design' }).waitFor();
    });

    await check('export menu downloads a jeweler pack ZIP and a BOM CSV', async () => {
      await go(bp, '/build');
      await ready(bp);
      await bp.getByTestId('btn-export-menu').click();
      const [csv] = await Promise.all([bp.waitForEvent('download'), bp.getByTestId('export-csv').click()]);
      assert(csv.suggestedFilename().endsWith('-bom.csv'), `csv name: ${csv.suggestedFilename()}`);
      await bp.getByTestId('btn-export-menu').click();
      const [zip] = await Promise.all([bp.waitForEvent('download'), bp.getByTestId('export-zip').click()]);
      assert(zip.suggestedFilename().endsWith('-jeweler-pack.zip'), `zip name: ${zip.suggestedFilename()}`);
      await bp.getByTestId('toast').filter({ hasText: 'Exported' }).waitFor();
    });
    await bp.close();

    await check('gallery shows >= 100 cards, search filters, opening an example loads it', async () => {
      const { page, errors } = await open(ctx);
      await go(page, '/gallery');
      await page.getByTestId('gallery-grid').waitFor();
      const total = await page.getByTestId('design-card').count();
      assert(total >= 100, `only ${total} cards`);
      await page.getByTestId('gallery-search').fill('halo');
      await page.waitForFunction(
        (n) => document.querySelectorAll('[data-testid="design-card"]').length < n,
        total,
      );
      const n = await page.getByTestId('design-card').count();
      assert(n > 0 && n < total, `search gave ${n} of ${total}`);
      const first = page.getByTestId('design-card').first();
      const name = (await first.locator('.dcard-title').innerText()).trim();
      await first.locator('.dcard-title a').click();
      await page.getByTestId('gallery-detail').waitFor();
      await page.getByTestId('open-in-builder').click();
      await page.getByTestId('builder').waitFor();
      assert(
        (await page.getByTestId('input-name').inputValue()) === name,
        'builder did not load the example',
      );
      await ready(page);
      assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
      await page.close();
    });

    await check('components index lists every kind and a detail page renders', async () => {
      const { page, errors } = await open(ctx);
      await go(page, '/components');
      const kinds = ['cut', 'head', 'shank', 'band', 'gem', 'metal', 'finish', 'clarity', 'color-grade'];
      for (const k of kinds) {
        await page.locator(`section#${k}`).waitFor();
        assert(
          (await page.locator(`section#${k} [data-testid^="component-card-"]`).count()) > 0,
          `${k} empty`,
        );
      }
      await page.locator('section#head a[data-testid^="component-card-"]').first().click();
      await page.getByTestId('component-detail').waitFor();
      assert((await page.getByTestId('spec-table').count()) > 0, 'no spec table');
      await page.waitForTimeout(500);
      assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
      await page.close();
    });

    await check("deep link '#/components/head/halo-round' works on a fresh load", async () => {
      const { page, errors } = await open(await newCtx());
      await go(page, '/components/head/halo-round');
      await page.getByTestId('component-detail').waitFor();
      assert(/halo/i.test(await page.locator('h1').first().innerText()), 'wrong heading');
      assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
      await page.close();
    });

    await check('docs index lists guides and an article renders with a TOC', async () => {
      const { page, errors } = await open(ctx);
      await go(page, '/docs');
      await page.getByTestId('guide-list').waitFor();
      const n = await page.locator('[data-testid="guide-list"] a').count();
      assert(n > 0, 'no guides');
      await page.locator('[data-testid="guide-list"] a').first().click();
      await page.getByTestId('article').waitFor();
      assert((await page.getByTestId('article').locator('h1, h2, p').count()) > 2, 'article empty');
      assert((await page.locator('[data-testid="toc"] a').count()) > 0, 'no TOC');
      assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
      await page.close();
    });

    await check('theme toggle switches and persists', async () => {
      const { page } = await open(ctx);
      await go(page, '/');
      const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
      const t0 = await theme();
      await page.locator('header button[aria-label^="Switch to"]').click();
      const t1 = await theme();
      assert(t0 !== t1 && (t1 === 'light' || t1 === 'dark'), `theme ${t0} -> ${t1}`);
      await page.reload();
      assert((await theme()) === t1, 'theme not persisted');
      await page.locator('header button[aria-label^="Switch to"]').click();
      assert((await theme()) === t0, 'theme did not toggle back');
      await page.close();
    });

    await check('mobile 390px has no horizontal overflow on / and /build', async () => {
      const m = await newCtx({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      m.setDefaultTimeout(T);
      const { page } = await open(m);
      for (const hash of ['/', '/build']) {
        await go(page, hash);
        await page.waitForTimeout(1500);
        const over = await page.evaluate(() => ({
          sw: document.documentElement.scrollWidth,
          cw: document.documentElement.clientWidth,
        }));
        assert(over.sw <= over.cw, `${hash} overflows: scrollWidth ${over.sw} > ${over.cw}`);
      }
      await m.close();
    });

    await check('keyboard: tab reaches skip link and each nav link in order', async () => {
      const { page } = await open(ctx);
      await go(page, '/');
      await page.getByTestId('home').waitFor();
      const seen: string[] = [];
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press('Tab');
        seen.push(
          await page.evaluate(() => {
            const a = document.activeElement as HTMLElement | null;
            return `${a?.tagName}:${(a?.textContent ?? '').trim().slice(0, 20)}`;
          }),
        );
      }
      const labels = ['Skip to content', 'Ring Creator', 'Build', 'Gallery', 'Saved', 'Components', 'Guides'];
      let at = -1;
      for (const l of labels) {
        const j = seen.findIndex((s, idx) => idx > at && s.startsWith('A:') && s.includes(l));
        assert(j > at, `"${l}" not reached in order: ${seen.join(' > ')}`);
        at = j;
      }
      // Focus is now past the nav; walk back to the Guides link and activate it from the keyboard.
      await page.keyboard.press('Shift+Tab');
      assert(
        (await page.evaluate(() => document.activeElement?.textContent?.trim())) === 'Guides',
        'Shift+Tab did not return to the Guides link',
      );
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => location.hash === '#/docs');
      await page.close();
    });
  } finally {
    await browser?.close();
    server.kill();
  }
  console.log(`\ne2e: ${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

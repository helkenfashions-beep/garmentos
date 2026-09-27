import { test, expect } from '@playwright/test';
import { openApp, generateBlock, touchDrag, noErrors } from './helpers.js';

// ── On-demand cloth physics (PBD solver in a worker) ───────────────────────

const simState = (page) => page.getByTestId('viewer3d').getAttribute('data-sim-state');

test('simulate: the trousers settle on the body in the worker, then reset goes back to the live drape', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = await openApp(page);
  await generateBlock(page);

  await page.getByTestId('simulate').click();
  await expect(page.getByTestId('viewer3d')).toHaveAttribute('data-sim-state', 'running');
  await expect(page.getByTestId('simulate')).toHaveText(/stop/i);
  // frames arrive while it runs
  await expect.poll(async () => +(await page.getByTestId('viewer3d').getAttribute('data-sim-frame')), { timeout: 30_000 }).toBeGreaterThan(5);

  await expect(page.getByTestId('viewer3d')).toHaveAttribute('data-sim-state', 'done', { timeout: 120_000 });
  const st = await page.evaluate(() => window.__garmentos3d.simStats());
  expect(st.thread).toBe('worker');
  expect(['settled', 'max-frames']).toContain(st.reason);
  expect(st.inside).toBe(0);
  expect(st.seamGap).toBeLessThan(4);
  // handles belong to the live drape: none while the simulated result shows
  expect(await page.evaluate(() => window.__garmentos3d.handleIds().length)).toBe(0);

  await page.getByTestId('simulate').click();              // reset
  await expect(page.getByTestId('viewer3d')).toHaveAttribute('data-sim-state', 'idle');
  await page.waitForFunction(() => (window.__garmentos3d?.handleIds() ?? []).length > 10);
  noErrors(errors);
});

test('stop ends the simulation where the cloth is', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = await openApp(page);
  await generateBlock(page);
  await page.getByTestId('simulate').click();
  await expect.poll(async () => +(await page.getByTestId('viewer3d').getAttribute('data-sim-frame')), { timeout: 30_000 }).toBeGreaterThan(2);
  await page.getByTestId('simulate').click();              // stop
  await expect(page.getByTestId('viewer3d')).toHaveAttribute('data-sim-state', 'done', { timeout: 10_000 });
  const st = await page.evaluate(() => window.__garmentos3d.simStats());
  expect(st.reason).toBe('cancelled');
  expect(st.inside).toBe(0);
  noErrors(errors);
});

test('the 3D view stays interactive while the solver runs (orbit mid-simulation)', async ({ page, isMobile }) => {
  test.setTimeout(60_000);
  const errors = await openApp(page);
  await generateBlock(page);
  await page.getByTestId('simulate').click();
  await expect.poll(async () => +(await page.getByTestId('viewer3d').getAttribute('data-sim-frame')), { timeout: 30_000 }).toBeGreaterThan(1);
  const frame0 = +(await page.getByTestId('viewer3d').getAttribute('data-sim-frame'));
  const cam0 = await page.evaluate(() => window.__garmentos3d.cameraPos());
  const box = await page.getByTestId('viewer3d').boundingBox();
  const from = { x: box.x + box.width * 0.2, y: box.y + box.height * 0.3 };
  const to = { x: from.x + box.width * 0.3, y: from.y };
  if (isMobile) await touchDrag(page, from, to, 6);
  else { await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 6 }); await page.mouse.up(); }
  // the camera turned, and the solver kept producing frames meanwhile
  await expect.poll(async () => {
    const c = await page.evaluate(() => window.__garmentos3d.cameraPos());
    return Math.hypot(c[0] - cam0[0], c[2] - cam0[2]);
  }, { timeout: 10_000 }).toBeGreaterThan(50);
  expect(+(await page.getByTestId('viewer3d').getAttribute('data-sim-frame'))).toBeGreaterThan(frame0);
  noErrors(errors);
});

test('editing during a simulation cancels it and the live drape comes back', async ({ page, isMobile }) => {
  test.setTimeout(60_000);
  const errors = await openApp(page);
  await generateBlock(page);
  // open the measurements first (on phones the drawer resizes the 3D view)
  if (isMobile) await page.getByTestId('measure-open').click();
  else await page.getByTestId('measure-toggle').click();
  await expect(page.getByTestId('m-waist')).toBeVisible();
  await page.getByTestId('simulate').click();
  await expect(page.getByTestId('viewer3d')).toHaveAttribute('data-sim-state', 'running');
  await page.getByTestId('m-waist').fill('90');              // an edit: new waist
  await expect(page.getByTestId('viewer3d')).toHaveAttribute('data-sim-state', 'idle');
  await page.waitForFunction(() => (window.__garmentos3d?.handleIds() ?? []).length > 10);
  // no stale frames land on the live garment afterwards
  await page.waitForTimeout(1500);
  expect(await simState(page)).toBe('idle');
  expect(await page.evaluate(() => window.__garmentos3d.handleIds().length)).toBeGreaterThan(10);
  noErrors(errors);
});

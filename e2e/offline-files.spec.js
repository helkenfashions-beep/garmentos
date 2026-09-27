import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { openApp, generateBlock, pattern, touchDrag, frontDartTip, noErrors } from './helpers.js';

// ── Install + offline ────────────────────────────────────────────────────────

test('installable: manifest, icons and service worker are valid', async ({ page, request }) => {
  await openApp(page);
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const res = await request.get(new URL(href, page.url()).toString());
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m.display).toBe('standalone');
  expect(m.short_name).toBe('GarmentOS');
  const sizes = m.icons.map(i => i.sizes);
  expect(sizes).toContain('192x192');
  expect(sizes).toContain('512x512');
  expect(m.icons.some(i => i.purpose === 'maskable')).toBe(true);
  for (const icon of m.icons) {
    const r = await request.get(new URL(icon.src, new URL(href, page.url())).toString());
    expect(r.ok()).toBe(true);
    expect(r.headers()['content-type']).toContain('image/png');
  }
  const sw = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return !!reg.active;
  });
  expect(sw).toBe(true);
});

test('works fully offline after the first visit', async ({ page, context }) => {
  await openApp(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  // make sure this page is controlled (first load may not be)
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('viewer3d')).toBeVisible();
  await generateBlock(page);
  await expect(page.getByTestId('viewer3d')).toHaveAttribute('data-drape-pieces', '2');
  await context.setOffline(false);
});

// ── Autosave, save, open ─────────────────────────────────────────────────────

test('autosave: edits survive closing and reopening the app', async ({ page, isMobile }) => {
  await openApp(page);
  await generateBlock(page);
  const p0 = await pattern(page);
  const id = frontDartTip(p0);
  const from = await page.evaluate(({ x, y }) => window.__garmentos2d.toScreen(x, y), p0.points[id]);
  const to = { x: from.x, y: from.y + 40 };
  if (isMobile) await touchDrag(page, from, to);
  else { await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 8 }); await page.mouse.up(); }
  const p1 = await pattern(page);
  await page.waitForTimeout(300); // autosave rides on the 80 ms pattern debounce

  await page.reload();
  await expect(page.getByTestId('viewer3d')).toHaveAttribute('data-drape-pieces', '2');
  const p2 = await pattern(page);
  expect(p2.points).toEqual(p1.points);
  expect(p2.pieces).toEqual(p1.pieces);
  await expect(page.getByTestId('empty-hint')).toHaveCount(0);
});

test('save to a file, start new, open it again', async ({ page }, testInfo) => {
  const errors = await openApp(page);
  await page.getByTestId('menu-open').click();
  await page.getByTestId('pattern-name').fill('Slim trouser v2');
  await page.getByTestId('m-waist').fill('78');
  await page.getByTestId('block-fit').selectOption('slack');
  await page.getByTestId('btn-generate').click();
  const saved = await pattern(page);

  await page.getByTestId('menu-open').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('btn-save').click(),
  ]);
  expect(download.suggestedFilename()).toBe('slim-trouser-v2.garmentos.json');
  const file = testInfo.outputPath('saved.garmentos.json');
  await download.saveAs(file);
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  expect(json.format).toBe('garmentos-pattern');
  expect(json.measurements.waist).toBe(780);

  // New → empty canvas, default name
  await page.getByTestId('btn-new').click();
  await expect(page.getByTestId('empty-hint')).toBeVisible();
  expect(Object.keys((await pattern(page)).points)).toHaveLength(0);

  // Open the saved file
  await page.getByTestId('file-input').setInputFiles(file);
  await expect(page.getByTestId('viewer3d')).toHaveAttribute('data-drape-pieces', '2');
  const reopened = await pattern(page);
  expect(reopened.points).toEqual(saved.points);
  expect(reopened.segments).toEqual(saved.segments);
  await page.getByTestId('menu-open').click();
  await expect(page.getByTestId('pattern-name')).toHaveValue('Slim trouser v2');
  await expect(page.getByTestId('m-waist')).toHaveValue('78.0');
  noErrors(errors);
});

test('opening a file that is not a pattern shows a clear message and changes nothing', async ({ page }, testInfo) => {
  await openApp(page);
  await generateBlock(page);
  const before = await pattern(page);
  const bad = testInfo.outputPath('notes.json');
  fs.writeFileSync(bad, '{"shopping":["thread","zips"]}');
  await page.getByTestId('file-input').setInputFiles(bad);
  await expect(page.getByTestId('toast')).toContainText('not a GarmentOS pattern');
  expect((await pattern(page)).points).toEqual(before.points);
});

import { test, expect } from '@playwright/test';
import { openApp, generateBlock, pattern, touchDrag, pinch, tap, noErrors } from './helpers.js';

// Touch-only behaviour: run on the phone projects
test.skip(({ isMobile }) => !isMobile, 'touch tests run on the Android projects');

const canvasBox = (page) => page.getByTestId('pattern-canvas').boundingBox();
const vp = async (page) => {
  const c = page.getByTestId('pattern-canvas');
  return {
    scale: Number(await c.getAttribute('data-scale')),
    x: Number(await c.getAttribute('data-vx')),
    y: Number(await c.getAttribute('data-vy')),
  };
};

test('pinch zooms the pattern canvas around the fingers', async ({ page }) => {
  const errors = await openApp(page);
  await generateBlock(page);
  const b = await canvasBox(page);
  const c = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const v0 = await vp(page);
  await pinch(page, c, 80, 200);
  const v1 = await vp(page);
  expect(v1.scale / v0.scale).toBeGreaterThan(2);
  expect(v1.scale / v0.scale).toBeLessThan(3);
  // the pattern point under the pinch centre stays put
  const before = { x: (c.x - b.x) / v0.scale + v0.x, y: (c.y - b.y) / v0.scale + v0.y };
  const after  = { x: (c.x - b.x) / v1.scale + v1.x, y: (c.y - b.y) / v1.scale + v1.y };
  expect(Math.hypot(before.x - after.x, before.y - after.y)).toBeLessThan(2 / v0.scale + 1);
  // pinch never edits the pattern
  const n = Object.keys((await pattern(page)).points).length;
  await pinch(page, c, 200, 90);
  expect(Object.keys((await pattern(page)).points).length).toBe(n);
  noErrors(errors);
});

test('one-finger drag on empty canvas pans; tap on empty canvas deselects', async ({ page }) => {
  await openApp(page);
  await generateBlock(page);
  const b = await canvasBox(page);
  const v0 = await vp(page);
  // top-left corner is empty space
  await touchDrag(page, { x: b.x + 20, y: b.y + b.height - 20 }, { x: b.x + 120, y: b.y + b.height - 60 });
  const v1 = await vp(page);
  expect((v0.x - v1.x) * v1.scale).toBeGreaterThan(80);
  expect(v1.scale).toBeCloseTo(v0.scale, 5);
});

test('fit button frames the whole pattern', async ({ page }) => {
  await openApp(page);
  await generateBlock(page);
  const b = await canvasBox(page);
  await pinch(page, { x: b.x + b.width / 2, y: b.y + b.height / 2 }, 60, 260);
  await page.getByTestId('tool-fit').click();
  const p = await pattern(page);
  for (const pt of Object.values(p.points)) {
    const s = await page.evaluate(({ x, y }) => window.__garmentos2d.toScreen(x, y), pt);
    expect(s.x).toBeGreaterThanOrEqual(b.x - 1);
    expect(s.x).toBeLessThanOrEqual(b.x + b.width + 1);
    expect(s.y).toBeGreaterThanOrEqual(b.y - 1);
    expect(s.y).toBeLessThanOrEqual(b.y + b.height + 1);
  }
});

test('line tool: two taps draw a segment; a two-finger pinch drops no stray points', async ({ page }) => {
  await openApp(page);
  const b = await canvasBox(page);
  await page.getByTestId('tool-line').click();
  const n0 = Object.keys((await pattern(page)).points).length;
  await pinch(page, { x: b.x + b.width / 2, y: b.y + b.height / 2 }, 100, 150);
  expect(Object.keys((await pattern(page)).points).length).toBe(n0);
  await tap(page, { x: b.x + b.width * 0.2, y: b.y + b.height * 0.2 });
  await tap(page, { x: b.x + b.width * 0.6, y: b.y + b.height * 0.5 });
  const p = await pattern(page);
  expect(Object.keys(p.points).length).toBe(n0 + 2);
  expect(Object.values(p.segments).filter(s => s.type === 'line').length).toBe(1);
});

test('a closed rectangle drawn by finger drapes onto the body as a piece', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByTestId('tool-rect').click();
  const b = await canvasBox(page);
  await touchDrag(page, { x: b.x + b.width * 0.15, y: b.y + b.height * 0.15 }, { x: b.x + b.width * 0.65, y: b.y + b.height * 0.8 });
  await expect(page.getByTestId('viewer3d')).toHaveAttribute('data-drape-pieces', '1');
  noErrors(errors);
});

test('line tool closes a hand-drawn shape by tapping the first point (touch snap)', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('tool-line').click();
  const b = await canvasBox(page);
  const P = [[0.2, 0.15], [0.7, 0.18], [0.65, 0.8], [0.22, 0.75]].map(([fx, fy]) => ({ x: b.x + b.width * fx, y: b.y + b.height * fy }));
  for (const q of P) await tap(page, q);
  // finger lands 12 px off the first point — the touch snap radius catches it
  await tap(page, { x: P[0].x + 9, y: P[0].y + 8 });
  const p = await pattern(page);
  expect(Object.keys(p.points).length).toBe(4);
  expect(Object.keys(p.segments).length).toBe(4);
  await expect(page.getByTestId('viewer3d')).toHaveAttribute('data-drape-pieces', '1');
});

test('split divider resizes by finger', async ({ page }) => {
  await openApp(page);
  const d = await page.getByTestId('divider').boundingBox();
  const c0 = await canvasBox(page);
  const horizontal = d.width > d.height;
  const from = { x: d.x + d.width / 2, y: d.y + d.height / 2 };
  const to = horizontal ? { x: from.x, y: from.y - 120 } : { x: from.x - 120, y: from.y };
  await touchDrag(page, from, to);
  const c1 = await canvasBox(page);
  if (horizontal) expect(c0.height - c1.height).toBeGreaterThan(80);
  else expect(c0.width - c1.width).toBeGreaterThan(80);
});

test('3D panel: one finger orbits the body without editing the pattern', async ({ page }) => {
  await openApp(page);
  await generateBlock(page);
  const p0 = await pattern(page);
  const v = await page.getByTestId('viewer3d').boundingBox();
  // far left of the 3D panel: empty background, no handles
  await touchDrag(page, { x: v.x + 30, y: v.y + v.height / 2 }, { x: v.x + 200, y: v.y + v.height / 2 });
  const p1 = await pattern(page);
  expect(p1.points).toEqual(p0.points);
});

test('menu sheet: change fit + measurement, regenerate', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByTestId('menu-open').click();
  await expect(page.getByTestId('menu-sheet')).toBeVisible();
  await page.getByTestId('block-fit').selectOption('jeans');
  await page.getByTestId('m-waist').fill('90');
  await page.getByTestId('btn-generate').click();
  await expect(page.getByTestId('menu-sheet')).toBeHidden();
  await expect(page.getByTestId('viewer3d')).toHaveAttribute('data-drape-pieces', '2');
  const p = await pattern(page);
  // front waist width = WC/4 + 20 with WC = 900 mm
  const front = Object.values(p.segments).find(s => s.piece === 'trouser-front' && !s.dart && p.points[s.p1].y === p.points[s.p2].y && p.points[s.p1].y === p.pieces['trouser-front'].waistY);
  const w = Math.abs(p.points[front.p2].x - p.points[front.p1].x);
  expect(w).toBeCloseTo(900 / 4 + 20, 0);
  noErrors(errors);
});

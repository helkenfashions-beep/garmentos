import { test, expect } from '@playwright/test';
import { openApp, generateBlock, pattern, touchDrag, frontDartTip, noErrors } from './helpers.js';

// ── 2D ⇄ 3D live split view ─────────────────────────────────────────────────

test('generated block drapes both panels onto both legs', async ({ page }) => {
  const errors = await openApp(page);
  await generateBlock(page);
  const inst = await page.evaluate(() => window.__garmentos3d.instances());
  expect(inst.map(i => `${i.key}:${i.sx}`).sort()).toEqual([
    'trouser-back:-1', 'trouser-back:1', 'trouser-front:-1', 'trouser-front:1',
  ]);
  for (const i of inst) expect(i.tris).toBeGreaterThan(300);
  noErrors(errors);
});

test('2D → 3D: moving a point on the pattern moves it on the body', async ({ page, isMobile }) => {
  const errors = await openApp(page);
  await generateBlock(page);
  const p0 = await pattern(page);
  const id = frontDartTip(p0);
  const before3d = await page.evaluate((id) => window.__garmentos3d.handleScreen(id, 1), id);

  const from = await page.evaluate(({ x, y }) => window.__garmentos2d.toScreen(x, y), p0.points[id]);
  const to = { x: from.x, y: from.y + 40 };
  if (isMobile) await touchDrag(page, from, to);
  else { await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 10 }); await page.mouse.up(); }

  const p1 = await pattern(page);
  expect(p1.points[id].y - p0.points[id].y).toBeGreaterThan(10);

  // the draped handle follows (sync is automatic — no button press)
  await expect.poll(async () => {
    const s = await page.evaluate((id) => window.__garmentos3d.handleScreen(id, 1), id);
    return s.y - before3d.y;
  }, { timeout: 2000 }).toBeGreaterThan(3);

  // re-drape is fast enough for live editing
  const ms = Number(await page.getByTestId('viewer3d').getAttribute('data-drape-ms'));
  expect(ms).toBeLessThan(200);
  noErrors(errors);
});

test('3D → 2D: dragging a seam point on the body edits the pattern, one undo restores it', async ({ page, isMobile }) => {
  const errors = await openApp(page);
  await generateBlock(page);
  const p0 = await pattern(page);
  const id = frontDartTip(p0);
  const from = await page.evaluate((id) => window.__garmentos3d.handleScreen(id, 1), id);
  expect(from).not.toBeNull();
  const to = { x: from.x, y: from.y + 25 };

  if (isMobile) await touchDrag(page, from, to, 16);
  else { await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 16 }); await page.mouse.up(); }

  const p1 = await pattern(page);
  const dy = p1.points[id].y - p0.points[id].y;
  const dx = p1.points[id].x - p0.points[id].x;
  expect(dy).toBeGreaterThan(15);          // pulled down on the body → longer dart on paper
  expect(Math.abs(dx)).toBeLessThan(dy);   // mostly vertical, as dragged
  // no other point moved
  const moved = Object.keys(p0.points).filter(k => p0.points[k].x !== p1.points[k].x || p0.points[k].y !== p1.points[k].y);
  expect(moved).toEqual([id]);

  await page.getByTestId('tool-undo').click();
  const p2 = await pattern(page);
  expect(p2.points[id]).toEqual(p0.points[id]);
  noErrors(errors);
});

test('undo after a 2D drag puts the point back (single step)', async ({ page, isMobile }) => {
  await openApp(page);
  await generateBlock(page);
  const p0 = await pattern(page);
  const id = frontDartTip(p0);
  const from = await page.evaluate(({ x, y }) => window.__garmentos2d.toScreen(x, y), p0.points[id]);
  const to = { x: from.x + 30, y: from.y + 30 };
  if (isMobile) await touchDrag(page, from, to);
  else { await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 8 }); await page.mouse.up(); }
  expect((await pattern(page)).points[id]).not.toEqual(p0.points[id]);
  await page.getByTestId('tool-undo').click();
  expect((await pattern(page)).points[id]).toEqual(p0.points[id]);
  await page.getByTestId('tool-redo').click();
  expect((await pattern(page)).points[id]).not.toEqual(p0.points[id]);
});

test('view modes keep the pattern (3D-only does not lose work)', async ({ page }) => {
  await openApp(page);
  await generateBlock(page);
  const n0 = Object.keys((await pattern(page)).points).length;
  await page.getByTestId('view-3d').click();
  await expect(page.getByTestId('viewer3d')).toHaveAttribute('data-drape-pieces', '2');
  await page.getByTestId('view-2d').click();
  await page.getByTestId('view-split').click();
  expect(Object.keys((await pattern(page)).points).length).toBe(n0);
  await expect(page.getByTestId('viewer3d')).toHaveAttribute('data-drape-pieces', '2');
});

test('points toggle hides seam handles in 3D', async ({ page }) => {
  await openApp(page);
  await generateBlock(page);
  const id = frontDartTip(await pattern(page));
  const from = await page.evaluate((id) => window.__garmentos3d.handleScreen(id, 1), id);
  await page.getByTestId('toggle-handles').click();
  const p0 = await pattern(page);
  // dragging where the handle was now orbits the camera instead of editing
  await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(from.x, from.y + 30, { steps: 5 }); await page.mouse.up();
  expect((await pattern(page)).points[id]).toEqual(p0.points[id]);
});

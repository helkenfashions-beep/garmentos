import { expect } from '@playwright/test';

/** Fresh app with no autosave, console errors collected. */
export async function openApp(page, { keepStorage = false } = {}) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  if (!keepStorage) {
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  }
  await expect(page.getByTestId('viewer3d')).toBeVisible();
  return errors;
}

export async function generateBlock(page) {
  await page.getByTestId('quick-generate').click();
  await expect(page.getByTestId('viewer3d')).toHaveAttribute('data-drape-pieces', '2');
  // wait for the handles to exist in the scene
  await page.waitForFunction(() => (window.__garmentos3d?.handleIds() ?? []).length > 10);
}

export const pattern = (page) => page.evaluate(() => {
  const p = window.__garmentos2d.pattern();
  return { points: p.points, segments: p.segments, pieces: p.pieces };
});

/** Real touch drag through the Chrome DevTools protocol (pointerType = 'touch'). */
export async function touchDrag(page, from, to, steps = 12) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y, id: 1 }] });
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, id: 1 }],
    });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/** Two-finger pinch centred on `c`, fingers moving from d0 to d1 apart (px). */
export async function pinch(page, c, d0, d1, steps = 10) {
  const cdp = await page.context().newCDPSession(page);
  const pts = (d) => [{ x: c.x - d / 2, y: c.y, id: 1 }, { x: c.x + d / 2, y: c.y, id: 2 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(d0) });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(d0 + (d1 - d0) * i / steps) });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

export async function tap(page, p) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/** Id of the front dart tip — a front-facing seam point that is easy to see in 3D. */
export function frontDartTip(p) {
  const legs = Object.values(p.segments).filter(s => s.dart === 'fd1');
  return legs[0].p2;
}

export const noErrors = (errors) => expect(errors.filter(e => !/favicon|DevTools/.test(e))).toEqual([]);

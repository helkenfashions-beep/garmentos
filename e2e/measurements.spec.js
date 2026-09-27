import { test, expect } from '@playwright/test';
import { openApp, generateBlock, pattern, touchDrag, frontDartTip, noErrors } from './helpers.js';

// Open the measurements UI for this device: bottom drawer on phones, panel on desktop.
async function openMeasurements(page, isMobile) {
  if (isMobile) {
    await page.getByTestId('measure-open').click();
    await expect(page.getByTestId('measure-drawer')).toBeVisible();
  } else {
    await page.getByTestId('measure-toggle').click();
    await expect(page.getByTestId('measurements')).toBeVisible();
  }
}

const frontWaist = (p) => {
  const L = p.pieces['trouser-front'].landmarks;
  return p.points[L.waistCentre].x - p.points[L.waistSide].x;
};

test('editing a measurement redraws the 2D block and the 3D body live', async ({ page, isMobile }) => {
  const errors = await openApp(page);
  await generateBlock(page);
  await openMeasurements(page, isMobile);

  // both views stay on screen while the measurements are open
  const c = await page.getByTestId('pattern-canvas').boundingBox();
  const v = await page.getByTestId('viewer3d').boundingBox();
  expect(c.height).toBeGreaterThan(80);
  expect(v.height).toBeGreaterThan(80);

  const body0 = await page.evaluate(() => window.__garmentos3d.bodyBox());
  expect(frontWaist(await pattern(page))).toBeCloseTo(840 / 4 + 20, 3);

  await page.getByTestId('m-waist').fill('100');
  await expect.poll(async () => frontWaist(await pattern(page)), { timeout: 3000 }).toBeCloseTo(1000 / 4 + 20, 3);
  // 3D: body got wider and the garment re-draped
  await expect.poll(async () => {
    const b = await page.evaluate(() => window.__garmentos3d.bodyBox());
    return (b.max[0] - b.min[0]) - (body0.max[0] - body0.min[0]);
  }, { timeout: 3000 }).toBeGreaterThanOrEqual(0);
  await expect(page.getByTestId('viewer3d')).toHaveAttribute('data-drape-pieces', '2');

  // longer legs: waist-to-ankle drives the hem
  await page.getByTestId('m-waistToAnkle').fill('105');
  await expect.poll(async () => {
    const p = await pattern(page);
    const F = p.pieces['trouser-front'];
    return p.points[F.landmarks.hemOuter].y - F.waistY;
  }, { timeout: 3000 }).toBeCloseTo(1050, 3);
  noErrors(errors);
});

test('lengths are automatic until measured, and clearing returns to automatic', async ({ page, isMobile }) => {
  await openApp(page);
  await generateBlock(page);
  await openMeasurements(page, isMobile);
  const input = page.getByTestId('m-waistToKnee');
  await expect(input).toHaveValue('');
  const auto = Number(await input.getAttribute('placeholder'));
  expect(auto).toBeGreaterThan(40);
  const kneeDepth = async () => { const p = await pattern(page); const F = p.pieces['trouser-front']; return F.kneeY - F.waistY; };
  expect(await kneeDepth()).toBeCloseTo(auto * 10, 0);

  await input.fill('62');
  await expect.poll(kneeDepth, { timeout: 3000 }).toBeCloseTo(620, 3);
  await input.fill('');
  await expect.poll(kneeDepth, { timeout: 3000 }).toBeCloseTo(auto * 10, 0);
});

test('an impossible value is flagged and changes nothing', async ({ page, isMobile }) => {
  await openApp(page);
  await generateBlock(page);
  await openMeasurements(page, isMobile);
  const before = await pattern(page);
  await page.getByTestId('m-waist').fill('5');
  await expect(page.getByText('use 40–250 cm')).toBeVisible();
  await page.waitForTimeout(400);
  expect((await pattern(page)).points).toEqual(before.points);
});

test('hand edits are protected: Apply redraws, Undo brings the edits back', async ({ page, isMobile }) => {
  await openApp(page);
  await generateBlock(page);
  const p0 = await pattern(page);
  const id = frontDartTip(p0);
  const from = await page.evaluate(({ x, y }) => window.__garmentos2d.toScreen(x, y), p0.points[id]);
  const to = { x: from.x, y: from.y + 30 };
  if (isMobile) await touchDrag(page, from, to);
  else { await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 8 }); await page.mouse.up(); }
  const edited = await pattern(page);
  expect(edited.points[id]).not.toEqual(p0.points[id]);

  await openMeasurements(page, isMobile);
  await page.getByTestId('m-hip').fill('104');
  await expect(page.getByTestId('apply-banner')).toBeVisible();
  // the hand edit is still there
  expect((await pattern(page)).points[id]).toEqual(edited.points[id]);

  await page.getByTestId('btn-apply').click();
  await expect(page.getByTestId('apply-banner')).toBeHidden();
  const applied = await pattern(page);
  const L = applied.pieces['trouser-front'].landmarks;
  expect(applied.points[L.hipCentre].x - applied.points[L.hipSide].x).toBeCloseTo(1040 / 4 + 20, 3);

  // one undo → the hand-edited pattern is back
  if (isMobile) await page.getByTestId('measure-close').click();
  await page.getByTestId('tool-undo').click();
  expect((await pattern(page)).points[id]).toEqual(edited.points[id]);
});

test('the 3D view keeps its angle while measurements change', async ({ page, isMobile }) => {
  await openApp(page);
  await generateBlock(page);
  // turn the body first (on desktop the measurements panel floats over the 3D view)
  const v = await page.getByTestId('viewer3d').boundingBox();
  // orbit from empty background at the side of the 3D panel
  const from = { x: v.x + 12, y: v.y + v.height * 0.4 };
  const to = { x: v.x + v.width * 0.5, y: v.y + v.height * 0.4 };
  if (isMobile) await touchDrag(page, from, to);
  else { await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 8 }); await page.mouse.up(); }
  // wait for the orbit's momentum (damping) to stop — slow in software rendering
  // (software rendering can skip frames, so one still sample is not enough:
  // require three quiet samples in a row)
  const settle = async () => {
    let prev = await page.evaluate(() => window.__garmentos3d.cameraPos());
    let quiet = 0;
    for (let k = 0; k < 120 && quiet < 3; k++) {
      await page.waitForTimeout(250);
      const cur = await page.evaluate(() => window.__garmentos3d.cameraPos());
      quiet = Math.hypot(cur[0] - prev[0], cur[1] - prev[1], cur[2] - prev[2]) < 1 ? quiet + 1 : 0;
      prev = cur;
    }
    return prev;
  };
  const azimuth = (c) => Math.atan2(c[0], c[2]) * 180 / Math.PI;   // 0° = front view
  await openMeasurements(page, isMobile);
  const cam0 = await settle();
  expect(Math.abs(cam0[0])).toBeGreaterThan(50);   // really turned away from the front

  await page.getByTestId('m-waist').fill('92');
  await expect(page.getByTestId('viewer3d')).toHaveAttribute('data-drape-pieces', '2');
  const cam1 = await settle();
  // a reset would snap the camera back to the front view (azimuth 0°)
  expect(Math.abs(azimuth(cam0))).toBeGreaterThan(15);
  expect(Math.abs(azimuth(cam1) - azimuth(cam0))).toBeLessThan(3);
});

test('after reopening the app, measurement edits still redraw the block', async ({ page, isMobile }) => {
  await openApp(page);
  await generateBlock(page);
  await page.waitForTimeout(300);
  await page.reload();
  await expect(page.getByTestId('viewer3d')).toHaveAttribute('data-drape-pieces', '2');
  await openMeasurements(page, isMobile);
  await page.getByTestId('m-waist').fill('88');
  await expect.poll(async () => frontWaist(await pattern(page)), { timeout: 3000 }).toBeCloseTo(880 / 4 + 20, 3);
  await expect(page.getByTestId('apply-banner')).toHaveCount(0);
});

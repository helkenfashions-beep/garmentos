/**
 * The parametric avatar: measurements must deform the body accurately and
 * locally, and the mesh must be a clean closed manifold (especially at the
 * crotch) so garments can wrap it.
 */
import { describe, it, expect } from 'vitest';
import { createAvatar, meshTopology, tapeGirth } from './avatar.js';
import { DEFAULT_MEASUREMENTS as M } from '../../hooks/useMeasurements.js';

export const SIZES = {
  'size 40 man': [M, 'male_adult'],
  'slim man': [{ ...M, waist: 760, hip: 920, seat: 940, chest: 920, upperThighGirth: 540, kneeGirth: 380, height: 1720 }, 'male_adult'],
  'large man': [{ ...M, waist: 1120, hip: 1180, seat: 1200, chest: 1200, upperThighGirth: 700, kneeGirth: 440, height: 1840, bodyRise: 310 }, 'male_adult'],
  'tall man, measured lengths': [{ ...M, height: 1900, waistToKnee: 620, waistToAnkle: 1080, hipToWaist: 210 }, 'male_adult'],
  'woman': [{ ...M, waist: 700, hip: 1000, seat: 1010, chest: 900, upperThighGirth: 600, height: 1650, bodyRise: 270, shoulderWidth: 400 }, 'female_adult'],
};

const SPACING = 12;

for (const [name, [m, bodyType]] of Object.entries(SIZES)) {
  describe(`avatar — ${name}`, () => {
    const av = createAvatar(m, bodyType, { spacing: SPACING });
    const { model, mesh } = av;
    const d = model.dims;

    it('tape-measured girths match the measurements (±1.5%)', () => {
      const seat = m.seat ?? m.hip + 20;
      const want = { chest: m.chest, waist: m.waist, hip: m.hip, seat, upperThigh: m.upperThighGirth };
      for (const [k, v] of Object.entries(want)) {
        expect([k, Math.abs(model.girths[k] / v - 1) < 0.015]).toEqual([k, true]);
      }
    });

    it('height is exact: soles on the floor, head at the measured height', () => {
      let ymin = Infinity, ymax = -Infinity;
      for (let i = 1; i < mesh.positions.length; i += 3) { ymin = Math.min(ymin, mesh.positions[i]); ymax = Math.max(ymax, mesh.positions[i]); }
      expect(Math.abs(ymin)).toBeLessThan(2);
      expect(Math.abs(ymax - m.height)).toBeLessThan(3);
    });

    it('crotch sits exactly one body rise below the waist', () => {
      expect(Math.abs(model.crotchPoint[1] - d.crotchH)).toBeLessThan(2);
      expect(Math.abs((d.waistH - model.crotchPoint[1]) - m.bodyRise)).toBeLessThan(2);
    });

    it('mesh is a closed manifold (no holes, no non-manifold or degenerate edges)', () => {
      const t = meshTopology(mesh.indices);
      expect(t).toMatchObject({ boundary: 0, nonManifold: 0, degenerate: 0 });
      expect(t.triangles).toBeGreaterThan(15000);
    });

    it('crotch is a clean rounded saddle: solid above, open gap between the thighs below — no pinch', () => {
      const [, cy, cz] = model.crotchPoint;
      // just above the crotch point the body is one solid across the centre
      for (let x = -40; x <= 40; x += 5) expect(model.sdf(x, cy + 12, cz)).toBeLessThan(0);
      // below it there is air between the thighs, widening downward (no zero-thickness sliver)
      let prev = 0;
      for (const dy of [15, 40, 80, 160]) {
        const gap = model.sdf(0, cy - dy, cz);
        expect(gap).toBeGreaterThan(0.5);
        expect(gap).toBeGreaterThanOrEqual(prev - 0.5);
        prev = gap;
      }
      // the saddle is round: the surface normal at the crotch point faces straight down
      const n = model.normal(0, cy - 1, cz);
      expect(n[1]).toBeLessThan(-0.9);
    });

    it('normals point outward and are unit length', () => {
      for (const y of [d.chestH, d.waistH, d.hipH]) {
        for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
          // find the skin along the ray, then check the normal
          let r = 0; while (model.sdf(dx * r, y, dz * r) < 0 && r < 600) r += 2;
          const n = model.normal(dx * r, y, dz * r);
          expect(Math.hypot(...n)).toBeCloseTo(1, 3);
          expect(n[0] * dx + n[2] * dz).toBeGreaterThan(0.5);
        }
      }
    });

    it('builds fast enough for live editing', () => {
      expect(av.ms).toBeLessThan(900);
    });
  });
}

describe('measurements deform the body locally (segmented morph)', () => {
  const base = createAvatar(M, 'male_adult', { spacing: SPACING }).model;
  const noArms = (mdl) => (x, y, z) => mdl.sdf(x, y, z);   // arms hang clear of the tape lines below

  it('a bigger hip changes the hip, not the chest, waist, height or legs', () => {
    const big = createAvatar({ ...M, hip: M.hip + 120, seat: M.seat + 120 }, 'male_adult', { spacing: SPACING }).model;
    expect(big.girths.hip).toBeCloseTo(M.hip + 120, -1);
    expect(Math.abs(big.girths.chest / base.girths.chest - 1)).toBeLessThan(0.005);
    expect(Math.abs(big.girths.waist / base.girths.waist - 1)).toBeLessThan(0.01);
    expect(big.dims.H).toBe(base.dims.H);
    expect(big.dims.kneeH).toBe(base.dims.kneeH);
    // knee girth untouched
    const kneeG = (mdl) => tapeGirth(noArms(mdl), mdl.dims.kneeH, 0 + mdl.dims.legSpacing + (mdl.dims.crotchH - mdl.dims.kneeH) * Math.tan(mdl.dims.legSplay), 4, { minX: 0 });
    expect(Math.abs(kneeG(big) / kneeG(base) - 1)).toBeLessThan(0.01);
  });

  it('a bigger upper thigh changes the thigh, not the waist or chest', () => {
    const big = createAvatar({ ...M, upperThighGirth: M.upperThighGirth + 80 }, 'male_adult', { spacing: SPACING }).model;
    expect(big.girths.upperThigh).toBeCloseTo(M.upperThighGirth + 80, -1);
    expect(Math.abs(big.girths.chest / base.girths.chest - 1)).toBeLessThan(0.005);
    expect(Math.abs(big.girths.waist / base.girths.waist - 1)).toBeLessThan(0.005);
  });

  it('a longer body rise lowers the crotch but keeps the waist and the girths', () => {
    const deep = createAvatar({ ...M, bodyRise: M.bodyRise + 30 }, 'male_adult', { spacing: SPACING }).model;
    expect(deep.crotchPoint[1]).toBeCloseTo(base.crotchPoint[1] - 30, 0);
    expect(deep.dims.waistH).toBe(base.dims.waistH);
    for (const k of ['chest', 'waist', 'hip']) expect(Math.abs(deep.girths[k] / base.girths[k] - 1)).toBeLessThan(0.01);
  });

  it('shoulder width sets the shoulder span', () => {
    const span = (mdl) => { let x = 0; while (mdl.sdf(x, mdl.dims.shoulderH - 25, -5) < 0 && x < 600) x += 1; return 2 * x; };
    const wide = createAvatar({ ...M, shoulderWidth: M.shoulderWidth + 60 }, 'male_adult', { spacing: SPACING }).model;
    expect(span(wide) - span(base)).toBeGreaterThan(40);
    expect(Math.abs(wide.girths.chest / base.girths.chest - 1)).toBeLessThan(0.01);
  });
});

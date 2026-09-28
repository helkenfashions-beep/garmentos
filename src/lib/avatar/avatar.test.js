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

    it('builds fast enough for live editing (in the background worker)', () => {
      // one mesh ≈ 0.2 s; an unlucky grid alignment at the diagonal forearms
      // costs a rebuild on a shifted grid (see avatar.js), so allow a few
      expect(av.ms).toBeLessThan(1600);
      expect(av.attempts).toBeLessThanOrEqual(8);
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

// ── tailoring measurements: inseam, neck, sleeve, bicep, back waist length ──

/** Girth of the arm, taped square to the arm at point p (convex hull of ray exits). */
function armGirth(model, p, dir) {
  const [dx, dy] = dir; const l = Math.hypot(dx, dy);
  const ax = [dx / l, dy / l, 0];
  const u = [-ax[1], ax[0], 0], v = [0, 0, 1];       // two directions square to the arm
  const pts = [];
  for (let i = 0; i < 90; i++) {
    const t = (i / 90) * 2 * Math.PI, c = Math.cos(t), s = Math.sin(t);
    const w = [u[0] * c + v[0] * s, u[1] * c + v[1] * s, u[2] * c + v[2] * s];
    let r = 0; while (r < 200 && model.sdf(p.x + w[0] * r, p.y + w[1] * r, p.z + w[2] * r) < 0) r += 0.25;
    pts.push([c, s, r]);
  }
  // near the armpit the arm meets the chest wall; like a tape slipped into the
  // armpit, take the arm's own radius there (the opposite side's)
  const rs = pts.map(q => q[2]), med = [...rs].sort((a, b) => a - b)[rs.length >> 1];
  for (let i = 0; i < pts.length; i++) if (rs[i] > med * 1.3) pts[i][2] = rs[(i + 45) % 90];
  for (const q of pts) { q[0] *= q[2]; q[1] *= q[2]; }
  let per = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; per += Math.hypot(a[0] - b[0], a[1] - b[1]); }
  return per;
}

describe('tailoring measurements drive the body', () => {
  const base = createAvatar(M, 'male_adult', { spacing: SPACING }).model;

  it('inseam (crotch → floor) puts the crotch at that height and the waist one body rise above', () => {
    const md = createAvatar({ ...M, inseam: 800 }, 'male_adult', { spacing: SPACING }).model;
    expect(md.crotchPoint[1]).toBeCloseTo(800, 0);
    expect(md.dims.waistH).toBe(800 + M.bodyRise);
    expect(md.lengths.inseam).toBe(800);
    // unmeasured, the inseam follows from height and body rise
    expect(base.lengths.inseam).toBeCloseTo(base.dims.waistH - M.bodyRise, 6);
    // girths unaffected
    for (const k of ['chest', 'waist', 'hip']) expect(Math.abs(md.girths[k] / base.girths[k] - 1)).toBeLessThan(0.01);
  });

  it('neck circumference is matched (tape, ±2%) and only moves the neck', () => {
    expect(Math.abs(base.girths.neck / M.neckGirth - 1)).toBeLessThan(0.02);
    const thick = createAvatar({ ...M, neckGirth: 440 }, 'male_adult', { spacing: SPACING }).model;
    expect(Math.abs(thick.girths.neck / 440 - 1)).toBeLessThan(0.02);
    expect(Math.abs(thick.girths.chest / base.girths.chest - 1)).toBeLessThan(0.005);
  });

  it('sleeve length is laid along the arm: shoulder point → elbow → wrist', () => {
    const lm = base.landmarks, [sxp, syp] = lm.shoulderPoint;
    const [, , elbow, , wrist] = lm.arm;
    const dir = lm.armDir, l = Math.hypot(...dir), ux = dir[0] / l, uy = dir[1] / l;
    // distance along the arm from where the shoulder point projects onto it
    const alongArm = (p) => (p.x - sxp) * ux + (p.y - syp) * uy;
    const S = base.dims.sleeve;                      // automatic: 36.5% of height
    expect(S).toBeCloseTo(M.height * 0.365, 6);
    expect(alongArm(wrist)).toBeCloseTo(S, 0);
    expect(alongArm(elbow) / S).toBeCloseTo(0.56, 2);
    // measured, it is laid out exactly
    const m650 = createAvatar({ ...M, sleeveLength: 650 }, 'male_adult', { spacing: SPACING }).model;
    const u = m650.landmarks, l2 = Math.hypot(...u.armDir);
    expect((u.arm[4].x - u.shoulderPoint[0]) * u.armDir[0] / l2 + (u.arm[4].y - u.shoulderPoint[1]) * u.armDir[1] / l2).toBeCloseTo(650, 0);
    // a longer sleeve moves the wrist down the arm, nothing else
    const long = createAvatar({ ...M, sleeveLength: S + 60 }, 'male_adult', { spacing: SPACING }).model;
    expect(base.landmarks.arm[4].y - long.landmarks.arm[4].y).toBeGreaterThan(50);
    expect(Math.abs(long.girths.chest / base.girths.chest - 1)).toBeLessThan(0.005);
  });

  it('bicep girth is the girth of the upper arm, taped square to the arm (±3%)', () => {
    for (const g of [300, 330, 400]) {
      const md = g === 330 ? base : createAvatar({ ...M, bicepGirth: g }, 'male_adult', { spacing: SPACING }).model;
      const got = armGirth(md, md.landmarks.arm[1], md.landmarks.armDir);
      expect([g, Math.abs(got / g - 1) < 0.03]).toEqual([g, true]);
    }
  });

  it('old saved files: upperArmGirth is read as the bicep girth', async () => {
    const { normalizeMeasurements } = await import('../../hooks/useMeasurements.js');
    expect(normalizeMeasurements({ upperArmGirth: 360 })).toEqual({ bicepGirth: 360 });
    expect(normalizeMeasurements({ upperArmGirth: 360, bicepGirth: 310 })).toEqual({ bicepGirth: 310 });
    const md = createAvatar({ ...M, bicepGirth: undefined, upperArmGirth: 380 }, 'male_adult', { spacing: SPACING }).model;
    expect(Math.abs(armGirth(md, md.landmarks.arm[1], md.landmarks.armDir) / 380 - 1)).toBeLessThan(0.03);
  });

  it('back waist length (nape → waist) sets the length of the torso', () => {
    // automatic: nape at 86.3% of height, waist at 61.5%
    expect(base.dims.napeH - base.dims.waistH).toBeCloseTo(M.height * (0.863 - 0.615), 6);
    // measured: the nape stays, the waist moves (a longer back = a lower waist)
    const bwl = base.dims.napeH - base.dims.waistH;
    const long = createAvatar({ ...M, backWaistLength: bwl + 30 }, 'male_adult', { spacing: SPACING }).model;
    expect(long.dims.napeH).toBeCloseTo(base.dims.napeH, 6);
    expect(long.dims.waistH - base.dims.waistH).toBeCloseTo(-30, 6);
    // the body follows: waist girth taped at the new waist, crotch one rise below it
    expect(Math.abs(long.girths.waist / M.waist - 1)).toBeLessThan(0.015);
    expect(long.crotchPoint[1]).toBeCloseTo(long.dims.waistH - M.bodyRise, 0);
    // …and the trouser lengths follow from the new waist
    expect(long.lengths.waistToAnkle - base.lengths.waistToAnkle).toBeCloseTo(-30, 6);
    // with the inseam measured as well, the waist is fixed and the nape moves instead
    const both = createAvatar({ ...M, inseam: 800, backWaistLength: 460 }, 'male_adult', { spacing: SPACING }).model;
    expect(both.dims.waistH).toBe(800 + M.bodyRise);
    expect(both.dims.napeH - both.dims.waistH).toBe(460);
  });

  it('old saved files: the untouched old defaults (back 44 cm, sleeve 65 cm) go back to automatic', async () => {
    const { normalizeMeasurements } = await import('../../hooks/useMeasurements.js');
    expect(normalizeMeasurements({ backWaistLength: 440, sleeveLength: 650, chest: 1000 })).toEqual({ chest: 1000 });
    expect(normalizeMeasurements({ backWaistLength: 452, sleeveLength: 640 })).toEqual({ backWaistLength: 452, sleeveLength: 640 });
  });
});

// ── anatomy: spine curve, front/back asymmetry, shoulder slope, armpit ──────

/** Front and back of the body on the centre line at height y. */
function sagittal(model, y) {
  let front = null, back = null;
  for (let z = 320; z > -320; z -= 0.5) if (model.sdf(0, y, z) < 0) { front = z; break; }
  for (let z = -320; z < 320; z += 0.5) if (model.sdf(0, y, z) < 0) { back = z; break; }
  return { front, back };
}

describe('anatomy', () => {
  for (const bt of ['male_adult', 'female_adult']) {
    const md = createAvatar(M, bt, { spacing: SPACING }).model, d = md.dims;
    const underarmY = d.chestH + (d.shoulderH - d.chestH) * 0.55;

    it(`${bt}: the back follows an S-curve — lumbar hollow at the waist, rounded upper back, seat behind`, () => {
      const seat = sagittal(md, d.seatH).back, waist = sagittal(md, d.waistH).back, upper = sagittal(md, underarmY).back;
      expect(waist - seat).toBeGreaterThan(25);     // lordosis: the waist sits well forward of the seat
      expect(waist - upper).toBeGreaterThan(15);    // kyphosis: the shoulder blades sit behind the waist
    });

    it(`${bt}: cross-sections are not symmetric front to back`, () => {
      const at = (y) => { const s = sagittal(md, y), spine = md.torsoSection(y).spineZ; return { f: s.front - spine, b: spine - s.back }; };
      const seat = at(d.seatH);
      expect(seat.b).toBeGreaterThan(seat.f * 1.15);   // buttocks: more depth behind
      const chest = at(d.chestH);
      expect(chest.f).toBeGreaterThan(chest.b);        // ribcage / bust: more depth in front
    });

    it(`${bt}: shoulders slope down from the neck (15°–30°) into a rounded deltoid`, () => {
      const topAt = (x) => { let y = d.H; while (md.sdf(x, y, -8) > 0 && y > 0) y -= 0.5; return y; };
      const x0 = d.neckR * 2.1, x1 = md.landmarks.shoulderPoint[0] - 25;
      const deg = Math.atan2(topAt(x0) - topAt(x1), x1 - x0) * 180 / Math.PI;
      expect(deg).toBeGreaterThan(15);
      expect(deg).toBeLessThan(30);
      // the deltoid rounds past the shoulder point
      let xOut = 0; while (md.sdf(xOut, d.shoulderH - 60, -4) < 0 && xOut < 500) xOut += 0.5;
      expect(xOut).toBeGreaterThan(md.landmarks.shoulderPoint[0]);
    });

    it(`${bt}: the armpit is a smooth fold, and below it the arm hangs free of the torso`, () => {
      // below the armpit there is air between arm and torso
      const y = underarmY - 140;
      const arm = md.landmarks.arm, t = (arm[0].y - y) / (arm[0].y - arm[2].y);
      const armX = arm[0].x + (arm[2].x - arm[0].x) * t;
      let torsoX = 0; while (md.sdf(torsoX, y, 0, { arms: false }) < 0 && torsoX < 400) torsoX += 0.5;
      // …and the field between them is open (no web of skin)
      const midX = (torsoX + armX - arm[1].r) / 2;
      expect(md.sdf(midX, y, 0)).toBeGreaterThan(0);
      // at the armpit the blend fills the corner (no sharp crease): trace the
      // vault of the armpit from the gap below — the surface normal turns
      // gradually from the chest wall, over the top, down the arm
      const ns = [];
      for (let x = torsoX + 2; x < armX - arm[1].r - 2; x += 3) {
        let yy = y; while (md.sdf(x, yy, 0) > 0 && yy < y + 300) yy += 0.5;
        ns.push(md.normal(x, yy - 0.5, 0));
      }
      expect(ns.length).toBeGreaterThan(3);
      for (let i = 1; i < ns.length; i++) {
        const dot = ns[i][0] * ns[i - 1][0] + ns[i][1] * ns[i - 1][1] + ns[i][2] * ns[i - 1][2];
        expect(dot).toBeGreaterThan(0.5);             // never turns more than 60° in 3 mm
      }
    });
  }
});

// ── manifold integrity across the new measurements ──────────────────────────

describe('mesh stays a closed manifold whatever the tailoring measurements', () => {
  const bodies = {
    'short, broad': { ...M, height: 1550, chest: 1150, waist: 1010, hip: 1150, seat: 1170, shoulderWidth: 470 },
    'tall, slim, long inseam': { ...M, height: 1950, chest: 880, waist: 740, hip: 880, seat: 900, upperThighGirth: 500, kneeGirth: 360, inseam: 920 },
    'long sleeves, thick biceps': { ...M, sleeveLength: 720, bicepGirth: 420 },
    'short sleeves, thin arms': { ...M, sleeveLength: 560, bicepGirth: 250, wristGirth: 150 },
    'thick neck, long back': { ...M, neckGirth: 460, backWaistLength: 480 },
    'short back': { ...M, backWaistLength: 390 },
    'everything measured': { ...M, inseam: 820, backWaistLength: 450, sleeveLength: 640, bicepGirth: 350, neckGirth: 400 },
  };
  for (const [name, m] of Object.entries(bodies)) {
    it(name, () => {
      const av = createAvatar(m, 'male_adult', { spacing: SPACING });
      expect(meshTopology(av.mesh.indices)).toMatchObject({ boundary: 0, nonManifold: 0, degenerate: 0 });
      // and the tape measurements still hold
      for (const k of ['chest', 'waist', 'hip']) expect([k, Math.abs(av.model.girths[k] / m[k] - 1) < 0.015]).toEqual([k, true]);
      expect(Math.abs(av.model.girths.neck / m.neckGirth - 1)).toBeLessThan(0.02);
    });
  }
});

// ── seat and hip: gluteal volume ────────────────────────────────────────────

describe('seat and hips have real rear volume', () => {
  const bodies = {
    male_adult: [M, { minOut: 55 }],
    female_adult: [{ ...M, waist: 700, hip: 1000, seat: 1010, chest: 900, upperThighGirth: 600, height: 1650, bodyRise: 270, shoulderWidth: 400 }, { minOut: 65 }],
  };
  for (const [bt, [m, want]] of Object.entries(bodies)) {
    const md = createAvatar(m, bt, { spacing: SPACING }).model, d = md.dims;
    const backAt = (x, y) => { for (let z = -320; z < 320; z += 0.5) if (md.sdf(x, y, z, { arms: false }) < 0) return z; return null; };
    const rearAt = (y) => Math.min(backAt(0, y), backAt(40, y), backAt(60, y), backAt(80, y));   // furthest back across the seat

    it(`${bt}: the buttocks stand well out behind the small of the back`, () => {
      const waistBack = backAt(0, d.waistH);
      let fullest = Infinity; for (let y = d.hipH + 20; y > d.crotchH; y -= 5) fullest = Math.min(fullest, rearAt(y));
      expect(waistBack - fullest).toBeGreaterThan(want.minOut);
    });

    it(`${bt}: seen from behind, two rounded masses with a shallow cleft between`, () => {
      const y = (d.hipH + d.seatH) / 2;
      const centre = backAt(0, y), lobe = Math.min(backAt(40, y), backAt(60, y));
      expect(centre - lobe).toBeGreaterThan(2);    // lobes further back than the centre line…
      expect(centre - lobe).toBeLessThan(25);      // …but only a shallow cleft
    });

    it(`${bt}: the lower back is an S — hollow at the waist, rounding smoothly into the seat, no shelf`, () => {
      const ys = []; for (let y = d.waistH; y > d.crotchH + 10; y -= 10) ys.push(y);
      const r = ys.map(rearAt);
      const iMax = r.indexOf(Math.min(...r));
      // from the waist down to the fullest point the rear only moves out, never steeper than 60°
      for (let i = 1; i <= iMax; i++) {
        expect(r[i]).toBeLessThanOrEqual(r[i - 1] + 0.5);
        expect(r[i - 1] - r[i]).toBeLessThan(10 * Math.tan(60 * Math.PI / 180));
      }
      // concave above (the hollow), convex into the seat: the rear goes out
      // faster in the lower half of that run than in the upper half
      const half = Math.floor(iMax / 2);
      expect((r[half] - r[iMax])).toBeGreaterThan(r[0] - r[half]);
      // the fullest point is in the seat region, not up at the hip line
      expect(ys[iMax]).toBeLessThan(d.hipH + 15);
    });

    // cloth rests on this surface: any crease tighter than the fabric mesh
    // (15 mm) catches it and bunches it up
    const skinBack = (x, y) => {
      let z = -400; while (z < 300 && md.sdf(x, y, z, { arms: false }) >= 0) z += 2;
      let lo = z - 2, hi = z; for (let k = 0; k < 22; k++) { const mid = (lo + hi) / 2; if (md.sdf(x, y, mid, { arms: false }) < 0) hi = mid; else lo = mid; }
      return hi;
    };
    const tightestBend = (pts) => {   // smallest radius along a polyline of [u, z]
      let r = Infinity;
      for (let i = 1; i < pts.length - 1; i++) {
        const [a, b, c] = [pts[i - 1], pts[i], pts[i + 1]];
        const t1 = Math.atan2(b[1] - a[1], b[0] - a[0]), t2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
        const ds = (Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(c[0] - b[0], c[1] - b[1])) / 2;
        r = Math.min(r, ds / Math.abs(t2 - t1));
      }
      return r;
    };

    it(`${bt}: lower back and seat have no pinch or crease — up and down, and across the cleft`, () => {
      for (const x of [0, 20, 45, 70, 100]) {
        const pts = []; for (let y = d.waistH + 30; y > d.crotchH + 30; y -= 3) pts.push([-y, skinBack(x, y)]);
        expect(tightestBend(pts)).toBeGreaterThan(12);
      }
      for (const y of [d.hipH + 30, d.hipH, (d.hipH + d.seatH) / 2, d.seatH, d.crotchH + 40]) {
        const pts = []; for (let x = -60; x <= 60; x += 2) pts.push([x, skinBack(x, y)]);
        expect(tightestBend(pts)).toBeGreaterThan(8);
      }
    });

    it(`${bt}: surface normals over the seat turn smoothly (no kink for the cloth to catch on)`, () => {
      let worst = 0;
      for (let y = d.waistH + 30; y > d.crotchH + 20; y -= 6) for (let x = 0; x <= 120; x += 12) {
        const n1 = md.normal(x, y, skinBack(x, y)), n2 = md.normal(x, y - 3, skinBack(x, y - 3));
        worst = Math.max(worst, Math.acos(Math.min(1, n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2])) * 180 / Math.PI);
      }
      expect(worst).toBeLessThan(15);
    });

    it(`${bt}: hip width and depth are in human proportion (not a wide, flat slab)`, () => {
      let w = 0; for (let x = 300; x > 0; x -= 0.5) { let hit = false; for (let z = -250; z < 250; z += 2) if (md.sdf(x, d.hipH, z, { arms: false }) < 0) { hit = true; break; } if (hit) { w = 2 * x; break; } }
      let front = -Infinity; for (let x = -w / 2; x <= w / 2; x += 5) for (let z = 300; z > -300; z -= 1) if (md.sdf(x, d.hipH, z, { arms: false }) < 0) { front = Math.max(front, z); break; }
      const depth = front - rearAt(d.hipH);
      expect(w / depth).toBeGreaterThan(1.15);
      expect(w / depth).toBeLessThan(1.55);
    });
  }
});

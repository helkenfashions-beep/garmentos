/**
 * The drape must hold for every body, not just the default — measurements are
 * edited live. For a spread of sizes: no tears, seams closed, forks meet,
 * nothing inside the body, and fast enough for live editing.
 */
import { describe, it, expect } from 'vitest';
import { generateTrouserBlock } from '../blocks/trouserBlock.js';
import { DEFAULT_MEASUREMENTS as M } from '../../hooks/useMeasurements.js';
import { createAvatarModel, bodyForDrape } from '../avatar/avatar.js';
import { drapePattern } from './drape.js';

const SIZES = {
  'size 40 default': [M, 'trouser', 'male_adult'],
  'slim 32 waist, jeans': [{ ...M, waist: 760, hip: 920, seat: 940, upperThighGirth: 540, kneeGirth: 380, height: 1720 }, 'jeans', 'male_adult'],
  'large 44 waist, slacks': [{ ...M, waist: 1120, hip: 1180, seat: 1200, upperThighGirth: 700, kneeGirth: 440, height: 1840, bodyRise: 310 }, 'slack', 'male_adult'],
  'tall, measured lengths': [{ ...M, height: 1900, waistToKnee: 620, waistToAnkle: 1080, hipToWaist: 210 }, 'trouser', 'male_adult'],
  'female body': [{ ...M, waist: 700, hip: 1000, seat: 1010, chest: 900, upperThighGirth: 600, height: 1650, bodyRise: 270 }, 'trouser', 'female_adult'],
};

const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

for (const [name, [m, fit, bodyType]] of Object.entries(SIZES)) {
  describe(`drape holds — ${name}`, () => {
    const pattern = generateTrouserBlock(m, fit);
    const model = createAvatarModel(m, bodyType);
    const dims = bodyForDrape(model);
    const inst = drapePattern(pattern, dims);
    // live-edit speed: time a re-drape (the first call also pays for JIT
    // warm-up and the body's centre-line profile, built once per body)
    const t0 = performance.now();
    drapePattern(pattern, dims);
    const ms = performance.now() - t0;

    it('four panels, finite, fast', () => {
      expect(inst).toHaveLength(4);
      for (const i of inst) for (const v of i.positions) expect(Number.isFinite(v)).toBe(true);
      expect(ms).toBeLessThan(120);
    });

    it('no tears (stretch ≤ 2.5× on the body, ≤ 4.5× in the crotch band)', () => {
      for (const i of inst) {
        const P = i.positions, Q = i.patternXY, I = i.indices, riseY = pattern.pieces[i.key].riseY;
        let body = 0, crotch = 0;
        for (let k = 0; k < I.length; k += 3) for (const [a, c] of [[I[k], I[k + 1]], [I[k + 1], I[k + 2]], [I[k + 2], I[k]]]) {
          const dd = Math.hypot(P[a * 3] - P[c * 3], P[a * 3 + 1] - P[c * 3 + 1], P[a * 3 + 2] - P[c * 3 + 2]);
          if (dd <= 8) continue;
          const r = dd / Math.max(Math.hypot(Q[a * 2] - Q[c * 2], Q[a * 2 + 1] - Q[c * 2 + 1]), 1);
          if (Math.abs(Q[a * 2 + 1] - riseY) < 70 && Math.abs(Q[c * 2 + 1] - riseY) < 70) crotch = Math.max(crotch, r); else body = Math.max(body, r);
        }
        expect([i.key, i.sx, body < 2.5, crotch < 4.5]).toEqual([i.key, i.sx, true, true]);
      }
    });

    it('forks meet at the crotch point', () => {
      const P = pattern.points;
      const fk = P[pattern.pieces['trouser-front'].landmarks.fork], bk = P[pattern.pieces['trouser-back'].landmarks.fork];
      const f = inst.find(i => i.key === 'trouser-front' && i.sx === 1), b = inst.find(i => i.key === 'trouser-back' && i.sx === 1);
      expect(d3(f.map(fk.x - 0.01, fk.y - 0.05), b.map(bk.x + 0.01, bk.y - 0.05))).toBeLessThan(4);
    });

    it('fabric stays outside the body (checked against the avatar skin)', () => {
      for (const i of inst) {
        let worst = Infinity;
        for (let v = 0; v < i.positions.length; v += 3) worst = Math.min(worst, model.sdf(i.positions[v], i.positions[v + 1], i.positions[v + 2]));
        expect([i.key, i.sx, worst > 0.5]).toEqual([i.key, i.sx, true]);
      }
    });
  });
}

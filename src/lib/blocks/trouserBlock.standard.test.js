/**
 * LOCK for the approved classic trouser block (27 Sep 2026).
 *
 * Every drafting rule of the standard is asserted here, and the full geometry
 * is pinned by a snapshot. If one of these fails, the block's shape changed:
 * get the new shape approved by the pattern maker before updating anything.
 */
import { describe, it, expect } from 'vitest';
import { generateTrouserBlock, EASE_PRESETS } from './trouserBlock.js';
import { DEFAULT_MEASUREMENTS } from '../../hooks/useMeasurements.js';
import { legLengths } from '../body/dims.js';

const M = DEFAULT_MEASUREMENTS;
const SIZES = {
  'size 40 default': M,
  'slim 32 waist':   { ...M, waist: 760, hip: 920, seat: 940, upperThighGirth: 540, kneeGirth: 380, height: 1720 },
  'large 44 waist':  { ...M, waist: 1120, hip: 1180, seat: 1200, upperThighGirth: 700, kneeGirth: 440, height: 1840, bodyRise: 310 },
  'tall, measured lengths': { ...M, height: 1900, waistToKnee: 620, waistToAnkle: 1080, hipToWaist: 210 },
};

const near = (a, b, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

for (const [sizeName, m] of Object.entries(SIZES)) {
  for (const fit of Object.keys(EASE_PRESETS)) {
    describe(`classic standard — ${sizeName}, ${fit}`, () => {
      const b = generateTrouserBlock(m, fit);
      const ease = EASE_PRESETS[fit];
      const F = b.pieces['trouser-front'], B = b.pieces['trouser-back'];
      const pF = (k) => b.points[F.landmarks[k]];
      const pB = (k) => b.points[B.landmarks[k]];
      const SEAT = m.seat ?? m.hip + 20;
      const fFork = Math.max(SEAT / 16, (m.upperThighGirth - SEAT * 0.5) / 4);
      const L = legLengths(m);

      it('crease is centred between side seam and fork at the crotch line', () => {
        near(F.creaseX, (pF('crotchSide').x + pF('fork').x) / 2);
        near(B.creaseX, (pB('crotchSide').x + pB('fork').x) / 2);
      });

      it('knee and hem split evenly either side of the crease', () => {
        for (const [P, meta] of [[pF, F], [pB, B]]) {
          near(meta.creaseX - Math.min(P('kneeOuter').x, P('kneeInner').x), Math.max(P('kneeOuter').x, P('kneeInner').x) - meta.creaseX);
          near(meta.creaseX - Math.min(P('hemOuter').x, P('hemInner').x), Math.max(P('hemOuter').x, P('hemInner').x) - meta.creaseX);
        }
      });

      it('Aldrich widths: waist, hip, knee, hem', () => {
        near(pF('waistCentre').x - pF('waistSide').x, m.waist / 4 + 20);           // front waist incl. dart
        near(pB('waistSide').x - pB('waistCentre').x, m.waist / 4 + 50);           // back waist incl. darts
        near(pF('hipCentre').x - pF('hipSide').x, m.hip / 4 + ease.waist);          // front hip
        near(pB('hipSide').x - pB('hipCentre').x, SEAT / 4 + 50);                  // back seat
        near(Math.abs(pF('kneeInner').x - pF('kneeOuter').x), 2 * (m.kneeGirth / 4 + 15));
        near(Math.abs(pB('kneeInner').x - pB('kneeOuter').x), 2 * (m.kneeGirth / 4 + 15) + 40);   // back 4 cm wider
        near(Math.abs(pF('hemInner').x - pF('hemOuter').x), 0.125 * m.waist + 130);
        near(Math.abs(pB('hemInner').x - pB('hemOuter').x), 0.125 * m.waist + 130 + 40);
      });

      it('forks: front from upper thigh / seat, back 1.6× and dropped 1 cm', () => {
        near(pF('fork').x - pF('hipCentre').x, fFork);
        near(pB('hipCentre').x - pB('fork').x, fFork * 1.6);
        near(pF('fork').y, F.riseY);
        near(pB('fork').y, B.riseY + 10);
      });

      it('back waist is pitched: CB raised 2.5 cm and leaning 3.5 cm toward the side', () => {
        near(pB('waistSide').y - pB('waistCentre').y, 25);
        near(pB('waistCentre').x - pB('hipCentre').x, 35);
      });

      it('vertical levels come from the shared leg lengths', () => {
        const hip = Math.min(L.hipDepth, m.bodyRise - 40);
        near(F.hipY - F.waistY, hip);
        near(F.riseY - F.waistY, m.bodyRise);
        near(F.kneeY - F.waistY, Math.max(L.waistToKnee, m.bodyRise + 100));
        near(pF('hemOuter').y - F.waistY, Math.max(L.waistToAnkle, F.kneeY - F.waistY + 150));
      });

      it('crotch curves are beziers ending at the fork (never arcs, never straight)', () => {
        for (const [meta, piece] of [[F, 'trouser-front'], [B, 'trouser-back']]) {
          const curve = Object.values(b.segments).find(s => s.piece === piece && s.p1 === meta.landmarks.hipCentre && s.p2 === meta.landmarks.fork);
          expect(curve?.type).toBe('bezier');
        }
      });

      it('darts: front 2 × 10 cm; back 2 × 12 cm and 1.6 × 10 cm', () => {
        const legs = (id) => Object.values(b.segments).filter(s => s.dart === id);
        const depth = (id) => { const [l] = legs(id); return b.points[l.p2].y - b.points[l.p1].y; };
        const width = (id) => { const [l1, l2] = legs(id); return Math.abs(b.points[l2.p1].x - b.points[l1.p1].x); };
        near(depth('fd1'), 100); near(width('fd1'), 20);
        near(depth('bd1'), 120); near(width('bd1'), 20);
        near(depth('bd2'), 100); near(width('bd2'), 16);
      });

      it('geometry is pinned (approved shape)', () => {
        const round = (v) => Math.round(v * 10) / 10;
        const shape = Object.fromEntries(Object.entries({ ...F.landmarks, ...Object.fromEntries(Object.entries(B.landmarks).map(([k, v]) => ['back.' + k, v])) })
          .map(([k, id]) => [k, [round(b.points[id].x), round(b.points[id].y)]]));
        expect(shape).toMatchSnapshot();
      });
    });
  }
}

it('upper thigh drives the fork when the thigh is full', () => {
  const lean = generateTrouserBlock({ ...M, upperThighGirth: 560 });
  const full = generateTrouserBlock({ ...M, upperThighGirth: 820 });
  const fork = (b) => b.points[b.pieces['trouser-front'].landmarks.fork].x - b.points[b.pieces['trouser-front'].landmarks.hipCentre].x;
  expect(fork(full)).toBeGreaterThan(fork(lean) + 10);
});

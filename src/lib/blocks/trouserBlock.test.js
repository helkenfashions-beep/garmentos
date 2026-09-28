import { describe, it, expect } from 'vitest';
import { generateTrouserBlock } from './trouserBlock.js';
import { DEFAULT_MEASUREMENTS } from '../../hooks/useMeasurements.js';
import { cubicBezierPoint } from '../../utils/geometry.js';

const M = DEFAULT_MEASUREMENTS;

function seamsOf(b, piece) {
  return Object.values(b.segments).filter(s => s.piece === piece && !s.dart);
}
const P = (b, id) => b.points[id];
const cross = (a, b) => a.x * b.y - a.y * b.x;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });

describe.each(['trouser', 'slack', 'jeans'])('trouser block French-curve seams (%s)', (fit) => {
  const b = generateTrouserBlock(M, fit);

  for (const piece of ['trouser-front', 'trouser-back']) {
    const meta = b.pieces[piece];
    const seams = seamsOf(b, piece);
    const side = meta.sideAt; // 'min' → outseam on the left

    it(`${piece}: flip point sits at hip + (hip→knee)/2 on the outseam`, () => {
      const expected = meta.hipY + (meta.kneeY - meta.hipY) / 2;
      expect(meta.flipY).toBeCloseTo(expected, 6);
      // exactly two beziers meet at a point on the flip line
      const atFlip = seams.filter(s => s.type === 'bezier' && (Math.abs(P(b, s.p1).y - meta.flipY) < 1e-6 || Math.abs(P(b, s.p2).y - meta.flipY) < 1e-6));
      expect(atFlip).toHaveLength(2);
    });

    it(`${piece}: the curve is smooth through the flip (shared tangent)`, () => {
      const [a, c] = seams.filter(s => s.type === 'bezier' && (Math.abs(P(b, s.p2).y - meta.flipY) < 1e-6 || Math.abs(P(b, s.p1).y - meta.flipY) < 1e-6))
        .sort((s1, s2) => P(b, s1.p1).y - P(b, s2.p1).y);
      const F = P(b, a.p2);
      expect(c.p1).toBe(a.p2);
      const t1 = sub(F, a.c2), t2 = sub(c.c1, F);
      expect(Math.abs(cross(t1, t2)) / (Math.hypot(t1.x, t1.y) * Math.hypot(t2.x, t2.y))).toBeLessThan(1e-9);
      expect(t1.x * t2.x + t1.y * t2.y).toBeGreaterThan(0);
    });

    it(`${piece}: outer curve above the flip, inner curve below (S-shape)`, () => {
      const [upper, lower] = seams.filter(s => s.type === 'bezier' && (Math.abs(P(b, s.p2).y - meta.flipY) < 1e-6 || Math.abs(P(b, s.p1).y - meta.flipY) < 1e-6))
        .sort((s1, s2) => P(b, s1.p1).y - P(b, s2.p1).y);
      const out = side === 'min' ? -1 : 1;   // outward direction in x
      const bulge = (s) => {
        const a = P(b, s.p1), c = P(b, s.p2);
        const m = cubicBezierPoint(a, s.c1, s.c2, c, 0.5);
        return (m.x - (a.x + c.x) / 2) * out;
      };
      expect(bulge(upper)).toBeGreaterThan(1);   // bows outward (hip)
      expect(bulge(lower)).toBeLessThan(-0.5);   // bows inward (above knee)
    });

    it(`${piece}: knee → hem is ruled straight on both seams`, () => {
      const below = seams.filter(s => {
        const y1 = P(b, s.p1).y, y2 = P(b, s.p2).y;
        return Math.min(y1, y2) >= meta.kneeY - 1e-6 && Math.max(y1, y2) > meta.kneeY + 1 && Math.abs(y1 - y2) > 1;
      });
      expect(below).toHaveLength(2);
      for (const s of below) expect(s.type).toBe('line');
    });

    it(`${piece}: inseam fork → knee is a French curve hollowed ~1 cm toward the crease`, () => {
      const ins = seams.find(s => s.type === 'bezier' && s.p1 === meta.landmarks.fork && s.p2 === meta.landmarks.kneeInner);
      expect(ins).toBeTruthy();
      const a = P(b, ins.p1), c = P(b, ins.p2);
      const m = cubicBezierPoint(a, ins.c1, ins.c2, c, 0.5);
      const chordMid = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 };
      expect(Math.hypot(m.x - chordMid.x, m.y - chordMid.y)).toBeCloseTo(10, 1);
      // this panel's grainline is the one nearest the inseam
      const creaseX = Object.values(b.segments).filter(s => s.grain).map(s => P(b, s.p1).x)
        .sort((x1, x2) => Math.abs(x1 - chordMid.x) - Math.abs(x2 - chordMid.x))[0];
      expect(Math.abs(m.x - creaseX)).toBeLessThan(Math.abs(chordMid.x - creaseX));
    });
  }

  it('each panel has a vertical grainline on its crease, not part of the fabric outline', () => {
    const grains = Object.values(b.segments).filter(s => s.grain);
    expect(grains).toHaveLength(2);
    for (const g of grains) {
      expect(P(b, g.p1).x).toBeCloseTo(P(b, g.p2).x, 6);
      expect(g.construction).toBe(true);
      expect(g.piece).toBeUndefined();
    }
  });

  it('outline is still one closed loop per panel', () => {
    for (const piece of ['trouser-front', 'trouser-back']) {
      const deg = new Map();
      for (const s of seamsOf(b, piece)) for (const id of [s.p1, s.p2]) deg.set(id, (deg.get(id) || 0) + 1);
      expect([...deg.values()].every(d => d === 2)).toBe(true);
    }
  });
});

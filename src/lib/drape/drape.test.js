import { describe, it, expect } from 'vitest';
import { generateTrouserBlock } from '../blocks/trouserBlock.js';
import { DEFAULT_MEASUREMENTS } from '../../hooks/useMeasurements.js';
import { deriveBodyDims, torsoProfile, legProfile, radiusAt } from '../body/dims.js';
import { extractPieces } from './pieces.js';
import { drapePattern, solvePatternPoint, closeDarts, dartIntervalsAt } from './drape.js';

const M = DEFAULT_MEASUREMENTS;
const dims = deriveBodyDims(M);

function block(fit = 'trouser') { return generateTrouserBlock(M, fit); }
const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('piece extraction', () => {
  it('finds a closed front and back trouser panel with their darts', () => {
    const pieces = extractPieces(block());
    const front = pieces.find(p => p.key === 'trouser-front');
    const back  = pieces.find(p => p.key === 'trouser-back');
    expect(front?.closed).toBe(true);
    expect(back?.closed).toBe(true);
    expect(front.darts).toHaveLength(1);
    expect(back.darts).toHaveLength(2);
    // construction guides are never fabric
    expect(pieces.every(p => !p.key.startsWith('free'))).toBe(true);
  });

  it('turns a hand-drawn closed rectangle into a free piece, ignores open lines', () => {
    const points = {
      a: { id: 'a', x: 0, y: 0 }, b: { id: 'b', x: 200, y: 0 },
      c: { id: 'c', x: 200, y: 300 }, d: { id: 'd', x: 0, y: 300 },
      e: { id: 'e', x: 500, y: 0 }, f: { id: 'f', x: 600, y: 50 },
    };
    const segments = {
      s1: { id: 's1', type: 'line', p1: 'a', p2: 'b' },
      s2: { id: 's2', type: 'line', p1: 'b', p2: 'c' },
      s3: { id: 's3', type: 'line', p1: 'c', p2: 'd' },
      s4: { id: 's4', type: 'line', p1: 'd', p2: 'a' },
      s5: { id: 's5', type: 'line', p1: 'e', p2: 'f' },
    };
    const pieces = extractPieces({ points, segments });
    expect(pieces).toHaveLength(1);
    expect(pieces[0].meta.kind).toBe('free');
    const inst = drapePattern({ points, segments }, dims);
    expect(inst).toHaveLength(1);
    expect(inst[0].handles.map(h => h.pointId).sort()).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('trouser drape', () => {
  const pattern = block();
  const inst = drapePattern(pattern, dims);
  const get = (key, sx) => inst.find(i => i.key === key && i.sx === sx);

  it('produces front + back for both legs with finite geometry', () => {
    expect(inst).toHaveLength(4);
    for (const i of inst) {
      expect(i.indices.length).toBeGreaterThan(300);
      for (const v of i.positions) expect(Number.isFinite(v)).toBe(true);
      for (const v of i.seams) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('left leg is the mirror of the right leg', () => {
    const r = get('trouser-front', 1), l = get('trouser-front', -1);
    expect(r.positions.length).toBe(l.positions.length);
    for (let k = 0; k < r.positions.length; k += 3) {
      expect(l.positions[k]).toBeCloseTo(-r.positions[k], 6);
      expect(l.positions[k + 1]).toBeCloseTo(r.positions[k + 1], 6);
      expect(l.positions[k + 2]).toBeCloseTo(r.positions[k + 2], 6);
    }
  });

  it('side seams and inseams meet at the hem and knee', () => {
    const f = get('trouser-front', 1), b = get('trouser-back', 1);
    // only fabric outline points — construction guide endpoints also sit on these levels
    const pts = extractPieces(pattern).flatMap(p => p.outline.filter(q => q.pointId));
    const meta = pattern.pieces['trouser-front'];
    // hem y is the largest y among outline points; knee = meta.kneeY
    for (const yLevel of [meta.kneeY, Math.max(...pts.map(p => p.y))]) {
      const onLevel = pts.filter(p => Math.abs(p.y - yLevel) < 0.01);
      // front panel points are left of the back panel's leftmost point
      const xs = onLevel.map(p => p.x).sort((a, c) => a - c);
      const [fOuter, fInner, bInner, bOuter] = xs;
      const yy = yLevel - 0.05;
      expect(d3(f.map(fOuter + 0.01, yy), b.map(bOuter - 0.01, yy))).toBeLessThan(3);
      expect(d3(f.map(fInner - 0.01, yy), b.map(bInner + 0.01, yy))).toBeLessThan(3);
    }
  });

  it('fabric never cuts into the body (torso band and leg band)', () => {
    const torso = torsoProfile(dims), leg = legProfile(dims);
    const meta = pattern.pieces['trouser-front'];
    const hipH = dims.waistH - (meta.hipY - meta.waistY);
    const legTopH = dims.waistH - (meta.riseY - meta.waistY) - 75;
    for (const i of inst) {
      for (let k = 0; k < i.positions.length; k += 3) {
        const x = i.positions[k], y = i.positions[k + 1], z = i.positions[k + 2];
        if (y > dims.crotchH && y < dims.waistH - 5) {
          expect(Math.hypot(x, z)).toBeGreaterThan(radiusAt(torso, y) - 0.5);
        }
        if (y < legTopH && y > dims.ankleH + 50) {
          // no fabric inside either leg — including the inner faces at the midline
          for (const cx of [dims.legSpacing, -dims.legSpacing]) {
            expect(Math.hypot(x - cx, z)).toBeGreaterThan(radiusAt(leg, y) - 0.5);
          }
        }
      }
    }
  });

  it('closes the crotch: front and back fork points meet on the body', () => {
    const pieces = extractPieces(pattern);
    for (const sx of [1, -1]) {
      const f = get('trouser-front', sx), b = get('trouser-back', sx);
      const meta = pattern.pieces['trouser-front'];
      const y = meta.riseY - 0.05;
      const fo = pieces.find(p => p.key === 'trouser-front').outline;
      const bo = pieces.find(p => p.key === 'trouser-back').outline;
      const fFork = fo.filter(p => Math.abs(p.y - meta.riseY) < 0.01).sort((p, q) => q.x - p.x)[0];
      const bFork = bo.filter(p => Math.abs(p.y - meta.riseY) < 0.01).sort((p, q) => p.x - q.x)[0];
      expect(d3(f.map(fFork.x - 0.01, y), b.map(bFork.x + 0.01, y))).toBeLessThan(4);
    }
  });

  it('left and right crotch seams meet at the centre line', () => {
    const pieces = extractPieces(pattern);
    const meta = pattern.pieces['trouser-front'];
    const fo = pieces.find(p => p.key === 'trouser-front').outline;
    // a point on the fly curve halfway between hip line and rise
    const y = (meta.hipY + meta.riseY) / 2;
    let xmax = -Infinity;
    for (let k = 0; k < fo.length; k++) {
      const a = fo[k], c = fo[(k + 1) % fo.length];
      if ((a.y <= y && c.y > y) || (c.y <= y && a.y > y)) xmax = Math.max(xmax, a.x + (y - a.y) * (c.x - a.x) / (c.y - a.y));
    }
    const r = get('trouser-front', 1).map(xmax - 0.01, y);
    const l = get('trouser-front', -1).map(xmax - 0.01, y);
    expect(d3(r, l)).toBeLessThan(8);
  });

  it('closes darts: draped waist ≈ pattern waist minus dart intake', () => {
    const pieces = extractPieces(pattern);
    const front = pieces.find(p => p.key === 'trouser-front');
    const f = get('trouser-front', 1);
    const meta = front.meta;
    const y = meta.waistY + 30; // below the waist line, inside the dart
    const ivs = dartIntervalsAt(front.darts, y);
    expect(ivs).toHaveLength(1);
    // walk across the row in 3D
    let xmin = Infinity, xmax = -Infinity;
    for (let k = 0; k < front.outline.length; k++) {
      const a = front.outline[k], b = front.outline[(k + 1) % front.outline.length];
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
        const x = a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y);
        xmin = Math.min(xmin, x); xmax = Math.max(xmax, x);
      }
    }
    let arc = 0, prev = null;
    for (let s = 0; s <= 200; s++) {
      const p = f.map(xmin + (xmax - xmin) * s / 200, y);
      if (prev) arc += d3(prev, p);
      prev = p;
    }
    const effective = (xmax - xmin) - (ivs[0].b - ivs[0].a);
    expect(arc / effective).toBeGreaterThan(0.9);
    expect(arc / effective).toBeLessThan(1.15);
    // closing is monotone and collapses the wedge to a point
    expect(closeDarts(ivs[0].a, ivs)).toBeCloseTo(closeDarts(ivs[0].b, ivs), 6);
  });

  it('keeps vertical lengths: draped side seam ≈ pattern side seam', () => {
    const f = get('trouser-front', 1);
    const meta = pattern.pieces['trouser-front'];
    const pieces = extractPieces(pattern);
    const outline = pieces.find(p => p.key === 'trouser-front').outline;
    // from knee to hem along the side seam: u = 0 edge
    const kneeOuter = outline.filter(p => Math.abs(p.y - meta.kneeY) < 0.01).sort((a, b) => a.x - b.x)[0];
    const hemY = Math.max(...outline.map(p => p.y));
    const hemOuter = outline.filter(p => Math.abs(p.y - hemY) < 0.01).sort((a, b) => a.x - b.x)[0];
    const flat = Math.hypot(hemOuter.x - kneeOuter.x, hemOuter.y - kneeOuter.y);
    let arc = 0, prev = null;
    for (let s = 0; s <= 100; s++) {
      const t = s / 100;
      const p = f.map(kneeOuter.x + (hemOuter.x - kneeOuter.x) * t + 0.01, kneeOuter.y + (hemOuter.y - kneeOuter.y) * t - 0.05);
      if (prev) arc += d3(prev, p);
      prev = p;
    }
    expect(Math.abs(arc - flat) / flat).toBeLessThan(0.1);
  });

  it('drapes fast enough for live sync (< 60 ms)', () => {
    const t0 = performance.now();
    for (let k = 0; k < 5; k++) drapePattern(block(), dims);
    const each = (performance.now() - t0) / 5;
    expect(each).toBeLessThan(60);
  });
});

describe('3D → 2D inverse (two-way sync)', () => {
  const pattern = block();
  const inst = drapePattern(pattern, dims);

  it.each([
    ['trouser-front', 1], ['trouser-back', 1], ['trouser-front', -1], ['trouser-back', -1],
  ])('recovers a pattern move from its 3D position (%s, sx=%i)', (key, sx) => {
    const i = inst.find(q => q.key === key && q.sx === sx);
    // a point on the knee line, well inside the panel
    const h = i.handles.find(q => Math.abs(q.y - pattern.pieces[key].kneeY) < 0.01);
    const moved = { x: h.x + 12, y: h.y + 20 };
    const target = i.map(moved.x, moved.y);
    const got = solvePatternPoint(i.map, { x: h.x, y: h.y }, target);
    expect(Math.hypot(got.x - moved.x, got.y - moved.y)).toBeLessThan(1);
  });

  it('projects an off-surface drag onto the nearest pattern move', () => {
    const i = inst.find(q => q.key === 'trouser-front' && q.sx === 1);
    const h = i.handles[0];
    const p = i.map(h.x, h.y);
    // drag straight "up" in 3D by 25 mm → pattern y should decrease ~25 mm
    const got = solvePatternPoint(i.map, h, [p[0], p[1] + 25, p[2]]);
    expect(got.y).toBeLessThan(h.y - 15);
    expect(Math.abs(got.x - h.x)).toBeLessThan(15);
  });
});

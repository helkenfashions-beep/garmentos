import { describe, it, expect } from 'vitest';
import { generateTrouserBlock } from '../blocks/trouserBlock.js';
import { DEFAULT_MEASUREMENTS } from '../../hooks/useMeasurements.js';
import { createAvatarModel, bodyForDrape } from '../avatar/avatar.js';
import { extractPieces } from './pieces.js';
import { drapePattern, solvePatternPoint, closeDarts, dartIntervalsAt } from './drape.js';

const M = DEFAULT_MEASUREMENTS;
const model = createAvatarModel(M);
const dims = bodyForDrape(model);

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

  it('fabric never cuts into the body (checked against the avatar skin itself)', () => {
    for (const i of inst) {
      let worst = Infinity;
      for (let k = 0; k < i.positions.length; k += 3) {
        worst = Math.min(worst, model.sdf(i.positions[k], i.positions[k + 1], i.positions[k + 2]));
      }
      expect([i.key, i.sx, worst > 0.5]).toEqual([i.key, i.sx, true]);
    }
  });

  it('side seam stays closed from waist to hem (no splits)', () => {
    const pieces = extractPieces(pattern);
    const fo = pieces.find(p => p.key === 'trouser-front').outline;
    const bo = pieces.find(p => p.key === 'trouser-back').outline;
    const meta = pattern.pieces['trouser-front'];
    const hemY = Math.max(...fo.map(p => p.y));
    // outer edge of each panel at a given height (front: leftmost, back: rightmost)
    const edge = (poly, y, pick) => {
      const xs = [];
      for (let k = 0; k < poly.length; k++) {
        const a = poly[k], c = poly[(k + 1) % poly.length];
        if ((a.y <= y && c.y > y) || (c.y <= y && a.y > y)) xs.push(a.x + (y - a.y) * (c.x - a.x) / (c.y - a.y));
      }
      return pick(...xs);
    };
    let worst = 0;
    for (const sx of [1, -1]) {
      const f = get('trouser-front', sx), b = get('trouser-back', sx);
      for (let y = meta.waistY + 5; y < hemY - 1; y += 10) {
        const d = d3(f.map(edge(fo, y, Math.min), y), b.map(edge(bo, y, Math.max), y));
        worst = Math.max(worst, d);
      }
    }
    expect(worst).toBeLessThan(6);
  });

  it('fabric is continuous: no tears or flaps (nothing stretched far beyond the pattern)', () => {
    // A tear or flap shows up as a short distance on the paper becoming a long
    // distance on the body. Compare every mesh edge in 3D with the same edge on
    // the flat pattern. (Shrinking is fine: closed darts collapse to nothing.)
    //
    // Known limitation, crotch band only (±7 cm of the crotch line): the
    // mannequin torso is a round lathe, deeper front-to-back than a real seat,
    // so the crotch curve has to stretch up to ~4× to pass under it. This goes
    // when the MakeHuman/Anny body replaces the lathe. Real tears measured
    // 7–30× and are still caught everywhere.
    const worst = {};
    for (const i of inst) {
      const P = i.positions, Q = i.patternXY, I = i.indices;
      const riseY = pattern.pieces[i.key].riseY;
      let body = 0, crotch = 0;
      for (let k = 0; k < I.length; k += 3) {
        for (const [a, c] of [[I[k], I[k + 1]], [I[k + 1], I[k + 2]], [I[k + 2], I[k]]]) {
          const d3d = Math.hypot(P[a * 3] - P[c * 3], P[a * 3 + 1] - P[c * 3 + 1], P[a * 3 + 2] - P[c * 3 + 2]);
          if (d3d <= 8) continue;
          const d2d = Math.hypot(Q[a * 2] - Q[c * 2], Q[a * 2 + 1] - Q[c * 2 + 1]);
          const ratio = d3d / Math.max(d2d, 1);
          const inCrotchBand = Math.abs(Q[a * 2 + 1] - riseY) < 70 && Math.abs(Q[c * 2 + 1] - riseY) < 70;
          if (inCrotchBand) crotch = Math.max(crotch, ratio); else body = Math.max(body, ratio);
        }
      }
      worst[`${i.key}:${i.sx}`] = { body: +body.toFixed(2), crotch: +crotch.toFixed(2) };
    }
    for (const [k, v] of Object.entries(worst)) {
      expect([k, 'body', v.body < 2.5]).toEqual([k, 'body', true]);
      expect([k, 'crotch', v.crotch < 4.5]).toEqual([k, 'crotch', true]);
    }
  });

  it('closes the crotch: front and back fork points meet on the body', () => {
    const pieces = extractPieces(pattern);
    void pieces;
    const P = pattern.points;
    const fFork = P[pattern.pieces['trouser-front'].landmarks.fork];
    const bFork = P[pattern.pieces['trouser-back'].landmarks.fork];
    // the classic back fork is drafted 1 cm below the crotch line…
    expect(bFork.y - fFork.y).toBeCloseTo(10, 6);
    for (const sx of [1, -1]) {
      const f = get('trouser-front', sx), b = get('trouser-back', sx);
      // …and eased in on the body so the two forks still meet
      expect(d3(f.map(fFork.x - 0.01, fFork.y - 0.05), b.map(bFork.x + 0.01, bFork.y - 0.05))).toBeLessThan(4);
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

  it('drapes fast enough for live sync (< 80 ms; the whole 2D → 3D sync budget is 200 ms)', () => {
    const b = block();
    drapePattern(b, dims); drapePattern(b, dims);          // warm up (JIT, body centre line)
    const t0 = performance.now();
    for (let k = 0; k < 5; k++) drapePattern(b, dims);
    const each = (performance.now() - t0) / 5;
    expect(each).toBeLessThan(80);
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
    // mostly vertical: the body widens toward the chest, so a little sideways
    // movement is the correct nearest point on the fabric
    expect(Math.abs(got.x - h.x)).toBeLessThan(h.y - got.y);
  });
});

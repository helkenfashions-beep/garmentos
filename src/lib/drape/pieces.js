/**
 * Pattern → pieces.
 *
 * A "piece" is a closed outline of fabric on the 2D canvas. Pieces come from
 * two places:
 *   1. Block generators tag segments with `seg.piece = <pieceKey>` and put
 *      piece metadata (waist line, which edge is the side seam…) in
 *      `pattern.pieces[pieceKey]`. Dart legs carry `seg.dart = <dartId>`.
 *   2. Hand-drawn shapes: any untagged connected set of segments that forms a
 *      closed loop becomes a generic piece.
 *
 * Construction lines are never fabric.
 */

import { cubicBezierPoint } from '../../utils/geometry.js';

const BEZIER_SAMPLES = 16;
const LINE_STEP_MM   = 25;

/** Sample one segment from `fromId` to the other end; excludes the start point. */
function sampleSegment(seg, points, fromId) {
  const forward = seg.p1 === fromId;
  const a = points[forward ? seg.p1 : seg.p2];
  const b = points[forward ? seg.p2 : seg.p1];
  const endId = forward ? seg.p2 : seg.p1;
  const out = [];
  if (seg.type === 'bezier' && seg.c1 && seg.c2) {
    const c1 = forward ? seg.c1 : seg.c2;
    const c2 = forward ? seg.c2 : seg.c1;
    for (let i = 1; i <= BEZIER_SAMPLES; i++) {
      const p = cubicBezierPoint(a, c1, c2, b, i / BEZIER_SAMPLES);
      out.push({ x: p.x, y: p.y, pointId: i === BEZIER_SAMPLES ? endId : null });
    }
  } else {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(len / LINE_STEP_MM));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, pointId: i === n ? endId : null });
    }
  }
  return { samples: out, endId };
}

/**
 * Order a set of segments into a walk. Returns { loop: [{x,y,pointId}], closed }.
 * Tolerates open chains (the polygon is then closed implicitly).
 */
export function walkOutline(segs, points) {
  const valid = segs.filter(s => points[s.p1] && points[s.p2]);
  if (!valid.length) return { loop: [], closed: false };

  const adj = new Map();
  for (const s of valid) {
    for (const pid of [s.p1, s.p2]) {
      if (!adj.has(pid)) adj.set(pid, []);
      adj.get(pid).push(s);
    }
  }
  // Start from a degree-1 endpoint if the chain is open, otherwise anywhere.
  let start = valid[0].p1;
  for (const [pid, list] of adj) { if (list.length === 1) { start = pid; break; } }

  const used = new Set();
  const loop = [{ x: points[start].x, y: points[start].y, pointId: start }];
  let cur = start;
  let closed = false;
  for (let guard = 0; guard < valid.length + 1; guard++) {
    const next = (adj.get(cur) || []).find(s => !used.has(s.id));
    if (!next) break;
    used.add(next.id);
    const { samples, endId } = sampleSegment(next, points, cur);
    cur = endId;
    if (cur === start) {
      samples.pop();          // don't duplicate the start point
      loop.push(...samples);
      closed = true;
      break;
    }
    loop.push(...samples);
  }
  return { loop, closed };
}

/** Group untagged, non-construction segments into connected components. */
function components(segs) {
  const parent = new Map();
  const find = (a) => { while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a); } return a; };
  const union = (a, b) => { parent.set(find(a), find(b)); };
  for (const s of segs) {
    if (!parent.has(s.p1)) parent.set(s.p1, s.p1);
    if (!parent.has(s.p2)) parent.set(s.p2, s.p2);
    union(s.p1, s.p2);
  }
  const groups = new Map();
  for (const s of segs) {
    const r = find(s.p1);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(s);
  }
  return [...groups.values()];
}

function isClosedComponent(segs) {
  if (segs.length < 2) return false;
  const deg = new Map();
  for (const s of segs) {
    deg.set(s.p1, (deg.get(s.p1) || 0) + 1);
    deg.set(s.p2, (deg.get(s.p2) || 0) + 1);
  }
  for (const d of deg.values()) if (d !== 2) return false;
  return true;
}

/**
 * Extract drapable pieces from pattern state.
 * @returns {Array<{key, meta, outline, darts, closed}>}
 *   outline: [{x,y,pointId}] polygon (implicitly closed)
 *   darts:   [{id, legs: [[{x,y,pointId},{x,y,pointId}], ...]}]
 */
export function extractPieces(pattern) {
  const { points = {}, segments = {}, pieces: meta = {} } = pattern || {};
  const all = Object.values(segments).filter(s => !s.construction && points[s.p1] && points[s.p2]);

  const tagged = new Map();
  const untagged = [];
  for (const s of all) {
    if (s.piece && meta[s.piece]) {
      if (!tagged.has(s.piece)) tagged.set(s.piece, { outline: [], darts: new Map() });
      const g = tagged.get(s.piece);
      if (s.dart) {
        if (!g.darts.has(s.dart)) g.darts.set(s.dart, []);
        g.darts.get(s.dart).push(s);
      } else {
        g.outline.push(s);
      }
    } else {
      untagged.push(s);
    }
  }

  const result = [];
  for (const [key, g] of tagged) {
    const { loop, closed } = walkOutline(g.outline, points);
    if (loop.length < 3) continue;
    const darts = [];
    for (const [id, legs] of g.darts) {
      if (legs.length !== 2) continue;
      darts.push({
        id,
        legs: legs.map(l => [
          { x: points[l.p1].x, y: points[l.p1].y, pointId: l.p1 },
          { x: points[l.p2].x, y: points[l.p2].y, pointId: l.p2 },
        ]),
      });
    }
    result.push({ key, meta: meta[key], outline: loop, darts, closed });
  }

  let n = 0;
  for (const comp of components(untagged)) {
    if (!isClosedComponent(comp)) continue;
    const { loop, closed } = walkOutline(comp, points);
    if (loop.length < 3) continue;
    result.push({ key: `free-${++n}`, meta: { kind: 'free', name: `Piece ${n}` }, outline: loop, darts: [], closed });
  }
  return result;
}

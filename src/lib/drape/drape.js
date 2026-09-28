/**
 * Geometric drape engine.
 *
 * Wraps flat pattern pieces onto the parametric body without running a cloth
 * solver. This is what keeps the 2D ⇄ 3D split view instant: every canvas edit
 * re-drapes in a few milliseconds.
 *
 * How a trouser panel is placed:
 *   – Each pattern row (a horizontal line at pattern-y) maps to one body height:
 *       bodyY = waistHeight − (y − waistY)          (1 mm on paper = 1 mm on body)
 *   – Across the row, the panel is parameterised by u ∈ [0,1] from the side
 *     seam (u=0) to the centre edge (u=1: CF/CB above the crotch, inseam below).
 *   – Above the hip line the panel wraps half the torso: front panel from CF to
 *     side seam, back panel from side seam to CB.
 *   – Below the crotch the front + back panels together wrap one leg tube.
 *   – Between hip line and crotch the two placements blend — that blend is
 *     where the crotch curve lives.
 *   – Darts are closed: their wedge is removed from the row width before
 *     wrapping, exactly as if the dart were sewn.
 *   – Front and back share each seam: the circumference at every height is
 *     front width + back width, so side seams and inseams meet.
 *
 * Pure data in / pure data out (no Three.js) so it is unit-testable.
 */

import { extractPieces } from './pieces.js';
import { torsoProfile, legProfile, radiusAt, legCenterX, TORSO_X, TORSO_Z } from '../body/dims.js';

// `dims` passed to drapePattern must carry the avatar's collision field:
//   dims.sdf(x, y, z), dims.normal(x, y, z), dims.crotchPoint
// (see bodyForDrape() in lib/avatar/avatar.js).

const ROW_TABLE_STEP = 4;   // mm — resolution of the width lookup
const MESH_ROW_STEP  = 8;   // mm — vertical density of the fabric mesh
const COLLIDE_GAP    = 3;   // mm — fabric rests this far off the skin
const SEAM_OFFSET    = 5;   // mm — seam lines sit proud of the (camera-biased) fabric
const PI = Math.PI;

/** Perimeter of an ellipse with semi-axes a, b (Ramanujan). */
function ellipsePerimeter(a, b) {
  return PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
}
// A trouser leg hangs from the seat: at the crotch its cross-section is deeper
// front-to-back than side-to-side, rounding to a circle by the knee.
const LEG_DEPTH_RATIO = 1.6;
// Hip wrap is a slightly squared oval (superellipse): trouser fronts and backs
// are flatter than a pure ellipse, so the hip meets the leg without a pinch.
const HIP_SQUARENESS = 2.6;

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function smoothstep(a, b, x) {
  const t = clamp((x - a) / ((b - a) || 1), 0, 1);
  return t * t * (3 - 2 * t);
}

// ─── Row extents ──────────────────────────────────────────────────────────────

/** Horizontal extent [xmin, xmax] of a polygon at height y, or null. */
export function rowExtent(poly, y) {
  let xmin = Infinity, xmax = -Infinity;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
      const x = a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y);
      if (x < xmin) xmin = x;
      if (x > xmax) xmax = x;
    }
  }
  return xmin <= xmax ? { xmin, xmax } : null;
}

function buildRowTable(poly) {
  let ymin = Infinity, ymax = -Infinity;
  for (const p of poly) { if (p.y < ymin) ymin = p.y; if (p.y > ymax) ymax = p.y; }
  const rows = [];
  for (let y = ymin + 0.01; y < ymax; y += ROW_TABLE_STEP) {
    const e = rowExtent(poly, y);
    if (e) rows.push({ y, ...e });
  }
  const eLast = rowExtent(poly, ymax - 0.01);
  if (eLast) rows.push({ y: ymax - 0.01, ...eLast });
  return { ymin, ymax, rows };
}

function extentAt(table, y) {
  const { rows } = table;
  if (!rows.length) return { xmin: 0, xmax: 1 };
  if (y <= rows[0].y) return rows[0];
  if (y >= rows[rows.length - 1].y) return rows[rows.length - 1];
  // rows are evenly spaced except the last one
  let i = Math.min(rows.length - 2, Math.floor((y - rows[0].y) / ROW_TABLE_STEP));
  while (i > 0 && rows[i].y > y) i--;
  while (i < rows.length - 2 && rows[i + 1].y < y) i++;
  const a = rows[i], b = rows[i + 1];
  const t = (y - a.y) / ((b.y - a.y) || 1);
  return { xmin: a.xmin + (b.xmin - a.xmin) * t, xmax: a.xmax + (b.xmax - a.xmax) * t };
}

/**
 * Rows at the very ends of a panel (e.g. the raised CB corner) are narrow
 * slivers — measuring u across them would smear the panel. Clamp the lookup
 * to the band where the panel is at least half its widest.
 */
function validBand(table) {
  let maxW = 0;
  for (const r of table.rows) maxW = Math.max(maxW, r.xmax - r.xmin);
  const good = table.rows.filter(r => r.xmax - r.xmin >= maxW * 0.5);
  if (!good.length) return { top: table.ymin, bottom: table.ymax, maxW };
  return { top: good[0].y, bottom: good[good.length - 1].y, maxW };
}

// ─── Darts ────────────────────────────────────────────────────────────────────

function legXAt(leg, y) {
  const [a, b] = leg;
  const lo = Math.min(a.y, b.y), hi = Math.max(a.y, b.y);
  if (y < lo || y > hi || hi - lo < 1e-6) return null;
  return a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y);
}

/** Open dart intervals at height y, sorted left → right. */
export function dartIntervalsAt(darts, y) {
  const out = [];
  for (const d of darts) {
    const x0 = legXAt(d.legs[0], y), x1 = legXAt(d.legs[1], y);
    if (x0 == null || x1 == null) continue;
    const a = Math.min(x0, x1), b = Math.max(x0, x1);
    if (b - a > 1e-6) out.push({ a, b });
  }
  return out.sort((p, q) => p.a - q.a);
}

/** Remove dart wedges from x — the geometric equivalent of sewing the dart. */
export function closeDarts(x, intervals) {
  let acc = 0;
  for (const { a, b } of intervals) {
    if (x >= b) acc += b - a;
    else if (x > a) acc += x - a;
  }
  return x - acc;
}

// ─── Piece profiles ───────────────────────────────────────────────────────────

function makeProfile(piece) {
  const table = buildRowTable(piece.outline);
  const band  = validBand(table);
  const clampY = (y) => clamp(y, band.top, band.bottom);
  const effWidth = (y) => {
    const e = extentAt(table, clampY(y));
    const intake = dartIntervalsAt(piece.darts, y).reduce((s, iv) => s + iv.b - iv.a, 0);
    return Math.max(1, e.xmax - e.xmin - intake);
  };
  return { table, band, clampY, effWidth };
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

/**
 * The body's centre-line profile (the x = 0 slice): up the front from the
 * crotch to above the waist, and up the back, each as a polyline with running
 * arc length, offset out by the collision gap. The crotch seam of a trouser
 * lies along this line, so the centre edge of each panel is laid onto it by
 * arc length — the fly and seat curves wrap under the body the way a sewn
 * crotch seam does, instead of being squeezed into a few rows.
 */
const midlineCache = new WeakMap();
export function midlinePath(dims) {
  let path = midlineCache.get(dims);
  if (path) return path;
  const sdf = dims.sdf;
  const off = COLLIDE_GAP + 1;
  const cp = dims.crotchPoint ?? [0, dims.crotchH, 0];
  const Y0 = cp[1] + 70;                       // centre of the arc under the crotch
  const cz0 = dims.torsoSection ? dims.torsoSection(Y0).cz : cp[2];
  const top = dims.waistH + 80;
  // The centre-line profile as a seam sees it. At the back a seam lies
  // across the buttocks and bridges the cleft between them — there, take the
  // body's outline over a band ±BRIDGE mm wide. (The front has no cleft.)
  const BRIDGE = 50;
  let bridging = false;
  const sd0 = (y, z) => {
    let v = sdf(0, y, z);
    if (bridging) for (let x = 25; x <= BRIDGE; x += 25) { const w = sdf(x, y, z); if (w < v) v = w; }
    return v;
  };
  // distance from (0, y0, z0) along (dy, dz) to the skin, plus the gap
  const exit = (y0, z0, dy, dz) => {
    let r = 0, v = sd0(y0, z0);
    for (let k = 0; k < 200 && v < 0; k++) { r += Math.max(1, -v * 0.9); v = sd0(y0 + dy * r, z0 + dz * r); }
    let lo = Math.max(0, r - 20), hi = r;
    for (let k = 0; k < 16; k++) { const mid = (lo + hi) / 2; if (sd0(y0 + dy * mid, z0 + dz * mid) < 0) lo = mid; else hi = mid; }
    return hi;
  };
  // skin point → pushed out along the (bridged) surface normal
  const lift = (y, z) => {
    const e = 0.75;
    const ny = sd0(y + e, z) - sd0(y - e, z), nz = sd0(y, z + e) - sd0(y, z - e);
    const l = Math.hypot(ny, nz) || 1;
    return [y + (ny / l) * off, z + (nz / l) * off];
  };
  const side = (sgn) => {
    bridging = sgn < 0;
    const pts = [];
    for (let y = top; y > Y0; y -= 5) {
      const cz = dims.torsoSection ? dims.torsoSection(y).cz : 0;
      pts.push(lift(y, cz + sgn * exit(y, cz, 0, sgn)));
    }
    // round the underside: rays from (Y0, cz0), from horizontal to straight down
    // (no bridging here: under the seat the band would catch the thighs)
    bridging = false;
    for (let a = 1; a <= 45; a++) {
      const th = (a / 45) * (PI / 2);
      const dy = -Math.sin(th), dz = sgn * Math.cos(th);
      const r = exit(Y0, cz0, dy, dz);
      pts.push(lift(Y0 + dy * r, cz0 + dz * r));
    }
    // running arc length, measured from the waist
    const s = [0];
    for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    let iw = 0; while (iw < pts.length - 1 && pts[iw + 1][0] >= dims.waistH) iw++;
    const sw = s[iw] + (s[iw + 1] - s[iw]) * ((pts[iw][0] - dims.waistH) / ((pts[iw][0] - pts[iw + 1][0]) || 1));
    for (let i = 0; i < s.length; i++) s[i] -= sw;
    return { pts, s, length: s[s.length - 1] };
  };
  path = { front: side(1), back: side(-1) };
  midlineCache.set(dims, path);
  return path;
}

/** Point [y, z] at arc length `at` along a midline side (clamped to its ends). */
function alongMidline(side, at) {
  const { pts, s } = side;
  if (at <= s[0]) return pts[0];
  if (at >= s[s.length - 1]) return pts[pts.length - 1];
  let lo = 0, hi = s.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (s[mid] > at) hi = mid; else lo = mid; }
  const t = (at - s[lo]) / ((s[hi] - s[lo]) || 1);
  return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * t, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * t];
}

function trouserMapper(piece, profile, partnerProfile, dims) {
  const meta = piece.meta;
  const isFront = meta.panel === 'front';
  const torso = torsoProfile(dims);
  const leg   = legProfile(dims);
  const hipDepth  = meta.hipY  - meta.waistY;
  const riseDepth = meta.riseY - meta.waistY;
  const kneeDepth = (meta.kneeY ?? meta.riseY + 300) - meta.waistY;

  // A classic back fork is drafted below the crotch line (1 cm). When sewn, the
  // tailor eases that drop in along the back inseam so both forks meet at the
  // crotch. Do the same: take the drop up near the inseam, fading out by the
  // knee and toward the side seam (which is untouched).
  const forkPt = meta.landmarks?.fork
    ? piece.outline.find(p => p.pointId === meta.landmarks.fork) : null;
  const forkDrop = forkPt ? forkPt.y - meta.riseY : 0;
  // Fabric wrapping the torso can never be wider than the panel at the hip
  // line: below it, the extra width is the crotch fork, which goes UNDER the
  // body into the leg, not around the hips.
  const wHipSelf  = profile.effWidth(meta.hipY);
  const wHipOther = partnerProfile ? partnerProfile.effWidth(meta.hipY) : wHipSelf;
  // front and back of the garment at the hip line: the centre seams lie on
  // the body there (see the crotch seam below), so the body's front / back
  // plus a little ease
  let hipFrontZ = Infinity, hipBackZ = -Infinity;
  if (dims.torsoSection) {
    const sec = dims.torsoSection(dims.waistH - hipDepth);
    hipFrontZ = sec.cz + sec.b + 12;
    hipBackZ = sec.cz - sec.b - 12;
  }

  // Centre edge (CF / CB + crotch curve) arc length from the waist row down
  // to the fork, on the flat pattern
  const edgeX = (e) => (meta.sideAt === 'max' ? e.xmin : e.xmax);
  const forkY = forkPt ? forkPt.y : meta.riseY;
  const edgeYs = [], edgeS = [];
  {
    const rows = profile.table.rows.filter(r => r.y <= forkY);
    let acc = 0;
    for (let i = 0; i < rows.length; i++) {
      if (i) acc += Math.hypot(edgeX(rows[i]) - edgeX(rows[i - 1]), rows[i].y - rows[i - 1].y);
      edgeYs.push(rows[i].y); edgeS.push(acc);
    }
    if (forkPt && edgeYs.length) {
      const last = profile.table.rows.filter(r => r.y <= forkY).pop();
      acc += Math.hypot(forkPt.x - edgeX(last), forkPt.y - last.y);
      edgeYs.push(forkPt.y); edgeS.push(acc);
    }
  }
  // nearest point on the centre edge → its arc length and distance
  const edgeXs = edgeYs.map((ey, i) => (i === edgeYs.length - 1 && forkPt) ? forkPt.x
    : edgeX(profile.table.rows.filter(r => r.y <= forkY)[i]));
  // (the edge runs down the page: edgeYs increase, so search outward from the
  // segment at this height and stop once the rows are farther than the best)
  const nearestEdge = (x, y, maxD = Infinity) => {
    const n = edgeYs.length;
    let best = maxD, bs = 0;
    const seg = (i) => {
      const ax = edgeXs[i], ay = edgeYs[i], bx = edgeXs[i + 1], by = edgeYs[i + 1];
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
      const t = clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1);
      const d = Math.hypot(x - ax - dx * t, y - ay - dy * t);
      if (d < best) { best = d; bs = edgeS[i] + (edgeS[i + 1] - edgeS[i]) * t; }
    };
    if (n < 2) return { d: best, s: bs };
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (edgeYs[mid] > y) hi = mid; else lo = mid; }
    for (let i = lo; i < n - 1; i++) { if (edgeYs[i] - y > best) break; seg(i); }
    for (let i = lo - 1; i >= 0; i--) { if (y - edgeYs[i + 1] > best) break; seg(i); }
    return { d: best, s: bs };
  };
  const edgeSAt = (y) => {
    if (!edgeYs.length) return 0;
    if (y <= edgeYs[0]) return edgeS[0] - (edgeYs[0] - y);
    if (y >= edgeYs[edgeYs.length - 1]) return edgeS[edgeS.length - 1];
    let i = 0; while (i < edgeYs.length - 2 && edgeYs[i + 1] < y) i++;
    const t = (y - edgeYs[i]) / ((edgeYs[i + 1] - edgeYs[i]) || 1);
    return edgeS[i] + (edgeS[i + 1] - edgeS[i]) * t;
  };
  const edgeWaist = edgeSAt(meta.waistY);
  const edgeLen = edgeSAt(forkY) - edgeWaist;          // waist → fork along the seam
  const mid = dims.sdf ? midlinePath(dims)[isFront ? 'front' : 'back'] : null;
  // body seam from the waist to the crotch bottom; the fabric seam is laid on
  // it end to end (a few % ease either way is absorbed here)
  const seamScale = mid && edgeLen > 1 ? mid.length / edgeLen : 1;

  const easeIn = (h, u) => {
    if (Math.abs(forkDrop) < 0.01) return 0;
    const up   = smoothstep(hipDepth, riseDepth, h);
    const down = 1 - smoothstep(riseDepth + forkDrop, kneeDepth, h);
    return forkDrop * Math.min(up, down) * smoothstep(0.4, 1, u);
  };

  /** u across the row: 0 at the side seam, 1 at the centre / inseam edge. */
  function rowU(x, y) {
    const e = extentAt(profile.table, profile.clampY(y));
    const ivs = dartIntervalsAt(piece.darts, y);
    const intake = ivs.reduce((s, iv) => s + iv.b - iv.a, 0);
    const w = Math.max(1, e.xmax - e.xmin - intake);
    const xe = closeDarts(x, ivs);
    const u = meta.sideAt === 'max'
      ? ((e.xmax - intake) - xe) / w
      : (xe - e.xmin) / w;
    return { u, w };
  }

  return function map(x, y) {
    const { u, w } = rowU(x, y);
    return place(u, y, w, x);
  };

  /** Body-space position of the pattern point at (u across the row, y down the panel). */
  function place(u, y, w, x) {
    const hRaw = y - meta.waistY;
    const h = hRaw - easeIn(hRaw, u);
    const Y = Math.max(2, dims.waistH - h);

    const wOther = partnerProfile ? partnerProfile.effWidth(y) : w;
    const wf = isFront ? w : wOther;
    const wb = isFront ? wOther : w;

    // Torso placement: half-ellipse from CF (φ=0) round the side to CB (φ=π),
    // using widths capped at the hip line (fork fabric bunches at CF/CB)
    const wSelfT  = Math.min(w, wHipSelf);
    const wOtherT = Math.min(wOther, wHipOther);
    const wfT = isFront ? wSelfT : wOtherT;
    const wbT = isFront ? wOtherT : wSelfT;
    const uT = Math.min(1, (u * w) / wSelfT);
    const WtT = wfT + wbT;
    // garment oval follows the avatar's own cross-section at this height
    // (same aspect, same centre), scaled up to the fabric's girth but never
    // smaller than the skin plus a few mm
    let Rx, Rz, cz = 0;
    if (dims.torsoSection) {
      // (below the seat the body's own sections shrink to the crotch; the
      // garment doesn't — it keeps the seat's shape and hands over to the legs)
      const cpY0 = (dims.crotchPoint ?? [0, dims.crotchH])[1];
      const sec = dims.torsoSection(Math.max(Y, cpY0 + 55));
      const s = Math.max((2 * WtT) / ellipsePerimeter(sec.a, sec.b), (sec.a + 6) / sec.a, (sec.b + 6) / sec.b);
      Rx = sec.a * s; Rz = sec.b * s; cz = sec.cz;
    } else {
      const Rt = WtT / PI, bodyT = radiusAt(torso, Y);
      Rx = Math.max(Rt * TORSO_X, bodyT * TORSO_X + 5);
      Rz = Math.max(Rt * TORSO_Z, bodyT * TORSO_Z + 5);
    }
    const beta = PI * wfT / WtT;
    const phi = isFront ? (1 - uT) * beta : beta + uT * (PI - beta);
    const sph = Math.sin(phi), cph = Math.cos(phi);
    const se = 2 / HIP_SQUARENESS;
    const tx = Rx * Math.sign(sph) * Math.pow(Math.abs(sph), se);
    const tz = cz + Rz * Math.sign(cph) * Math.pow(Math.abs(cph), se);

    // Leg placement: full tube round one leg; front and back (forks included)
    // share the circumference
    const Wt = wf + wb;
    const lsec = dims.legSection ? dims.legSection(Y) : null;
    const bodyL = lsec ? lsec.r : Y > dims.crotchH ? dims.thighR : radiusAt(leg, Y);
    const Rl = Math.max(Wt / (2 * PI), bodyL + 5);
    const alphaF = 2 * PI * wf / Wt;
    const psi = isFront ? alphaF / 2 - u * alphaF : alphaF / 2 + u * (2 * PI - alphaF);
    // oval leg (same circumference as the circle) near the crotch → round at the knee
    const k = 1 + (LEG_DEPTH_RATIO - 1) * (1 - smoothstep(riseDepth, kneeDepth, h));
    const norm = 2 * PI / ellipsePerimeter(1 / k, k);
    let ax = Rl * norm / k;
    const az = Rl * norm * k;
    // near the crotch the inner half of the leg reaches the centre line, so
    // left and right crotch seams meet; fades out down the leg
    const legC = lsec ? lsec.x : legCenterX(dims, Y);
    const legZ = lsec ? lsec.z : 0;
    // A trouser leg falls straight from the hip: it is never deeper, front or
    // back, than the garment is at the hip line. Depth the tube can't take
    // goes into its width instead (keeping the circumference).
    const azF = Math.max(20, Math.min(az, hipFrontZ - legZ));
    const azB = Math.max(20, Math.min(az, legZ - hipBackZ));
    ax += ((az - azF) + (az - azB)) * 0.5;
    const sp = Math.sin(psi), cp = Math.cos(psi);
    const reach = 1 - smoothstep(riseDepth, riseDepth + 150, h);
    const axIn = ax + Math.max(0, legC - 1 - ax) * reach;
    const lx = Math.max(1, legC + (sp < 0 ? axIn : ax) * sp);
    const lz = legZ + (cp > 0 ? azF : azB) * cp;

    // Wide, soft hand-over from torso wrap to leg tubes (starts above the hip
    // line so the silhouette has no shelf at the hip)
    // Along the crotch edge (u → 1) the hand-over completes exactly at the
    // rise line, so front and back fork points meet there like a sewn inseam.
    const uc = clamp(u, 0, 1);
    const t = smoothstep(hipDepth * 0.55, riseDepth + 70 * (1 - uc * uc), h);
    let px = tx + (lx - tx) * t, pz = tz + (lz - tz) * t;
    // CROTCH POINT: where the four crotch seams meet, under the body centre.
    // The crotch edge of every panel is drawn onto it, so front and back forks
    // (and left and right legs) always close there.
    // The centre edge is the crotch seam: lay it along the body's centre line
    // by arc length (down the front / back, curving under to the crotch).
    // Rows are drawn onto it across their inner part, fading out down the
    // inseam below the fork.
    let Yp = Y, seamW = 0;
    if (mid) {
      const ramp = smoothstep(0.3, 0.6, u)
        * smoothstep(hipDepth * 0.2, hipDepth * 0.7, hRaw)
        * (1 - smoothstep(riseDepth, riseDepth + 30, h));
      // each point follows the nearest part of the seam (near the fork the
      // seam runs across the rows, not down them)
      const ne = ramp > 0 ? nearestEdge(x, y, 0.45 * w) : null;
      const wc = ne && ne.d < 0.45 * w ? ramp * (1 - smoothstep(0, 0.45 * w, ne.d)) : 0;
      if (wc > 0) {
        const [my, mz] = alongMidline(mid, (ne.s - edgeWaist) * seamScale);
        // beside the seam, as sewn: fabric d from the seam on paper lies d to
        // the side of it on the body (the collision then lays it on the skin).
        // Pulling it all to x = 0 stacked the rows near the seam into a few
        // mm, and the drape folded over itself down the back crotch seam.
        px += (ne.d - px) * wc;
        pz += (mz - pz) * wc;
        Yp += (my - Y) * wc;
        seamW = wc;
      }
    }
    // centre this row's fabric is wrapped around: the torso section's centre,
    // moving onto the leg's centre as the panel hands over to the leg tube
    const tc = dims.torsoSection ? dims.torsoSection(Yp).cz : 0;
    // (above the crotch the centre stays on the midline: fabric over the seat
    // and the fly moves straight back / forward, never sideways)
    const cpY = (dims.crotchPoint ?? [0, dims.crotchH])[1];
    const ox = legC * t * (1 - smoothstep(cpY - 10, cpY + 40, Yp)), oz = tc + (legZ - tc) * t;
    return collide(px, Yp, pz, isFront ? 1 : -1, ox, oz, seamW);
  }

  /**
   * Body collision against the avatar's signed-distance field: any fabric
   * point closer than GAP to the skin is pushed straight out along the surface
   * normal (the SDF gradient) — smooth everywhere, including the rounded
   * crotch saddle, so there is nothing to snag on and no direction flips.
   *
   * One safeguard: deep inside the body near the centre line the NEAREST skin
   * can be on the other side (a front-panel point exiting through the back
   * would fold the panel through itself). There the push direction leans
   * toward the panel's own side, fading out smoothly everywhere else.
   */
  function collide(x, Y, z, side, ox = 0, oz = 0, seamW = 0) {
    let px = x, py = Y, pz = z;
    if (!dims.sdf) return [px, py, pz];
    // 1) Radial push, level: a point inside the body moves straight out from
    //    the row's wrap centre, keeping its height and its angle round the
    //    body — so neighbouring pattern points stay neighbours on the body.
    const cyS = dims.crotchPoint ? dims.crotchPoint[1] : dims.crotchH;
    {
      let dx = px - ox, dz = pz - oz;
      const r = Math.hypot(dx, dz);
      const march = (ux, uz) => {
        let qx = px, qz = pz;
        for (let it = 0; it < 12; it++) {
          const dist = dims.sdf(qx, py, qz);
          if (dist >= COLLIDE_GAP - 0.05) break;
          const step = COLLIDE_GAP - dist;
          qx += ux * step; qz += uz * step;
        }
        return [qx, qz];
      };
      // (on the crotch seam the fabric already sits on the skin line — only
      // the normal push applies there)
      if (r > 5 && seamW < 0.5) {
        let [qx, qz] = march(dx / r, dz / r);
        // never through the centre line into the other leg: points by the
        // midline go straight forward / back instead
        // (just above the saddle the fork points are left to the normal push,
        // which settles them under the crotch where front and back meet)
        if (qx <= 0 && Y > cyS + 25) [qx, qz] = march(0, side);
        if (qx > 0) { px = qx; pz = qz; }
      }
    }
    // 2) What's left (the crotch saddle, points on the centre line) settles
    //    along the surface normal.
    // Pattern rows keep their height: above the crotch saddle the push is
    // (almost) horizontal, so a row can't be shoved up or down past its
    // neighbours. Only at the saddle itself does fabric move vertically.
    const cy = dims.crotchPoint ? dims.crotchPoint[1] : dims.crotchH;
    const vert = 1 - 0.85 * smoothstep(cy + 15, cy + 60, Y);
    for (let it = 0; it < 6; it++) {
      const dist = dims.sdf(px, py, pz);
      if (dist >= COLLIDE_GAP - 0.05) break;
      let [nx, ny, nz] = dims.normal(px, py, pz);
      ny *= vert;
      { const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l; }
      const lean = smoothstep(-8, -50, dist) * (1 - smoothstep(40, 100, Math.abs(px)));
      if (lean > 0 && nz * side < 0.3) {
        nz += side * lean * 1.5;
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l; ny /= l; nz /= l;
      }
      const push = COLLIDE_GAP - dist;
      px += nx * push; py += ny * push; pz += nz * push;
    }
    return [px, py, pz];
  }
}

function freeMapper(piece, dims) {
  const torso = torsoProfile(dims);
  let minX = Infinity, maxX = -Infinity, minY = Infinity;
  for (const p of piece.outline) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
  }
  const cx = (minX + maxX) / 2;
  const topY = dims.shoulderH - 40;
  return function map(x, y) {
    const Y = Math.max(2, topY - (y - minY));
    const R = radiusAt(torso, Y) + 12;
    const th = (x - cx) / R;
    return [R * 1.05 * Math.sin(th), Y, R * Math.cos(th)];
  };
}

// ─── Mesh building ───────────────────────────────────────────────────────────

function buildFabricMesh(piece, profile, map, sx, { rowStep = MESH_ROW_STEP, colStep = 15 } = {}) {
  const { table, band } = profile;
  const cols = clamp(Math.ceil(band.maxW / colStep), 8, 48);
  const rowsY = [];
  for (let y = table.ymin + 0.02; y < table.ymax; y += rowStep) rowsY.push(y);
  rowsY.push(table.ymax - 0.02);

  const positions = [];
  const patternXY = [];     // where each mesh point sits on the flat pattern (mm)
  const sewnXY = [];        // the same with the darts closed (sewn): true fabric distances
  const indices = [];
  let prevStart = -1;
  let vcount = 0;
  for (const y of rowsY) {
    const e = rowExtent(piece.outline, y);
    if (!e) { prevStart = -1; continue; }
    const start = vcount;
    const rowDarts = dartIntervalsAt(piece.darts, y);
    for (let j = 0; j <= cols; j++) {
      const x = e.xmin + (e.xmax - e.xmin) * (j / cols);
      const p = map(x, y);
      positions.push(p[0] * sx, p[1], p[2]);
      patternXY.push(x, y);
      sewnXY.push(closeDarts(x, rowDarts), y);
      vcount++;
    }
    if (prevStart >= 0) {
      for (let j = 0; j < cols; j++) {
        const a = prevStart + j, b = prevStart + j + 1;
        const c = start + j,     d = start + j + 1;
        if (sx > 0) indices.push(a, c, b, b, c, d);
        else        indices.push(a, b, c, b, d, c);   // keep winding outward when mirrored
      }
    }
    prevStart = start;
  }
  return {
    positions: new Float32Array(positions), patternXY: new Float32Array(patternXY),
    sewnXY: new Float32Array(sewnXY), indices: new Uint32Array(indices),
  };
}

function offsetOutward(p, sx) {
  // Push seam lines a hair away from the body axis so they draw on top of fabric
  const r = Math.hypot(p[0], p[2]) || 1;
  return [p[0] * sx + (p[0] * sx / r) * SEAM_OFFSET, p[1], p[2] + (p[2] / r) * SEAM_OFFSET];
}

function buildSeams(piece, map, sx) {
  const out = [];
  const pts = piece.outline.map(p => offsetOutward(map(p.x, p.y), sx));
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if (!piece.closed && i === pts.length - 1) break;
    out.push(...a, ...b);
  }
  for (const d of piece.darts) {
    for (const [a, b] of d.legs) {
      let prev = null;
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        const q = offsetOutward(map(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t), sx);
        if (prev) out.push(...prev, ...q);
        prev = q;
      }
    }
  }
  return new Float32Array(out);
}

function collectHandles(piece) {
  const seen = new Map();
  for (const p of piece.outline) if (p.pointId && !seen.has(p.pointId)) seen.set(p.pointId, { pointId: p.pointId, x: p.x, y: p.y });
  for (const d of piece.darts) for (const leg of d.legs) for (const p of leg) {
    if (!seen.has(p.pointId)) seen.set(p.pointId, { pointId: p.pointId, x: p.x, y: p.y });
  }
  return [...seen.values()];
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Drape every piece of a pattern onto the body.
 * @param pattern {points, segments, pieces}
 * @param dims    bodyForDrape(avatar model)
 * @param meshOpts { rowStep, colStep } fabric mesh spacing in mm (coarser for the cloth solver)
 * @returns Array of instances:
 *   { key, name, panel, sx, positions, indices, seams, handles:[{pointId,x,y,pos}], map }
 *   `map(x, y)` returns the body-space position for this instance (mirror applied).
 */
export function drapePattern(pattern, dims, meshOpts = {}) {
  const pieces = extractPieces(pattern);
  const profiles = new Map(pieces.map(p => [p.key, makeProfile(p)]));
  const instances = [];

  for (const piece of pieces) {
    const profile = profiles.get(piece.key);
    let baseMap, mirrors;
    if (piece.meta.kind === 'trouser') {
      const partner = pieces.find(q =>
        q !== piece && q.meta.kind === 'trouser' &&
        q.meta.garment === piece.meta.garment && q.meta.panel !== piece.meta.panel);
      baseMap = trouserMapper(piece, profile, partner ? profiles.get(partner.key) : null, dims);
      mirrors = [1, -1];
    } else {
      baseMap = freeMapper(piece, dims);
      mirrors = [1];
    }

    const handles = collectHandles(piece);
    for (const sx of mirrors) {
      const map = (x, y) => { const p = baseMap(x, y); return [p[0] * sx, p[1], p[2]]; };
      const mesh = buildFabricMesh(piece, profile, baseMap, sx, meshOpts);
      instances.push({
        key: piece.key,
        name: piece.meta.name ?? piece.key,
        panel: piece.meta.panel ?? 'free',
        waistY: piece.meta.waistY,          // top of the panel on paper (the cloth solver pins it)
        sx,
        positions: mesh.positions,
        patternXY: mesh.patternXY,
        sewnXY: mesh.sewnXY,
        indices: mesh.indices,
        seams: buildSeams(piece, baseMap, sx),
        handles: handles.map(h => ({ ...h, pos: map(h.x, h.y) })),
        map,
      });
    }
  }
  return instances;
}

/**
 * Inverse of a drape map near a point: find the pattern (x, y) whose draped
 * position is closest to `target` (least squares on the local Jacobian,
 * Gauss–Newton). This is what turns a drag on the 3D body into a 2D edit.
 */
export function solvePatternPoint(map, start, target, iterations = 4) {
  let x = start.x, y = start.y;
  const h = 0.5;
  for (let it = 0; it < iterations; it++) {
    const p  = map(x, y);
    const px = map(x + h, y);
    const py = map(x, y + h);
    const jx = [(px[0] - p[0]) / h, (px[1] - p[1]) / h, (px[2] - p[2]) / h];
    const jy = [(py[0] - p[0]) / h, (py[1] - p[1]) / h, (py[2] - p[2]) / h];
    const r  = [target[0] - p[0], target[1] - p[1], target[2] - p[2]];
    const a = jx[0] * jx[0] + jx[1] * jx[1] + jx[2] * jx[2];
    const b = jx[0] * jy[0] + jx[1] * jy[1] + jx[2] * jy[2];
    const c = jy[0] * jy[0] + jy[1] * jy[1] + jy[2] * jy[2];
    const gx = jx[0] * r[0] + jx[1] * r[1] + jx[2] * r[2];
    const gy = jy[0] * r[0] + jy[1] * r[1] + jy[2] * r[2];
    const det = a * c - b * b;
    if (Math.abs(det) < 1e-9) break;
    let dx = ( c * gx - b * gy) / det;
    let dy = (-b * gx + a * gy) / det;
    // Trust region — a drag step never jumps more than 60 mm per iteration
    const step = Math.hypot(dx, dy);
    if (step > 60) { dx *= 60 / step; dy *= 60 / step; }
    x += dx; y += dy;
    if (step < 0.05) break;
  }
  return { x, y };
}

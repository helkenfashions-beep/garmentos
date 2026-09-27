/**
 * Parametric avatar — one signed-distance body built from measurements (mm).
 *
 *   createBodyModel(measurements, bodyType) → model
 *     model.sdf(x, y, z)        signed distance to the skin (neg = inside)
 *     model.normal(x, y, z)     outward unit normal (collision push direction)
 *     model.girths              tape-measured girths after calibration (mm)
 *     model.crotchPoint         lowest point of the crotch saddle on the centre line
 *     model.bounds              axis-aligned box around the whole body
 *     model.dims                landmark heights (shared with pattern + drape)
 *
 * How measurements deform the body (segmented morph):
 *   – The TORSO is a loft of oval cross-sections. Chest, waist, hip and seat
 *     each own one keyframe; a monotone curve passes through them, so changing
 *     the hip only reshapes the region between seat and waist. Height, leg
 *     lengths and the other girths do not move.
 *   – Each LEG is a chain of tapering segments (hip joint → upper thigh →
 *     knee → calf → ankle) whose radii come from thigh / knee / calf girths.
 *   – Arms, neck, head, hands and feet are further segments.
 *   – Parts are joined with smooth minima. At the crotch the torso and both
 *     thighs blend over a wide radius into one rounded saddle: no pinch, no
 *     zero-thickness edge — the mesher turns it into a closed manifold.
 *
 * Calibration: after building, the model measures itself like a tailor's tape
 * (around the outside of each cross-section, bridging hollows) and rescales
 * each keyframe until chest, waist, hip, seat and upper thigh match the input,
 * and moves the crotch until waist-to-crotch equals the body rise.
 */

import { deriveBodyDims, legCenterX, legLengths } from '../body/dims.js';
import { smin, sdRoundCone, sdEllipsoid, sdEllipse2, ellipsePerimeter, monotoneCurve } from './sdf.js';

const FAR = 1e6;
// Torso-bottom sections as a fraction of the seat section (see compile).
// Width, front and back fall off at different rates: the lower belly runs
// down into the fly nearly flush with the thighs, while the seat curves
// under steeply into the gluteal fold.
const CAP_FRACTION = {
  cap0: { a: 0.08, f: 0.18, b: 0.05 },
  cap1: { a: 0.55, f: 0.72, b: 0.42 },
  cap2: { a: 0.86, f: 0.93, b: 0.80 },
};

// Cross-section shape (width : depth) per torso level, and forward offset of
// the section centre (mm, + = forward). Chests and hips are wider than deep.
const SHAPES = {
  male:   { chest: [1.32, 6],  waist: [1.28, 4], hip: [1.26, -6], seat: [1.20, -12] },
  female: { chest: [1.18, 14], waist: [1.30, 2], hip: [1.34, -8], seat: [1.22, -18] },
};

// Blend radii (mm) where parts meet
const K_CROTCH = 34;   // torso ↔ thighs: the rounded crotch saddle
const K_LEG    = 0;    // along a leg: segments share end spheres, so a plain union is already smooth (a blend would add a ring)
const K_ARM    = 16;   // shoulder
const K_NECK   = 26;
const K_HEAD   = 20;
const K_FOOT   = 18;

/** Oval semi-axes for a target girth and width:depth aspect. */
function axesForGirth(girth, aspect) {
  const b = girth / ellipsePerimeter(aspect, 1);
  return { a: aspect * b, b };
}

/** Build the part layout (rig) from measurements. Calibration edits it in place. */
function buildRig(m, bodyType) {
  const d = deriveBodyDims(m);
  const female = bodyType?.includes('female');
  const shape = female ? SHAPES.female : SHAPES.male;
  const seatG = m.seat ?? m.hip + 20;

  // Torso keyframes (y up). Each level has a girth target (null = shape only).
  const lv = (y, girth, aspect, cz, key) => ({ y, girth, aspect, cz, key, scale: 1, a: 0, b: 0 });
  const shoulderHalf = m.shoulderWidth / 2;
  const underArmY = d.chestH + (d.shoulderH - d.chestH) * 0.55;
  const neckBaseY = d.shoulderH + (d.neckTopH - d.shoulderH) * 0.35;
  const chestAx = axesForGirth(m.chest, shape.chest[0]);

  // rounded bottom of the torso, spaced in proportion to the crotch→seat
  // distance (short on bodies whose hip line sits close to the crotch);
  // shifted as a group by the calibration to set the crotch height
  const capSpan = Math.max(20, d.seatH - d.crotchH);
  const levels = [
    { y: d.crotchH + capSpan * 0.04, a: 4,               b: 4,               cz: -6,  key: 'cap0', scale: 1, fixed: true },
    { y: d.crotchH + capSpan * 0.30, a: d.thighR * 0.62, b: d.thighR * 0.62, cz: -8,  key: 'cap1', scale: 1, fixed: true },
    { y: d.crotchH + capSpan * 0.66, a: d.thighR * 1.00, b: d.thighR * 0.90, cz: -10, key: 'cap2', scale: 1, fixed: true },
    lv(d.seatH,  seatG,   shape.seat[0],  shape.seat[1],  'seat'),
    lv(d.hipH,   m.hip,   shape.hip[0],   shape.hip[1],   'hip'),
    lv(d.waistH, m.waist, shape.waist[0], shape.waist[1], 'waist'),
    lv(d.chestH, m.chest, shape.chest[0], shape.chest[1], 'chest'),
    { y: underArmY, a: Math.max(chestAx.a * 0.98, shoulderHalf - d.upperArmR * 1.6), b: chestAx.b * 0.9, cz: shape.chest[1] * 0.5, key: 'underarm', scale: 1, fixed: true },
    { y: d.shoulderH, a: shoulderHalf - d.upperArmR * 0.9, b: chestAx.b * 0.62, cz: -4, key: 'shoulder', scale: 1, fixed: true },
    { y: neckBaseY, a: d.neckR * 1.9, b: d.neckR * 1.35, cz: -6, key: 'neckbase', scale: 1, fixed: true },
    { y: d.neckTopH - 25, a: d.neckR * 1.05, b: d.neckR * 1.05, cz: -4, key: 'necktop', scale: 1, fixed: true },
  ];
  for (const L of levels) if (!L.fixed) { const ax = axesForGirth(L.girth, L.aspect); L.a = ax.a; L.b = ax.b; }

  // Leg chain (right leg; the left leg is the mirror). Radii scale with girths.
  const legY = {
    // hip joint kept low and inside the torso, so the thigh doesn't bulge at the hip line
    joint: d.crotchH + Math.min(45, (d.hipH - d.crotchH) * 0.5),
    thigh: d.crotchH - 60,
    knee:  d.kneeH,
    calf:  d.calfH,
    ankle: d.ankleH + 30,
  };
  const leg = {
    thighScale: 1,
    pts: [
      { y: legY.joint, r: d.thighR * 1.00, z: -6 },
      { y: legY.thigh, r: d.thighR * 0.97, z: -4 },
      { y: legY.knee,  r: d.kneeR  * 0.98, z: 4 },
      { y: legY.calf,  r: d.calfR  * 0.97, z: -10 },
      { y: legY.ankle, r: d.ankleR * 0.95, z: 0 },
      // continues down into the foot so ankle and foot join without a thin neck
      { y: Math.max(20, d.ankleH * 0.45), r: d.ankleR * 0.9, z: 18 },
    ],
  };

  // Arms: A-pose, opened just enough that the hands hang at least 35 mm clear
  // of the widest part of the hips and thighs (clean mesh; garments fit)
  const sx = shoulderHalf - d.upperArmR * 0.85;
  const sy = d.shoulderH - d.upperArmR * 1.1;
  const hipHalf = Math.max(axesForGirth(Math.max(m.hip, seatG), shape.hip[0]).a, d.legSpacing + d.thighR) + 12;
  // check the clearance where the arm passes the hip line AND at the wrist
  const forearmR = d.upperArmR * 0.76;
  const needAtHip   = Math.atan2(hipHalf + forearmR + 35 - sx, sy - d.hipH);
  const needAtWrist = Math.atan2(hipHalf + d.wristR * 1.3 + 35 - sx, sy - d.wristH);
  const armAngle = Math.max(9 * Math.PI / 180, needAtHip, needAtWrist);
  const armAt = (y) => sx + (sy - y) * Math.tan(armAngle);
  const arm = [
    { x: sx,              y: sy,          z: 0,  r: d.upperArmR * 1.05 },
    { x: armAt(d.elbowH), y: d.elbowH,    z: -8, r: d.upperArmR * 0.76 },
    { x: armAt(d.wristH), y: d.wristH,    z: 6,  r: d.wristR * 1.0 },
  ];
  // hand: a mitten (tapered segment wrist → fingertips) — exact distance, no thin plate
  const handLen = Math.max(140, d.H * 0.1);
  const hand = {
    x: armAt(d.wristH - handLen), y: d.wristH - handLen, z: 14,
    r0: d.wristR * 1.05, r1: d.wristR * 0.8, ry: 20,
  };

  return { m, d, female, levels, leg, arm, hand, crotchShift: 0 };
}

/** Compile a rig into fast evaluation closures. */
function compile(rig) {
  const { d, levels, leg, arm, hand } = rig;
  // cap keys move with the crotch calibration but never pass the seat key
  // The torso bottom is a rounded (quarter-ellipse) fall-off from the seat
  // section to the crotch: the cap sections are fractions of the calibrated
  // seat section, so the body curves under the seat instead of stepping in.
  const seat = levels.find(l => l.key === 'seat');
  const seatY = seat.y;
  const L = levels.map(l => {
    if (!l.key.startsWith('cap')) return { ...l };
    const span = Math.max(20, seatY - d.crotchH);
    const room = { cap0: span * 0.75, cap1: span * 0.5, cap2: span * 0.18 }[l.key];
    const f = CAP_FRACTION[l.key];
    const sb = seat.b * seat.scale;
    return {
      ...l, y: Math.min(l.y + rig.crotchShift, seatY - room), scale: 1,
      a: Math.max(l.a, seat.a * seat.scale * f.a),
      bf: Math.max(l.b, sb * f.f), bb: Math.max(l.b, sb * f.b),
    };
  }).sort((p, q) => p.y - q.y);
  const aCurve  = monotoneCurve(L.map(l => ({ y: l.y, v: l.a * l.scale })));
  // front and back half-depths (equal except at the torso bottom)
  const bfCurve = monotoneCurve(L.map(l => ({ y: l.y, v: (l.bf ?? l.b) * l.scale })));
  const bbCurve = monotoneCurve(L.map(l => ({ y: l.y, v: (l.bb ?? l.b) * l.scale })));
  const czCurve = monotoneCurve(L.map(l => ({ y: l.y, v: l.cz })));
  const y0 = L[0].y, y1 = L[L.length - 1].y;

  const legPts = leg.pts.map((p, i) => ({
    x: legCenterX(d, p.y), y: p.y, z: p.z,
    r: p.r * (i <= 1 ? leg.thighScale : 1),
  }));
  const ankle = legPts[legPts.length - 2];
  // sole rests on the floor (y = 0)
  const footRy = Math.max(26, d.ankleH * 0.45);
  const foot = { x: ankle.x + 6, y: footRy, z: 48, rx: d.ankleR * 1.35, ry: footRy, rz: Math.max(90, d.H * 0.066) };
  const neckA = { x: 0, y: d.shoulderH - 30, z: -12, r: d.neckR * 1.15 };
  const neckB = { x: 0, y: d.neckTopH + 25, z: 0, r: d.neckR * 0.95 };
  // head top lands exactly on the measured height
  const headRy = d.headR * 1.04;
  const head = { y: d.H - headRy, z: 10, rx: d.headR * 0.80, ry: headRy, rz: d.headR * 0.95 };

  const legTop = legPts[0].y + legPts[0].r + 20;
  const armBottom = hand.y - hand.r1 - 30;

  function torso(x, y, z) {
    const yc = y < y0 ? y0 : y > y1 ? y1 : y;
    const a = aCurve(yc), cz = czCurve(yc);
    // two half-ellipses (front / back) sharing the width: continuous and
    // smooth across the side, since both halves are vertical there
    const front = z >= cz;
    const bc = front ? bfCurve : bbCurve;
    const b = bc(yc);
    let d2 = sdEllipse2(x, z - cz, Math.max(a, 1), Math.max(b, 1));
    // The cross-section distance is horizontal; where the torso slopes (top of
    // the shoulders, under the seat) the true distance is shorter by cos(slope).
    // Correcting it keeps the field a true distance bound: safe for meshing,
    // smooth blends and collision normals.
    // (slope measured over ±12 mm so the correction varies slowly: a factor
    // that changes quickly with height would tilt the gradient — the surface
    // normals — wherever the torso field is far from zero, e.g. on the thighs)
    const e = 12;
    const sa = (aCurve(yc + e) - aCurve(yc - e)) / (2 * e);
    const sb = (bc(yc + e) - bc(yc - e)) / (2 * e);
    const slope = Math.max(Math.abs(sa), Math.abs(sb));
    d2 /= Math.sqrt(1 + slope * slope);
    if (y < y0) { const dy = y0 - y; return d2 > 0 ? Math.hypot(d2, dy) : dy; }
    if (y > y1) { const dy = y - y1; return d2 > 0 ? Math.hypot(d2, dy) : dy; }
    return d2;
  }

  function legD(xa, y, z) {
    if (y > legTop) return FAR;
    let dist = FAR;
    for (let i = 0; i < legPts.length - 1; i++) {
      const p = legPts[i], q = legPts[i + 1];
      if (y > p.y + p.r + K_LEG || y < q.y - q.r - K_LEG) continue;
      const s = sdRoundCone(xa, y, z, p.x, p.y, p.z, q.x, q.y, q.z, p.r, q.r);
      dist = dist === FAR ? s : smin(dist, s, K_LEG);
    }
    if (y < foot.y + foot.ry + K_FOOT) {
      const f = sdEllipsoid(xa, y, z, foot.x, foot.y, foot.z, foot.rx, foot.ry, foot.rz);
      dist = dist === FAR ? f : smin(dist, f, K_FOOT);
    }
    return dist;
  }

  function armD(xa, y, z) {
    if (y < armBottom || xa < arm[0].x - arm[0].r - 60) return FAR;
    let dist = sdRoundCone(xa, y, z, arm[0].x, arm[0].y, arm[0].z, arm[1].x, arm[1].y, arm[1].z, arm[0].r, arm[1].r);
    dist = smin(dist, sdRoundCone(xa, y, z, arm[1].x, arm[1].y, arm[1].z, arm[2].x, arm[2].y, arm[2].z, arm[1].r, arm[2].r), 0);
    const w = arm[2];
    return smin(dist, sdRoundCone(xa, y, z, w.x, w.y, w.z, hand.x, hand.y, hand.z, hand.r0, hand.r1), 6);
  }

  function headD(x, y, z) {
    if (y < neckA.y - neckA.r - 40) return FAR;
    const n = sdRoundCone(x, y, z, neckA.x, neckA.y, neckA.z, neckB.x, neckB.y, neckB.z, neckA.r, neckB.r);
    const h = sdEllipsoid(x, y, z, 0, head.y, head.z, head.rx, head.ry, head.rz);
    return { n, h };
  }

  /** Full body. `opts.arms = false` gives the body a tape measure goes round. */
  function sdf(x, y, z, opts) {
    const xa = x < 0 ? -x : x;
    let dist = y > y0 - 80 ? torso(x, y, z) : FAR;
    const lg = legD(xa, y, z);
    if (lg !== FAR) dist = dist === FAR ? lg : smin(dist, lg, K_CROTCH);
    if (!opts || opts.arms !== false) {
      const ar = armD(xa, y, z);
      if (ar !== FAR) dist = smin(dist, ar, K_ARM);
    }
    const hd = headD(x, y, z);
    if (hd !== FAR) {
      dist = smin(dist, hd.n, K_NECK);
      dist = smin(dist, hd.h, K_HEAD);
    }
    return dist;
  }

  /** Torso cross-section at height y: ellipse semi-axes a (x), b (z), centre z. */
  function torsoSection(y) {
    const yc = y < y0 ? y0 : y > y1 ? y1 : y;
    // as one symmetric ellipse with the same front and back extents
    const bf = Math.max(bfCurve(yc), 1), bb = Math.max(bbCurve(yc), 1);
    return { a: Math.max(aCurve(yc), 1), b: (bf + bb) / 2, cz: czCurve(yc) + (bf - bb) / 2 };
  }

  /** Leg (one side, x > 0) cross-section at height y: centre x, z and radius. */
  function legSection(y) {
    if (y >= legPts[0].y) return { ...legPts[0] };
    for (let i = 0; i < legPts.length - 1; i++) {
      const p = legPts[i], q = legPts[i + 1];
      if (y <= p.y && y >= q.y) {
        const t = (p.y - y) / ((p.y - q.y) || 1);
        return { x: p.x + (q.x - p.x) * t, y, z: p.z + (q.z - p.z) * t, r: p.r + (q.r - p.r) * t };
      }
    }
    return { ...legPts[legPts.length - 1] };
  }

  return { sdf, legPts, arm, hand, foot, head, torsoRange: [y0, y1], torsoSection, legSection };
}

// ─── Tape measuring ──────────────────────────────────────────────────────────

function convexHullPerimeter(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return 0;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  let per = 0;
  for (let i = 0; i < hull.length; i++) { const a = hull[i], b = hull[(i + 1) % hull.length]; per += Math.hypot(a[0] - b[0], a[1] - b[1]); }
  return per;
}

/**
 * Girth at height y the way a tape measure reads it: cast rays from a centre
 * point in the horizontal plane, find where each leaves the body, and take the
 * perimeter of the convex hull (a tape bridges hollows).
 * `minX` clips the section (e.g. one thigh only: minX = 0 stops at the midline).
 */
export function tapeGirth(sdf, y, cx, cz, { minX = -Infinity, rays = 120 } = {}) {
  const pts = [];
  for (let i = 0; i < rays; i++) {
    const t = (i / rays) * 2 * Math.PI;
    const dx = Math.sin(t), dz = Math.cos(t);
    let r = 0;
    let v = sdf(cx, y, cz);
    if (v >= 0) continue;
    // march out using the distance itself as the step (sphere tracing), then bisect
    let rOut = null;
    while (r < 1200) {
      const nr = r + Math.max(1.5, -v * 0.9);
      const x = cx + dx * nr;
      if (x < minX) { rOut = (minX - cx) / dx; break; }
      const nv = sdf(x, y, cz + dz * nr);
      if (nv >= 0) { let lo = r, hi = nr; for (let k = 0; k < 14; k++) { const mid = (lo + hi) / 2; if (sdf(cx + dx * mid, y, cz + dz * mid) >= 0) hi = mid; else lo = mid; } rOut = (lo + hi) / 2; break; }
      r = nr; v = nv;
    }
    if (rOut != null) pts.push([cx + dx * rOut, cz + dz * rOut]);
  }
  return convexHullPerimeter(pts);
}

/** Lowest point of the crotch saddle on the centre line (x = 0, z = centre). */
function findCrotchY(sdf, fromY, cz) {
  // walk down from inside the torso until we leave the body
  let y = fromY;
  if (sdf(0, y, cz) >= 0) return fromY;
  while (y > 0 && sdf(0, y, cz) < 0) y -= 2;
  let lo = y, hi = y + 2;   // lo outside, hi inside
  for (let k = 0; k < 20; k++) { const mid = (lo + hi) / 2; if (sdf(0, mid, cz) < 0) hi = mid; else lo = mid; }
  return (lo + hi) / 2;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build and calibrate the avatar for a set of measurements (mm).
 * @returns model — see header comment.
 */
export function createBodyModel(measurements, bodyType = 'male_adult', { calibrate = true } = {}) {
  const m = measurements;
  const rig = buildRig(m, bodyType);
  const d = rig.d;
  let c = compile(rig);
  const noArms = (x, y, z) => c.sdf(x, y, z, { arms: false });

  const seatTarget = m.seat ?? m.hip + 20;
  const thighY = d.crotchH - 30;
  const measureAll = () => {
    const lvl = Object.fromEntries(rig.levels.filter(l => !l.fixed).map(l => [l.key, l]));
    return {
      chest: tapeGirth(noArms, lvl.chest.y, 0, lvl.chest.cz),
      waist: tapeGirth(noArms, lvl.waist.y, 0, lvl.waist.cz),
      hip:   tapeGirth(noArms, lvl.hip.y,   0, lvl.hip.cz),
      seat:  tapeGirth(noArms, lvl.seat.y,  0, lvl.seat.cz),
      upperThigh: tapeGirth(noArms, thighY, legCenterX(d, thighY), -4, { minX: 0 }),
    };
  };

  let girths = measureAll();
  let crotchY = findCrotchY(noArms, d.crotchH + 60, -8);
  if (calibrate) {
    const targets = { chest: m.chest, waist: m.waist, hip: m.hip, seat: seatTarget, upperThigh: m.upperThighGirth };
    for (let iter = 0; iter < 10; iter++) {
      // crotch height: move the rounded torso bottom so waist→crotch = body rise
      rig.crotchShift += d.crotchH - crotchY;
      for (const l of rig.levels) if (!l.fixed) l.scale *= targets[l.key] / girths[l.key];
      rig.leg.thighScale *= targets.upperThigh / girths.upperThigh;
      c = compile(rig);
      girths = measureAll();
      crotchY = findCrotchY(noArms, d.crotchH + 60, -8);
      const worst = Math.max(...Object.keys(targets).map(k => Math.abs(girths[k] / targets[k] - 1)));
      if (worst < 0.004 && Math.abs(crotchY - d.crotchH) < 1.5) break;
    }
  }

  const sdf = (x, y, z) => c.sdf(x, y, z);
  // outward unit normal = normalised SDF gradient (tetrahedral differences:
  // 4 evaluations instead of 6, same accuracy)
  const normal = (x, y, z) => {
    const e = 0.75;
    const a = sdf(x + e, y - e, z - e), b = sdf(x - e, y - e, z + e);
    const c = sdf(x - e, y + e, z - e), d4 = sdf(x + e, y + e, z + e);
    const nx = a - b - c + d4, ny = -a - b + c + d4, nz = -a + b - c + d4;
    const l = Math.hypot(nx, ny, nz) || 1;
    return [nx / l, ny / l, nz / l];
  };

  const reach = Math.max(c.hand.x + c.hand.r0, c.foot.x + c.foot.rx, ...rig.levels.map(l => l.a * l.scale)) + 30;
  const bounds = {
    min: [-reach, -12, Math.min(-220, -reach * 0.8)],
    max: [reach, d.H + 10, Math.max(c.foot.z + c.foot.rz + 20, 220)],
  };

  return {
    sdf, normal, girths, bounds, dims: d,
    torsoSection: c.torsoSection, legSection: c.legSection,
    crotchPoint: [0, crotchY, -8],
    measurements: m, bodyType,
    lengths: legLengths(m),
  };
}

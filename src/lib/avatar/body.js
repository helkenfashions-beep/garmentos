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

import { deriveBodyDims, legCenterX, legLengths, UPPER_ARM_FRACTION, SHOULDER_SLOPE, NECK_BASE_WIDTH } from '../body/dims.js';
import { smin, sdRoundCone, sdEllipsoid, sdEllipse2, ellipsePerimeter, monotoneCurve } from './sdf.js';

const FAR = 1e6;
// Torso-bottom sections as a fraction of the seat section (see compile).
// Width, front and back fall off at different rates: the lower belly runs
// down into the fly nearly flush with the thighs, while the seat curves
// under steeply into the gluteal fold.
const CAP_FRACTION = {
  cap0: { a: 0.08, f: 0.18, b: 0.30 },
  cap1: { a: 0.55, f: 0.72, b: 0.80 },
  cap2: { a: 0.86, f: 0.93, b: 1.00 },
};

// Torso cross-sections. Per level:
//   aspect — width : depth (chests and hips are wider than deep)
//   spine  — forward offset of the section's widest line (mm, + = forward).
//            Down the body these trace the S of the spine: the thoracic
//            curve (kyphosis) carries the upper back and shoulders back, the
//            lumbar curve (lordosis) brings the waist forward, and the pelvis
//            tips the seat back again.
//   fb     — front/back split of the depth: + puts more of it in front
//            (ribcage, bust, belly), − behind (shoulder blades, buttocks).
//            front depth = b·(1 + fb), back depth = b·(1 − fb).
// Girths are calibrated afterwards, so these set the SHAPE only.
const SHAPES = {
  male: {
    seat:     { aspect: 1.14, spine: -12, fb: -0.24, glute: 0.20 },
    hip:      { aspect: 1.22, spine: -6,  fb: -0.14, glute: 0.09 },
    waist:    { aspect: 1.28, spine: 8,   fb: 0.04 },
    chest:    { aspect: 1.32, spine: 2,   fb: 0.08 },
    underarm: { spine: -8,  fb: -0.10 },
    shoulder: { spine: -16, fb: -0.12 },
    neckbase: { spine: -14 },
    necktop:  { spine: -2 },
  },
  female: {
    seat:     { aspect: 1.14, spine: -20, fb: -0.24, glute: 0.30 },
    hip:      { aspect: 1.26, spine: -10, fb: -0.22, glute: 0.15 },
    waist:    { aspect: 1.30, spine: 12,  fb: 0.06 },
    chest:    { aspect: 1.18, spine: 6,   fb: 0.18 },
    underarm: { spine: -6,  fb: -0.02 },
    shoulder: { spine: -14, fb: -0.10 },
    neckbase: { spine: -12 },
    necktop:  { spine: 0 },
  },
};

// Blend radii (mm) where parts meet
const K_CROTCH = 34;   // torso ↔ thighs: the rounded crotch saddle
const K_FOLD   = 70;   // …widening behind the body: the buttocks round down into
                       // the backs of the thighs (the gluteal fold), no shelf
// Gluteal shape: the BACK half of each torso section between the hip and
// the gluteal fold is two-lobed — fullest either side of the centre line
// (the gluteal masses) with a shallow cleft between — instead of a single
// curve peaking on the spine. `glute` (per level) is how much the lobes add
// to the back depth at their fullest; the calibration still tapes the
// section, so girths stay exact.
// The lobes are two mirrored bells, so the cleft is the smooth, wide valley
// between them (no V on the centre line for cloth to catch in), and their
// width is set by the SEAT, so they run straight down into the fold instead
// of pinching toward the centre as the torso narrows under the seat.
const SACRUM_AT = 0.5;     // the sacrum key: halfway from waist to hip line…
const SACRUM_BACK = 0.3;   // …where the back has gone only 30% of the way out
const LOBE_AT = 0.40;      // lobe centre, as a share of the seat half-width
const LOBE_SPREAD = 0.30;
const LOBE_LIP = 2.0;      // steepest change of the back depth across x, per unit of glute
// Below the waist the back depth and the gluteal amount are blurred up and
// down the body (Gaussian, this σ in mm) after the keyframe curve: the keys
// (sacrum, hip, seat, fold) can sit only 25 mm apart on some bodies, and a
// curve forced through them makes a shelf. Blurring keeps the volume but
// spreads it, and a blur of a monotone curve is still monotone.
const BACK_BLUR = 16;
const BLUR_FADE = 60;      // …fading out over this far above the waist
const LEG_MID = 10;      // mm: the legs' mirror seam is rounded over this far either side of the centre
const LEG_OVAL = 0.07;  // thigh-top cross-section: 7% narrower across, 7% deeper
const K_LEG    = 0;    // along a leg: segments share end spheres, so a plain union is already smooth (a blend would add a ring)
const K_ARM    = 10;   // arm ↔ torso below the armpit (the arm hangs clear)
const K_AXILLA = 34;   // …widening to this at the armpit: a smooth axillary fold
const K_DELT   = 22;   // deltoid ↔ upper arm
const K_NECK   = 40;
const K_HEAD   = 20;
const K_FOOT   = 18;

/** Oval semi-axes for a target girth and width:depth aspect. */
function axesForGirth(girth, aspect) {
  const b = girth / ellipsePerimeter(aspect, 1);
  return { a: aspect * b, b };
}

/**
 * Gluteal lobes across the back (u = x / seat half-width): two mirrored
 * bells, 1 at their fullest, with a smooth valley (flat on the centre line)
 * between them.
 */
const LOBE_NORM = 1 + Math.exp(-((2 * LOBE_AT / LOBE_SPREAD) ** 2));
function lobeShape(u) {
  const p = (u - LOBE_AT) / LOBE_SPREAD, q = (u + LOBE_AT) / LOBE_SPREAD;
  return (Math.exp(-p * p) + Math.exp(-q * q)) / LOBE_NORM;
}

/**
 * Gaussian blur (σ mm) of a table sampled every `step` mm from `lo`, applied
 * fully below yTop and fading back to the original over `fade` mm above it.
 * Ends are clamped, so a flat end stays flat.
 */
function blurBelow(tab, lo, step, sigma, yTop, fade) {
  const n = tab.length, r = Math.ceil((3 * sigma) / step);
  const w = [];
  for (let j = -r; j <= r; j++) w.push(Math.exp(-0.5 * ((j * step) / sigma) ** 2));
  const wSum = w.reduce((s, v) => s + v, 0);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = -r; j <= r; j++) s += w[j + r] * tab[Math.min(n - 1, Math.max(0, i + j))];
    const t = Math.min(1, Math.max(0, (lo + i * step - yTop) / fade)), k = t * t * (3 - 2 * t);
    out[i] = (s / wSum) * (1 - k) + tab[i] * k;
  }
  return out;
}

/** Read a table at fractional index f with a Catmull-Rom cubic (C1, no overshoot on smooth data). */
function catmullRom(tab, f) {
  const n = tab.length;
  if (f <= 0) return tab[0];
  if (f >= n - 1) return tab[n - 1];
  const i = Math.floor(f), t = f - i;
  const p0 = tab[Math.max(0, i - 1)], p1 = tab[i], p2 = tab[i + 1], p3 = tab[Math.min(n - 1, i + 2)];
  return p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
}

/** Build the part layout (rig) from measurements. Calibration edits it in place. */
function buildRig(m, bodyType) {
  const d = deriveBodyDims(m);
  const female = bodyType?.includes('female');
  const shape = female ? SHAPES.female : SHAPES.male;
  const seatG = m.seat ?? m.hip + 20;
  const rB = d.upperArmR;                     // bicep radius

  // Torso keyframes (y up). Girth levels get their oval from the girth; the
  // others are shaped from the neighbouring levels.
  const lv = (y, girth, key) => {
    const sh = shape[key];
    const ax = axesForGirth(girth, sh.aspect);
    return { y, girth, key, scale: 1, a: ax.a, b: ax.b, bf: ax.b * (1 + sh.fb), bb: ax.b * (1 - sh.fb), cz: sh.spine, glute: sh.glute ?? 0 };
  };
  const fixed = (y, a, b, key) => {
    const sh = shape[key] ?? {}, fb = sh.fb ?? 0;
    return { y, key, scale: 1, fixed: true, a, b, bf: b * (1 + fb), bb: b * (1 - fb), cz: sh.spine ?? 0 };
  };
  const shoulderHalf = m.shoulderWidth / 2;
  const underArmY = d.chestH + (d.shoulderH - d.chestH) * 0.55;
  const chestAx = axesForGirth(m.chest, shape.chest.aspect);
  // the neck: from its base at the nape (C7) up toward the chin
  // (always at least 40 mm of neck above the nape, whatever the lengths)
  const neckTopY = Math.max(d.napeH + 60, d.neckTopH - 25);

  function shoulderLine() {
    const aS = shoulderHalf - rB * 0.9, aN = d.neckR * NECK_BASE_WIDTH;
    const tan = Math.tan(SHOULDER_SLOPE);
    const yS = Math.min(d.napeH - 8, d.shoulderH + Math.max(0, shoulderHalf - aS) * tan);
    const bS = chestAx.b * 0.62, bN = d.neckR * 1.3;
    // a few keys along the line keep the loft from bulging between them
    const out = [fixed(yS, aS, bS, 'shoulder')];
    for (const k of [1, 2, 3]) {
      const t = k / 4, y = yS + (d.napeH - yS) * t;
      if (y > yS + 2 && y < d.napeH - 2) {
        const key = fixed(y, aS + (aN - aS) * t, bS + (bN - bS) * t, 'shoulder');
        // the front falls away toward the collarbones faster than the back
        key.bf = key.bf + (d.neckR * 0.95 - key.bf) * Math.min(1, t * 1.4);
        out.push({ ...key, key: `trap${k}`, cz: (shape.shoulder.spine * (1 - t) + shape.neckbase.spine * t) });
      }
    }
    return out;
  }

  // rounded bottom of the torso, spaced in proportion to the crotch→seat
  // distance (short on bodies whose hip line sits close to the crotch);
  // shifted as a group by the calibration to set the crotch height
  const capSpan = Math.max(20, d.seatH - d.crotchH);
  const levels = [
    { y: d.crotchH + capSpan * 0.04, a: 4,               b: 4,               cz: -6,  key: 'cap0', scale: 1, fixed: true },
    { y: d.crotchH + capSpan * 0.30, a: d.thighR * 0.62, b: d.thighR * 0.62, cz: -8,  key: 'cap1', scale: 1, fixed: true },
    { y: d.crotchH + capSpan * 0.66, a: d.thighR * 1.00, b: d.thighR * 0.90, cz: -10, key: 'cap2', scale: 1, fixed: true },
    lv(d.seatH,  seatG,   'seat'),
    lv(d.hipH,   m.hip,   'hip'),
    lv(d.waistH, m.waist, 'waist'),
    lv(d.chestH, m.chest, 'chest'),
    fixed(underArmY, Math.max(chestAx.a * 0.98, shoulderHalf - rB * 1.6), chestAx.b * 0.9, 'underarm'),
    // the top of the shoulders: a straight line sloping down from the neck
    // base to the shoulder point (the deltoid carries it the last few cm)
    ...shoulderLine(),
    // neck base: wide across the trapezius, deep behind (the nape), shallow
    // in front — the front of the neck starts low, at the collarbones
    { ...fixed(d.napeH, d.neckR * NECK_BASE_WIDTH, d.neckR * 1.3, 'neckbase'), bf: d.neckR * 0.95 },
    // top of the torso loft sits just inside the neck, so it never shows as a lip
    fixed(neckTopY, d.neckR * 0.9, d.neckR * 0.9, 'necktop'),
  ];

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

  // ── Arms ─────────────────────────────────────────────────────────────────
  // The shoulder joint sits just inside the shoulder point. The arm hangs in
  // an A-pose opened just enough that forearm and hand clear the hips and
  // thighs by 35 mm. Along the arm, the SLEEVE LENGTH is laid out exactly:
  // shoulder → elbow = 56%, elbow → wrist = the rest.
  const sx = shoulderHalf - rB * 0.7;
  const sy = d.shoulderH - rB * 1.1;
  const S = d.sleeve;
  const hipHalf = Math.max(axesForGirth(Math.max(m.hip, seatG), shape.hip.aspect).a, d.legSpacing + d.thighR) + 12;
  const forearmR = rB * 0.78;
  const needAtHip   = Math.atan2(hipHalf + forearmR + 35 - sx, sy - d.hipH);
  const needAtWrist = Math.asin(Math.min(0.9, Math.max(0, (hipHalf + d.wristR * 1.3 + 35 - sx) / (S - rB))));
  // …and the upper arm clears the ribcage just below the armpit, so the
  // armpit is a fold, not a web of skin joining arm and chest
  const chestHalf = axesForGirth(m.chest, shape.chest.aspect).a;
  const needAtChest = Math.atan2(chestHalf + rB + 25 - sx, sy - (d.chestH - 60));
  const armAngle = Math.max(9 * Math.PI / 180, needAtHip, needAtWrist, needAtChest);
  const dir = [Math.sin(armAngle), -Math.cos(armAngle)];
  const along = (t, z) => ({ x: sx + dir[0] * t, y: sy + dir[1] * t, z });
  // the tape starts at the shoulder point, which sits above/outside the joint:
  // measure the sleeve from where the shoulder point falls on the arm's axis
  const t0 = (shoulderHalf - sx) * dir[0] + (d.shoulderH - sy) * dir[1];
  const upper = S * UPPER_ARM_FRACTION;
  const arm = [
    { ...along(0, 0),                                   r: rB * 1.02 },   // shoulder joint
    { ...along(t0 + upper * 0.5, -2),                   r: rB },          // bicep (the girth measured)
    { ...along(t0 + upper, -8),                         r: rB * 0.74 },   // elbow
    { ...along(t0 + upper + (S - upper) * 0.3, -2),     r: forearmR },    // forearm muscle
    { ...along(t0 + S, 6),                              r: d.wristR },    // wrist
  ];
  // deltoid: the rounded cap over the shoulder joint, slightly outside the
  // shoulder point — gives the shoulder its slope into the arm
  const deltoid = { x: shoulderHalf - rB * 0.75, y: d.shoulderH - rB * 1.15, z: -4, rx: rB * 1.05, ry: rB * 1.2, rz: rB * 1.15 };
  // hand: a mitten (tapered segment wrist → fingertips) — exact distance, no thin plate
  const handLen = Math.max(140, d.H * 0.1);
  const hand = {
    ...along(t0 + S + handLen, 14),
    r0: d.wristR * 1.05, r1: d.wristR * 0.95, ry: 20,
  };
  // the armpit: where the inside of the upper arm leaves the chest wall
  const axillaY = Math.min(underArmY, sy - Math.max(0, chestHalf + rB - sx) / Math.tan(armAngle));

  return { m, d, female, levels, leg, arm, hand, deltoid, axillaY, crotchShift: 0, neckScale: 1, shoulderPoint: [shoulderHalf, d.shoulderH, 0] };
}

/** Compile a rig into fast evaluation closures. */
function compile(rig) {
  const { d, levels, leg, arm, hand, deltoid, axillaY } = rig;
  // cap keys move with the crotch calibration but never pass the seat key
  // The torso bottom is a rounded (quarter-ellipse) fall-off from the seat
  // section to the crotch: the cap sections are fractions of the calibrated
  // seat section, so the body curves under the seat instead of stepping in.
  const seat = levels.find(l => l.key === 'seat');
  const seatY = seat.y;
  const lobeA = Math.max(seat.a * seat.scale, 1);
  const L = levels.map(l => {
    if (!l.key.startsWith('cap')) return { ...l };
    const span = Math.max(20, seatY - d.crotchH);
    const room = { cap0: span * 0.75, cap1: span * 0.5, cap2: span * 0.18 }[l.key];
    const f = CAP_FRACTION[l.key];
    return {
      ...l, y: Math.min(l.y + rig.crotchShift, seatY - room), scale: 1,
      a: Math.max(l.a, seat.a * seat.scale * f.a),
      bf: Math.max(l.b, seat.bf * seat.scale * f.f), bb: Math.max(l.b, seat.bb * seat.scale * f.b),
      glute: (seat.glute ?? 0) * ({ cap2: 1.0, cap1: 0.7, cap0: 0 })[l.key],
    };
  }).map(l => (l.key === 'necktop' || l.key === 'neckbase' ? { ...l, a: l.a * rig.neckScale, bf: l.bf * rig.neckScale, bb: l.bb * rig.neckScale } : l));
  // Sacrum: between waist and hip the back keeps the lumbar hollow almost to
  // the sacrum, then rounds out quickly into the buttocks — an S (concave
  // above, convex below), not a straight ramp from waist to seat. Width and
  // front follow the waist→hip blend; only the back is held in.
  {
    const w = L.find(l => l.key === 'waist'), h = L.find(l => l.key === 'hip');
    const t = SACRUM_AT;
    const mix = (p, q, k) => p + (q - p) * k;
    L.push({
      key: 'sacrum', fixed: true, scale: 1, y: mix(w.y, h.y, t),
      a: mix(w.a * w.scale, h.a * h.scale, t), b: 0,
      bf: mix(w.bf * w.scale, h.bf * h.scale, t),
      bb: mix(w.bb * w.scale, h.bb * h.scale, SACRUM_BACK),
      cz: mix(w.cz, h.cz, t), glute: (h.glute ?? 0) * 0.25,
    });
  }
  L.sort((p, q) => p.y - q.y);
  const aCurve0 = monotoneCurve(L.map(l => ({ y: l.y, v: l.a * l.scale })));
  // front and back half-depths (equal except at the torso bottom)
  const bfCurve0 = monotoneCurve(L.map(l => ({ y: l.y, v: (l.bf ?? l.b) * l.scale })));
  const bbCurve0 = monotoneCurve(L.map(l => ({ y: l.y, v: (l.bb ?? l.b) * l.scale })));
  const czCurve0 = monotoneCurve(L.map(l => ({ y: l.y, v: l.cz })));
  const glCurve0 = monotoneCurve(L.map(l => ({ y: l.y, v: l.glute ?? 0 })));
  // The torso is evaluated millions of times (meshing, drape, cloth): sample
  // each curve every 2 mm once and interpolate linearly (error ≪ 0.01 mm on
  // these smooth curves) instead of a binary search + cubic per call.
  const TAB_LO = L[0].y - 40, TAB_STEP = 2;
  const TAB_N = Math.ceil((L[L.length - 1].y + 40 - TAB_LO) / TAB_STEP) + 1;
  const sample = (fn) => {
    const tab = new Float64Array(TAB_N);
    for (let i = 0; i < TAB_N; i++) tab[i] = fn(TAB_LO + i * TAB_STEP);
    return tab;
  };
  const lookup = (tab) => (y) => {
    const f = (y - TAB_LO) / TAB_STEP;
    if (f <= 0) return tab[0];
    if (f >= TAB_N - 1) return tab[TAB_N - 1];
    const i = f | 0, t = f - i;
    return tab[i] + (tab[i + 1] - tab[i]) * t;
  };
  const waistY = L.find(l => l.key === 'waist').y;
  const blurred = (tab) => blurBelow(tab, TAB_LO, TAB_STEP, BACK_BLUR, waistY, BLUR_FADE);
  const aCurve = lookup(sample(aCurve0)), bfCurve = lookup(sample(bfCurve0));
  const bbCurve = lookup(blurred(sample(bbCurve0)));
  const czCurve = lookup(blurred(sample(czCurve0))), glCurve = lookup(blurred(sample(glCurve0)));
  const y0 = L[0].y, y1 = L[L.length - 1].y;
  // 1/√(1+slope²) for the torso's front and back halves, tabulated every
  // SLOPE_STEP mm (slope over ±20 mm), blurred and read back with a cubic:
  // the factor multiplies the distance, so wherever the torso field is far
  // from zero (in a blend with a leg or arm) any kink in it with height
  // would kink the surface normals.
  const SLOPE_STEP = 4, e = 20;
  const nS = Math.ceil((y1 - y0) / SLOPE_STEP) + 1;
  let slopeF = new Float64Array(nS), slopeB = new Float64Array(nS);
  for (let i = 0; i < nS; i++) {
    const yy = y0 + i * SLOPE_STEP;
    const sa = Math.abs(aCurve(yy + e) - aCurve(yy - e)) / (2 * e);
    const sf = Math.max(sa, Math.abs(bfCurve(yy + e) - bfCurve(yy - e)) / (2 * e));
    const sb = Math.max(sa, Math.abs(bbCurve(yy + e) - bbCurve(yy - e)) / (2 * e));
    slopeF[i] = 1 / Math.sqrt(1 + sf * sf);
    slopeB[i] = 1 / Math.sqrt(1 + sb * sb);
  }
  slopeF = blurBelow(slopeF, y0, SLOPE_STEP, 8, Infinity, 1);
  slopeB = blurBelow(slopeB, y0, SLOPE_STEP, 8, Infinity, 1);
  const slopeFactor = (tab, yc) => catmullRom(tab, (yc - y0) / SLOPE_STEP);

  const legPts = leg.pts.map((p, i) => ({
    x: legCenterX(d, p.y), y: p.y, z: p.z,
    r: p.r * (i <= 1 ? leg.thighScale : 1),
  }));
  const ankle = legPts[legPts.length - 2];
  // sole rests on the floor (y = 0)
  const footRy = Math.max(26, d.ankleH * 0.45);
  const foot = { x: ankle.x + 6, y: footRy, z: 48, rx: d.ankleR * 1.35, ry: footRy, rz: Math.max(90, d.H * 0.066) };
  // neck: rises from inside the trapezius at the nape, leaning slightly
  // forward (cervical curve) up under the head
  const ns = rig.neckScale;
  const neckA = { x: 0, y: d.napeH - 40, z: -14, r: d.neckR * 1.12 * ns };
  const neckB = { x: 0, y: d.neckTopH + 25, z: 2, r: d.neckR * 0.95 * ns };
  // head: the cranium (its top lands exactly on the measured height) and the
  // face/jaw below it, forward — so the chin is in front and the back of the
  // neck shows below the skull instead of the head sitting on the shoulders
  const R = d.headR;
  const head = { y: d.H - R * 0.9, z: -4, rx: R * 0.78, ry: R * 0.9, rz: R * 0.95 };
  const jaw  = { y: d.H - R * 1.45, z: 24, rx: R * 0.6, ry: R * 0.62, rz: R * 0.62 };

  // (the legs' field is skipped above this; it must clear the widest blend
  // with the torso, or the cut would show as a seam in the surface)
  const legTop = legPts[0].y + legPts[0].r + K_FOLD + 10;
  const armBottom = hand.y - hand.r1 - 30;

  function torso(x, y, z) {
    const yc = y < y0 ? y0 : y > y1 ? y1 : y;
    const a = aCurve(yc), cz = czCurve(yc);
    // two half-ellipses (front / back) sharing the width: continuous and
    // smooth across the side, since both halves are vertical there
    const front = z >= cz;
    const bc = front ? bfCurve : bbCurve;
    let b = bc(yc);
    // two-lobed seat (back half only): deeper either side of the centre, a
    // shallow cleft on it. The depth varies smoothly with x, so the field
    // stays a (slightly conservative) distance — see the Lipschitz factor.
    let lip = 1;
    if (!front) {
      const g = glCurve(yc);
      if (g > 0.001) {
        b *= 1 + g * lobeShape(x / lobeA);
        lip = 1 + g * LOBE_LIP;
      }
    }
    let d2 = sdEllipse2(x, z - cz, Math.max(a, 1), Math.max(b, 1)) / lip;
    // The cross-section distance is horizontal; where the torso slopes (top of
    // the shoulders, under the seat) the true distance is shorter by cos(slope).
    // Correcting it keeps the field a true distance bound: safe for meshing,
    // smooth blends and collision normals.
    // (slope measured over ±12 mm so the correction varies slowly: a factor
    // that changes quickly with height would tilt the gradient — the surface
    // normals — wherever the torso field is far from zero, e.g. on the thighs)
    d2 *= slopeFactor(front ? slopeF : slopeB, yc);
    if (y < y0) { const dy = y0 - y; return d2 > 0 ? Math.hypot(d2, dy) : dy; }
    if (y > y1) { const dy = y - y1; return d2 > 0 ? Math.hypot(d2, dy) : dy; }
    return d2;
  }

  // Thighs are oval near the top — deeper front-to-back than across, as they
  // press together under the pelvis — rounding out by the knee. Done by
  // squeezing the leg's field across its own axis (same girth: an ellipse of
  // 1−e by 1+e has the circle's perimeter to within 0.5%). The distance is
  // scaled by the squeeze so it stays a safe bound.
  const kneeY = legPts[2].y, jointY = legPts[0].y;
  const thighTopY = d.crotchH + rig.crotchShift;
  function legD(xa, y, z) {
    if (y > legTop) return FAR;
    let px = xa, pz = z, k = 1;
    if (y > kneeY) {
      const t0 = Math.min(1, (y - kneeY) / Math.max(1, thighTopY - kneeY));
      const e = LEG_OVAL * t0 * t0 * (3 - 2 * t0);
      if (e > 0) {
        const ax = legSection(Math.min(y, jointY));
        px = ax.x + (xa - ax.x) / (1 - e);
        pz = ax.z + (z - ax.z) / (1 + e);
        k = 1 - e;
      }
    }
    let dist = FAR;
    for (let i = 0; i < legPts.length - 1; i++) {
      const p = legPts[i], q = legPts[i + 1];
      // (skip segments out of reach — but never the top one within the
      // torso blend's reach, or the skip would show as a seam)
      const reachUp = i === 0 ? K_FOLD + 10 : K_LEG;
      if (y > p.y + p.r + reachUp || y < q.y - q.r - K_LEG) continue;
      const s = sdRoundCone(px, y, pz, p.x, p.y, p.z, q.x, q.y, q.z, p.r, q.r) * k;
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
    // chain of round cones sharing end spheres: a plain union is already smooth
    let dist = FAR;
    for (let i = 0; i < arm.length - 1; i++) {
      const p = arm[i], q = arm[i + 1];
      const s = sdRoundCone(xa, y, z, p.x, p.y, p.z, q.x, q.y, q.z, p.r, q.r);
      if (s < dist) dist = s;
    }
    const w = arm[arm.length - 1];
    dist = smin(dist, sdRoundCone(xa, y, z, w.x, w.y, w.z, hand.x, hand.y, hand.z, hand.r0, hand.r1), 12);
    if (y > deltoid.y - deltoid.ry - K_DELT) {
      dist = smin(dist, sdEllipsoid(xa, y, z, deltoid.x, deltoid.y, deltoid.z, deltoid.rx, deltoid.ry, deltoid.rz), K_DELT);
    }
    return dist;
  }

  /** Arm ↔ torso blend: wide at the armpit (smooth axillary fold), tight below (the arm hangs free). */
  function armBlend(y) {
    const t = (y - (axillaY - 70)) / 80;
    const s = t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
    return K_ARM + (K_AXILLA - K_ARM) * s;
  }

  function headD(x, y, z) {
    if (y < neckA.y - neckA.r - 40) return FAR;
    const n = sdRoundCone(x, y, z, neckA.x, neckA.y, neckA.z, neckB.x, neckB.y, neckB.z, neckA.r, neckB.r);
    const h = smin(sdEllipsoid(x, y, z, 0, head.y, head.z, head.rx, head.ry, head.rz),
                   sdEllipsoid(x, y, z, 0, jaw.y, jaw.z, jaw.rx, jaw.ry, jaw.rz), 24);
    return { n, h };
  }

  /** Full body. `opts.arms = false` gives the body a tape measure goes round. */
  function sdf(x, y, z, opts) {
    const xa = x < 0 ? -x : x;
    let dist = y > y0 - 80 ? torso(x, y, z) : FAR;
    // (the legs are one leg mirrored, and |x| has a corner on the centre line
    // that the wide fold blend would carry into the back of the crotch, just
    // where the back seam lies: round it off within LEG_MID of the centre —
    // |x|·(2u − u²) is flat at 0, meets |x| smoothly at LEG_MID and never
    // exceeds it, so the saddle between the thighs stays exactly where it was)
    const u = xa / LEG_MID;
    const lg = legD(u < 1 ? xa * u * (2 - u) : xa, y, z);
    if (lg !== FAR) {
      // blend radius: the crotch's own at the centre and in front, growing
      // behind (from 45 mm behind the crotch to 120 mm) for the gluteal fold
      const t = (-45 - z) / 75, s = t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
      dist = dist === FAR ? lg : smin(dist, lg, K_CROTCH + (K_FOLD - K_CROTCH) * s);
    }
    if (!opts || opts.arms !== false) {
      const ar = armD(xa, y, z);
      if (ar !== FAR) dist = smin(dist, ar, armBlend(y));
    }
    const hd = headD(x, y, z);
    if (hd !== FAR) {
      dist = smin(dist, hd.n, K_NECK);
      // (opts.head = false: the neck without the chin — for taping the neck)
      if (!opts || opts.head !== false) dist = smin(dist, hd.h, K_HEAD);
    }
    return dist;
  }

  /** Torso cross-section at height y: ellipse semi-axes a (x), b (z), centre z. */
  function torsoSection(y) {
    const yc = y < y0 ? y0 : y > y1 ? y1 : y;
    // as one symmetric ellipse with the same front and back extents
    const bf = Math.max(bfCurve(yc), 1), bb = Math.max(bbCurve(yc), 1);
    // spineZ: where the section is widest (the spine's forward offset);
    // front = spineZ + bf, back = spineZ − bb
    return { a: Math.max(aCurve(yc), 1), b: (bf + bb) / 2, cz: czCurve(yc) + (bf - bb) / 2, spineZ: czCurve(yc), bf, bb };
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

  return { sdf, legPts, arm, hand, foot, head, neckA, neckB, torsoRange: [y0, y1], torsoSection, legSection };
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
  const noHead = (x, y, z) => c.sdf(x, y, z, { arms: false, head: false });

  const seatTarget = m.seat ?? m.hip + 20;
  const thighY = d.crotchH - 30;
  // neck girth: taped halfway between the nape and the top of the neck
  const neckY = d.napeH + 25;
  const measureAll = () => {
    const lvl = Object.fromEntries(rig.levels.filter(l => !l.fixed).map(l => [l.key, l]));
    return {
      chest: tapeGirth(noArms, lvl.chest.y, 0, lvl.chest.cz),
      waist: tapeGirth(noArms, lvl.waist.y, 0, lvl.waist.cz),
      hip:   tapeGirth(noArms, lvl.hip.y,   0, lvl.hip.cz),
      seat:  tapeGirth(noArms, lvl.seat.y,  0, lvl.seat.cz),
      upperThigh: tapeGirth(noArms, thighY, legCenterX(d, thighY), -4, { minX: 0 }),
      neck: tapeGirth(noHead, neckY, 0, -6),
    };
  };

  let girths = measureAll();
  let crotchY = findCrotchY(noArms, d.crotchH + 60, -8);
  if (calibrate) {
    const targets = { chest: m.chest, waist: m.waist, hip: m.hip, seat: seatTarget, upperThigh: m.upperThighGirth, neck: m.neckGirth };
    for (let iter = 0; iter < 14; iter++) {
      // crotch height: move the rounded torso bottom so waist→crotch = body rise
      rig.crotchShift += d.crotchH - crotchY;
      for (const l of rig.levels) if (!l.fixed) l.scale *= targets[l.key] / girths[l.key];
      rig.leg.thighScale *= targets.upperThigh / girths.upperThigh;
      rig.neckScale *= targets.neck / girths.neck;
      c = compile(rig);
      girths = measureAll();
      crotchY = findCrotchY(noArms, d.crotchH + 60, -8);
      const worst = Math.max(...Object.keys(targets).map(k => Math.abs(girths[k] / targets[k] - 1)));
      if (worst < 0.004 && Math.abs(crotchY - d.crotchH) < 1.5) break;
    }
  }

  // opts.arms = false: the body without arms (what a tape measure goes round)
  const sdf = (x, y, z, opts) => c.sdf(x, y, z, opts);
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
    // tailoring landmarks (mm): where the tape starts and ends on this body
    landmarks: {
      shoulderPoint: rig.shoulderPoint,
      napeH: d.napeH, neckY,
      arm: rig.arm.map(p => ({ ...p })),        // shoulder joint, bicep, elbow, forearm, wrist
      armDir: [rig.arm[4].x - rig.arm[0].x, rig.arm[4].y - rig.arm[0].y],
    },
    measurements: m, bodyType,
    lengths: legLengths(m),
  };
}

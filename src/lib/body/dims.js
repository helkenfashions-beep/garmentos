/**
 * Body dimensions — single source of truth for the 3D mannequin AND the
 * geometric drape engine. All values in mm, heights measured from the floor.
 *
 * Kept free of Three.js so it can be unit tested in Node.
 */

const TAU = 2 * Math.PI;

export function lerp(a, b, t) { return a + (b - a) * t; }

// Proportions of height used when a length has not been measured directly
export const WAIST_HEIGHT_RATIO = 0.615;
export const KNEE_HEIGHT_RATIO  = 0.286;
export const ANKLE_HEIGHT_RATIO = 0.054;
export const HIP_DEPTH_DEFAULT  = 200;   // natural waist → hip line, mm
export const NAPE_HEIGHT_RATIO  = 0.863; // back neck point (C7) — nearly constant with height
export const SLEEVE_RATIO       = 0.365; // shoulder point → wrist

// The torso is an oval, not a circle: wider side-to-side than front-to-back
// (same girth). A round torso makes the seat far too deep for any crotch curve.
export const TORSO_X = 1.12;
export const TORSO_Z = 0.87;

/**
 * Height of the natural waist above the floor.
 *   – a measured inseam (crotch → floor) fixes it: waist = inseam + body rise;
 *   – else a measured back waist length (nape → waist) does: the nape sits at
 *     a near-constant share of height, so a longer back means a lower waist;
 *   – else a proportion of height.
 */
export function waistHeight(m) {
  const H = m.height;
  if (m.inseam != null && m.bodyRise != null) return m.inseam + m.bodyRise;
  if (m.backWaistLength != null) {
    return Math.min(H * 0.70, Math.max(H * 0.52, H * NAPE_HEIGHT_RATIO - m.backWaistLength));
  }
  return H * WAIST_HEIGHT_RATIO;
}

/** Height of the nape (C7). Only moves off its proportion when both the
 *  inseam and the back waist length are measured (then waist + back length). */
export function napeHeight(m, waistH = waistHeight(m)) {
  if (m.inseam != null && m.backWaistLength != null) return waistH + m.backWaistLength;
  return m.height * NAPE_HEIGHT_RATIO;
}

/**
 * Vertical trouser lengths, measured down from the natural waist (mm).
 * ONE source for both the pattern block and the 3D body, so the knee and
 * hem lines on the pattern land on the knee and ankle of the mannequin.
 * A measured value always wins; otherwise it is derived from height.
 */
export function legLengths(m) {
  const H = m.height;
  const waistH = waistHeight(m);
  const hipDepth     = m.hipToWaist   ?? HIP_DEPTH_DEFAULT;
  const waistToKnee  = m.waistToKnee  ?? (waistH - H * KNEE_HEIGHT_RATIO);
  const waistToAnkle = m.waistToAnkle ?? (waistH - H * ANKLE_HEIGHT_RATIO);
  // inseam: crotch to floor (shown as the automatic value when not measured)
  const inseam       = m.inseam       ?? (waistH - (m.bodyRise ?? 0));
  return { hipDepth, waistToKnee, waistToAnkle, inseam };
}

/** Every length that is worked out when not measured — shown as hints. */
export function autoLengths(m) {
  const waistH = waistHeight(m);
  return {
    ...legLengths(m),
    backWaistLength: m.backWaistLength ?? (napeHeight(m, waistH) - waistH),
    sleeveLength:    m.sleeveLength    ?? m.height * SLEEVE_RATIO,
  };
}

// Upper-body proportions used when a length has not been measured directly
export const SHOULDER_SLOPE = 20 * Math.PI / 180;   // neck base → shoulder point
export const UPPER_ARM_FRACTION = 0.56;             // shoulder→elbow share of the sleeve length
export const NECK_BASE_WIDTH = 1.45;                // half-width at the side neck points, × neck radius
/** Bicep girth (the key was called upperArmGirth before; both are read). */
export const bicepGirthOf = (m) => m.bicepGirth ?? m.upperArmGirth ?? m.chest * 0.33;

export function deriveBodyDims(m) {
  const H = m.height;

  // Radii from girth measurements (girth = 2πr)
  const neckR     = m.neckGirth       / TAU;
  const chestR    = m.chest           / TAU;
  const waistR    = m.waist           / TAU;
  const hipR      = m.hip             / TAU;
  const seatR     = (m.seat ?? m.hip + 20) / TAU;
  const thighR    = m.upperThighGirth / TAU;
  const kneeR     = m.kneeGirth       / TAU;
  const calfR     = m.calfGirth       / TAU;
  const upperArmR = bicepGirthOf(m)   / TAU;     // bicep
  const wristR    = m.wristGirth      / TAU;
  const ankleR    = calfR * 0.66;

  const headR     = H * 0.065;
  const headCtrH  = H - headR;
  const neckTopH  = H - headR * 1.85;
  const waistH    = waistHeight(m);
  // The nape (C7) — see waistHeight/napeHeight for how the back waist length
  // and inseam place it; the shoulder points sit below it on a natural ~20°
  // shoulder slope. (Never above the top of the neck.)
  const napeH     = Math.min(neckTopH, Math.max(waistH + 200, napeHeight(m, waistH)));
  const neckBaseHalf = neckR * NECK_BASE_WIDTH;
  const shoulderH = napeH - Math.max(0, m.shoulderWidth / 2 - neckBaseHalf) * Math.tan(SHOULDER_SLOPE);
  const chestH    = lerp(waistH, shoulderH, 0.62);
  const L         = legLengths(m);
  const crotchH   = waistH - m.bodyRise;
  // hip, knee and ankle follow the trouser measurements (kept in a sane order)
  const hipH      = Math.max(crotchH + 40, waistH - L.hipDepth);
  const seatH     = lerp(hipH, crotchH, 0.35);
  const kneeH     = Math.min(crotchH - 100, Math.max(H * 0.18, waistH - L.waistToKnee));
  const ankleH    = Math.min(kneeH - 150, Math.max(20, waistH - L.waistToAnkle));
  const calfH     = lerp(ankleH, kneeH, 0.54);
  // Sleeve length (shoulder point → wrist, arm hanging) sets elbow and wrist.
  // Heights here assume the arm hangs ~10° out; body.js lays the exact lengths
  // along the arm it builds.
  const sleeve    = m.sleeveLength ?? H * SLEEVE_RATIO;
  const armCos    = Math.cos(10 * Math.PI / 180);
  const elbowH    = shoulderH - sleeve * UPPER_ARM_FRACTION * armCos;
  const wristH    = shoulderH - sleeve * armCos;

  // thighs sit side by side with a small gap below the crotch (like a CLO
  // avatar); the crotch itself is a rounded saddle blended over the gap
  // (the thigh tops are oval, 7% narrower across than round — see body.js)
  const legSpacing = Math.max(hipR * 0.40, thighR * 1.06 * 0.93);
  // Legs splay 5° from the crotch (feet apart, like a CLO avatar's stance) so
  // the knees and hems of a trouser leg never press flat against each other.
  const legSplay   = 5 * Math.PI / 180;
  const armSpacing = m.shoulderWidth / 2;

  return {
    H, headR, headCtrH, neckTopH, napeH, shoulderH, chestH, sleeve,
    waistH, hipH, seatH, crotchH, kneeH, calfH, ankleH, elbowH, wristH,
    neckR, chestR, waistR, hipR, seatR, thighR, kneeR, calfR, ankleR,
    upperArmR, wristR, legSpacing, armSpacing, legSplay,
  };
}

/** x of the (right) leg axis at height Y — mirror for the left leg. */
export function legCenterX(d, Y) {
  return d.legSpacing + Math.max(0, d.crotchH - Y) * Math.tan(d.legSplay ?? 0);
}

/** Torso lathe profile, bottom → top, as [radius, height] pairs. */
export function torsoProfile(d) {
  // rounded bottom: the torso closes to a point at the crotch (perineum),
  // so fabric can pass under it smoothly instead of meeting a flat disc
  const cap = Math.min(25, (d.seatH - d.crotchH) * 0.6);
  return [
    [0.5,                                d.crotchH],
    [d.thighR * 0.45,                    d.crotchH + cap * 0.32],
    [d.thighR * 0.70,                    d.crotchH + cap],
    [d.seatR,                            d.seatH],
    [d.hipR,                             d.hipH],
    [lerp(d.hipR, d.waistR, 0.35),       lerp(d.hipH, d.waistH, 0.35)],
    [d.waistR,                           d.waistH],
    [lerp(d.waistR, d.chestR, 0.30),     lerp(d.waistH, d.chestH, 0.30)],
    [lerp(d.waistR, d.chestR, 0.65),     lerp(d.waistH, d.chestH, 0.65)],
    [d.chestR,                           d.chestH],
    [lerp(d.chestR, d.armSpacing * 0.82, 0.5), lerp(d.chestH, d.shoulderH, 0.5)],
    [d.armSpacing * 0.82,                d.shoulderH],
    [lerp(d.armSpacing * 0.82, d.neckR * 1.5, 0.5), lerp(d.shoulderH, d.neckTopH, 0.3)],
    [d.neckR * 1.5,                      lerp(d.shoulderH, d.neckTopH, 0.55)],
    [d.neckR * 1.15,                     lerp(d.shoulderH, d.neckTopH, 0.75)],
    [d.neckR,                            d.neckTopH],
  ];
}

/** Leg lathe profile (one leg, centred on its own axis), bottom → top. */
export function legProfile(d) {
  return [
    [d.ankleR * 0.90,                    d.ankleH],
    [d.ankleR * 1.18,                    d.ankleH + 45],
    [d.calfR  * 0.82,                    lerp(d.ankleH, d.kneeH, 0.35)],
    [d.calfR,                            d.calfH],
    [d.calfR  * 0.86,                    lerp(d.calfH, d.kneeH, 0.55)],
    [d.kneeR  * 0.90,                    d.kneeH - 35],
    [d.kneeR  * 1.06,                    d.kneeH],
    [d.kneeR  * 0.94,                    d.kneeH + 35],
    [lerp(d.kneeR, d.thighR, 0.35),      lerp(d.kneeH, d.crotchH, 0.35)],
    [lerp(d.kneeR, d.thighR, 0.70),      lerp(d.kneeH, d.crotchH, 0.70)],
    [d.thighR * 1.02,                    lerp(d.kneeH, d.crotchH, 0.86)],
    [d.thighR,                           d.crotchH],
  ];
}

/** Piecewise-linear radius lookup on a [r, h] profile. Outside range → nearest end. */
export function radiusAt(profile, h) {
  if (h <= profile[0][1]) return profile[0][0];
  for (let i = 1; i < profile.length; i++) {
    const [r1, h1] = profile[i];
    if (h <= h1) {
      const [r0, h0] = profile[i - 1];
      const t = (h - h0) / ((h1 - h0) || 1);
      return lerp(r0, r1, t);
    }
  }
  return profile[profile.length - 1][0];
}

/** Scale adult measurements for child bodies (same proportions, shorter). */
export function bodyMeasurementsFor(measurements, bodyType) {
  return bodyType?.includes('child')
    ? { ...measurements, height: measurements.height * 0.64 }
    : measurements;
}

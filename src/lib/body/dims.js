/**
 * Body dimensions — single source of truth for the 3D mannequin AND the
 * geometric drape engine. All values in mm, heights measured from the floor.
 *
 * Kept free of Three.js so it can be unit tested in Node.
 */

const TAU = 2 * Math.PI;

export function lerp(a, b, t) { return a + (b - a) * t; }

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
  const upperArmR = m.upperArmGirth   / TAU;
  const wristR    = m.wristGirth      / TAU;
  const ankleR    = calfR * 0.66;

  const headR     = H * 0.065;
  const headCtrH  = H - headR;
  const neckTopH  = H - headR * 1.85;
  const shoulderH = H * 0.844;
  const chestH    = H * 0.756;
  const waistH    = H * 0.615;
  const hipH      = waistH - 190;
  const seatH     = hipH  - 50;
  const crotchH   = waistH - m.bodyRise;
  const kneeH     = H * 0.286;
  const calfH     = H * 0.18;
  const ankleH    = H * 0.054;
  const elbowH    = H * 0.630;
  const wristH    = H * 0.420;

  const legSpacing = hipR * 0.40;
  const armSpacing = m.shoulderWidth / 2;

  return {
    H, headR, headCtrH, neckTopH, shoulderH, chestH,
    waistH, hipH, seatH, crotchH, kneeH, calfH, ankleH, elbowH, wristH,
    neckR, chestR, waistR, hipR, seatR, thighR, kneeR, calfR, ankleR,
    upperArmR, wristR, legSpacing, armSpacing,
  };
}

/** Torso lathe profile, bottom → top, as [radius, height] pairs. */
export function torsoProfile(d) {
  return [
    [d.thighR * 0.70,                    d.crotchH],
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

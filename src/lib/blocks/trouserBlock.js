/**
 * Trouser Block Engine — Winifred Aldrich system (Metric Pattern Cutting)
 * All coordinates in mm. Origin = top-left of block bounding box.
 * Y-axis: positive downward (SVG convention, matches PatternCanvas).
 *
 * Construction sequence follows Aldrich strictly:
 *   1. Crease line (vertical centre of leg)
 *   2. Horizontal construction lines (waist → hip1 → hip2 → rise → knee → ankle)
 *   3. Front panel (left of crease) with fly bezier and dart
 *   4. Back panel (right overlay) with seat bezier and two darts
 *
 * The crotch curve is ALWAYS a bezier — never a simple arc.
 * Upper thigh is used directly for crotch extension — never derived from hip.
 */

// ─── ID helpers ──────────────────────────────────────────────────────────────
let _idCounter = 0;
function pid() { return 'bp_' + (++_idCounter); }
function sid() { return 'bs_' + (++_idCounter); }

// ─── Ease table by garment type ───────────────────────────────────────────────
export const EASE_PRESETS = {
  trouser: { thighEase: 100, seatEase: 40, waistEase: 20, label: 'Trouser (formal)' },
  slack:   { thighEase:  65, seatEase: 30, waistEase: 15, label: 'Slacks'           },
  jeans:   { thighEase:  30, seatEase: 20, waistEase: 10, label: 'Jeans'            },
};

// ─── Pure math helpers ────────────────────────────────────────────────────────
function pt(id, x, y) { return { id, x, y }; }

function lineSeg(id, p1, p2) {
  return { id, type: 'line', p1: p1.id, p2: p2.id };
}

function bezierSeg(id, p1, p2, c1, c2) {
  // c1, c2 are absolute {x,y} control point positions
  return { id, type: 'bezier', p1: p1.id, p2: p2.id, c1, c2 };
}

// ─── Main generator ───────────────────────────────────────────────────────────
/**
 * @param {object} m  measurements object (all values in mm)
 * @param {string} garmentType  'trouser' | 'slack' | 'jeans'
 * @returns {{ points: object, segments: object, constructionLines: array }}
 */
export function generateTrouserBlock(m, garmentType = 'trouser') {
  _idCounter = 0; // reset so IDs are deterministic per generation

  const ease = EASE_PRESETS[garmentType] ?? EASE_PRESETS.trouser;

  // ── Measurements ────────────────────────────────────────────────────────────
  const WC   = m.waist;             // waist circumference mm
  const HC   = m.hip;               // hip circumference mm
  const SEAT = m.seat ?? HC + 20;   // seat circumference mm
  const BR   = m.bodyRise;          // body rise (waist to crotch when sitting) mm
  const UTG  = m.upperThighGirth;   // upper thigh girth mm — used directly
  const KG   = m.kneeGirth;         // knee girth mm
  const WTK  = m.waistToKnee  ?? (m.height * 0.415); // waist to knee
  const WTA  = m.waistToAnkle ?? (m.height * 0.623); // waist to ankle
  const H2W  = m.hipToWaist   ?? 200; // hip1 distance below waist

  // ── Horizontal levels (Y values, positive downward) ─────────────────────────
  const Y_WAIST = 0;
  const Y_HIP1  = H2W * 0.5;           // first hip reference (~100mm below waist)
  const Y_HIP2  = H2W;                 // main hip line
  const Y_RISE  = BR;                  // body rise line (crotch level)
  const Y_KNEE  = WTK;
  const Y_ANKLE = WTA;

  // ── Width calculations ───────────────────────────────────────────────────────
  // All widths are HALF-widths (one panel = half the body front or back)

  // Front panel widths
  const frontWaistHalf = WC / 4 + 20;          // 1/4 WC + 2cm
  const frontHipHalf   = HC / 4 + ease.waistEase;
  const frontSeatHalf  = SEAT / 4 + ease.seatEase;

  // Crotch fork — using upper thigh directly (Aldrich + East African calibration)
  const crotchFork = UTG / 4 - frontSeatHalf;   // extension beyond seat half-width
  const crotchForkMin = SEAT / 16;               // minimum fork = 1/16 seat
  const frontFork = Math.max(crotchFork, crotchForkMin);

  // Knee and hem widths (half each side of crease)
  const kneeHalf = (KG + ease.thighEase * 0.4) / 2;
  const hemHalf  = (WC / 10 + 130) / 2;         // 0.125 × waist(cm) + 13cm → mm

  // Back panel widens over front
  const backWaistHalf = WC / 4 + 50;            // 1/4 WC + 5cm
  const backSeatHalf  = SEAT / 4 + 50;          // 1/4 seat + 5cm
  const backFork      = frontFork * 1.6;        // back fork is wider than front

  // ── X origin — crease line at X=0, front panel is to the LEFT (neg X) ───────
  // We'll use positive coords only: crease line at X = backFork + backSeatHalf
  // so everything fits on screen. Then offset whole block right by MARGIN.
  const MARGIN = 50;
  const creaseX = MARGIN + backFork + backSeatHalf + 20;

  // ── Helper: absolute X relative to crease ────────────────────────────────────
  function cx(offset) { return creaseX + offset; } // positive = right (back side)
  function y(level)   { return MARGIN + level;    }

  const points   = {};
  const segments = {};

  function addPt(p)  { points[p.id]   = p; return p; }
  function addSeg(s) { segments[s.id] = s; return s; }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONSTRUCTION LINES (rendered as dashed — stored with label metadata)
  // ═══════════════════════════════════════════════════════════════════════════

  // Crease line — full length
  const cl_top    = addPt(pt(pid(), cx(0), y(Y_WAIST - 20)));
  const cl_bottom = addPt(pt(pid(), cx(0), y(Y_ANKLE + 20)));
  const creaseSeg = addSeg({ ...lineSeg(sid(), cl_top, cl_bottom), construction: true, label: 'Crease' });

  // Horizontal construction lines (full width)
  const guideLines = [
    { name: 'Waist', yLevel: Y_WAIST },
    { name: 'Hip 1', yLevel: Y_HIP1  },
    { name: 'Hip 2', yLevel: Y_HIP2  },
    { name: 'Rise',  yLevel: Y_RISE  },
    { name: 'Knee',  yLevel: Y_KNEE  },
    { name: 'Ankle', yLevel: Y_ANKLE },
  ];

  const guideWidth = backFork + backSeatHalf + frontFork + frontSeatHalf + 40;
  for (const g of guideLines) {
    const gL = addPt(pt(pid(), cx(-(frontSeatHalf + frontFork + 20)), y(g.yLevel)));
    const gR = addPt(pt(pid(), cx(backSeatHalf + backFork + 20),       y(g.yLevel)));
    addSeg({ ...lineSeg(sid(), gL, gR), construction: true, label: g.name });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FRONT PANEL
  // ═══════════════════════════════════════════════════════════════════════════

  // Front waist points
  // Centre front waist: slightly left of crease (dart offset)
  const fCF_waist = addPt(pt(pid(), cx(-10),               y(Y_WAIST)));      // CF at waist
  const fSide_waist = addPt(pt(pid(), cx(-frontWaistHalf), y(Y_WAIST)));      // side seam at waist

  // Front hip / seat
  const fCF_hip  = addPt(pt(pid(), cx(-10),              y(Y_HIP2)));
  const fSide_hip = addPt(pt(pid(), cx(-frontHipHalf),   y(Y_HIP2)));

  // Rise line — crotch fork extends TOWARD front (negative X)
  const fFork    = addPt(pt(pid(), cx(-(frontSeatHalf + frontFork)), y(Y_RISE)));
  const fSide_rise = addPt(pt(pid(), cx(-frontSeatHalf),             y(Y_RISE)));

  // Knee
  const fSide_knee = addPt(pt(pid(), cx(-kneeHalf), y(Y_KNEE)));
  const fInner_knee = addPt(pt(pid(), cx(kneeHalf * 0.3), y(Y_KNEE)));

  // Hem
  const fSide_hem  = addPt(pt(pid(), cx(-hemHalf), y(Y_ANKLE)));
  const fInner_hem = addPt(pt(pid(), cx(hemHalf),  y(Y_ANKLE)));

  // ── Front waist line ──────────────────────────────────────────────────────
  addSeg(lineSeg(sid(), fSide_waist, fCF_waist));

  // ── Front side seam: waist → hip → rise → knee → hem ────────────────────
  addSeg(lineSeg(sid(), fSide_waist, fSide_hip));
  addSeg(lineSeg(sid(), fSide_hip,   fSide_rise));
  addSeg(lineSeg(sid(), fSide_rise,  fSide_knee));
  addSeg(lineSeg(sid(), fSide_knee,  fSide_hem));

  // ── Front hem line ────────────────────────────────────────────────────────
  addSeg(lineSeg(sid(), fSide_hem, fInner_hem));

  // ── Front inseam: hem → knee → rise ──────────────────────────────────────
  addSeg(lineSeg(sid(), fInner_hem, fInner_knee));
  addSeg(lineSeg(sid(), fInner_knee, fFork));

  // ── Front fly bezier curve (CF seam: fork → waist) ───────────────────────
  // The fly curve departs at ~45° from the fork, curves smoothly to the CF waist
  // Control point 1: directly above fork, bringing it vertical
  // Control point 2: below CF waist, coming in horizontally
  const flyC1 = { x: cx(-10), y: y(Y_RISE) };               // vertical rise above fork
  const flyC2 = { x: cx(-10), y: y(Y_WAIST + (Y_RISE - Y_WAIST) * 0.25) }; // approach from below
  addSeg(bezierSeg(sid(), fFork, fCF_waist, flyC1, flyC2));

  // ── Front dart ───────────────────────────────────────────────────────────
  // Dart at 1/16 WC from CF, 10cm long, 2cm wide
  const dartOffset = WC / 16;
  const dartX      = cx(-(10 + dartOffset));                 // negative = front side
  const dL = addPt(pt(pid(), dartX - 10, y(Y_WAIST)));      // dart left leg
  const dR = addPt(pt(pid(), dartX + 10, y(Y_WAIST)));      // dart right leg
  const dTip = addPt(pt(pid(), dartX,    y(Y_WAIST + 100))); // dart tip 10cm down
  addSeg(lineSeg(sid(), dL, dTip));
  addSeg(lineSeg(sid(), dR, dTip));

  // ═══════════════════════════════════════════════════════════════════════════
  // BACK PANEL
  // ═══════════════════════════════════════════════════════════════════════════

  // Back waist points — back sits slightly higher at CB (back waist angle)
  const bCB_waist  = addPt(pt(pid(), cx(10),              y(Y_WAIST - 15)));  // CB raised 15mm
  const bSide_waist = addPt(pt(pid(), cx(backWaistHalf),  y(Y_WAIST)));

  // Back hip / seat
  const bCB_hip    = addPt(pt(pid(), cx(10),              y(Y_HIP2)));
  const bSide_hip  = addPt(pt(pid(), cx(backSeatHalf),    y(Y_HIP2)));

  // Back rise — fork extends RIGHT (positive X toward back)
  const bFork      = addPt(pt(pid(), cx(backSeatHalf + backFork), y(Y_RISE)));
  const bSide_rise = addPt(pt(pid(), cx(backSeatHalf),            y(Y_RISE)));

  // Back knee and hem (slightly wider than front)
  const bSide_knee  = addPt(pt(pid(), cx(backWaistHalf * 0.75),  y(Y_KNEE)));
  const bInner_knee = addPt(pt(pid(), cx(-kneeHalf * 0.35),       y(Y_KNEE)));
  const bSide_hem   = addPt(pt(pid(), cx(hemHalf + 10),           y(Y_ANKLE)));
  const bInner_hem  = addPt(pt(pid(), cx(-(hemHalf + 10)),        y(Y_ANKLE)));

  // ── Back waist line ───────────────────────────────────────────────────────
  addSeg(lineSeg(sid(), bSide_waist, bCB_waist));

  // ── Back side seam ────────────────────────────────────────────────────────
  addSeg(lineSeg(sid(), bSide_waist, bSide_hip));
  addSeg(lineSeg(sid(), bSide_hip,   bSide_rise));
  addSeg(lineSeg(sid(), bSide_rise,  bSide_knee));
  addSeg(lineSeg(sid(), bSide_knee,  bSide_hem));

  // ── Back hem line ─────────────────────────────────────────────────────────
  addSeg(lineSeg(sid(), bSide_hem, bInner_hem));

  // ── Back inseam ───────────────────────────────────────────────────────────
  addSeg(lineSeg(sid(), bInner_hem, bInner_knee));
  addSeg(lineSeg(sid(), bInner_knee, bFork));

  // ── Back seat bezier curve (CB seam: fork → CB waist) ────────────────────
  // Deep dramatic curve for buttocks accommodation.
  // Must not deviate more than 15mm from the CB vertical in the upper portion.
  // Departs from fork at near-horizontal, sweeps up to CB waist.
  const seatC1 = { x: cx(backSeatHalf + backFork * 0.5), y: y(Y_HIP2 + 30) }; // sweeping up through hip
  const seatC2 = { x: cx(10 + 30), y: y(Y_WAIST + (Y_RISE - Y_WAIST) * 0.3) }; // approaches CB from right
  addSeg(bezierSeg(sid(), bFork, bCB_waist, seatC1, seatC2));

  // ── Back darts ───────────────────────────────────────────────────────────
  // Dart 1: 12cm long, 2cm wide, at 1/3 back waist from CB
  const bd1X   = cx(10 + backWaistHalf / 3);
  const bd1L   = addPt(pt(pid(), bd1X - 10, y(Y_WAIST)));
  const bd1R   = addPt(pt(pid(), bd1X + 10, y(Y_WAIST)));
  const bd1Tip = addPt(pt(pid(), bd1X,      y(Y_WAIST + 120)));
  addSeg(lineSeg(sid(), bd1L, bd1Tip));
  addSeg(lineSeg(sid(), bd1R, bd1Tip));

  // Dart 2: 10cm long, at 2/3 back waist from CB
  const bd2X   = cx(10 + (backWaistHalf * 2) / 3);
  const bd2L   = addPt(pt(pid(), bd2X - 8, y(Y_WAIST)));
  const bd2R   = addPt(pt(pid(), bd2X + 8, y(Y_WAIST)));
  const bd2Tip = addPt(pt(pid(), bd2X,     y(Y_WAIST + 100)));
  addSeg(lineSeg(sid(), bd2L, bd2Tip));
  addSeg(lineSeg(sid(), bd2R, bd2Tip));

  return { points, segments };
}

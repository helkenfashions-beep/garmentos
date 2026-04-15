/**
 * Trouser Block Engine — Winifred Aldrich system (Metric Pattern Cutting)
 * All coordinates in mm. Y-axis positive downward (SVG convention).
 *
 * Layout: two separate panels side by side.
 *   LEFT  = Front panel  (side seam on left, fly/CF on right)
 *   RIGHT = Back panel   (CB/seat seam on left, side seam on right)
 *
 * Each panel is drawn as a standalone closed outline.
 * Crotch curves are ALWAYS bezier — never simple arcs.
 * Upper thigh drives crotch fork directly.
 */

// ─── ID helpers ──────────────────────────────────────────────────────────────
let _id = 0;
function pid() { return 'bp_' + (++_id); }
function sid() { return 'bs_' + (++_id); }
function pt(x, y)           { const id = pid(); return { id, x, y }; }
function line(p1, p2)       { return { id: sid(), type: 'line',   p1: p1.id, p2: p2.id }; }
function bez(p1, p2, c1, c2){ return { id: sid(), type: 'bezier', p1: p1.id, p2: p2.id, c1, c2 }; }

// ─── Ease presets ─────────────────────────────────────────────────────────────
export const EASE_PRESETS = {
  trouser: { seat: 40, waist: 20, label: 'Trouser (formal)' },
  slack:   { seat: 30, waist: 15, label: 'Slacks'           },
  jeans:   { seat: 20, waist: 10, label: 'Jeans'            },
};

// ─── Main generator ───────────────────────────────────────────────────────────
export function generateTrouserBlock(m, garmentType = 'trouser') {
  _id = 0;
  const ease = EASE_PRESETS[garmentType] ?? EASE_PRESETS.trouser;

  // ── Body measurements (all mm) ─────────────────────────────────────────────
  const WC   = m.waist;
  const HC   = m.hip;
  const SEAT = m.seat  ?? (HC + 20);
  const BR   = m.bodyRise;
  const UTG  = m.upperThighGirth;
  const KG   = m.kneeGirth;
  const WTK  = m.waistToKnee  ?? (m.height * 0.415);
  const WTA  = m.waistToAnkle ?? (m.height * 0.623);
  const H2W  = m.hipToWaist   ?? 200;

  // ── Horizontal guide levels (Y, 0 = waist) ────────────────────────────────
  const MG  = 60;                     // canvas margin
  const yw  = MG;                     // waist
  const yh1 = MG + H2W * 0.4;        // hip guide 1
  const yh2 = MG + H2W;              // hip guide 2 (main hip line)
  const yr  = MG + BR;               // body rise (crotch level)
  const yk  = MG + WTK;              // knee
  const ya  = MG + WTA;              // ankle / hem

  // ── Panel width calculations ──────────────────────────────────────────────
  // FRONT panel (Aldrich metric):
  //   waist  = WC/4 + 2cm
  //   hip    = HC/4 + ease
  //   seat   = SEAT/4 + ease  (side seam reference at rise level)
  //   fork   = max(SEAT/16, UTG-based) — crotch extension, used directly
  const fWaistW = WC / 4 + 20;
  const fHipW   = HC / 4 + ease.waist;
  const fSeatW  = SEAT / 4 + ease.seat;
  const fFork   = Math.max(SEAT / 16, (UTG - SEAT * 0.5) / 4);

  // BACK panel (Aldrich metric):
  //   waist  = WC/4 + 5cm  (wider than front for seat accommodation)
  //   seat   = SEAT/4 + 5cm
  //   fork   = 1.6× front fork (back requires more crotch room)
  const bWaistW = WC / 4 + 50;
  const bSeatW  = SEAT / 4 + 50;
  const bFork   = fFork * 1.6;

  // Hem (Aldrich: 0.125 × waist_cm + 13cm → in mm: 0.125 × WC + 130)
  const hemTotal  = 0.125 * WC + 130;
  const hemHalf   = hemTotal / 2;

  // Knee — each panel contributes half the knee circumference + ease
  const fKneeHalf = KG / 4 + 15;     // front half-width each side of crease
  const bKneeHalf = KG / 4 + 20;     // back slightly wider

  // ════════════════════════════════════════════════════════════════════════════
  // FRONT PANEL
  //
  // Reference: crease line at X = cFx
  //   cFx = MG + fSeatW   → so the outermost side-seam point is at X = MG
  //
  // At each level, outer = cFx − OUTER_HALF,  inner = cFx + INNER_HALF
  //
  //   Waist:  outer = side seam   → OUTER_HALF = fWaistW − 10mm (CF sits 10mm right of crease)
  //           inner = CF/fly      → INNER_HALF = 10mm
  //   Hip:    outer = fHipW from crease
  //           inner = 0 (inner edge tracks the crease down to rise)
  //   Rise:   outer = fSeatW from crease   (= MG, left edge)
  //           inner = fFork past crease     (fork extends right)
  //   Knee:   ±fKneeHalf (symmetric around crease)
  //   Ankle:  ±hemHalf   (symmetric around crease)
  // ════════════════════════════════════════════════════════════════════════════

  const cFx = MG + fSeatW;           // front crease X

  // Waist
  const cfWX  = cFx + 10;             // CF at waist (10mm right of crease)
  const fswX  = cfWX - fWaistW;       // side seam at waist

  // Hip
  const fshX  = cFx - fHipW;          // side seam at hip

  // Rise
  const fsrX  = MG;                   // side seam at rise = MG (left edge of panel)
  const ffkX  = cFx + fFork;          // fork point (right of crease)

  // Knee
  const fokX  = cFx - fKneeHalf;      // outer knee
  const fikX  = cFx + fKneeHalf;      // inner knee

  // Ankle
  const foaX  = cFx - hemHalf;        // outer ankle
  const fiaX  = cFx + hemHalf;        // inner ankle

  const points   = {};
  const segments = {};
  function add(p)  { points[p.id]   = p; return p; }
  function seg(s)  { segments[s.id] = s; return s; }

  // Front panel points
  const fSW = add(pt(fswX,  yw));    // side seam waist
  const fCW = add(pt(cfWX,  yw));    // CF waist
  const fSH = add(pt(fshX,  yh2));   // side seam hip
  const fSR = add(pt(fsrX,  yr));    // side seam rise
  const fFK = add(pt(ffkX,  yr));    // fork
  const fOK = add(pt(fokX,  yk));    // outer knee (side seam)
  const fIK = add(pt(fikX,  yk));    // inner knee (inseam)
  const fOA = add(pt(foaX,  ya));    // outer ankle
  const fIA = add(pt(fiaX,  ya));    // inner ankle

  // Front outline segments
  seg(line(fSW, fCW));               // top: waist line (side → CF)
  seg(line(fSW, fSH));               // left: side seam waist → hip
  seg(line(fSH, fSR));               // left: side seam hip → rise
  seg(line(fSR, fOK));               // left: side seam rise → knee
  seg(line(fOK, fOA));               // left: side seam knee → ankle
  seg(line(fOA, fIA));               // bottom: hem (outer → inner)
  seg(line(fIA, fIK));               // right: inseam ankle → knee
  seg(line(fIK, fFK));               // right: inseam knee → fork

  // Fly bezier: fork → CF waist (right side of front panel, crotch seam)
  // Exits fork going STRAIGHT UP, curves LEFT to arrive at CF waist from below-right
  const flyC1 = { x: ffkX,      y: yr - (yr - yw) * 0.55 };   // above fork, same X
  const flyC2 = { x: cfWX + 35, y: yw + (yr - yw) * 0.18 };   // right-below CF waist
  seg(bez(fFK, fCW, flyC1, flyC2));

  // Front dart: 2cm wide × 10cm deep, at WC/16 from CF
  const fdX = cfWX - WC / 16;
  const fdL = add(pt(fdX - 10, yw));
  const fdR = add(pt(fdX + 10, yw));
  const fdT = add(pt(fdX,      yw + 100));
  seg(line(fdL, fdT));
  seg(line(fdR, fdT));

  // ════════════════════════════════════════════════════════════════════════════
  // BACK PANEL
  //
  // Placed to the RIGHT of front panel with a GAP.
  // Reference: back crease at X = cBx
  //   cBx = bStartX + bSeatW
  //
  //   Waist:  CB = 10mm LEFT of crease, raised 15mm  → back waist tilts toward CB
  //           side seam = CB + bWaistW to the RIGHT
  //   Hip:    CB ≈ crease; side seam = crease + bSeatW
  //   Rise:   side seam = crease + bSeatW (same as hip)
  //           fork = crease − bFork (extends LEFT, toward front panel)
  //   Knee:   ±bKneeHalf (inner = left, outer = right)
  //   Ankle:  inner = crease − (hemHalf+10);  outer = crease + (hemHalf+10)
  // ════════════════════════════════════════════════════════════════════════════

  const GAP       = 70;
  const fPanelW   = fSeatW + fFork + 10;   // bounding width of front panel
  const bStartX   = MG + fPanelW + GAP;
  const cBx       = bStartX + bSeatW;      // back crease X

  // CB and side seam at waist
  const cbWX  = cBx - 10;
  const cbWY  = yw - 15;             // CB raised 15mm relative to side waist
  const bswX  = cbWX + bWaistW;      // side seam at waist (CB + back waist total)

  // Hip
  const bshX  = cBx + bSeatW;       // side seam at hip ≈ same as rise

  // Rise
  const bsrX  = cBx + bSeatW;       // side seam at rise
  const bfkX  = cBx - bFork;        // fork (extends LEFT of crease)

  // Knee
  const bokX  = cBx + bKneeHalf;    // outer knee (side seam side)
  const bikX  = cBx - bKneeHalf;    // inner knee (inseam side)

  // Ankle
  const boaX  = cBx + hemHalf + 10;
  const biaX  = cBx - hemHalf - 10;

  // Back panel points
  const bCW = add(pt(cbWX,  cbWY));  // CB waist (raised)
  const bSW = add(pt(bswX,  yw));    // side seam waist
  const bSH = add(pt(bshX,  yh2));   // side seam hip
  const bSR = add(pt(bsrX,  yr));    // side seam rise
  const bFK = add(pt(bfkX,  yr));    // fork
  const bOK = add(pt(bokX,  yk));    // outer knee
  const bIK = add(pt(bikX,  yk));    // inner knee
  const bOA = add(pt(boaX,  ya));    // outer ankle
  const bIA = add(pt(biaX,  ya));    // inner ankle

  // Back outline segments
  seg(line(bCW, bSW));               // top: waist line (CB → side)
  seg(line(bSW, bSH));               // right: side seam waist → hip
  seg(line(bSH, bSR));               // right: side seam hip → rise
  seg(line(bSR, bOK));               // right: side seam rise → knee
  seg(line(bOK, bOA));               // right: side seam knee → ankle
  seg(line(bOA, bIA));               // bottom: hem
  seg(line(bIA, bIK));               // left: inseam ankle → knee
  seg(line(bIK, bFK));               // left: inseam knee → fork

  // Seat bezier: fork → CB waist (left side of back panel, crotch seam)
  // Deep dramatic curve for buttocks accommodation.
  // Exits fork going UPWARD-RIGHT, sweeps to arrive at CB from below.
  const seatC1 = { x: bfkX + (cBx - bfkX) * 0.35, y: yr - (yr - yw) * 0.5  };  // up-right from fork
  const seatC2 = { x: cbWX + 45,                   y: cbWY + (yr - cbWY) * 0.22 }; // below-right of CB
  seg(bez(bFK, bCW, seatC1, seatC2));

  // Back dart 1: 12cm deep × 2cm wide, at 1/3 across back waist from CB
  const bwLen = bswX - cbWX;        // total back waist length
  const bd1X  = cbWX + bwLen / 3;
  const bd1L  = add(pt(bd1X - 10, yw));
  const bd1R  = add(pt(bd1X + 10, yw));
  const bd1T  = add(pt(bd1X,      yw + 120));
  seg(line(bd1L, bd1T));
  seg(line(bd1R, bd1T));

  // Back dart 2: 10cm deep × 1.6cm wide, at 2/3 across back waist
  const bd2X  = cbWX + (bwLen * 2) / 3;
  const bd2L  = add(pt(bd2X - 8, yw));
  const bd2R  = add(pt(bd2X + 8, yw));
  const bd2T  = add(pt(bd2X,     yw + 100));
  seg(line(bd2L, bd2T));
  seg(line(bd2R, bd2T));

  // ── Horizontal construction guide lines (span both panels) ─────────────────
  const gx1 = MG - 20;
  const gx2 = boaX + 20;
  for (const [label, yLevel] of [
    ['Waist', yw], ['Hip 1', yh1], ['Hip 2', yh2],
    ['Rise',  yr], ['Knee',  yk],  ['Ankle',  ya],
  ]) {
    const gL = add(pt(gx1, yLevel));
    const gR = add(pt(gx2, yLevel));
    const gs  = { ...line(gL, gR), construction: true, label };
    segments[gs.id] = gs;
  }

  return { points, segments };
}

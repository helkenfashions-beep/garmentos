/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  LOCKED STANDARD — classic Aldrich trouser block, approved by Benson     ║
 * ║  27 Sep 2026 ("3 is the most accurate … use 3 as the standard").         ║
 * ║                                                                          ║
 * ║  The shape is guarded by trouserBlock.test.js (drafting rules) and a     ║
 * ║  geometry snapshot. Changing the draft makes those tests fail on         ║
 * ║  purpose. Only update the snapshot (vitest -u) after the new shape has   ║
 * ║  been approved by the pattern maker.                                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Trouser Block Engine — Winifred Aldrich system (Metric Pattern Cutting)
 * All coordinates in mm. Y-axis positive downward (SVG convention).
 *
 * Classic layout: each panel is drafted around its own CREASE LINE, and the
 * crease sits halfway between the side seam and the fork tip at crotch level.
 * Knee and hem are split evenly either side of the crease, so the leg hangs
 * straight from the crotch.
 *
 *   LEFT  = Front panel  (side seam on left, CF/fly and fork on right)
 *   RIGHT = Back panel   (fork and CB/seat seam on left, side seam on right)
 *
 * Crotch curves are ALWAYS bezier. Upper thigh drives the crotch fork.
 * Hip→knee side seam is a French-curve S-curve that flips at
 *   flipY = hip line + (hip to knee length) / 2
 * Knee→hem is ruled straight. Inseam fork→knee is hollowed 1 cm.
 */

import { legLengths } from '../body/dims.js';

// ─── ID helpers ──────────────────────────────────────────────────────────────
let _id = 0;
function pid() { return 'bp_' + (++_id); }
function sid() { return 'bs_' + (++_id); }
function pt(x, y)           { const id = pid(); return { id, x, y }; }
function line(p1, p2)       { return { id: sid(), type: 'line',   p1: p1.id, p2: p2.id }; }
function bez(p1, p2, c1, c2){ return { id: sid(), type: 'bezier', p1: p1.id, p2: p2.id, c1, c2 }; }
// Tag a segment with the pattern piece it belongs to (and dart id for dart legs)
function tag(s, piece, dart) { s.piece = piece; if (dart) s.dart = dart; return s; }

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
  // Vertical lengths come from the same source as the 3D body, so the knee and
  // hem lines on paper land on the mannequin's knee and ankle.
  const LL   = legLengths(m);
  const H2W  = Math.min(LL.hipDepth, BR - 40);                 // hip line always above crotch
  const WTK  = Math.max(LL.waistToKnee, BR + 100);             // knee always below crotch
  const WTA  = Math.max(LL.waistToAnkle, WTK + 150);           // hem always below knee

  // ── Horizontal levels (Y, measured down the crease) ────────────────────────
  const MG  = 60;
  const yw  = MG;                     // waist
  const yh1 = MG + H2W * 0.4;         // hip guide 1
  const yh2 = MG + H2W;               // hip line
  const yr  = MG + BR;                // crotch (body rise) line
  const yk  = MG + WTK;               // knee
  const ya  = MG + WTA;               // ankle / hem

  // ── Widths ─────────────────────────────────────────────────────────────────
  const fWaistW = WC / 4 + 20;                            // front waist incl. 2 cm dart
  const fHipW   = HC / 4 + ease.waist;                    // front: side seam → CF line
  const fFork   = Math.max(SEAT / 16, (UTG - SEAT * 0.5) / 4);   // front crotch extension (upper thigh)
  const bWaistW = WC / 4 + 50;                            // back waist incl. both darts
  const bHipW   = SEAT / 4 + 50;                          // back: CB line → side seam
  const bFork   = fFork * 1.6;                            // back extension is longer
  const hemHalf = (0.125 * WC + 130) / 2;                 // front hem half-width
  const fKneeHalf = KG / 4 + 15;                          // front knee half-width
  const bKneeHalf = fKneeHalf + 20;                       // back leg 4 cm wider at knee
  const bHemHalf  = hemHalf + 20;                         // …and at the hem

  const BACK_PITCH = 25;   // CB waist raised above side waist
  const SEAT_ANGLE = 35;   // CB leans toward the side seam from hip line to waist
  const BACK_DROP  = 10;   // back fork sits 1 cm below the crotch line

  const points   = {};
  const segments = {};
  function add(p)  { points[p.id]   = p; return p; }
  function seg(s)  { segments[s.id] = s; return s; }

  // ── French-curve seams ─────────────────────────────────────────────────────
  const flipY = Math.max(yh2 + (yk - yh2) / 2, yr + 30);
  const unit = (dx, dy) => { const l = Math.hypot(dx, dy) || 1; return { x: dx / l, y: dy / l }; };

  /** Outseam rise → flip → knee. H = hip point, R = crotch-line side point, K = knee, A = ankle. */
  function frenchOutseam(H, R, K, A, piece) {
    const tt = (flipY - R.y) / ((K.y - R.y) || 1);
    const F = add(pt(R.x + (K.x - R.x) * tt, flipY));   // flip point, on the crotch–knee chord
    const tR  = unit(R.x - H.x, R.y - H.y);              // leave crotch line continuing the hip line → outer curve
    const tK  = unit(A.x - K.x, A.y - K.y);              // arrive at knee along the straight lower leg → inner curve
    // Shared tangent at the flip (G1). F lies on the crotch–knee chord, so for
    // each half to be ONE arc (the curve flipping once, at F) the tangent there
    // must cross the chord to the other side from tR and tK: the mean of tR and
    // tK mirrored in the chord. (Along the chord itself, each half had to wiggle
    // to reach it — two extra inflections.)
    const ch = unit(K.x - R.x, K.y - R.y);
    const mR = unit(tR.x + tK.x, tR.y + tK.y), md = mR.x * ch.x + mR.y * ch.y;
    const tF  = unit(2 * md * ch.x - mR.x, 2 * md * ch.y - mR.y);
    const l1 = Math.hypot(F.x - R.x, F.y - R.y) / 3;
    const l2 = Math.hypot(K.x - F.x, K.y - F.y) / 3;
    seg(tag(bez(R, F, { x: R.x + tR.x * l1, y: R.y + tR.y * l1 }, { x: F.x - tF.x * l1, y: F.y - tF.y * l1 }), piece));
    seg(tag(bez(F, K, { x: F.x + tF.x * l2, y: F.y + tF.y * l2 }, { x: K.x - tK.x * l2, y: K.y - tK.y * l2 }), piece));
    return F;
  }

  /**
   * Inseam crotch fork → knee, hollowed 1 cm toward the crease (French curve),
   * arriving at the knee along the straight knee → hem line (no kink at the knee).
   */
  const INSEAM_HOLLOW = 10;
  function frenchInseam(FK, K, A, creaseX, piece) {
    const cx = K.x - FK.x, cy = K.y - FK.y, len = Math.hypot(cx, cy);
    let n = unit(-cy, cx);
    const mid = { x: (FK.x + K.x) / 2, y: (FK.y + K.y) / 2 };
    if ((creaseX - mid.x) * n.x < 0) n = { x: -n.x, y: -n.y };
    // A cubic's midpoint sits 3/8 of its two control offsets off the chord, so
    // the offsets share 8/3 of the hollow. Knee end: on the knee → hem line, up
    // to a third of the chord back up it, but taking no more than half the
    // hollow — the rest goes to the fork end, so both bow the same way (one
    // arc, no inflection).
    const share = INSEAM_HOLLOW * 8 / 3;
    const tK = unit(K.x - A.x, K.y - A.y);
    const off = tK.x * n.x + tK.y * n.y;                       // hollow per mm up the knee line
    const l2 = off > 1e-6 ? Math.min(len / 3, (share / 2) / off) : len / 3;
    const c2 = { x: K.x + tK.x * l2, y: K.y + tK.y * l2 };
    const o1 = share - Math.max(0, off * l2);
    // …and along the chord the two controls sum to its length, so the curve's
    // midpoint sits square off the chord's midpoint (the hollow is measured there)
    const ch = { x: cx / len, y: cy / len };
    const a1 = len - ((c2.x - FK.x) * ch.x + (c2.y - FK.y) * ch.y);
    seg(tag(bez(FK, K, { x: FK.x + ch.x * a1 + n.x * o1, y: FK.y + ch.y * a1 + n.y * o1 }, c2), piece));
  }

  // ════════════════════════════════════════════════════════════════════════════
  // FRONT PANEL
  //   side line x = sX, CF line x = cfX, fork tip x = fkX
  //   crease = halfway between side seam and fork tip at the crotch line
  // ════════════════════════════════════════════════════════════════════════════
  const sX   = MG + 20;
  const cfX  = sX + fHipW;
  const fkX  = cfX + fFork;
  const cFx  = (sX + fkX) / 2;                  // FRONT CREASE

  const cfWX = cfX - 10;                        // CF waist 1 cm in from CF line
  const fswX = cfWX - fWaistW;                  // side waist

  const fSW = add(pt(fswX, yw));                // side waist
  const fCW = add(pt(cfWX, yw));                // CF waist
  const fSH = add(pt(sX,   yh2));               // side hip
  const fSR = add(pt(sX,   yr));                // side at crotch line
  const fCH = add(pt(cfX,  yh2));               // CF at hip line (fly curve starts)
  const fFK = add(pt(fkX,  yr));                // fork tip
  const fOK = add(pt(cFx - fKneeHalf, yk));     // outer knee
  const fIK = add(pt(cFx + fKneeHalf, yk));     // inner knee
  const fOA = add(pt(cFx - hemHalf,   ya));     // outer hem
  const fIA = add(pt(cFx + hemHalf,   ya));     // inner hem

  const F = 'trouser-front';
  seg(tag(line(fSW, fCW), F));                                  // waist line
  // side seam waist → hip: gentle hip curve (bows outward)
  seg(tag(bez(fSW, fSH,
    { x: fswX - 2, y: yw + H2W * 0.35 },
    { x: sX, y: yh2 - H2W * 0.35 }), F));
  seg(tag(line(fSH, fSR), F));                                  // hip → crotch line: straight
  const fFL = frenchOutseam(fSH, fSR, fOK, fOA, F);             // crotch line → flip → knee
  seg(tag(line(fOK, fOA), F));                                  // knee → hem: straight
  seg(tag(line(fOA, fIA), F));                                  // hem
  seg(tag(line(fIA, fIK), F));                                  // inseam hem → knee: straight
  frenchInseam(fFK, fIK, fIA, cFx, F);                          // inseam fork → knee: French curve
  // fly: CF straight from waist to hip line, then bezier crotch curve to the fork
  seg(tag(line(fCW, fCH), F));
  const flyDepth = yr - yh2;
  seg(tag(bez(fCH, fFK,
    { x: cfX,              y: yh2 + flyDepth * 0.60 },          // leaves the CF line vertically
    { x: cfX + fFork * 0.35, y: yr }), F));                    // arrives at the fork horizontally

  // front dart: 2 cm × 10 cm at WC/16 from CF waist
  const fdX = cfWX - WC / 16;
  const fdL = add(pt(fdX - 10, yw));
  const fdR = add(pt(fdX + 10, yw));
  const fdT = add(pt(fdX,      yw + 100));
  seg(tag(line(fdL, fdT), F, 'fd1'));
  seg(tag(line(fdR, fdT), F, 'fd1'));

  // ════════════════════════════════════════════════════════════════════════════
  // BACK PANEL (to the right; mirrored so the fork faces the front panel)
  //   fork tip x = bkX, CB line at crotch x = cbX, side line x = bsX
  //   crease = halfway between fork tip and side seam at the crotch line
  // ════════════════════════════════════════════════════════════════════════════
  const GAP  = 90;
  const bkX  = fkX + GAP + hemHalf;             // clear of the front hem
  const cbX  = bkX + bFork;
  const bsX  = cbX + bHipW;
  const cBx  = (bkX + bsX) / 2;                 // BACK CREASE

  // seat angle: CB leans toward the side seam and rises above the side waist
  const cbHX = cbX;                              // CB at hip line
  const cbWX = cbX + SEAT_ANGLE;                 // CB at waist
  const cbWY = yw - BACK_PITCH;
  const bswX = cbWX + bWaistW;                   // side waist, measured from CB waist

  const bCW = add(pt(cbWX, cbWY));              // CB waist (raised)
  const bSW = add(pt(bswX, yw));                // side waist
  const bSH = add(pt(bsX,  yh2));               // side hip
  const bSR = add(pt(bsX,  yr));                // side at crotch line
  const bCH = add(pt(cbHX, yh2));               // CB at hip line (seat curve starts)
  const bFK = add(pt(bkX,  yr + BACK_DROP));    // back fork tip (dropped 1 cm)
  const bOK = add(pt(cBx + bKneeHalf, yk));     // outer knee
  const bIK = add(pt(cBx - bKneeHalf, yk));     // inner knee
  const bOA = add(pt(cBx + bHemHalf,  ya));     // outer hem
  const bIA = add(pt(cBx - bHemHalf,  ya));     // inner hem

  const B = 'trouser-back';
  seg(tag(line(bCW, bSW), B));                                  // sloped waist line
  seg(tag(bez(bSW, bSH,
    { x: bswX + 2, y: yw + H2W * 0.35 },
    { x: bsX, y: yh2 - H2W * 0.35 }), B));                      // side waist → hip (hip curve)
  seg(tag(line(bSH, bSR), B));                                  // hip → crotch line: straight
  const bFL = frenchOutseam(bSH, bSR, bOK, bOA, B);             // crotch line → flip → knee
  seg(tag(line(bOK, bOA), B));                                  // knee → hem: straight
  seg(tag(line(bOA, bIA), B));                                  // hem
  seg(tag(line(bIA, bIK), B));                                  // inseam hem → knee: straight
  frenchInseam(bFK, bIK, bIA, cBx, B);                          // inseam fork → knee: French curve
  // CB: straight along the seat angle from waist to hip line, then the deep seat curve to the fork
  seg(tag(line(bCW, bCH), B));
  const seatDir = unit(cbHX - cbWX, yh2 - cbWY);                // continue the seat-angle line
  const seatDepth = yr + BACK_DROP - yh2;
  seg(tag(bez(bCH, bFK,
    { x: cbHX + seatDir.x * seatDepth * 0.55, y: yh2 + seatDir.y * seatDepth * 0.55 },
    { x: bkX + bFork * 0.55, y: yr + BACK_DROP }), B));

  // back darts along the sloped waist: 12 cm at 1/3, 10 cm at 2/3
  const along = (t) => ({ x: cbWX + (bswX - cbWX) * t, y: cbWY + (yw - cbWY) * t });
  for (const [t, depth, half, id] of [[1 / 3, 120, 10, 'bd1'], [2 / 3, 100, 8, 'bd2']]) {
    const c = along(t);
    const L = add(pt(c.x - half, c.y));
    const R = add(pt(c.x + half, c.y));
    const T = add(pt(c.x, c.y + depth));
    seg(tag(line(L, T), B, id));
    seg(tag(line(R, T), B, id));
  }

  // ── Construction guides (span both panels) ─────────────────────────────────
  const gx1 = MG - 20;
  const gx2 = cBx + bHemHalf + 20;
  for (const [label, yLevel] of [
    ['Waist', yw], ['Hip 1', yh1], ['Hip 2', yh2],
    ['Rise',  yr], ['Knee',  yk],  ['Ankle',  ya],
  ]) {
    const gL = add(pt(gx1, yLevel));
    const gR = add(pt(gx2, yLevel));
    const gs  = { ...line(gL, gR), construction: true, label };
    segments[gs.id] = gs;
  }

  // ── Crease / grainline on each panel ───────────────────────────────────────
  for (const cx of [cFx, cBx]) {
    const g1 = add(pt(cx, yh2 + 40));
    const g2 = add(pt(cx, yk + (ya - yk) * 0.6));
    const gs = { ...line(g1, g2), construction: true, grain: true, label: 'Grain' };
    segments[gs.id] = gs;
  }

  // ── Piece metadata — tells the 3D drape engine how each panel sits on the body
  const common = { kind: 'trouser', garment: 'trouser', fit: garmentType, waistY: yw, hipY: yh2, riseY: yr, kneeY: yk, flipY };
  // Named landmark point ids — stable handles for the drape engine, tests and
  // (later) grading and fit-correction logging.
  const lm = (o) => Object.fromEntries(Object.entries(o).map(([k, p]) => [k, p.id]));
  const pieces = {
    'trouser-front': {
      ...common, panel: 'front', sideAt: 'min', name: 'Trouser front', creaseX: cFx,
      landmarks: lm({ waistSide: fSW, waistCentre: fCW, hipSide: fSH, hipCentre: fCH, crotchSide: fSR,
        fork: fFK, flip: fFL, kneeOuter: fOK, kneeInner: fIK, hemOuter: fOA, hemInner: fIA }),
    },
    'trouser-back': {
      ...common, panel: 'back', sideAt: 'max', name: 'Trouser back', creaseX: cBx,
      landmarks: lm({ waistSide: bSW, waistCentre: bCW, hipSide: bSH, hipCentre: bCH, crotchSide: bSR,
        fork: bFK, flip: bFL, kneeOuter: bOK, kneeInner: bIK, hemOuter: bOA, hemInner: bIA }),
    },
  };

  return { points, segments, pieces };
}

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

const ROW_TABLE_STEP = 4;   // mm — resolution of the width lookup
const MESH_ROW_STEP  = 8;   // mm — vertical density of the fabric mesh
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
    return place(u, y, w);
  };

  /** Body-space position of the pattern point at (u across the row, y down the panel). */
  function place(u, y, w) {
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
    const Rt = WtT / PI;
    const bodyT = radiusAt(torso, Y);
    // garment oval follows the body oval (same girth as the circle)
    const Rx = Math.max(Rt * TORSO_X, bodyT * TORSO_X + 5);
    const Rz = Math.max(Rt * TORSO_Z, bodyT * TORSO_Z + 5);
    const beta = PI * wfT / WtT;
    const phi = isFront ? (1 - uT) * beta : beta + uT * (PI - beta);
    const sph = Math.sin(phi), cph = Math.cos(phi);
    const se = 2 / HIP_SQUARENESS;
    const tx = Rx * Math.sign(sph) * Math.pow(Math.abs(sph), se);
    const tz = Rz * Math.sign(cph) * Math.pow(Math.abs(cph), se);

    // Leg placement: full tube round one leg; front and back (forks included)
    // share the circumference
    const Wt = wf + wb;
    const bodyL = Y > dims.crotchH ? dims.thighR : radiusAt(leg, Y);
    const Rl = Math.max(Wt / (2 * PI), bodyL + 5);
    const alphaF = 2 * PI * wf / Wt;
    const psi = isFront ? alphaF / 2 - u * alphaF : alphaF / 2 + u * (2 * PI - alphaF);
    // oval leg (same circumference as the circle) near the crotch → round at the knee
    const k = 1 + (LEG_DEPTH_RATIO - 1) * (1 - smoothstep(riseDepth, kneeDepth, h));
    const norm = 2 * PI / ellipsePerimeter(1 / k, k);
    const ax = Rl * norm / k, az = Rl * norm * k;
    // near the crotch the inner half of the leg reaches the centre line, so
    // left and right crotch seams meet; fades out down the leg
    const legC = legCenterX(dims, Y);
    const sp = Math.sin(psi);
    const reach = 1 - smoothstep(riseDepth, riseDepth + 150, h);
    const axIn = ax + Math.max(0, legC - 1 - ax) * reach;
    const lx = Math.max(1, legC + (sp < 0 ? axIn : ax) * sp);
    const lz = az * Math.cos(psi);

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
    const wc = smoothstep(0.55, 1, u) * (1 - smoothstep(0, 120, Math.abs(h - riseDepth)));
    px += (1 - px) * wc;
    pz += (0 - pz) * wc;
    return collide(px, Y, pz, isFront ? 1 : -1);
  }

  /**
   * Body collision: fabric can never sit inside the body. Any point inside the
   * torso or a leg is pushed straight out to the skin + a small gap. This also
   * makes over-tight edits show as fabric stretched onto the body.
   */
  function collide(x, Y, z, side) {
    const GAP = 3;
    if (Y > dims.crotchH) {
      const rt0 = radiusAt(torso, Y);
      const rtX = rt0 * TORSO_X + GAP, rtZ = rt0 * TORSO_Z + GAP;   // body oval + gap
      const rt = (rtX + rtZ) / 2;
      const r = Math.hypot(x / rtX, z / rtZ);                       // < 1 → inside
      if (r < 1) {
        // Outward push from the body axis. Near CF/CB the direction leans toward
        // this panel's own side (front forward, back backward): close to the
        // axis a plain radial direction is ill-defined and would flip fabric
        // through the body. Toward the sides it is a plain radial push, so a
        // side seam shared by front and back lands in one place.
        const lean = side * 0.35 * rtZ * (1 - smoothstep(0.25 * rt, 0.5 * rt, Math.abs(x)));
        const zl = z + lean;
        const q = Math.hypot(x / rtX, zl / rtZ) || 1;                 // exit onto the oval
        const nx = x / q;
        const nz = zl / q;
        // just above the crotch point the fork passes under the body: fade in
        const wT = smoothstep(dims.crotchH, dims.crotchH + 30, Y);
        x += (nx - x) * wT;
        z += (nz - z) * wT;
      }
    }
    if (Y < dims.crotchH + 30) {
      // The two legs overlap near the crotch, so treat them as one union:
      // exit radially from one leg, and if that lands inside the other leg,
      // exit front/back (along z) instead.
      const rl = (Y > dims.crotchH ? dims.thighR : radiusAt(leg, Y)) + GAP;
      const L = legCenterX(dims, Y);
      const inside = (px, pz, c) => Math.hypot(px - c, pz) < rl - 1e-6;
      const inA = inside(x, z, L), inB = inside(x, z, -L);
      // Right at the crotch point the fork passes under the body (between the
      // thighs, out of sight), so the push fades in over the first 3.5 cm
      // below the crotch — front and back forks can still meet there.
      // (Measured trade-off: 3/3.5 cm keeps crotch stretch ≈ 4× while hiding
      // most skin; tighter fades stretch the crotch > 5×.)
      const wPush = smoothstep(dims.crotchH - 2, dims.crotchH - 35, Y);
      if ((inA || inB) && wPush > 0) {
        const c = inA && inB ? (x >= 0 ? L : -L) : (inA ? L : -L);
        const dx = x - c, r = Math.hypot(dx, z);
        // exit A: straight out of this thigh
        const ax = r < 1e-6 ? c + Math.sign(c) * rl : c + dx * rl / r;
        const az = r < 1e-6 ? z : z * rl / r;
        // exit B: forward (front panel) / backward (back panel), keeping x —
        // used where exit A would land inside the other thigh
        const need = (cc) => Math.sqrt(Math.max(0, rl * rl - (x - cc) * (x - cc)));
        const bz = side * Math.max(need(L), need(-L), Math.abs(z));
        // blend smoothly by how deep exit A lands in the other thigh (no jumps)
        const depthOther = rl - Math.hypot(ax + c, az);
        const wB = smoothstep(-12, 12, depthOther);
        const nx = ax + (x - ax) * wB;
        const nz = az + (bz - az) * wB;
        x += (nx - x) * wPush;
        z += (nz - z) * wPush;
        // final touch-up: a blended exit can graze a thigh by a millimetre or
        // two — nudge it out (small, so it never creates a jump)
        for (const cc of [L, -L]) {
          const ddx = x - cc, rr = Math.hypot(ddx, z);
          if (rr < rl && rr > 1e-6 && rl - rr < 15) {
            const push = (rl - rr) * wPush;
            x += ddx / rr * push; z += z / rr * push;
          }
        }
      }
    }
    return [x, Y, z];
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

function buildFabricMesh(piece, profile, map, sx) {
  const { table, band } = profile;
  const cols = clamp(Math.ceil(band.maxW / 15), 8, 48);
  const rowsY = [];
  for (let y = table.ymin + 0.02; y < table.ymax; y += MESH_ROW_STEP) rowsY.push(y);
  rowsY.push(table.ymax - 0.02);

  const positions = [];
  const patternXY = [];     // where each mesh point sits on the flat pattern (mm)
  const indices = [];
  let prevStart = -1;
  let vcount = 0;
  for (const y of rowsY) {
    const e = rowExtent(piece.outline, y);
    if (!e) { prevStart = -1; continue; }
    const start = vcount;
    for (let j = 0; j <= cols; j++) {
      const x = e.xmin + (e.xmax - e.xmin) * (j / cols);
      const p = map(x, y);
      positions.push(p[0] * sx, p[1], p[2]);
      patternXY.push(x, y);
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
  return { positions: new Float32Array(positions), patternXY: new Float32Array(patternXY), indices: new Uint32Array(indices) };
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
 * @param dims    from deriveBodyDims()
 * @returns Array of instances:
 *   { key, name, panel, sx, positions, indices, seams, handles:[{pointId,x,y,pos}], map }
 *   `map(x, y)` returns the body-space position for this instance (mirror applied).
 */
export function drapePattern(pattern, dims) {
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
      const mesh = buildFabricMesh(piece, profile, baseMap, sx);
      instances.push({
        key: piece.key,
        name: piece.meta.name ?? piece.key,
        panel: piece.meta.panel ?? 'free',
        sx,
        positions: mesh.positions,
        patternXY: mesh.patternXY,
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

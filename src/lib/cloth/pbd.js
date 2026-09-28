/**
 * Position-Based Dynamics cloth solver for draped garments.
 *
 * Starts from the geometric drape (lib/drape) and lets the fabric settle under
 * gravity against the avatar's signed-distance field (lib/avatar). It is the
 * on-demand "simulate" step — the live 2D ⇄ 3D sync keeps using the instant
 * geometric drape.
 *
 * Units: mm, seconds, y up. Pure data in / data out (no Three.js, no DOM), so
 * the same code runs in a Web Worker (cloth.worker.js), on the main thread as
 * a fallback, and in unit tests.
 *
 * One frame = `substeps` small steps (Macklin et al., "Small Steps in Physics
 * Simulation", 2019: many substeps with one constraint pass each are more
 * stable and stiffer than few steps with many iterations). Each substep:
 *
 *   1. predict       v += g·h (damped, clamped),  p = x + v·h
 *   2. constraints   stretch + shear (triangle edges), bending (across edges),
 *                    seams (sewing panels together) — rest lengths come from
 *                    the FLAT PATTERN, so the cloth relaxes to its true size
 *   3. collisions, in priority order:
 *        a. body (SDF)   — particles inside the skin are projected out along
 *                          ∇d by the penetration depth, with friction
 *        b. self (hash)  — particles of different parts of the garment
 *                          closer than the cloth thickness are pushed apart
 *        c. body again   — no friction; the body always wins, so a self-
 *                          collision push can never leave cloth inside the skin
 *   4. velocities    v = (p − x) / h, restitution on the contact normal,
 *                    x = p
 *
 * Stability against "exploding" starts: rest lengths blend from the draped
 * lengths to the pattern lengths over the first frames, per-constraint
 * corrections are capped, and speeds are clamped.
 */

// ─── Defaults ───────────────────────────────────────────────────────────────

export const CLOTH_DEFAULTS = {
  dt: 1 / 60,              // s per frame
  substeps: 12,
  gravity: -9810,          // mm/s²
  damping: 3,              // 1/s — air drag + internal damping
  maxSpeed: 1500,          // mm/s — safety clamp
  stretchStiffness: 1.0,   // 0..1 per substep (1 = inextensible within one pass)
  compressStiffness: 0.05, // woven fabric buckles freely instead of pushing back when compressed
  bendStiffness: 0.2,      // 0..1 — below ~0.1 the mesh shivers (unstable buckling); 0.2 settles still and still folds
  sewStiffness: 1.0,
  maxCorrection: 4,        // mm per constraint per substep
  restRampFrames: 20,      // draped lengths → pattern lengths over this many frames
  skinGap: 2,              // mm — cloth rests this far off the skin (0 = exactly on it)
  staticFriction: 0.6,     // μs — against the skin
  kineticFriction: 0.35,   // μk
  restitution: 0.0,        // e — 0: cloth never bounces off the skin
  selfThickness: 5,        // mm — minimum distance between separate cloth layers
  selfSkipPattern: 40,     // mm — same-panel particles closer than this on paper are neighbours, not layers
  pinBand: 10,             // mm below the waist line on paper that is held (the waistband)
  bandHold: 0.01,          // 0..1 per substep — how firmly the band stays where it was draped
                           //   around the body (its height is held exactly)
  sewTolerance: 6,         // mm — boundary particles this close at the start are sewn together
  tetherSlack: 1.03,       // tethers allow 3% stretch before they act
};

// ─── Building the cloth ─────────────────────────────────────────────────────

/**
 * Turn drape instances into one particle system.
 * @param instances  from drapePattern(pattern, body, { rowStep, colStep })
 * @param opts       CLOTH_DEFAULTS overrides (pinBand, sewTolerance)
 * @returns cloth: flat typed arrays + per-instance offsets
 */
export function buildCloth(instances, opts = {}) {
  const o = { ...CLOTH_DEFAULTS, ...opts };
  let N = 0;
  const offsets = [];
  for (const inst of instances) { offsets.push(N); N += inst.positions.length / 3; }

  const x = new Float32Array(N * 3);
  const pat = new Float32Array(N * 2);      // on the flat pattern, darts sewn (rest shape)
  const part = new Uint16Array(N);      // which instance each particle belongs to
  const w = new Float32Array(N);        // inverse mass (0 = pinned; the waistband uses `band` instead)
  const band = new Uint8Array(N);       // waistband particles
  const tris = [];
  instances.forEach((inst, k) => {
    const off = offsets[k];
    x.set(inst.positions, off * 3);
    pat.set(inst.sewnXY ?? inst.patternXY, off * 2);
    part.fill(k, off, off + inst.positions.length / 3);
    for (let i = 0; i < inst.indices.length; i++) tris.push(inst.indices[i] + off);
    // top of the piece on paper: the waist line for trousers; for any other
    // piece its highest point (so a hand-drawn piece hangs from its top edge
    // instead of falling off the body)
    let top = inst.waistY;
    if (top == null) { top = Infinity; for (let i = 1; i < inst.patternXY.length; i += 2) top = Math.min(top, inst.patternXY[i]); }
    for (let i = 0; i < inst.positions.length / 3; i++) {
      const py = inst.patternXY[i * 2 + 1];
      // the waistband holds the trousers up: everything within pinBand of the
      // panel's top on paper is held at its height (see bandPass)
      band[off + i] = py <= top + o.pinBand ? 1 : 0;
      w[off + i] = 1;
    }
  });
  const indices = Uint32Array.from(tris);

  // ── stretch/shear: every triangle edge; bending: across every shared edge ──
  const edgeTris = new Map();            // "a,b" → [opposite vertices]
  const key = (a, b) => (a < b ? a * N + b : b * N + a);
  for (let t = 0; t < indices.length; t += 3) {
    const v = [indices[t], indices[t + 1], indices[t + 2]];
    for (let e = 0; e < 3; e++) {
      const a = v[e], b = v[(e + 1) % 3], c = v[(e + 2) % 3];
      if (a === b || b === c || a === c) continue;
      const k2 = key(a, b);
      const list = edgeTris.get(k2);
      if (list) list.push(c); else edgeTris.set(k2, [c]);
    }
  }
  const stretch = [], bend = [], boundary = new Set();
  for (const [k2, opp] of edgeTris) {
    const a = Math.floor(k2 / N), b = k2 % N;
    stretch.push(a, b);
    if (opp.length === 2) bend.push(opp[0], opp[1]);
    else { boundary.add(a); boundary.add(b); }
  }

  // ── seams: boundary particles of DIFFERENT panels that the drape put on
  //    top of each other are sewn (side seams, inseams, CF/CB, crotch) ──────
  const bList = [...boundary];
  const sew = [];
  const sewKeys = new Set();
  const cell = o.sewTolerance;
  const grid = new Map();
  const gk = (ix, iy, iz) => `${ix},${iy},${iz}`;
  for (const i of bList) {
    const k3 = gk(Math.floor(x[i * 3] / cell), Math.floor(x[i * 3 + 1] / cell), Math.floor(x[i * 3 + 2] / cell));
    (grid.get(k3) ?? grid.set(k3, []).get(k3)).push(i);
  }
  for (const i of bList) {
    const ix = Math.floor(x[i * 3] / cell), iy = Math.floor(x[i * 3 + 1] / cell), iz = Math.floor(x[i * 3 + 2] / cell);
    const best = new Map();              // other part → [j, dist]
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      for (const j of grid.get(gk(ix + dx, iy + dy, iz + dz)) ?? []) {
        if (part[j] === part[i]) continue;
        const d = Math.hypot(x[i * 3] - x[j * 3], x[i * 3 + 1] - x[j * 3 + 1], x[i * 3 + 2] - x[j * 3 + 2]);
        if (d > o.sewTolerance) continue;
        const cur = best.get(part[j]);
        if (!cur || d < cur[1]) best.set(part[j], [j, d]);
      }
    }
    for (const [j] of best.values()) {
      const k2 = key(i, j);
      if (sewKeys.has(k2)) continue;
      sewKeys.add(k2);
      sew.push(i, j);
    }
  }

  // rest lengths: flat pattern distance (stretch, bend); 0 for seams.
  // start lengths: as draped (the ramp blends start → rest).
  const lens = (pairs, fromPattern) => {
    const rest = new Float32Array(pairs.length / 2), start = new Float32Array(pairs.length / 2);
    for (let c = 0; c < rest.length; c++) {
      const a = pairs[c * 2], b = pairs[c * 2 + 1];
      start[c] = Math.hypot(x[a * 3] - x[b * 3], x[a * 3 + 1] - x[b * 3 + 1], x[a * 3 + 2] - x[b * 3 + 2]);
      rest[c] = fromPattern ? Math.hypot(pat[a * 2] - pat[b * 2], pat[a * 2 + 1] - pat[b * 2 + 1]) : 0;
      // a link to the pinned waistband keeps the length it was draped at: the
      // band can't move to meet a different length, and asking it to would
      // leave the first free rows fighting between band and pattern forever
      if (w[a] === 0 || w[b] === 0) rest[c] = start[c];
    }
    return { pairs: Uint32Array.from(pairs), rest, start };
  };

  // ── tethers (long-range attachments, Kim et al. 2012): a hanging particle
  //    can never be farther from its nearest waistband particle than it is on
  //    the flat pattern. Stops long legs creeping downward — plain distance
  //    chains converge too slowly for that — at almost no cost. ──────────────
  const tetherAnchor = new Int32Array(N).fill(-1);
  const tetherLen = new Float32Array(N);
  const pinsByPart = new Map();
  for (let i = 0; i < N; i++) if (band[i]) (pinsByPart.get(part[i]) ?? pinsByPart.set(part[i], []).get(part[i])).push(i);
  for (let i = 0; i < N; i++) {
    if (band[i] || w[i] === 0) continue;
    let best = -1, bd = Infinity;
    for (const j of pinsByPart.get(part[i]) ?? []) {
      const d = Math.hypot(pat[i * 2] - pat[j * 2], pat[i * 2 + 1] - pat[j * 2 + 1]);
      if (d < bd) { bd = d; best = j; }
    }
    if (best < 0) continue;
    tetherAnchor[i] = best;
    // never shorter than it hangs now (a draped point already farther away
    // than the pattern allows is eased back over the ramp, not snapped)
    const now = Math.hypot(x[i * 3] - x[best * 3], x[i * 3 + 1] - x[best * 3 + 1], x[i * 3 + 2] - x[best * 3 + 2]);
    tetherLen[i] = Math.max(bd, now);
  }

  return {
    N, offsets, x, pat, part, w, band, indices, tetherAnchor, tetherLen,
    stretch: lens(stretch, true),
    bend: lens(bend, true),
    sew: lens(sew, false),
    sewKeys,
  };
}

// ─── The solver ─────────────────────────────────────────────────────────────

/**
 * @param cloth  from buildCloth()
 * @param body   { sdf(x,y,z), normal(x,y,z) } — the avatar model (createAvatarModel)
 * @param opts   CLOTH_DEFAULTS overrides
 * @returns sim  { step(), run(frames), positions, frame, stats(), instancePositions(k) }
 */
export function createClothSim(cloth, body, opts = {}) {
  const o = { ...CLOTH_DEFAULTS, ...opts };
  const { N, w, part, pat } = cloth;
  const x = Float32Array.from(cloth.x);     // positions at the start of a substep
  const p = new Float32Array(N * 3);         // predicted positions
  const v = new Float32Array(N * 3);         // velocities
  const hitN = new Float32Array(N * 3);      // contact normal (this substep)
  const vn0 = new Float32Array(N);           // normal speed before the contact
  const hit = new Uint8Array(N);
  // Distance-bound cache: where each particle's distance was last sampled and
  // what it was. The SDF is a distance bound (|∇d| ≤ 1), so a particle that has
  // moved δ since then is at least d − δ from the skin — far-away cloth skips
  // the SDF entirely.
  const lastQ = new Float32Array(N * 3).fill(1e9);
  const lastD = new Float32Array(N).fill(-1e9);
  let frame = 0;
  let lastSelfPairs = 0, lastContacts = 0, lastFrameMove = Infinity;

  const h = o.dt / o.substeps;
  const dampS = Math.max(0, 1 - o.damping * h);

  // ── constraints ───────────────────────────────────────────────────────────
  /** Distance constraints, Gauss–Seidel, capped corrections. */
  function solveDistance(set, stiffness, ramp, compress = stiffness) {
    const { pairs, rest, start } = set;
    const cap = o.maxCorrection;
    for (let c = 0; c < rest.length; c++) {
      const a = pairs[c * 2], b = pairs[c * 2 + 1];
      const wa = w[a], wb = w[b], ws = wa + wb;
      if (ws === 0) continue;
      const L = start[c] + (rest[c] - start[c]) * ramp;
      const ax = a * 3, bx = b * 3;
      const dx = p[bx] - p[ax], dy = p[bx + 1] - p[ax + 1], dz = p[bx + 2] - p[ax + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < 1e-9) continue;
      let C = d - L;
      if (C > cap) C = cap; else if (C < -cap) C = -cap;
      const s = ((C < 0 ? compress : stiffness) * C) / (ws * d);
      p[ax] += dx * s * wa; p[ax + 1] += dy * s * wa; p[ax + 2] += dz * s * wa;
      p[bx] -= dx * s * wb; p[bx + 1] -= dy * s * wb; p[bx + 2] -= dz * s * wb;
    }
  }

  /**
   * The waistband: held at its draped height, and drawn softly back toward its
   * draped place around the body. It can still slide round the waist, so the
   * band takes its true (pattern) length instead of locking in any stretch
   * the geometric drape left there.
   */
  const anchor = Float32Array.from(cloth.x);
  function bandPass() {
    const k = o.bandHold, band = cloth.band;
    for (let i = 0; i < N; i++) {
      if (!band[i]) continue;
      const i3 = i * 3;
      p[i3 + 1] = anchor[i3 + 1];
      p[i3] += (anchor[i3] - p[i3]) * k;
      p[i3 + 2] += (anchor[i3 + 2] - p[i3 + 2]) * k;
    }
  }

  /** Tethers: inequality — only acts when a particle hangs too far from its anchor. */
  function solveTethers() {
    const { tetherAnchor, tetherLen } = cloth;
    for (let i = 0; i < N; i++) {
      const a = tetherAnchor[i];
      if (a < 0) continue;
      const i3 = i * 3, a3 = a * 3;
      const dx = p[i3] - p[a3], dy = p[i3 + 1] - p[a3 + 1], dz = p[i3 + 2] - p[a3 + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const L = tetherLen[i] * o.tetherSlack;
      if (d <= L) continue;
      const k = (d - L) / d;
      p[i3] -= dx * k; p[i3 + 1] -= dy * k; p[i3 + 2] -= dz * k;
    }
  }

  // ── collisions ────────────────────────────────────────────────────────────
  /**
   * Body collision against the SDF. d = sdf(p) − skinGap; if d < 0 the particle
   * is projected along ∇d by −d (exactly onto the offset skin).
   * With friction: the tangential part of this substep's motion is removed
   * (static: |Δt| < μs·depth) or reduced by μk·depth (kinetic) — position-based
   * Coulomb friction, so cloth settles on the skin instead of sliding off or
   * sticking in mid-air.
   */
  function bodyPass(withFriction) {
    let contacts = 0;
    for (let i = 0; i < N; i++) {
      if (w[i] === 0) continue;
      const i3 = i * 3;
      const moved = Math.hypot(p[i3] - lastQ[i3], p[i3 + 1] - lastQ[i3 + 1], p[i3 + 2] - lastQ[i3 + 2]);
      if (lastD[i] - moved > o.skinGap + 1) continue;
      const raw = body.sdf(p[i3], p[i3 + 1], p[i3 + 2]);
      lastQ[i3] = p[i3]; lastQ[i3 + 1] = p[i3 + 1]; lastQ[i3 + 2] = p[i3 + 2]; lastD[i] = raw;
      const d = raw - o.skinGap;
      if (d >= 0) continue;
      lastD[i] = o.skinGap;              // it is about to sit exactly on the offset skin
      const n = body.normal(p[i3], p[i3 + 1], p[i3 + 2]);
      const depth = -d;
      p[i3] += n[0] * depth; p[i3 + 1] += n[1] * depth; p[i3 + 2] += n[2] * depth;
      if (!hit[i]) {
        hit[i] = 1;
        hitN[i3] = n[0]; hitN[i3 + 1] = n[1]; hitN[i3 + 2] = n[2];
        vn0[i] = v[i3] * n[0] + v[i3 + 1] * n[1] + v[i3 + 2] * n[2];
      }
      contacts++;
      if (!withFriction) continue;
      // motion over this substep, split into normal + tangential parts
      const mx = p[i3] - x[i3], my = p[i3 + 1] - x[i3 + 1], mz = p[i3 + 2] - x[i3 + 2];
      const mn = mx * n[0] + my * n[1] + mz * n[2];
      const tx = mx - mn * n[0], ty = my - mn * n[1], tz = mz - mn * n[2];
      const tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
      if (tl < 1e-9) continue;
      const k = tl < o.staticFriction * depth ? 1 : Math.min(1, (o.kineticFriction * depth) / tl);
      p[i3] -= tx * k; p[i3 + 1] -= ty * k; p[i3 + 2] -= tz * k;
    }
    return contacts;
  }

  // Self-collision candidates are gathered once per frame with a spatial hash
  // (radius = thickness + the most a particle can travel in a frame), then
  // enforced every substep.
  let selfPairs = new Uint32Array(0);
  let frameMaxSpeed = o.maxSpeed;          // fastest particle last frame (starts pessimistic)
  function gatherSelfPairs() {
    // two particles can close at most 2·v·dt in a frame (+ margin)
    const r = o.selfThickness + 2 * Math.min(o.maxSpeed, frameMaxSpeed * 1.5) * o.dt + 2;
    const cellSize = r;
    const tableSize = 2 * N + 1;
    const count = new Int32Array(tableSize + 1);
    const hashOf = (ix, iy, iz) => Math.abs((ix * 92837111) ^ (iy * 689287499) ^ (iz * 283923481)) % tableSize;
    const cx = new Int32Array(N), cy = new Int32Array(N), cz = new Int32Array(N);
    for (let i = 0; i < N; i++) {
      cx[i] = Math.floor(x[i * 3] / cellSize); cy[i] = Math.floor(x[i * 3 + 1] / cellSize); cz[i] = Math.floor(x[i * 3 + 2] / cellSize);
      count[hashOf(cx[i], cy[i], cz[i])]++;
    }
    for (let i = 1; i <= tableSize; i++) count[i] += count[i - 1];
    const entries = new Int32Array(N);
    for (let i = 0; i < N; i++) entries[--count[hashOf(cx[i], cy[i], cz[i])]] = i;
    const out = [];
    const r2 = r * r, skip2 = o.selfSkipPattern * o.selfSkipPattern;
    for (let i = 0; i < N; i++) {
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const hsh = hashOf(cx[i] + dx, cy[i] + dy, cz[i] + dz);
        for (let e = count[hsh]; e < count[hsh + 1]; e++) {
          const j = entries[e];
          if (j <= i) continue;
          const ex = x[j * 3] - x[i * 3], ey = x[j * 3 + 1] - x[i * 3 + 1], ez = x[j * 3 + 2] - x[i * 3 + 2];
          if (ex * ex + ey * ey + ez * ez > r2) continue;
          if (part[i] === part[j]) {
            // neighbours in the same panel are held by the stretch constraints
            const px = pat[i * 2] - pat[j * 2], py = pat[i * 2 + 1] - pat[j * 2 + 1];
            if (px * px + py * py < skip2) continue;
          } else if (cloth.sewKeys.has(i < j ? i * N + j : j * N + i)) continue;   // sewn together
          out.push(i, j);
        }
      }
    }
    selfPairs = Uint32Array.from(out);
    lastSelfPairs = selfPairs.length / 2;
  }

  /** Push apart any candidate pair closer than the cloth thickness. */
  function selfPass() {
    const t = o.selfThickness;
    for (let c = 0; c < selfPairs.length; c += 2) {
      const a = selfPairs[c], b = selfPairs[c + 1];
      const wa = w[a], wb = w[b], ws = wa + wb;
      if (ws === 0) continue;
      const a3 = a * 3, b3 = b * 3;
      const dx = p[b3] - p[a3], dy = p[b3 + 1] - p[a3 + 1], dz = p[b3 + 2] - p[a3 + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d >= t || d < 1e-9) continue;
      const s = (t - d) / (ws * d);
      p[a3] -= dx * s * wa; p[a3 + 1] -= dy * s * wa; p[a3 + 2] -= dz * s * wa;
      p[b3] += dx * s * wb; p[b3 + 1] += dy * s * wb; p[b3 + 2] += dz * s * wb;
    }
  }

  // ── one frame ─────────────────────────────────────────────────────────────
  function step() {
    const ramp = Math.min(1, (frame + 1) / o.restRampFrames);
    if (o.selfThickness > 0) gatherSelfPairs();
    let contacts = 0;
    const xStart = Float32Array.from(x);
    for (let s = 0; s < o.substeps; s++) {
      // 1. predict
      for (let i = 0; i < N; i++) {
        const i3 = i * 3;
        hit[i] = 0;
        if (w[i] === 0) { p[i3] = x[i3]; p[i3 + 1] = x[i3 + 1]; p[i3 + 2] = x[i3 + 2]; continue; }
        v[i3 + 1] += o.gravity * h;
        v[i3] *= dampS; v[i3 + 1] *= dampS; v[i3 + 2] *= dampS;
        const sp = Math.sqrt(v[i3] * v[i3] + v[i3 + 1] * v[i3 + 1] + v[i3 + 2] * v[i3 + 2]);
        if (sp > o.maxSpeed) { const k = o.maxSpeed / sp; v[i3] *= k; v[i3 + 1] *= k; v[i3 + 2] *= k; }
        p[i3] = x[i3] + v[i3] * h; p[i3 + 1] = x[i3 + 1] + v[i3 + 1] * h; p[i3 + 2] = x[i3 + 2] + v[i3 + 2] * h;
      }
      // 2. cloth constraints
      solveDistance(cloth.stretch, o.stretchStiffness, ramp, o.compressStiffness);
      solveDistance(cloth.bend, o.bendStiffness, ramp);
      solveTethers();
      solveDistance(cloth.sew, o.sewStiffness, ramp);      // seams last: they must hold
      bandPass();
      // 3. collisions: body first (anchors), then cloth-cloth, then body again
      contacts = bodyPass(true);
      // seams again: the body push above must not open a seam (the next
      // passes keep the result outside the skin)
      solveDistance(cloth.sew, o.sewStiffness, ramp);
      if (o.selfThickness > 0) selfPass();
      bodyPass(false);
      // 4. velocities + restitution
      const ih = 1 / h;
      for (let i = 0; i < N; i++) {
        const i3 = i * 3;
        if (w[i] === 0) { v[i3] = v[i3 + 1] = v[i3 + 2] = 0; continue; }
        let vx = (p[i3] - x[i3]) * ih, vy = (p[i3 + 1] - x[i3 + 1]) * ih, vz = (p[i3 + 2] - x[i3 + 2]) * ih;
        if (hit[i]) {
          // normal speed after contact: bounce back with e·(approach speed),
          // and never faster than that — the projection itself must not
          // launch the cloth off the skin
          const nx = hitN[i3], ny = hitN[i3 + 1], nz = hitN[i3 + 2];
          const vn = vx * nx + vy * ny + vz * nz;
          const newVn = vn0[i] < 0 ? -o.restitution * vn0[i] : Math.min(vn, Math.max(0, vn0[i]));
          const dv = newVn - vn;
          vx += dv * nx; vy += dv * ny; vz += dv * nz;
        }
        v[i3] = vx; v[i3 + 1] = vy; v[i3 + 2] = vz;
        x[i3] = p[i3]; x[i3 + 1] = p[i3 + 1]; x[i3 + 2] = p[i3 + 2];
      }
    }
    lastContacts = contacts;
    // how far anything actually moved this frame (substep jitter cancels out)
    let d2max = 0;
    for (let i = 0; i < N * 3; i += 3) {
      const dx = x[i] - xStart[i], dy = x[i + 1] - xStart[i + 1], dz = x[i + 2] - xStart[i + 2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > d2max) d2max = d2;
    }
    frameMaxSpeed = Math.min(o.maxSpeed, Math.sqrt(d2max) / o.dt);
    lastFrameMove = Math.sqrt(d2max);
    frame++;
    return frame;
  }

  function stats() {
    let maxSpeed = 0, energy = 0, inside = 0, worstDepth = 0;
    for (let i = 0; i < N; i++) {
      const i3 = i * 3;
      const s2 = v[i3] * v[i3] + v[i3 + 1] * v[i3 + 1] + v[i3 + 2] * v[i3 + 2];
      energy += 0.5 * s2;
      if (s2 > maxSpeed * maxSpeed) maxSpeed = Math.sqrt(s2);
      const d = body.sdf(x[i3], x[i3 + 1], x[i3 + 2]);
      if (d < 0) { inside++; worstDepth = Math.max(worstDepth, -d); }
    }
    let maxStretch = 0;
    const { pairs, rest } = cloth.stretch;
    for (let c = 0; c < rest.length; c++) {
      const a = pairs[c * 2] * 3, b = pairs[c * 2 + 1] * 3;
      const d = Math.hypot(x[a] - x[b], x[a + 1] - x[b + 1], x[a + 2] - x[b + 2]);
      if (rest[c] > 1) maxStretch = Math.max(maxStretch, d / rest[c]);
    }
    let seamGap = 0;
    const sp = cloth.sew.pairs;
    for (let c = 0; c < sp.length; c += 2) {
      const a = sp[c] * 3, b = sp[c + 1] * 3;
      seamGap = Math.max(seamGap, Math.hypot(x[a] - x[b], x[a + 1] - x[b + 1], x[a + 2] - x[b + 2]));
    }
    return { frame, maxSpeed, maxMove: lastFrameMove, energy, inside, worstDepth, maxStretch, seamGap, contacts: lastContacts, selfPairs: lastSelfPairs };
  }

  return {
    get positions() { return x; },
    get velocities() { return v; },
    get frame() { return frame; },
    step,
    /** Largest distance any particle moved in the last frame (mm). */
    lastFrameMove() { return lastFrameMove; },
    run(frames) { for (let f = 0; f < frames; f++) step(); return stats(); },
    stats,
    /** Positions of one drape instance (a view into the particle array). */
    instancePositions(k) {
      const start = cloth.offsets[k] * 3;
      const end = k + 1 < cloth.offsets.length ? cloth.offsets[k + 1] * 3 : N * 3;
      return x.subarray(start, end);
    },
    options: o,
  };
}

/** Mesh spacing the solver drapes at (coarser than the live view: fewer particles). */
export const CLOTH_MESH = { rowStep: 15, colStep: 15 };

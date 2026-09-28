/**
 * Cloth solver tests: the physics pieces one by one on simple shapes (SDF
 * projection, friction, restitution, self-collision, collision priority), then
 * real trousers settling on real avatars.
 */
import { describe, it, expect } from 'vitest';
import { buildCloth, createClothSim, CLOTH_MESH } from './pbd.js';
import { runClothSimulation } from './runner.js';
import { generateTrouserBlock } from '../blocks/trouserBlock.js';
import { DEFAULT_MEASUREMENTS as M } from '../../hooks/useMeasurements.js';
import { createAvatarModel, bodyForDrape } from '../avatar/avatar.js';
import { drapePattern } from '../drape/drape.js';
import { seatFoldShare } from '../drape/testBodies.js';

// ── simple shapes ───────────────────────────────────────────────────────────

/** Flat square sheet of nx × nz particles in the plane y = y0 (a drape instance). */
function sheet(nx, nz, spacing, [x0, y0, z0], key = 'sheet') {
  const positions = [], patternXY = [], indices = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    positions.push(x0 + i * spacing, y0, z0 + j * spacing);
    patternXY.push(i * spacing, j * spacing);
  }
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  const pxy = new Float32Array(patternXY);
  return { key, positions: new Float32Array(positions), patternXY: pxy, sewnXY: pxy, indices: new Uint32Array(indices) };
}

/** Half-space body: solid below the plane through p0 with (unit) normal n. */
function planeBody(n, p0 = [0, 0, 0]) {
  const l = Math.hypot(...n), u = n.map(v => v / l);
  return {
    sdf: (x, y, z) => (x - p0[0]) * u[0] + (y - p0[1]) * u[1] + (z - p0[2]) * u[2],
    normal: () => u,
  };
}
const sphereBody = (r, c = [0, 0, 0]) => ({
  sdf: (x, y, z) => Math.hypot(x - c[0], y - c[1], z - c[2]) - r,
  normal: (x, y, z) => { const d = Math.hypot(x - c[0], y - c[1], z - c[2]) || 1; return [(x - c[0]) / d, (y - c[1]) / d, (z - c[2]) / d]; },
});
/** No waistband: the whole sheet is free to move. */
const FREE = { pinBand: -1e9 };
const centroid = (sim) => {
  const x = sim.positions, n = x.length / 3; const c = [0, 0, 0];
  for (let i = 0; i < n; i++) { c[0] += x[i * 3]; c[1] += x[i * 3 + 1]; c[2] += x[i * 3 + 2]; }
  return c.map(v => v / n);
};

describe('cloth solver — physics pieces', () => {
  it('SDF projection: a penetrating particle ends exactly on the skin (d = skinGap), pushed along ∇d', () => {
    const body = sphereBody(100);
    const cloth = buildCloth([sheet(3, 3, 10, [-10, 80, -10])], FREE);     // centre particle 20 mm deep
    // cloth constraints off: only the collision acts
    const sim = createClothSim(cloth, body, { gravity: 0, skinGap: 0, selfThickness: 0, stretchStiffness: 0, compressStiffness: 0, bendStiffness: 0 });
    sim.step();
    for (let i = 0; i < cloth.N; i++) {
      const p = sim.positions.subarray(i * 3, i * 3 + 3);
      expect(body.sdf(...p)).toBeGreaterThan(-0.05);
    }
    // the middle particle moved straight up (the sphere's gradient there)
    const mid = sim.positions.subarray(4 * 3, 4 * 3 + 3);
    expect(Math.abs(mid[0]) + Math.abs(mid[2])).toBeLessThan(0.01);
    expect(mid[1]).toBeCloseTo(100, 1);
    // a corner went out along its own radius
    const c = sim.positions.subarray(0, 3), r = Math.hypot(...c);
    expect(r).toBeCloseTo(100, 1);
    expect(c[0] / r).toBeCloseTo(-10 / Math.hypot(10, 80, 10), 2);
  });

  it('friction: cloth stays put on a 25° slope with skin-like friction, slides with none', () => {
    const slope = 25 * Math.PI / 180;
    const body = planeBody([Math.sin(slope), Math.cos(slope), 0]);
    const drift = (mu) => {
      // sheet lying on the slope, 2 mm off it
      const s = sheet(5, 5, 10, [0, 0, 0]);
      for (let i = 0; i < s.positions.length; i += 3) {
        const u = s.positions[i];
        s.positions[i] = u * Math.cos(slope) + 2 * Math.sin(slope);
        s.positions[i + 1] = -u * Math.sin(slope) + 2 * Math.cos(slope);
      }
      const sim = createClothSim(buildCloth([s], FREE), body, { staticFriction: mu, kineticFriction: mu * 0.8, selfThickness: 0 });
      const c0 = centroid(sim);
      sim.run(60);
      const c1 = centroid(sim);
      return Math.hypot(c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]);
    };
    const stuck = drift(0.9), slid = drift(0);
    expect(stuck).toBeLessThan(5);
    expect(slid).toBeGreaterThan(100);
  });

  it('a piece without a waist line hangs from its top edge', () => {
    const s = sheet(4, 4, 10, [0, 500, 0]);
    // stand the sheet up: pattern y runs downward
    for (let i = 0; i < s.positions.length; i += 3) { s.positions[i + 1] = 500 - s.positions[i + 2]; s.positions[i + 2] = 0; }
    const cloth = buildCloth([s]);
    expect(cloth.band.slice(0, 4)).toEqual(new Uint8Array([1, 1, 1, 1]));
    const sim = createClothSim(cloth, planeBody([0, 1, 0]), { selfThickness: 0 });
    sim.run(30);
    expect(Math.min(...Array.from({ length: 16 }, (_, i) => sim.positions[i * 3 + 1]))).toBeGreaterThan(400);
  });

  it('restitution: e = 0 lands dead, e = 0.8 bounces', () => {
    const body = planeBody([0, 1, 0]);
    const bounce = (e) => {
      const sim = createClothSim(buildCloth([sheet(3, 3, 10, [0, 150, 0])], FREE), body, { restitution: e, selfThickness: 0, damping: 0 });
      let landed = false, peak = -Infinity;
      for (let f = 0; f < 90; f++) {
        sim.step();
        const y = centroid(sim)[1];
        if (!landed && y < 4) landed = true;
        else if (landed) peak = Math.max(peak, y);
      }
      return peak;
    };
    expect(bounce(0)).toBeLessThan(4);          // stays on the floor (skinGap 2 mm)
    expect(bounce(0.8)).toBeGreaterThan(40);    // clearly bounces
  });

  it('self-collision: two layers pressed together keep the cloth thickness apart', () => {
    const body = planeBody([0, 1, 0], [0, -1000, 0]);   // far away
    const layers = [sheet(6, 6, 10, [0, 100, 0], 'a'), sheet(6, 6, 10, [1, 102, 1], 'b')];
    const gap = (opts) => {
      const cloth = buildCloth(layers, { ...FREE, sewTolerance: 0 });
      const sim = createClothSim(cloth, body, { gravity: 0, ...opts });
      sim.run(10);
      let min = Infinity;
      for (let i = 0; i < 36; i++) for (let j = 36; j < 72; j++) {
        const a = sim.positions.subarray(i * 3, i * 3 + 3), b = sim.positions.subarray(j * 3, j * 3 + 3);
        min = Math.min(min, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
      }
      return min;
    };
    expect(gap({ selfThickness: 5 })).toBeGreaterThan(4.9);
    expect(gap({ selfThickness: 0 })).toBeLessThan(3);
  });

  it('priority: a self-collision push can never leave cloth inside the body', () => {
    const body = planeBody([0, 1, 0]);
    // layer a on the skin, layer b pressed onto it: pushing a and b apart
    // drives a toward the body — the final body pass must win
    const layers = [sheet(6, 6, 10, [0, 2, 0], 'a'), sheet(6, 6, 10, [2, 3, 2], 'b')];
    const sim = createClothSim(buildCloth(layers, { ...FREE, sewTolerance: 0 }), body, { selfThickness: 6, gravity: -9810 });
    for (let f = 0; f < 30; f++) {
      sim.step();
      for (let i = 0; i < 72; i++) expect(sim.positions[i * 3 + 1]).toBeGreaterThan(2 - 0.05);
    }
  });

  it('no explosion from high initial tension: cloth started 40% oversize relaxes, stays finite and bounded', () => {
    const s = sheet(12, 12, 10, [0, 300, 0]);
    s.patternXY = s.sewnXY = s.patternXY.map(v => v / 1.4);     // pattern much smaller than the start
    const sim = createClothSim(buildCloth([s], FREE), planeBody([0, 1, 0]), { gravity: 0, selfThickness: 0 });
    let prevMove = Infinity;
    for (let f = 0; f < 60; f++) {
      sim.step();
      for (const v of sim.positions) expect(Number.isFinite(v)).toBe(true);
      if (f > 30) { expect(sim.lastFrameMove()).toBeLessThanOrEqual(prevMove + 0.5); prevMove = sim.lastFrameMove(); }
    }
    for (let i = 0; i < sim.positions.length; i += 3) {
      expect(Math.abs(sim.positions[i] - 55)).toBeLessThan(80);
      expect(Math.abs(sim.positions[i + 1] - 300)).toBeLessThan(40);
    }
    expect(sim.stats().maxStretch).toBeLessThan(1.1);
  });
});

// ── real trousers on real bodies ────────────────────────────────────────────

const BODIES = {
  'size 40': [M, 'male_adult', 'trouser'],
  'large 44, slacks': [{ ...M, waist: 1120, hip: 1180, seat: 1200, upperThighGirth: 700, kneeGirth: 440, height: 1840, bodyRise: 310 }, 'male_adult', 'slack'],
  // the fullest seat: hip and seat lines only 25 mm apart
  'woman': [{ ...M, waist: 700, hip: 1000, seat: 1010, chest: 900, upperThighGirth: 600, height: 1650, bodyRise: 270, shoulderWidth: 400 }, 'female_adult', 'trouser'],
};

for (const [name, [m, bodyType, fit]] of Object.entries(BODIES)) {
  describe(`cloth solver — trousers settle on the avatar (${name})`, () => {
    const model = createAvatarModel(m, bodyType);
    const pattern = generateTrouserBlock(m, fit);
    const inst = drapePattern(pattern, bodyForDrape(model), CLOTH_MESH);
    const cloth = buildCloth(inst);
    const sim = createClothSim(cloth, model);
    const moves = [];
    const frameMs = [];
    let settledAt = -1;
    for (let f = 0; f < 150; f++) {
      const t0 = performance.now();
      sim.step();
      frameMs.push(performance.now() - t0);
      moves.push(sim.lastFrameMove());
      if (settledAt < 0 && f > 20 && moves.slice(-6).every(v => v < 0.8)) settledAt = f;
    }
    const st = sim.stats();

    it('panels are sewn together (seams found at side seams, inseams, CF/CB, crotch)', () => {
      expect(cloth.sew.rest.length).toBeGreaterThan(150);
      const parts = new Set();
      for (let c = 0; c < cloth.sew.pairs.length; c += 2) parts.add([cloth.part[cloth.sew.pairs[c]], cloth.part[cloth.sew.pairs[c + 1]]].sort().join('-'));
      // front L–back L, front R–back R (side seams + inseams), front L–front R (CF), back L–back R (CB)
      for (const pr of ['0-2', '1-3', '0-1', '2-3']) expect(parts.has(pr)).toBe(true);
    });

    it('settles: stops moving and does not explode', () => {
      expect(settledAt).toBeGreaterThan(0);
      expect(settledAt).toBeLessThan(140);
      for (const v of sim.positions) expect(Number.isFinite(v)).toBe(true);
      expect(Math.max(...moves.slice(-10))).toBeLessThan(1.25);   // sub-millimetre flicker allowed (see PROGRESS)
    });

    it('nothing inside the body', () => {
      expect(st.inside).toBe(0);
    });

    it('seams stay closed and the fabric keeps its pattern size', () => {
      expect(st.seamGap).toBeLessThan(4);
      // edges longer than 5 mm (short dart slivers aside) within 60% of their
      // pattern length; in the crotch band (±70 mm of the rise line on paper —
      // the same band the drape tests use) up to 2.2×: the forks and the seat
      // cleft are where a sewn trouser also strains
      const x = sim.positions, { pairs, rest } = cloth.stretch;
      const riseOf = Object.fromEntries(Object.entries(pattern.pieces).map(([k, p]) => [k, p.riseY]));
      const partRise = inst.map(i => riseOf[i.key]);
      let worst = 0, worstCrotch = 0;
      for (let c = 0; c < rest.length; c++) {
        if (rest[c] < 5) continue;
        const ia = pairs[c * 2], ib = pairs[c * 2 + 1], a = ia * 3, b = ib * 3;
        const r = Math.hypot(x[a] - x[b], x[a + 1] - x[b + 1], x[a + 2] - x[b + 2]) / rest[c];
        const rise = partRise[cloth.part[ia]];
        const inCrotch = Math.abs(cloth.pat[ia * 2 + 1] - rise) < 70 && Math.abs(cloth.pat[ib * 2 + 1] - rise) < 70;
        if (inCrotch) worstCrotch = Math.max(worstCrotch, r); else worst = Math.max(worst, r);
      }
      expect(worst).toBeLessThan(1.6);
      expect(worstCrotch).toBeLessThan(2.2);
    });

    it('the seat fabric lies smooth: settling does not fold it over on itself', () => {
      const pieces = inst.map((_, k) => ({ positions: sim.instancePositions(k), indices: inst[k].indices }));
      const { seat, share } = seatFoldShare(pieces, model);
      expect(seat).toBeGreaterThan(300);
      expect(share).toBeLessThan(0.02);
    });

    it('hangs from the waist: the waistband stays at its height, the hems drop onto the feet line', () => {
      // (held at its height; only the body push — which always wins — may nudge it)
      for (let i = 0; i < cloth.N; i++) if (cloth.band[i]) expect(Math.abs(sim.positions[i * 3 + 1] - cloth.x[i * 3 + 1])).toBeLessThan(0.1);
      let minY = Infinity; for (let i = 1; i < sim.positions.length; i += 3) minY = Math.min(minY, sim.positions[i]);
      expect(minY).toBeGreaterThan(-5);                 // not through the floor
      expect(minY).toBeLessThan(model.dims.ankleH + 60); // reaches down to the ankle
    });

    it('fast enough to watch (a frame well under 200 ms)', () => {
      const warm = frameMs.slice(10).sort((a, b) => a - b);
      expect(warm[Math.floor(warm.length / 2)]).toBeLessThan(200);
    });
  });
}

// ── the frame-by-frame runner (what the worker runs) ────────────────────────

describe('cloth runner', () => {
  const body = planeBody([0, 1, 0]);
  const instances = [sheet(4, 4, 10, [0, 60, 0])];

  it('streams fresh copies of the positions and finishes when settled', async () => {
    const frames = [];
    const info = await new Promise((resolve) => {
      runClothSimulation({
        instances, body, options: { ...FREE, selfThickness: 0 }, maxFrames: 200,
        schedule: (fn) => setTimeout(fn, 0),
        onFrame: (p, i) => frames.push([p, i]),
        onDone: resolve,
      });
    });
    expect(info.reason).toBe('settled');
    expect(frames.length).toBe(info.frame);
    expect(frames[0][0].length).toBe(16 * 3);
    expect(frames[0][0].buffer).not.toBe(frames[1][0].buffer);   // a copy each frame (safe to transfer)
    expect(frames[0][1].offsets).toEqual([0]);
    expect(frames.at(-1)[0][1]).toBeLessThan(4);                 // landed on the floor
  });

  it('can be cancelled', async () => {
    const info = await new Promise((resolve) => {
      const h = runClothSimulation({
        instances, body, options: { ...FREE, selfThickness: 0 },
        schedule: (fn) => setTimeout(fn, 0),
        onFrame: (p, i) => { if (i.frame === 3) h.cancel(); },
        onDone: resolve,
      });
    });
    expect(info.reason).toBe('cancelled');
    expect(info.frame).toBe(3);
  });
});

/**
 * Surface-nets polygoniser: signed-distance body → closed triangle mesh.
 *
 * Surface nets puts one vertex in every grid cell the skin passes through and
 * joins neighbouring cells with quads, which gives an evenly spaced, closed
 * (watertight) mesh without the sliver triangles of marching cubes.
 *
 * Speed: a coarse pass (4 × spacing) finds the blocks near the skin; only those
 * blocks are evaluated at full resolution, lazily. Each vertex is then snapped
 * onto the true surface with Newton steps along the gradient, so girths on
 * the mesh match the distance function.
 */

const COARSE = 4;

export function polygonize(sdf, bounds, spacing = 10, { snapSteps = 1 } = {}) {
  const h = spacing;
  const [x0, y0, z0] = bounds.min;
  const nx = Math.ceil((bounds.max[0] - x0) / h) + 2;
  const ny = Math.ceil((bounds.max[1] - y0) / h) + 2;
  const nz = Math.ceil((bounds.max[2] - z0) / h) + 2;
  const NXY = nx * ny;
  const vals = new Float32Array(nx * ny * nz).fill(NaN);
  let evals = 0;

  const val = (i, j, k) => {
    const id = i + j * nx + k * NXY;
    let v = vals[id];
    if (v !== v) { v = sdf(x0 + i * h, y0 + j * h, z0 + k * h); vals[id] = v; evals++; }
    return v;
  };

  // ── coarse pass: which COARSE³ blocks can contain skin? ──────────────────
  // A block is kept if its corners disagree on inside/outside, or any corner
  // is close enough that skin could pass through without a sign change.
  const cx = Math.ceil((nx - 1) / COARSE), cy = Math.ceil((ny - 1) / COARSE), cz = Math.ceil((nz - 1) / COARSE);
  const reachC = COARSE * h * 0.9;
  const cnode = (bi, bj, bk) => val(Math.min(bi * COARSE, nx - 1), Math.min(bj * COARSE, ny - 1), Math.min(bk * COARSE, nz - 1));
  const blocks = [];
  for (let bk = 0; bk < cz; bk++) for (let bj = 0; bj < cy; bj++) for (let bi = 0; bi < cx; bi++) {
    let neg = false, pos = false, near = false;
    for (let c = 0; c < 8; c++) {
      const v = cnode(bi + (c & 1), bj + ((c >> 1) & 1), bk + ((c >> 2) & 1));
      if (v < 0) neg = true; else pos = true;
      if (Math.abs(v) < reachC) near = true;
    }
    if ((neg && pos) || near) blocks.push([bi, bj, bk]);
  }

  // ── vertices: one per surface cell ────────────────────────────────────────
  const cellVert = new Map();
  const positions = [];
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const CORNER = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const cv = new Float64Array(8);

  function vertexFor(i, j, k) {
    const key = i + j * nx + k * NXY;
    const hit = cellVert.get(key);
    if (hit !== undefined) return hit;
    let mask = 0;
    for (let c = 0; c < 8; c++) { cv[c] = val(i + CORNER[c][0], j + CORNER[c][1], k + CORNER[c][2]); if (cv[c] < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) { cellVert.set(key, -1); return -1; }
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of EDGES) {
      const va = cv[a], vb = cv[b];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      sx += CORNER[a][0] + (CORNER[b][0] - CORNER[a][0]) * t;
      sy += CORNER[a][1] + (CORNER[b][1] - CORNER[a][1]) * t;
      sz += CORNER[a][2] + (CORNER[b][2] - CORNER[a][2]) * t;
      n++;
    }
    let px = x0 + (i + sx / n) * h, py = y0 + (j + sy / n) * h, pz = z0 + (k + sz / n) * h;
    // snap onto the true surface (Newton along the gradient), staying in the cell's reach
    for (let s = 0; s < snapSteps; s++) {
      const d = sdf(px, py, pz);
      const e = 0.5;
      let gx = sdf(px + e, py, pz) - d, gy = sdf(px, py + e, pz) - d, gz = sdf(px, py, pz + e) - d;
      const g = Math.hypot(gx, gy, gz) || 1; gx /= g; gy /= g; gz /= g;
      const step = Math.max(-h, Math.min(h, d));
      px -= gx * step; py -= gy * step; pz -= gz * step;
      evals += 4;
    }
    const id = positions.length / 3;
    positions.push(px, py, pz);
    cellVert.set(key, id);
    return id;
  }

  // ── faces: every grid edge that crosses the skin becomes a quad ──────────
  const indices = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) indices.push(a, c, b, a, d, c);
    else indices.push(a, b, c, a, c, d);
  };
  for (const [bi, bj, bk] of blocks) {
    const iE = Math.min((bi + 1) * COARSE, nx - 1), jE = Math.min((bj + 1) * COARSE, ny - 1), kE = Math.min((bk + 1) * COARSE, nz - 1);
    for (let k = bk * COARSE; k < kE; k++) for (let j = bj * COARSE; j < jE; j++) for (let i = bi * COARSE; i < iE; i++) {
      const v0 = val(i, j, k);
      const in0 = v0 < 0;
      // edge +x
      if (j > 0 && k > 0 && i + 1 < nx && (val(i + 1, j, k) < 0) !== in0) {
        quad(vertexFor(i, j - 1, k - 1), vertexFor(i, j, k - 1), vertexFor(i, j, k), vertexFor(i, j - 1, k), !in0);
      }
      // edge +y
      if (i > 0 && k > 0 && j + 1 < ny && (val(i, j + 1, k) < 0) !== in0) {
        quad(vertexFor(i - 1, j, k - 1), vertexFor(i - 1, j, k), vertexFor(i, j, k), vertexFor(i, j, k - 1), !in0);
      }
      // edge +z
      if (i > 0 && j > 0 && k + 1 < nz && (val(i, j, k + 1) < 0) !== in0) {
        quad(vertexFor(i - 1, j - 1, k), vertexFor(i, j - 1, k), vertexFor(i, j, k), vertexFor(i - 1, j, k), !in0);
      }
    }
  }

  return { positions: new Float32Array(positions), indices: new Uint32Array(indices), evals, spacing: h };
}

/**
 * Mesh health check: counts edges not shared by exactly two triangles.
 * A closed manifold mesh has zero boundary and zero non-manifold edges.
 */
export function meshTopology(indices) {
  const count = new Map();
  for (let t = 0; t < indices.length; t += 3) {
    for (const [a, b] of [[indices[t], indices[t + 1]], [indices[t + 1], indices[t + 2]], [indices[t + 2], indices[t]]]) {
      const key = a < b ? a * 4194304 + b : b * 4194304 + a;
      count.set(key, (count.get(key) || 0) + 1);
    }
  }
  let boundary = 0, nonManifold = 0;
  for (const c of count.values()) { if (c === 1) boundary++; else if (c > 2) nonManifold++; }
  let degenerate = 0;
  for (let t = 0; t < indices.length; t += 3) {
    if (indices[t] === indices[t + 1] || indices[t + 1] === indices[t + 2] || indices[t] === indices[t + 2]) degenerate++;
  }
  return { edges: count.size, boundary, nonManifold, degenerate, triangles: indices.length / 3 };
}

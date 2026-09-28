/**
 * Test helpers shared by the drape and cloth tests.
 */

/**
 * Share of seat triangles folded over: facing the body the opposite way from
 * the rest of their panel. Behind the body, hip line (+60) down to the fold.
 */
export function seatFoldShare(pieces, model) {
  const d = model.dims;
  let seat = 0, folded = 0;
  for (const { positions: X, indices: I } of pieces) {
    let pos = 0, neg = 0;
    const seatDots = [];
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const ux = X[b] - X[a], uy = X[b + 1] - X[a + 1], uz = X[b + 2] - X[a + 2];
      const vx = X[c] - X[a], vy = X[c + 1] - X[a + 1], vz = X[c + 2] - X[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz);
      if (l < 1e-6) continue;
      const cx = (X[a] + X[b] + X[c]) / 3, cy = (X[a + 1] + X[b + 1] + X[c + 1]) / 3, cz = (X[a + 2] + X[b + 2] + X[c + 2]) / 3;
      const bn = model.normal(cx, cy, cz), dot = (nx * bn[0] + ny * bn[1] + nz * bn[2]) / l;
      if (dot >= 0) pos++; else neg++;
      if (cy > d.crotchH - 10 && cy < d.hipH + 60 && cz < -20) seatDots.push(dot);
    }
    const sign = pos >= neg ? 1 : -1;
    seat += seatDots.length;
    folded += seatDots.filter(v => v * sign < 0).length;
  }
  return { seat, share: seat ? folded / seat : 0 };
}

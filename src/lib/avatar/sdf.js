/**
 * Signed-distance primitives for the parametric avatar.
 *
 * Convention: all lengths in mm, y up, z forward. A signed distance is
 * negative inside the body, zero on the skin, positive outside. The same
 * functions build the visible mesh (lib/avatar/mesher.js) and answer
 * collision queries for the cloth (distance + outward normal), so what you
 * see is exactly what the fabric collides with.
 *
 * Formulas follow Inigo Quilez's reference distance functions
 * (iquilezles.org/articles/distfunctions), written out for plain JS numbers.
 */

/** Polynomial smooth minimum: blends two shapes over a radius k (mm). */
export function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/**
 * Round cone between two spheres (centre a, radius ra) → (centre b, radius rb).
 * Exact distance. Used for limb segments: thigh, shin, upper arm, forearm, neck.
 */
export function sdRoundCone(px, py, pz, ax, ay, az, bx, by, bz, ra, rb) {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = ra - rb;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const pax = px - ax, pay = py - ay, paz = pz - az;
  const y = pax * bax + pay * bay + paz * baz;
  const z = y - l2;
  const xx = pax * l2 - bax * y, xy = pay * l2 - bay * y, xz = paz * l2 - baz * y;
  const x2 = xx * xx + xy * xy + xz * xz;
  const y2 = y * y * l2;
  const z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - rb;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - ra;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - ra;
}

/** Ellipsoid with semi-axes (rx, ry, rz), centred at c. Good approximation (IQ). */
export function sdEllipsoid(px, py, pz, cx, cy, cz, rx, ry, rz) {
  const x = px - cx, y = py - cy, z = pz - cz;
  const k0 = Math.hypot(x / rx, y / ry, z / rz);
  const k1 = Math.hypot(x / (rx * rx), y / (ry * ry), z / (rz * rz));
  return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(rx, ry, rz);
}

/** 2D ellipse (semi-axes a, b) distance approximation — torso cross-sections. */
export function sdEllipse2(x, z, a, b) {
  const k0 = Math.hypot(x / a, z / b);
  const k1 = Math.hypot(x / (a * a), z / (b * b));
  return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(a, b);
}

/** Ellipse perimeter (Ramanujan II) — girth of an oval cross-section. */
export function ellipsePerimeter(a, b) {
  const h = ((a - b) * (a - b)) / ((a + b) * (a + b));
  return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
}

/**
 * Monotone cubic interpolation (Fritsch–Carlson) through keyframes.
 * Smooth, never overshoots — so widening the hip can't make the waist bulge.
 * keys: [{ y, v }] sorted by y. Returns f(y); flat beyond the ends.
 */
export function monotoneCurve(keys) {
  const n = keys.length;
  const ys = keys.map(k => k.y), vs = keys.map(k => k.v);
  const d = new Array(n - 1), m = new Array(n);
  for (let i = 0; i < n - 1; i++) d[i] = (vs[i + 1] - vs[i]) / ((ys[i + 1] - ys[i]) || 1e-9);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return function (y) {
    if (y <= ys[0]) return vs[0];
    if (y >= ys[n - 1]) return vs[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ys[mid] > y) hi = mid; else lo = mid; }
    const h = ys[hi] - ys[lo], t = (y - ys[lo]) / h;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * vs[lo] + (t3 - 2 * t2 + t) * h * m[lo]
         + (-2 * t3 + 3 * t2) * vs[hi] + (t3 - t2) * h * m[hi];
  };
}

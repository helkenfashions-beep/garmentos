// geometry.js — coordinate math, snap detection, bezier utilities
// 1 SVG unit = 1mm throughout the system

// ─── Distance ───────────────────────────────────────────────────────────────

export function dist(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function distSq(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy;
}

// ─── Snap ────────────────────────────────────────────────────────────────────

/**
 * Find the nearest point within snapRadius (in SVG/mm units).
 * Returns { snapped: true, point, id } or { snapped: false, point: cursor }
 */
export function findSnap(cursor, points, snapRadiusMm) {
  let bestId = null;
  let bestDist = Infinity;

  for (const [id, pt] of Object.entries(points)) {
    const d = dist(cursor, pt);
    if (d < snapRadiusMm && d < bestDist) {
      bestDist = d;
      bestId = id;
    }
  }

  if (bestId !== null) {
    return { snapped: true, point: points[bestId], id: bestId };
  }
  return { snapped: false, point: cursor, id: null };
}

// ─── Viewport / coordinate conversion ───────────────────────────────────────

/**
 * Convert a DOM mouse event position to SVG canvas coordinates (mm).
 * viewport = { x, y, scale }  where x,y are the SVG viewBox offset
 */
export function screenToCanvas(screenX, screenY, svgRect, viewport) {
  const relX = screenX - svgRect.left;
  const relY = screenY - svgRect.top;
  return {
    x: (relX / viewport.scale) + viewport.x,
    y: (relY / viewport.scale) + viewport.y,
  };
}

export function canvasToScreen(canvasX, canvasY, svgRect, viewport) {
  return {
    x: (canvasX - viewport.x) * viewport.scale + svgRect.left,
    y: (canvasY - viewport.y) * viewport.scale + svgRect.top,
  };
}

// ─── Measurement formatting ──────────────────────────────────────────────────

/**
 * Format a distance in mm to a human-readable string.
 * Under 10mm: show 1dp, otherwise integer mm.
 * Over 100mm: also show cm.
 */
export function formatMm(mm) {
  if (mm < 10) return `${mm.toFixed(1)}mm`;
  if (mm >= 100) return `${mm.toFixed(0)}mm (${(mm / 10).toFixed(1)}cm)`;
  return `${Math.round(mm)}mm`;
}

// ─── Segment length ──────────────────────────────────────────────────────────

/**
 * Approximate arc length of a cubic bezier curve by sampling.
 * p1, p2, c1, c2 are all {x, y} in mm.
 * samples: higher = more accurate, 20 is fine for display.
 */
export function bezierLength(p1, c1, c2, p2, samples = 20) {
  let length = 0;
  let prev = p1;
  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    const pt = cubicBezierPoint(p1, c1, c2, p2, t);
    length += dist(prev, pt);
    prev = pt;
  }
  return length;
}

export function lineLength(p1, p2) {
  return dist(p1, p2);
}

// ─── Cubic bezier math ───────────────────────────────────────────────────────

export function cubicBezierPoint(p1, c1, c2, p2, t) {
  const mt = 1 - t;
  return {
    x: mt * mt * mt * p1.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * p2.x,
    y: mt * mt * mt * p1.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * p2.y,
  };
}

/**
 * Default control points for a new bezier segment — 1/3 and 2/3 along the line.
 */
export function defaultControlPoints(p1, p2) {
  return {
    c1: { x: p1.x + (p2.x - p1.x) / 3, y: p1.y + (p2.y - p1.y) / 3 },
    c2: { x: p1.x + (2 * (p2.x - p1.x)) / 3, y: p1.y + (2 * (p2.y - p1.y)) / 3 },
  };
}

// ─── Hit testing ─────────────────────────────────────────────────────────────

/**
 * Check if cursor is within radiusMm of any point on a line segment.
 * Uses perpendicular distance for interior of segment, endpoint distance at ends.
 */
export function isNearLine(cursor, p1, p2, radiusMm) {
  const lenSq = distSq(p1, p2);
  if (lenSq === 0) return dist(cursor, p1) <= radiusMm;

  let t = ((cursor.x - p1.x) * (p2.x - p1.x) + (cursor.y - p1.y) * (p2.y - p1.y)) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const nearest = {
    x: p1.x + t * (p2.x - p1.x),
    y: p1.y + t * (p2.y - p1.y),
  };
  return dist(cursor, nearest) <= radiusMm;
}

/**
 * Check if cursor is within radiusMm of a cubic bezier (samples the curve).
 */
export function isNearBezier(cursor, p1, c1, c2, p2, radiusMm, samples = 20) {
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const pt = cubicBezierPoint(p1, c1, c2, p2, t);
    if (dist(cursor, pt) <= radiusMm) return true;
  }
  return false;
}

// ─── ID generation ───────────────────────────────────────────────────────────

let _idCounter = 0;
export function newId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${_idCounter++}`;
}

// ─── Shape helpers ───────────────────────────────────────────────────────────

/**
 * Return 4 cubic bezier segment specs that approximate a circle.
 * Uses kappa = 0.5523 — standard quarter-circle bezier approximation.
 * Each spec has { p1, p2, c1, c2 } as {x,y} positions (not IDs).
 */
export function circleAsBezierSegments(cx, cy, r) {
  const k = 0.5523;
  const top    = { x: cx,     y: cy - r };
  const right  = { x: cx + r, y: cy     };
  const bottom = { x: cx,     y: cy + r };
  const left   = { x: cx - r, y: cy     };
  return [
    { p1: top,    p2: right,  c1: { x: cx + r * k, y: cy - r     }, c2: { x: cx + r,     y: cy - r * k } },
    { p1: right,  p2: bottom, c1: { x: cx + r,     y: cy + r * k }, c2: { x: cx + r * k, y: cy + r     } },
    { p1: bottom, p2: left,   c1: { x: cx - r * k, y: cy + r     }, c2: { x: cx - r,     y: cy + r * k } },
    { p1: left,   p2: top,    c1: { x: cx - r,     y: cy - r * k }, c2: { x: cx - r * k, y: cy - r     } },
  ];
}

/**
 * Return a new p2 position that is newLength away from p1, along the same direction.
 */
export function extendLineP2(p1, p2, newLength) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const d  = Math.sqrt(dx * dx + dy * dy) || 1;
  return { x: p1.x + (dx / d) * newLength, y: p1.y + (dy / d) * newLength };
}

/**
 * Scale a bezier curve to a new arc length by scaling all three moving points
 * (c1, c2, p2) relative to the fixed anchor p1.
 */
export function scaleBezierFromP1(p1, c1, c2, p2, newLength) {
  const current = bezierLength(p1, c1, c2, p2);
  const sf = current > 0 ? newLength / current : 1;
  return {
    c1: { x: p1.x + (c1.x - p1.x) * sf, y: p1.y + (c1.y - p1.y) * sf },
    c2: { x: p1.x + (c2.x - p1.x) * sf, y: p1.y + (c2.y - p1.y) * sf },
    p2: { x: p1.x + (p2.x - p1.x) * sf, y: p1.y + (p2.y - p1.y) * sf },
  };
}

// ─── Grid helpers ────────────────────────────────────────────────────────────

/**
 * Return the set of grid line positions visible in the current viewport.
 * gridSpacing in mm. Returns { xLines: number[], yLines: number[] }
 */
export function visibleGridLines(viewport, svgWidth, svgHeight, gridSpacing) {
  const left   = viewport.x;
  const top    = viewport.y;
  const right  = viewport.x + svgWidth  / viewport.scale;
  const bottom = viewport.y + svgHeight / viewport.scale;

  const xStart = Math.floor(left   / gridSpacing) * gridSpacing;
  const yStart = Math.floor(top    / gridSpacing) * gridSpacing;

  const xLines = [];
  const yLines = [];

  for (let x = xStart; x <= right;  x += gridSpacing) xLines.push(x);
  for (let y = yStart; y <= bottom; y += gridSpacing) yLines.push(y);

  return { xLines, yLines };
}

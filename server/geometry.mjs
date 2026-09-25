// Geometry primitives for fixture-plan adjudication.
// Coordinates are plain { x, y } numbers in the wing-board frame (mm).

export function point(x, y) {
  return { x, y };
}

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Signed cross product (B-A) x (C-A). >0 => C is left of directed edge A->B. */
export function cross(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/**
 * Convex hull via Andrew's monotone chain.
 * Returns vertices in counter-clockwise order, starting at the
 * lexicographically smallest point. Collinear boundary points are removed.
 */
export function convexHull(points) {
  const pts = points
    .map((p) => ({ x: p.x, y: p.y, ref: p }))
    .sort((a, b) => (a.x - b.x || a.y - b.y));

  if (pts.length <= 1) return pts.map((p) => ({ x: p.x, y: p.y }));

  const lower = [];
  for (const p of pts) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    ) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    ) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper).map((p) => ({ x: p.x, y: p.y }));
}

/** Polygon signed area (positive for CCW vertex order). */
export function polygonArea(poly) {
  let twice = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    twice += a.x * b.y - b.x * a.y;
  }
  return twice / 2;
}

/**
 * Signed distance from p to each edge of a CCW convex polygon.
 * Positive values mean p is on the interior (left) side of the edge.
 */
export function edgeDistancesCCW(poly, p) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    out.push(len === 0 ? 0 : cross(a, b, p) / len);
  }
  return out;
}

/**
 * Signed distance from p to the boundary of a convex polygon (CCW):
 *   > 0 strictly inside, === 0 on boundary, < 0 outside.
 * For a degenerate hull (segment / point) every value is <= 0: the
 * pad set can never enclose a point, which matches the tipping requirement.
 */
export function signedDistanceToPolygon(poly, p) {
  if (poly.length < 3) return -Infinity;
  return Math.min(...edgeDistancesCCW(poly, p));
}

/** Index of the polygon edge closest to p (the limiting edge). */
export function nearestEdgeIndex(poly, p) {
  const ds = edgeDistancesCCW(poly, p);
  let idx = 0;
  for (let i = 1; i < ds.length; i++) {
    if (ds[i] < ds[idx]) idx = i;
  }
  return idx;
}

/** Four corners of the axis-aligned CG deviation rectangle. */
export function deviationCorners(cg, dx, dy) {
  return [
    { x: cg.x - dx, y: cg.y - dy },
    { x: cg.x + dx, y: cg.y - dy },
    { x: cg.x + dx, y: cg.y + dy },
    { x: cg.x - dx, y: cg.y + dy },
  ];
}

/** True when an axis-aligned rectangle lies strictly inside a CCW polygon. */
export function rectInsidePolygon(poly, min, max, eps) {
  if (poly.length < 3) return false;
  const corners = [
    { x: min.x, y: min.y },
    { x: max.x, y: min.y },
    { x: max.x, y: max.y },
    { x: min.x, y: max.y },
  ];
  return corners.every((c) => signedDistanceToPolygon(poly, c) > eps);
}

/** True when point p is inside or on an axis-aligned boundary rectangle. */
export function pointInBounds(p, min, max, eps) {
  return (
    p.x >= min.x - eps &&
    p.x <= max.x + eps &&
    p.y >= min.y - eps &&
    p.y <= max.y + eps
  );
}

/** Smallest signed distance from any of `points` to the polygon boundary. */
export function minCornerMargin(poly, points) {
  let m = Infinity;
  for (const p of points) {
    const d = signedDistanceToPolygon(poly, p);
    if (d < m) m = d;
  }
  return m;
}

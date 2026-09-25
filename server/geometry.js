// 纯计算几何工具：二维点、有符号距离、凸包、点与简单多边形关系。
// 所有多边形约定按逆时针(CCW)给出边时，内部位于每条有向边的左侧，
// 因此“点到边的有符号距离”为正表示在内部、为负表示在外部、为 0 表示恰在边界上。

export function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function cross(a, b) {
  return a.x * b.y - a.y * b.x;
}

export function pointDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * 点 p 到过 a、b 的直线的有符号距离（沿 a->b 方向，左侧为正）。
 */
export function lineSide(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return pointDistance(p, a);
  return cross({ x: dx, y: dy }, sub(p, a)) / len;
}

/**
 * 点到线段的（无符号）距离，用于退化凸包（共线/重合）时的证据量化。
 */
export function distanceToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return pointDistance(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function polygonSignedArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/**
 * 保证多边形为逆时针方向。
 */
export function ensureCCW(poly) {
  return polygonSignedArea(poly) < 0 ? poly.slice().reverse() : poly.slice();
}

/**
 * 点到（逆时针）多边形边界的有符号距离：
 * 内部为正（到最近边的距离），外部为负。
 */
export function polygonSignedDistance(polyCCW, p) {
  let minAbs = Infinity;
  for (let i = 0; i < polyCCW.length; i++) {
    minAbs = Math.min(minAbs, lineSide(p, polyCCW[i], polyCCW[(i + 1) % polyCCW.length]));
  }
  return minAbs;
}

/**
 * 射线法点是否在多边形内（含边界）。
 */
export function pointInPolygon(poly, p) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    const onBoundary =
      (a.x - p.x) * (b.y - p.y) - (a.y - p.y) * (b.x - p.x) === 0 &&
      Math.min(a.x, b.x) <= p.x && p.x <= Math.max(a.x, b.x) &&
      Math.min(a.y, b.y) <= p.y && p.y <= Math.max(a.y, b.y);
    if (onBoundary) return true;
    const intersects =
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function dedupe(points) {
  const seen = new Set();
  const out = [];
  for (const p of points) {
    const key = `${p.x},${p.y}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(p);
    }
  }
  return out;
}

/**
 * Andrew 单调链凸包，返回逆时针顶点序列，剔除共线中间点。
 * 点数不足时原样返回（去重后）。
 */
export function convexHull(points) {
  const pts = dedupe(points).sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length <= 2) return pts;
  const cross3 = (o, a, b) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross3(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross3(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * 点到逆时针凸包边界的最小有符号距离（各边有符号距离的最小值）。
 * 凸包退化（不足 3 个顶点）时返回 -Infinity。
 */
export function convexMargin(hullCCW, p) {
  if (hullCCW.length < 3) return -Infinity;
  let m = Infinity;
  for (let i = 0; i < hullCCW.length; i++) {
    m = Math.min(m, lineSide(p, hullCCW[i], hullCCW[(i + 1) % hullCCW.length]));
  }
  return m;
}

// Fixture-plan solver.
//
// Enumerates the FULL cartesian product of the four rails' approved
// candidate points and adjudicates every combination directly:
//   hard constraints (all must hold):
//     1. every chosen pad lies inside the approved wing boundary
//     2. every pair of pads is at least minSpacing apart
//     3. every corner of the CG deviation rectangle is STRICTLY inside
//        the support convex hull (positive signed distance to every edge)
//   lexicographic objective over feasible combinations:
//     a. maximise the minimum signed corner-to-hull-boundary distance
//     b. minimise the sum of pad-to-nominal-CG distances
//     c. tie-break on the candidate-number sequence in rail input order
//        (lexicographically smallest), giving a unique stable plan
//
// When nothing is feasible, the combination with the smallest worst
// constraint shortfall is returned as evidence of the closest failure.

import {
  convexHull,
  signedDistanceToPolygon,
  edgeDistancesCCW,
  deviationCorners,
  dist,
  pointInBounds,
} from './geometry.mjs';

// Strict interior tolerance (mm). A corner exactly on a hull edge fails.
export const STRICT_EPS = 1e-7;
// Numeric tolerance used when comparing objective values for ties.
const TIE_EPS = 1e-9;
// Enumeration guard so an over-large request cannot stall the service.
const MAX_COMBINATIONS = 5_000_000;

function round6(v) {
  if (!Number.isFinite(v)) return v;
  return Math.round(v * 1e6) / 1e6;
}

/** Iterate every cartesian-product tuple of the four rails. */
function* combinations(rails) {
  const n = rails.length;
  const idx = new Array(n).fill(0);
  const sizes = rails.map((r) => r.length);
  for (;;) {
    yield idx.map((k, r) => rails[r][k]);
    let r = n - 1;
    while (r >= 0 && idx[r] + 1 >= sizes[r]) {
      idx[r] = 0;
      r--;
    }
    if (r < 0) return;
    idx[r]++;
  }
}

function boundaryOvershoot(pad, bounds) {
  // L_inf distance (mm) by which a point sits outside the boundary box.
  return Math.max(
    bounds.min.x - pad.x,
    pad.x - bounds.max.x,
    bounds.min.y - pad.y,
    pad.y - bounds.max.y,
    0,
  );
}

function evaluateTuple(pads, ctx) {
  const { bounds, minSpacing, corners } = ctx;

  // ---- constraint 1: wing boundary -------------------------------------
  const boundaryViolations = [];
  let boundaryGap = 0;
  pads.forEach((pad, rail) => {
    if (!pointInBounds(pad, bounds.min, bounds.max, STRICT_EPS)) {
      const overshoot = boundaryOvershoot(pad, bounds);
      boundaryGap = Math.max(boundaryGap, overshoot);
      boundaryViolations.push({ rail, candidateNumber: pad.__k + 1, point: pt(pad), overshoot: round6(overshoot) });
    }
  });

  // ---- constraint 2: pad spacing ---------------------------------------
  const spacingViolations = [];
  let spacingGap = 0;
  for (let i = 0; i < pads.length; i++) {
    for (let j = i + 1; j < pads.length; j++) {
      const d = dist(pads[i], pads[j]);
      if (d < minSpacing - STRICT_EPS) {
        const shortfall = minSpacing - d;
        spacingGap = Math.max(spacingGap, shortfall);
        spacingViolations.push({
          rails: [i, j],
          candidateNumbers: [pads[i].__k + 1, pads[j].__k + 1],
          points: [pt(pads[i]), pt(pads[j])],
          distance: round6(d),
          required: round6(minSpacing),
          shortfall: round6(shortfall),
        });
      }
    }
  }

  // ---- constraint 3: deviation rectangle strictly inside support hull --
  const hull = convexHull(pads.map((p) => ({ x: p.x, y: p.y })));
  const cornerResults = corners.map((c) => {
    const margins = hull.length >= 3 ? edgeDistancesCCW(hull, c) : [];
    const signedMargin = signedDistanceToPolygon(hull, c);
    let edgeIndex = -1;
    if (margins.length) {
      edgeIndex = 0;
      for (let i = 1; i < margins.length; i++) {
        if (margins[i] < margins[edgeIndex]) edgeIndex = i;
      }
    }
    return { corner: c, signedMargin, edgeIndex, margins };
  });
  const minMargin = Math.min(...cornerResults.map((c) => c.signedMargin));
  // Strict interior: margin must be greater than STRICT_EPS.
  const containmentViolated = hull.length < 3 || minMargin <= STRICT_EPS;
  const containmentGap =
    hull.length < 3 ? Infinity : Math.max(0, STRICT_EPS - minMargin);

  const feasible =
    boundaryViolations.length === 0 &&
    spacingViolations.length === 0 &&
    hull.length >= 3 &&
    minMargin > STRICT_EPS;

  return {
    feasible,
    hull,
    cornerResults,
    minMargin,
    boundaryGap,
    spacingGap,
    containmentGap,
    containmentViolated,
    boundaryViolations,
    spacingViolations,
  };
}

function pt(p) {
  return { x: round6(p.x), y: round6(p.y) };
}

function describeCorners(cornerResults, hull, labels) {
  return cornerResults.map((r, i) => {
    const edge =
      r.edgeIndex >= 0
        ? {
            a: hull[r.edgeIndex],
            b: hull[(r.edgeIndex + 1) % hull.length],
          }
        : null;
    return {
      label: labels[i],
      point: { x: round6(r.corner.x), y: round6(r.corner.y) },
      signedMargin: round6(r.signedMargin),
      nearestEdge: edge
        ? { a: pt(edge.a), b: pt(edge.b) }
        : null,
    };
  });
}

/**
 * @param {object} input normalized request:
 *   rails: Array<4, Array<{x,y}>>, bounds {min:{x,y},max:{x,y}},
 *   cg {x,y}, deviation {x,y}, minSpacing number
 */
export function planFixture(input) {
  const rails = input.rails;
  const corners = deviationCorners(input.cg, input.deviation.x, input.deviation.y);
  const cornerLabels = ['BL', 'BR', 'TR', 'TL'];
  const ctx = {
    bounds: input.bounds,
    minSpacing: input.minSpacing,
    corners,
  };

  const totalCombinations = rails.reduce((acc, r) => acc * r.length, 1);
  if (totalCombinations > MAX_COMBINATIONS) {
    const err = new Error(
      `候选点组合数 ${totalCombinations} 超过上限 ${MAX_COMBINATIONS}，请收窄候选点`,
    );
    err.code = 'TOO_MANY_COMBINATIONS';
    throw err;
  }

  // Annotate each candidate with its 1-based input position.
  rails.forEach((rail, r) => {
    rail.forEach((p, k) => {
      p.__k = k;
      p.__rail = r;
    });
  });

  let best = null; // best feasible tuple
  // Best (least-bad) infeasible evidence: smallest worst shortfall first,
  // then fewest violated constraint groups, then candidate sequence.
  let closestFailure = null;

  let feasibleCount = 0;
  for (const pads of combinations(rails)) {
    const ev = evaluateTuple(pads, ctx);
    const sequence = pads.map((p) => p.__k + 1);

    if (ev.feasible) {
      feasibleCount++;
      const distanceSum = pads.reduce((acc, p) => acc + dist(p, input.cg), 0);
      const candidate = { pads, ev, sequence, distanceSum };
      if (!best || compareFeasible(candidate, best) < 0) best = candidate;
    } else if (!closestFailure || compareFailure(pads, ev, closestFailure) < 0) {
      closestFailure = { pads, ev, sequence };
    }
  }

  const stats = {
    combinations: totalCombinations,
    feasibleCombinations: feasibleCount,
  };

  if (best) {
    const { pads, ev, sequence, distanceSum } = best;
    return {
      feasible: true,
      selection: pads.map((p, rail) => ({
        rail,
        candidateNumber: p.__k + 1,
        point: pt(p),
      })),
      candidateSequence: sequence,
      hull: ev.hull.map((h) => ({ x: round6(h.x), y: round6(h.y) })),
      corners: describeCorners(ev.cornerResults, ev.hull, cornerLabels),
      minMargin: round6(ev.minMargin),
      padDistanceSum: round6(distanceSum),
      cg: pt(input.cg),
      deviation: { x: input.deviation.x, y: input.deviation.y },
      stats,
    };
  }

  return {
    feasible: false,
    stats,
    evidence: buildFailureEvidence(closestFailure, cornerLabels),
  };
}

/** Lexicographic feasible ordering: margin desc, distance sum asc, sequence asc. */
function compareFeasible(a, b) {
  if (a.ev.minMargin - b.ev.minMargin > TIE_EPS) return -1;
  if (b.ev.minMargin - a.ev.minMargin > TIE_EPS) return 1;
  if (a.distanceSum - b.distanceSum > TIE_EPS) return 1;
  if (b.distanceSum - a.distanceSum > TIE_EPS) return -1;
  return compareSequence(a.sequence, b.sequence);
}

function compareSequence(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/** Infeasible ordering: nearest to satisfying every constraint wins. */
function compareFailure(pads, ev, cur) {
  const gap = failureGap(ev);
  const curGap = failureGap(cur.ev);
  if (gap !== curGap) return gap < curGap ? -1 : 1;
  const groups = failedGroupCount(ev);
  const curGroups = failedGroupCount(cur.ev);
  if (groups !== curGroups) return groups - curGroups;
  const seq = pads.map((p) => p.__k + 1);
  return compareSequence(seq, cur.sequence);
}

function failureGap(ev) {
  // -Infinity margins map to Infinity; surface them last.
  return Math.max(
    ev.boundaryGap,
    ev.spacingGap,
    Number.isFinite(ev.containmentGap) ? ev.containmentGap : 1e18,
  );
}

function failedGroupCount(ev) {
  return (
    (ev.boundaryViolations.length ? 1 : 0) +
    (ev.spacingViolations.length ? 1 : 0) +
    (ev.hull.length < 3 || ev.containmentViolated ? 1 : 0)
  );
}

function buildFailureEvidence(closest, cornerLabels) {
  const { pads, ev, sequence } = closest;
  const failedConstraints = [];
  if (ev.boundaryViolations.length) failedConstraints.push('boundary');
  if (ev.spacingViolations.length) failedConstraints.push('spacing');
  if (ev.hull.length < 3 || ev.containmentViolated) {
    failedConstraints.push('containment');
  }

  let containment = null;
  if (ev.hull.length < 3) {
    containment = {
      reason: '四点共线或重合，支撑凸包退化，无法围合任何偏差角点',
      degenerateHull: ev.hull.map((h) => pt(h)),
    };
  } else {
    let worst = ev.cornerResults[0];
    for (const c of ev.cornerResults.slice(1)) {
      if (c.signedMargin < worst.signedMargin) worst = c;
    }
    const edge =
      worst.edgeIndex >= 0
        ? {
            a: ev.hull[worst.edgeIndex],
            b: ev.hull[(worst.edgeIndex + 1) % ev.hull.length],
          }
        : null;
    containment = {
      worstCorner: {
        label: cornerLabels[ev.cornerResults.indexOf(worst)],
        point: pt(worst.corner),
        signedMargin: round6(worst.signedMargin),
      },
      nearestEdge: edge ? { a: pt(edge.a), b: pt(edge.b) } : null,
      shortfall: round6(Math.max(0, -worst.signedMargin)),
      strictShortfall: round6(ev.containmentGap),
      corners: describeCorners(ev.cornerResults, ev.hull, cornerLabels),
    };
  }

  return {
    selection: pads.map((p, rail) => ({
      rail,
      candidateNumber: p.__k + 1,
      point: pt(p),
    })),
    candidateSequence: sequence,
    overallGap: round6(failureGap(ev) >= 1e18 ? Infinity : failureGap(ev)),
    failedConstraints,
    boundary: ev.boundaryViolations,
    spacing: ev.spacingViolations,
    containment,
  };
}

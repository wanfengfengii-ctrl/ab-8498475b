import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planFixture } from '../server/planner.mjs';

const BOUNDS = { min: { x: 0, y: 0 }, max: { x: 1000, y: 600 } };
const CG = { x: 500, y: 300 };

function baseInput(rails, opts = {}) {
  return {
    rails,
    bounds: BOUNDS,
    cg: opts.cg || CG,
    deviation: opts.deviation || { x: 60, y: 40 },
    minSpacing: opts.minSpacing ?? 300,
  };
}

test('feasible: chooses outer pads to maximise minimum corner margin', () => {
  const rails = [
    [{ x: 50, y: 50 }, { x: 100, y: 100 }],
    [{ x: 950, y: 50 }, { x: 900, y: 100 }],
    [{ x: 950, y: 550 }, { x: 900, y: 500 }],
    [{ x: 50, y: 550 }, { x: 100, y: 500 }],
  ];
  const r = planFixture(baseInput(rails));
  assert.equal(r.feasible, true);
  assert.deepEqual(r.candidateSequence, [1, 1, 1, 1]);
  // Hull is the 900x500 rectangle; nearest corner (440,260)/(440,340)
  // is 210 mm from the y=50 / y=550 edges.
  assert.ok(Math.abs(r.minMargin - 210) < 1e-6, `margin=${r.minMargin}`);
  assert.equal(r.corners.length, 4);
  assert.ok(r.corners.every((c) => c.signedMargin > 0));
  assert.equal(r.stats.combinations, 16);
  assert.ok(r.stats.feasibleCombinations >= 1);
});

test('objective 2: equal margins broken by smaller pad-to-CG distance sum', () => {
  const rails = [
    // moving rail-0 pad from (100,100) to (300,100) leaves the limiting
    // top/bottom margin at exactly 170 but shortens the CG distance sum
    [{ x: 100, y: 100 }, { x: 300, y: 100 }],
    [{ x: 900, y: 100 }],
    [{ x: 900, y: 500 }],
    [{ x: 100, y: 500 }],
  ];
  const r = planFixture(baseInput(rails, { deviation: { x: 40, y: 30 } }));
  assert.equal(r.feasible, true);
  assert.ok(Math.abs(r.minMargin - 170) < 1e-6, `margin=${r.minMargin}`);
  assert.deepEqual(r.candidateSequence, [2, 1, 1, 1]);
});

test('objective 3: congruent-hull tie broken by candidate sequence', () => {
  // Rails 0 and 3 both carry the two left-side corners. Assigning the
  // upper corner to rail 0 vs rail 3 yields the same hull set, the same
  // margin and the same distance sum; smallest sequence must win.
  const leftCorners = [{ x: 100, y: 100 }, { x: 100, y: 500 }];
  const rails = [
    leftCorners,
    [{ x: 900, y: 100 }],
    [{ x: 900, y: 500 }],
    leftCorners.map((p) => ({ ...p })),
  ];
  const r = planFixture(baseInput(rails, { deviation: { x: 40, y: 30 } }));
  assert.equal(r.feasible, true);
  assert.deepEqual(r.candidateSequence, [1, 1, 1, 2]);
});

test('strict containment: corner exactly on a hull edge is infeasible', () => {
  // unit-ish square hull; deviation corners (0,50) and (100,50) lie
  // exactly on the left/right edges -> signed distance 0, not > 0.
  const rails = [
    [{ x: 0, y: 0 }], [{ x: 100, y: 0 }],
    [{ x: 100, y: 100 }], [{ x: 0, y: 100 }],
  ];
  const r = planFixture(
    baseInput(rails, { cg: { x: 50, y: 50 }, deviation: { x: 50, y: 0 }, minSpacing: 50 }),
  );
  assert.equal(r.feasible, false);
  assert.equal(r.stats.feasibleCombinations, 0);
  assert.ok(r.evidence.failedConstraints.includes('containment'));
  assert.equal(r.evidence.containment.worstCorner.signedMargin, 0);
});

test('infeasible: pad spacing violation reported with shortfall', () => {
  const rails = [
    [{ x: 100, y: 100 }], [{ x: 150, y: 100 }],
    [{ x: 900, y: 500 }], [{ x: 100, y: 500 }],
  ];
  const r = planFixture(baseInput(rails, { minSpacing: 300 }));
  assert.equal(r.feasible, false);
  assert.ok(r.evidence.failedConstraints.includes('spacing'));
  const v = r.evidence.spacing.find((s) => s.rails.join(',') === '0,1');
  assert.ok(v);
  assert.ok(Math.abs(v.distance - 50) < 1e-6);
  assert.ok(Math.abs(v.shortfall - 250) < 1e-6);
});

test('infeasible: candidate outside approved boundary reported', () => {
  const rails = [
    [{ x: -120, y: 300 }], // outside the wing boundary
    [{ x: 900, y: 100 }], [{ x: 900, y: 500 }], [{ x: 200, y: 500 }],
  ];
  const r = planFixture(baseInput(rails, { deviation: { x: 10, y: 10 } }));
  assert.equal(r.feasible, false);
  assert.ok(r.evidence.failedConstraints.includes('boundary'));
  assert.equal(r.evidence.boundary[0].rail, 0);
  assert.ok(Math.abs(r.evidence.boundary[0].overshoot - 120) < 1e-6);
});

test('infeasible: collinear pads give degenerate-hull evidence', () => {
  const rails = [
    [{ x: 100, y: 300 }], [{ x: 300, y: 300 }],
    [{ x: 700, y: 300 }], [{ x: 900, y: 300 }],
  ];
  const r = planFixture(baseInput(rails, { minSpacing: 50 }));
  assert.equal(r.feasible, false);
  assert.ok(r.evidence.failedConstraints.includes('containment'));
  assert.match(r.evidence.containment.reason, /退化/);
});

test('every rail contributes exactly one pad to the selection', () => {
  const rails = [
    [{ x: 50, y: 50 }],
    [{ x: 950, y: 50 }, { x: 900, y: 100 }],
    [{ x: 950, y: 550 }],
    [{ x: 50, y: 550 }, { x: 100, y: 500 }],
  ];
  const r = planFixture(baseInput(rails));
  assert.equal(r.feasible, true);
  assert.deepEqual(r.selection.map((s) => s.rail), [0, 1, 2, 3]);
  assert.equal(new Set(r.selection.map((s) => s.rail)).size, 4);
});

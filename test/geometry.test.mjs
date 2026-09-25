import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cross,
  convexHull,
  polygonArea,
  edgeDistancesCCW,
  signedDistanceToPolygon,
  deviationCorners,
  pointInBounds,
} from '../server/geometry.mjs';

test('cross product orientation', () => {
  assert.ok(cross({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }) > 0);
  assert.ok(cross({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }) < 0);
  assert.equal(cross({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }), 0);
});

test('convex hull of a square keeps CCW order and drops interior points', () => {
  const pts = [
    { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 },
    { x: 1, y: 1 }, { x: 1, y: 0 }, // last is collinear on edge
  ];
  const hull = convexHull(pts);
  assert.equal(hull.length, 4);
  assert.ok(polygonArea(hull) > 0, 'CCW');
  assert.deepEqual(hull, [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }]);
});

test('signed distance: inside positive, boundary zero, outside negative', () => {
  const sq = [
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
  ];
  assert.equal(signedDistanceToPolygon(sq, { x: 5, y: 5 }), 5);
  assert.equal(signedDistanceToPolygon(sq, { x: 0, y: 5 }), 0);
  assert.ok(signedDistanceToPolygon(sq, { x: -1, y: 5 }) < 0);
});

test('edge distances for a rotated square', () => {
  const diamond = [
    { x: -1, y: 0 }, { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 },
  ];
  const d = edgeDistancesCCW(diamond, { x: 0, y: 0 });
  assert.ok(d.every((v) => Math.abs(v - Math.SQRT1_2) < 1e-12));
});

test('degenerate hull (line) never encloses', () => {
  const seg = convexHull([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }]);
  assert.ok(seg.length < 3);
  assert.equal(signedDistanceToPolygon(seg, { x: 5, y: 0 }), -Infinity);
});

test('deviation corners ordered BL, BR, TR, TL', () => {
  const cs = deviationCorners({ x: 10, y: 20 }, 3, 2);
  assert.deepEqual(cs, [
    { x: 7, y: 18 }, { x: 13, y: 18 },
    { x: 13, y: 22 }, { x: 7, y: 22 },
  ]);
});

test('pointInBounds includes edges', () => {
  const min = { x: 0, y: 0 };
  const max = { x: 100, y: 100 };
  assert.equal(pointInBounds({ x: 0, y: 50 }, min, max, 0), true);
  assert.equal(pointInBounds({ x: 100.0001, y: 50 }, min, max, 0), false);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  convexHull,
  ensureCCW,
  convexMargin,
  lineSide,
  pointInPolygon,
  polygonSignedArea,
} from '../server/geometry.js';

test('凸包按逆时针返回并剔除共线点', () => {
  const hull = ensureCCW(convexHull([
    { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 },
    { x: 0, y: 2 }, { x: 1, y: 1 },
  ]));
  assert.equal(hull.length, 4);
  assert.ok(polygonSignedArea(hull) > 0);
});

test('内部点有符号距离为正，外部为负', () => {
  const hull = ensureCCW([
    { x: -5, y: -5 }, { x: 5, y: -5 }, { x: 5, y: 5 }, { x: -5, y: 5 },
  ]);
  assert.ok(convexMargin(hull, { x: 0, y: 0 }) > 0);
  assert.equal(convexMargin(hull, { x: 0, y: 0 }).toFixed(3), '5.000');
  assert.ok(convexMargin(hull, { x: 0, y: 6 }) < 0);
});

test('恰在边上的点有符号距离为 0（不满足严格在内）', () => {
  const hull = ensureCCW([
    { x: -5, y: -5 }, { x: 5, y: -5 }, { x: 5, y: 5 }, { x: -5, y: 5 },
  ]);
  assert.equal(convexMargin(hull, { x: 0, y: 5 }), 0);
});

test('lineSide 左侧为正', () => {
  assert.ok(lineSide({ x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }) > 0);
  assert.ok(lineSide({ x: 0, y: -1 }, { x: -1, y: 0 }, { x: 1, y: 0 }) < 0);
});

test('pointInPolygon 含边界', () => {
  const poly = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }];
  assert.equal(pointInPolygon(poly, { x: 2, y: 2 }), true);
  assert.equal(pointInPolygon(poly, { x: 4, y: 2 }), true);
  assert.equal(pointInPolygon(poly, { x: 5, y: 2 }), false);
});

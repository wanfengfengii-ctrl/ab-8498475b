import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.mjs';

const rails = [
  [{ x: 50, y: 50 }, { x: 100, y: 100 }],
  [{ x: 950, y: 50 }, { x: 900, y: 100 }],
  [{ x: 950, y: 550 }, { x: 900, y: 500 }],
  [{ x: 50, y: 550 }, { x: 100, y: 500 }],
];

const payload = {
  rails,
  boundary: { min: { x: 0, y: 0 }, max: { x: 1000, y: 600 } },
  cg: { x: 500, y: 300 },
  deviation: { x: 60, y: 40 },
  minSpacing: 300,
};

let server;
let base;

before(async () => {
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function post(body) {
  const res = await fetch(`${base}/api/fixture-plans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

test('GET /api/health reports ok', async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.status, 'ok');
});

test('POST feasible plan returns selection, hull and four corners', async () => {
  const { status, json } = await post(payload);
  assert.equal(status, 200);
  assert.equal(json.ok, true);
  const r = json.result;
  assert.equal(r.feasible, true);
  assert.equal(r.selection.length, 4);
  assert.equal(r.hull.length, 4);
  assert.equal(r.corners.length, 4);
  assert.ok(r.minMargin > 0);
  assert.ok(r.corners.every((c) => c.signedMargin > 0));
});

test('POST infeasible plan returns closest-failure evidence', async () => {
  const bad = {
    ...payload,
    cg: { x: 850, y: 300 },
    deviation: { x: 150, y: 120 },
  };
  const { status, json } = await post(bad);
  assert.equal(status, 200);
  const r = json.result;
  assert.equal(r.feasible, false);
  assert.equal(r.stats.feasibleCombinations, 0);
  assert.ok(Array.isArray(r.evidence.failedConstraints));
  assert.ok(r.evidence.failedConstraints.includes('containment'));
  assert.ok(Number.isFinite(r.evidence.overallGap));
});

test('POST invalid payload returns 400 with Chinese validation message', async () => {
  const { status, json } = await post({ rails: payload.rails.slice(0, 3) });
  assert.equal(status, 400);
  assert.equal(json.ok, false);
  assert.equal(json.error.code, 'VALIDATION_FAILED');
  assert.match(json.error.message, /4 条/);
});

test('POST non-JSON garbage returns 400', async () => {
  const res = await fetch(`${base}/api/fixture-plans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'not json',
  });
  assert.equal(res.status, 400);
});

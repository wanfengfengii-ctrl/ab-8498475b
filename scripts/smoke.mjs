// One-shot HTTP smoke test used by the compose `verify` service.
// Exits 0 only if every check passes, non-zero otherwise.

const BASE = process.env.BASE_URL || `http://127.0.0.1:${process.env.PORT || 8080}`;

let failures = 0;

function check(name, cond, detail = '') {
  if (cond) {
    console.log(`  ok   - ${name}`);
  } else {
    failures++;
    console.error(`  FAIL - ${name}${detail ? ` :: ${detail}` : ''}`);
  }
}

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`);
  return res;
}

async function postPlan(body) {
  const res = await fetch(`${BASE}/api/fixture-plans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { res, json: await res.json() };
}

const FEASIBLE = {
  rails: [
    [{ x: 120, y: 120 }, { x: 150, y: 100 }, { x: 100, y: 180 }],
    [{ x: 850, y: 110 }, { x: 880, y: 150 }, { x: 820, y: 90 }],
    [{ x: 860, y: 480 }, { x: 830, y: 450 }, { x: 900, y: 500 }],
    [{ x: 130, y: 470 }, { x: 100, y: 440 }, { x: 170, y: 500 }],
  ],
  boundary: { min: { x: 0, y: 0 }, max: { x: 1000, y: 600 } },
  cg: { x: 500, y: 300 },
  deviation: { x: 60, y: 40 },
  minSpacing: 300,
};

const INFEASIBLE = {
  ...FEASIBLE,
  cg: { x: 850, y: 300 },
  deviation: { x: 150, y: 120 },
};

async function waitForHealthy(retries = 30, waitMs = 1000) {
  for (let i = 1; i <= retries; i++) {
    try {
      const res = await getJson('/api/health');
      if (res.ok) return true;
    } catch {
      /* service not up yet */
    }
    process.stdout.write(`  ... waiting for ${BASE} (${i}/${retries})\n`);
    await new Promise((r) => setTimeout(r, waitMs));
  }
  return false;
}

async function main() {
  console.log(`[smoke] target=${BASE}`);

  check('service reaches healthy state', await waitForHealthy());

  const health = await getJson('/api/health');
  check('GET /api/health -> 200 ok', health.status === 200);
  const healthJson = await health.json();
  check('health payload status=ok', healthJson.status === 'ok');

  const index = await getJson('/');
  const indexHtml = await index.text();
  check('GET / serves front-end page', index.status === 200 && indexHtml.includes('支撑垫选点裁决'));

  const ok = await postPlan(FEASIBLE);
  check('POST feasible -> 200', ok.res.status === 200, `status=${ok.res.status}`);
  const r = ok.json.result;
  check('feasible plan selected one pad per rail', r && r.feasible === true && r.selection.length === 4);
  check('hull returned with >=3 vertices', r && r.hull.length >= 3);
  check('four deviation corners reported', r && r.corners.length === 4);
  check(
    'every deviation corner is strictly inside the hull (margin > 0)',
    r && r.corners.every((c) => c.signedMargin > 0),
    r ? JSON.stringify(r.corners.map((c) => c.signedMargin)) : '',
  );
  check('candidate sequence has 4 entries', r && r.candidateSequence.length === 4);

  const bad = await postPlan(INFEASIBLE);
  check('POST infeasible -> 200 with feasible=false', bad.res.status === 200 && bad.json.result.feasible === false);
  const ev = bad.json.result.evidence;
  check('failure evidence names failed constraints', ev && Array.isArray(ev.failedConstraints) && ev.failedConstraints.length > 0);
  check('failure evidence includes closest tuple', ev && ev.selection.length === 4 && ev.candidateSequence.length === 4);

  const invalid = await postPlan({ rails: FEASIBLE.rails.slice(0, 3) });
  check('POST invalid -> 400 VALIDATION_FAILED', invalid.res.status === 400 && invalid.json.error.code === 'VALIDATION_FAILED');

  if (failures > 0) {
    console.error(`\n[smoke] ${failures} check(s) FAILED`);
    process.exit(1);
  }
  console.log('\n[smoke] all checks passed');
}

main().catch((err) => {
  console.error('[smoke] fatal:', err);
  process.exit(1);
});

// Request validation and normalization for POST /api/fixture-plans.

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function parsePoint(v, path, errors) {
  if (!v || typeof v !== 'object' || !isNum(v.x) || !isNum(v.y)) {
    errors.push(`${path} 必须是包含数值 x、y 的点`);
    return null;
  }
  return { x: v.x, y: v.y };
}

export function validatePlanRequest(body) {
  const errors = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throwValidation(['请求体必须是 JSON 对象']);
  }

  // ---- rails: exactly four, each a non-empty candidate list ------------
  const rails = [];
  if (!Array.isArray(body.rails) || body.rails.length !== 4) {
    errors.push('rails 必须是恰好 4 条安装导轨的候选点数组');
  } else {
    body.rails.forEach((rail, r) => {
      const label = `第 ${r + 1} 条导轨`;
      if (!Array.isArray(rail) || rail.length === 0) {
        errors.push(`${label} 至少需要 1 个候选点`);
        rails.push([]);
        return;
      }
      const pts = [];
      rail.forEach((p, k) => {
        const q = parsePoint(p, `${label}候选点 ${k + 1}`, errors);
        if (q) pts.push(q);
      });
      rails.push(pts);
    });
  }

  // ---- approved wing boundary ------------------------------------------
  let bounds = null;
  const b = body.boundary;
  if (!b || typeof b !== 'object') {
    errors.push('boundary 必须包含 min/max 两个点（翼板批准边界）');
  } else {
    const min = parsePoint(b.min, 'boundary.min', errors);
    const max = parsePoint(b.max, 'boundary.max', errors);
    if (min && max) {
      if (min.x >= max.x || min.y >= max.y) {
        errors.push('boundary 要求 min.x < max.x 且 min.y < max.y');
      }
      bounds = { min, max };
    }
  }

  // ---- nominal centre of gravity ---------------------------------------
  const cg = parsePoint(body.cg, 'cg', errors);

  // ---- deviation rectangle half-extents --------------------------------
  let deviation = null;
  const d = body.deviation;
  if (!d || typeof d !== 'object' || !isNum(d.x) || !isNum(d.y)) {
    errors.push('deviation 必须包含横向、纵向偏差数值 x、y（>= 0）');
  } else if (d.x < 0 || d.y < 0) {
    errors.push('deviation 的 x、y 偏差不得为负');
  } else {
    deviation = { x: d.x, y: d.y };
  }

  // ---- minimum pad spacing ---------------------------------------------
  let minSpacing = null;
  if (!isNum(body.minSpacing)) {
    errors.push('minSpacing 必须是支撑垫最小间距数值（>= 0）');
  } else if (body.minSpacing < 0) {
    errors.push('minSpacing 不得为负');
  } else {
    minSpacing = body.minSpacing;
  }

  if (errors.length) throwValidation(errors);

  return {
    rails,
    bounds,
    cg,
    deviation,
    minSpacing,
  };
}

function throwValidation(errors) {
  const err = new Error(errors.join('；'));
  err.status = 400;
  err.code = 'VALIDATION_FAILED';
  err.details = errors;
  throw err;
}

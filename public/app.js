/* Fixture planner front-end: parses the form, POSTs to /api/fixture-plans,
   and renders the selected pads / support hull / deviation-corner margins. */

const RAIL_COLORS = ['#fbbf24', '#34d399', '#a78bfa', '#fb923c'];
const RAIL_NAMES = ['导轨 1', '导轨 2', '导轨 3', '导轨 4'];

const SAMPLE = {
  rails: [
    ['120, 120', '150, 100', '100, 180'],
    ['850, 110', '880, 150', '820, 90'],
    ['860, 480', '830, 450', '900, 500'],
    ['130, 470', '100, 440', '170, 500'],
  ],
  boundsMin: '0, 0',
  boundsMax: '1000, 600',
  cg: '500, 300',
  deviation: '60, 40',
  minSpacing: '300',
};

const INFEASIBLE_SAMPLE = {
  rails: SAMPLE.rails,
  boundsMin: '0, 0',
  boundsMax: '1000, 600',
  cg: '850, 300',
  deviation: '150, 120',
  minSpacing: '300',
};

const $ = (id) => document.getElementById(id);

function initRailBoxes() {
  const grid = $('railsGrid');
  SAMPLE.rails.forEach((lines, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'rail-box';
    wrap.innerHTML = `<span class="rail-tag">${RAIL_NAMES[i]}</span>`;
    const ta = document.createElement('textarea');
    ta.id = `rail-${i}`;
    ta.rows = 4;
    ta.value = lines.join('\n');
    wrap.appendChild(ta);
    grid.appendChild(wrap);
  });
}

function loadSample(s) {
  s.rails.forEach((lines, i) => { $('rail-' + i).value = lines.join('\n'); });
  $('boundsMin').value = s.boundsMin;
  $('boundsMax').value = s.boundsMax;
  $('cg').value = s.cg;
  $('deviation').value = s.deviation;
  $('minSpacing').value = s.minSpacing;
}

/** Parse a "x, y" string (comma/whitespace separated), or throw. */
function parseXY(text, label) {
  const parts = text.split(/[,\s]+/).filter(Boolean).map(Number);
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error(`${label} 格式应为 "x, y"`);
  }
  return { x: parts[0], y: parts[1] };
}

/** Parse a textarea of "x, y" lines. */
function parseRail(textareaEl, railIdx) {
  const lines = textareaEl.value.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) throw new Error(`${RAIL_NAMES[railIdx]} 至少需要 1 个候选点`);
  return lines.map((line, k) => parseXY(line, `${RAIL_NAMES[railIdx]} 第 ${k + 1} 行`));
}

function collectPayload() {
  const rails = [0, 1, 2, 3].map((i) => parseRail($('rail-' + i), i));
  return {
    rails,
    boundary: {
      min: parseXY($('boundsMin').value, '边界 min'),
      max: parseXY($('boundsMax').value, '边界 max'),
    },
    cg: parseXY($('cg').value, '重心标称坐标'),
    deviation: (() => {
      const d = parseXY($('deviation').value, '横纵偏差');
      if (d.x < 0 || d.y < 0) throw new Error('横纵偏差不得为负');
      return d;
    })(),
    minSpacing: Number($('minSpacing').value),
  };
}

function showFormError(msg) {
  const el = $('formError');
  el.textContent = msg;
  el.hidden = false;
}
function clearFormError() { $('formError').hidden = true; }

/** Tear down any previously rendered plan before a new adjudication. */
function clearResult() {
  $('resultBlock').hidden = true;
  $('emptyHint').hidden = false;
  $('statusBanner').textContent = '';
  $('statusBanner').className = 'banner';
  $('summary').innerHTML = '';
  $('details').innerHTML = '';
  $('planSvg').innerHTML = '';
}

function fmt(v, digits = 2) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  return v.toFixed(digits);
}

// ---------------------------------------------------------------- rendering

function metric(k, v, sub) {
  return `<div class="metric"><div class="k">${k}</div>
    <div class="v">${v}${sub ? ` <small>${sub}</small>` : ''}</div></div>`;
}

function padTable(selection) {
  const rows = selection
    .map(
      (s) => `<tr><td>${RAIL_NAMES[s.rail]}</td>
        <td class="num">#${s.candidateNumber}</td>
        <td class="num">(${fmt(s.point.x)}, ${fmt(s.point.y)})</td></tr>`,
    )
    .join('');
  return `<div class="tbl-wrap"><table>
      <thead><tr><th>导轨</th><th>候选编号</th><th>坐标 (mm)</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
}

function cornerTable(corners) {
  const rows = corners
    .map((c) => {
      const cls = c.signedMargin > 0 ? 'pos' : c.signedMargin < 0 ? 'neg' : 'zero';
      return `<tr><td>${c.label}</td>
        <td class="num">(${fmt(c.point.x)}, ${fmt(c.point.y)})</td>
        <td class="num ${cls}">${fmt(c.signedMargin, 3)}</td></tr>`;
    })
    .join('');
  return `<div class="tbl-wrap"><table>
      <thead><tr><th>偏差角点</th><th>坐标 (mm)</th><th>到凸包边界有符号距离 (mm)</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
}

function renderSvg(payload, result, feasible) {
  const svg = $('planSvg');
  const W = 800;
  const H = 520;
  const PAD = 46;

  const boundary = payload.boundary;
  const all = [
    boundary.min,
    boundary.max,
    payload.cg,
    ...payload.rails.flat(),
    ...(feasible ? result.hull : result.evidence.selection.map((s) => s.point)),
  ];
  // deviation rectangle corners
  const dx = payload.deviation.x;
  const dy = payload.deviation.y;
  const corners = [
    { x: payload.cg.x - dx, y: payload.cg.y - dy },
    { x: payload.cg.x + dx, y: payload.cg.y - dy },
    { x: payload.cg.x + dx, y: payload.cg.y + dy },
    { x: payload.cg.x - dx, y: payload.cg.y + dy },
  ];
  all.push(...corners);

  const minX = Math.min(...all.map((p) => p.x));
  const maxX = Math.max(...all.map((p) => p.x));
  const minY = Math.min(...all.map((p) => p.y));
  const maxY = Math.max(...all.map((p) => p.y));
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const scale = Math.min((W - 2 * PAD) / spanX, (H - 2 * PAD) / spanY);
  const ox = (W - spanX * scale) / 2 - minX * scale;
  const oy = (H - spanY * scale) / 2 + maxY * scale; // flip Y
  const X = (x) => x * scale + ox;
  const Y = (y) => -y * scale + oy;

  const ns = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, parent = svg) => {
    const n = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
    parent.appendChild(n);
    return n;
  };
  svg.innerHTML = '';

  // approved boundary
  el('rect', {
    x: X(boundary.min.x), y: Y(boundary.max.y),
    width: (boundary.max.x - boundary.min.x) * scale,
    height: (boundary.max.y - boundary.min.y) * scale,
    fill: 'rgba(148,163,184,0.05)', stroke: '#64748b',
    'stroke-width': 1.5, 'stroke-dasharray': '7 5', rx: 4,
  });
  el('text', { x: X(boundary.min.x) + 4, y: Y(boundary.max.y) - 6, fill: '#94a3b8', 'font-size': 11 })
    .textContent = '翼板批准边界';

  // rail candidate points
  payload.rails.forEach((rail, r) => {
    rail.forEach((p, k) => {
      el('circle', { cx: X(p.x), cy: Y(p.y), r: 3.2, fill: RAIL_COLORS[r], opacity: 0.85 });
      if (rail.length <= 8) {
        const t = el('text', { x: X(p.x) + 5, y: Y(p.y) - 4, fill: RAIL_COLORS[r], 'font-size': 9, opacity: 0.85 });
        t.textContent = k + 1;
      }
    });
  });

  const selection = feasible ? result.selection : result.evidence.selection;
  const hull = feasible
    ? result.hull
    : convexHullOf(selection.map((s) => s.point));

  // support hull
  if (hull.length >= 3) {
    el('polygon', {
      points: hull.map((p) => `${X(p.x)},${Y(p.y)}`).join(' '),
      fill: feasible ? 'rgba(56,189,248,0.10)' : 'rgba(248,113,113,0.08)',
      stroke: feasible ? '#38bdf8' : '#f87171',
      'stroke-width': 2,
    });
  } else if (hull.length === 2) {
    el('line', {
      x1: X(hull[0].x), y1: Y(hull[0].y), x2: X(hull[1].x), y2: Y(hull[1].y),
      stroke: '#f87171', 'stroke-width': 2,
    });
  }

  // deviation rectangle
  const c0 = corners[0];
  el('rect', {
    x: X(c0.x), y: Y(corners[2].y),
    width: 2 * dx * scale, height: 2 * dy * scale,
    fill: 'rgba(244,114,182,0.10)', stroke: '#f472b6',
    'stroke-width': 1.6, 'stroke-dasharray': '6 4', rx: 3,
  });

  // margin perpendicular lines from each corner to its nearest hull edge
  const cornerInfo = feasible
    ? result.corners
    : (result.evidence.containment && result.evidence.containment.corners) || [];
  if (hull.length >= 3) {
    cornerInfo.forEach((c) => {
      if (!c.nearestEdge) return;
      const { a, b } = c.nearestEdge;
      const cp = { x: c.point.x, y: c.point.y };
      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const t = ((cp.x - a.x) * vx + (cp.y - a.y) * vy) / (vx * vx + vy * vy);
      const foot = { x: a.x + t * vx, y: a.y + t * vy };
      el('line', {
        x1: X(cp.x), y1: Y(cp.y), x2: X(foot.x), y2: Y(foot.y),
        stroke: c.signedMargin > 0 ? '#34d399' : '#f87171',
        'stroke-width': 1.2, 'stroke-dasharray': '3 3', opacity: 0.9,
      });
    });
  }

  // selected pads on top
  selection.forEach((s) => {
    el('circle', {
      cx: X(s.point.x), cy: Y(s.point.y), r: 7,
      fill: RAIL_COLORS[s.rail], stroke: '#e2e8f0', 'stroke-width': 2,
    });
    const t = el('text', {
      x: X(s.point.x) + 9, y: Y(s.point.y) + 14,
      fill: '#e2e8f0', 'font-size': 11, 'font-weight': 700,
    });
    t.textContent = `${s.rail + 1}-${s.candidateNumber}`;
  });

  // corners
  corners.forEach((c, i) => {
    el('rect', {
      x: X(c.x) - 4, y: Y(c.y) - 4, width: 8, height: 8,
      fill: '#f472b6', stroke: '#0b1220', 'stroke-width': 1.2,
      transform: `rotate(45 ${X(c.x)} ${Y(c.y)})`,
    });
  });

  // nominal CG
  const gx = X(payload.cg.x);
  const gy = Y(payload.cg.y);
  el('circle', { cx: gx, cy: gy, r: 4.5, fill: '#fde047' });
  el('line', { x1: gx - 9, y1: gy, x2: gx + 9, y2: gy, stroke: '#fde047', 'stroke-width': 1.6 });
  el('line', { x1: gx, y1: gy - 9, x2: gx, y2: gy + 9, stroke: '#fde047', 'stroke-width': 1.6 });
  el('text', { x: gx + 8, y: gy - 8, fill: '#fde047', 'font-size': 11, 'font-weight': 700 })
    .textContent = 'CG';

  // legend
  const legend = el('g', { transform: `translate(${PAD - 6}, ${H - 12})` });
  const items = [
    ['#38bdf8', '支撑凸包'], ['#f472b6', '重心偏差矩形'],
    ['#fde047', '标称重心'], ['#34d399', '稳定裕量垂线'],
  ];
  items.forEach(([color, text], i) => {
    const g = el('g', { transform: `translate(${i * 150}, 0)` }, legend);
    el('rect', { x: 0, y: -9, width: 14, height: 3, fill: color }, g);
    const t0 = el('text', { x: 20, y: -4, fill: '#94a3b8', 'font-size': 11 }, g);
    t0.textContent = text;
  });
}

/** Minimal monotone-chain hull for front-end failure visualisation. */
function convexHullOf(points) {
  const pts = points.map((p) => ({ x: p.x, y: p.y })).sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length <= 1) return pts;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

// ----------------------------------------------------------------- render

function renderFeasible(payload, result) {
  const banner = $('statusBanner');
  banner.className = 'banner ok';
  banner.textContent = `裁决通过：候选编号序列 [${result.candidateSequence.join(', ')}]，偏差矩形四角严格位于支撑凸包内`;

  $('summary').innerHTML =
    `<div class="metric-grid">
      ${metric('四角最小有符号裕量', `${fmt(result.minMargin, 3)} mm`)}
      ${metric('四垫到标称重心距离和', `${fmt(result.padDistanceSum, 2)} mm`)}
      ${metric('枚举组合数', result.stats.combinations)}
      ${metric('可行组合数', result.stats.feasibleCombinations)}
    </div>`;

  $('details').innerHTML = padTable(result.selection) + cornerTable(result.corners);
  renderSvg(payload, result, true);
}

function renderInfeasible(payload, result) {
  const ev = result.evidence;
  const banner = $('statusBanner');
  banner.className = 'banner fail';
  banner.textContent =
    `无可行方案：在 ${result.stats.combinations} 个完整组合中无一满足全部约束。` +
    `下列最接近可行的组合（编号序列 [${ev.candidateSequence.join(', ')}]）作为失败证据。`;

  $('summary').innerHTML =
    `<div class="metric-grid">
      ${metric('枚举组合数', result.stats.combinations)}
      ${metric('可行组合数', result.stats.feasibleCombinations)}
      ${metric('最大约束缺口', `${fmt(ev.overallGap, 3)} mm`)}
    </div>`;

  const nameMap = { boundary: '支撑垫越出翼板批准边界', spacing: '支撑垫间距不足', containment: '偏差角点未严格位于凸包内' };
  let html = '<div class="evidence"><h3>最接近失败约束的证据</h3><ul>';
  html += `<li>违反约束：${ev.failedConstraints.map((k) => nameMap[k] || k).join('；')}</li>`;

  if (ev.boundary && ev.boundary.length) {
    ev.boundary.forEach((v) => {
      html += `<li>${RAIL_NAMES[v.rail]} 候选点 #${v.candidateNumber} (${fmt(v.point.x)}, ${fmt(v.point.y)}) 越界 ${fmt(v.overshoot, 2)} mm</li>`;
    });
  }
  if (ev.spacing && ev.spacing.length) {
    ev.spacing.slice(0, 6).forEach((v) => {
      html += `<li>${RAIL_NAMES[v.rails[0]]}#${v.candidateNumbers[0]} 与 ${RAIL_NAMES[v.rails[1]]}#${v.candidateNumbers[1]} 间距 ${fmt(v.distance, 2)} mm &lt; ${fmt(v.required, 2)} mm（缺口 ${fmt(v.shortfall, 2)} mm）</li>`;
    });
  }
  if (ev.containment) {
    if (ev.containment.reason) {
      html += `<li>${ev.containment.reason}</li>`;
    } else {
      const w = ev.containment.worstCorner;
      html += `<li>最危险角点 ${w.label} (${fmt(w.point.x)}, ${fmt(w.point.y)}) 到凸包边界有符号距离 ${fmt(w.signedMargin, 3)} mm（需严格 &gt; 0，缺口 ${fmt(ev.containment.shortfall, 3)} mm）</li>`;
    }
  }
  html += '</ul></div>';
  html += padTable(ev.selection);
  if (ev.containment && ev.containment.corners) html += cornerTable(ev.containment.corners);

  $('details').innerHTML = html;
  renderSvg(payload, result, false);
}

// ------------------------------------------------------------------- main

async function generate() {
  clearFormError();
  clearResult(); // 撤下旧结果

  let payload;
  try {
    payload = collectPayload();
  } catch (e) {
    showFormError(e.message);
    return;
  }

  const btn = $('generateBtn');
  btn.disabled = true;
  btn.textContent = '裁决中…';

  try {
    const resp = await fetch('/api/fixture-plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) {
      const msg = data && data.error ? data.error.message : `服务返回 ${resp.status}`;
      showFormError(msg);
      return;
    }
    const result = data.result;
    $('emptyHint').hidden = true;
    $('resultBlock').hidden = false;
    if (result.feasible) renderFeasible(payload, result);
    else renderInfeasible(payload, result);
  } catch (e) {
    showFormError(`请求失败：${e.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = '生成选点方案';
  }
}

initRailBoxes();
loadSample(SAMPLE);
$('generateBtn').addEventListener('click', generate);
$('sampleBtn').addEventListener('click', () => { clearResult(); clearFormError(); loadSample(SAMPLE); });
$('infeasibleSampleBtn').addEventListener('click', () => { clearResult(); clearFormError(); loadSample(INFEASIBLE_SAMPLE); });

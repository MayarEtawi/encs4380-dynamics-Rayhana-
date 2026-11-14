/*
 * RAYHANA — ENCS4380 Homework 2 / Partner 4 (P4 Tuning Challenge)
 * Browser-only bundle: numerical PID engine + interactive interface.
 * All features run locally; no server, framework, or CDN is required.
 *
 * Part A: hidden plant generator, RK4 simulation, performance metrics.
 * Part B: PID controls, live preview, prediction checks, scoring, SVG scope.
 */

// ========= PART A: NUMERICAL ENGINE =========
/* Browser + Node numerical core. No external dependencies. */
(function (root) {
  'use strict';
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const rand = (a, b, rng) => a + rng() * (b - a);
  function createPlant(rng = Math.random) {
    // Adapted from Homework 1 docs/module4.js createChallenge().
    // Sine experiments are excluded: P4 evaluates unit-step tracking.
    if (rng() < .5) return { kind: 'first', gain: rand(.8, 3.2, rng), tau: rand(.45, 2.2, rng) };
    return { kind: 'second', zeta: rand(.2, .78, rng), wn: rand(1.1, 3.2, rng) };
  }
  function validate(plant, gains, options) {
    if (!plant || !['first', 'second'].includes(plant.kind)) throw Error('Unknown plant model.');
    const values = plant.kind === 'first' ? [plant.gain, plant.tau] : [plant.zeta, plant.wn];
    if (values.some(x => !Number.isFinite(x) || x <= 0)) throw Error('Plant parameters must be positive.');
    if (!gains || ['kp', 'ki', 'kd'].some(k => !Number.isFinite(gains[k]) || gains[k] < 0 || gains[k] > 100)) throw Error('Gains must be finite numbers from 0 to 100.');
    if (!(options.dt > 0 && options.dt <= .005 && options.end >= 2 && options.end <= 120)) throw Error('Invalid simulation settings.');
  }
  function simulate(plant, gains, settings = {}) {
    const o = { dt: .002, end: 24, limit: 20, filter: .06, ...settings };
    validate(plant, gains, o);
    if (!(o.limit > 0 && Number.isFinite(o.limit) && o.filter >= .02 && Number.isFinite(o.filter))) throw Error('Invalid actuator/filter settings.');
    const { kp, ki, kd } = gains;
    // State [output, velocity, integral(error), low-pass filtered output].
    // Derivative on measurement avoids setpoint kick; q'=(y-q)/Tf.
    const control = s => clamp(kp * (1 - s[0]) + ki * s[2] - kd * (s[0] - s[3]) / o.filter, -o.limit, o.limit);
    const rhs = s => {
      const e = 1 - s[0], raw = kp * e + ki * s[2] - kd * (s[0] - s[3]) / o.filter;
      const u = clamp(raw, -o.limit, o.limit);
      // Conditional integration: freeze only when error drives saturation further.
      const integral = ((raw > o.limit && e > 0) || (raw < -o.limit && e < 0)) ? 0 : e;
      if (plant.kind === 'first') return [(-s[0] + plant.gain * u) / plant.tau, 0, integral, (s[0] - s[3]) / o.filter];
      return [s[1], plant.wn ** 2 * (u - s[0]) - 2 * plant.zeta * plant.wn * s[1], integral, (s[0] - s[3]) / o.filter];
    };
    const plus = (s, d, h) => s.map((v, i) => v + d[i] * h);
    let s = [0, 0, 0, 0], unstable = false, saturated = false;
    const t = [0], y = [0], u = [control(s)];
    const n = Math.ceil(o.end / o.dt), h = o.end / n;
    for (let i = 1; i <= n; i++) {
      const a = rhs(s), b = rhs(plus(s, a, h / 2)), c = rhs(plus(s, b, h / 2)), d = rhs(plus(s, c, h));
      s = s.map((v, j) => v + h * (a[j] + 2 * b[j] + 2 * c[j] + d[j]) / 6);
      if (s.some(v => !Number.isFinite(v) || Math.abs(v) > 1e6)) { unstable = true; break; }
      const command = control(s);
      saturated ||= Math.abs(command) >= o.limit - 1e-8;
      t.push(i * h); y.push(s[0]); u.push(command);
    }
    return { t, y, u, unstable, saturated, end: o.end, limit: o.limit };
  }
  function metrics(series, spec = { overshoot: 10, settling: 3, error: 1 }) {
    const { t, y, unstable } = series;
    const peak = y.reduce((max, v) => Math.max(max, v), -Infinity);
    const overshoot = Math.max(0, (peak - 1) * 100);
    let outside = -1;
    for (let i = 0; i < y.length; i++) if (Math.abs(y[i] - 1) > .02 + 1e-9) outside = i;
    const candidate = outside + 1;
    // Require a full final second in band; never report a last-sample crossing as settled.
    const settling = !unstable && candidate < t.length && t.at(-1) - t[candidate] >= 1 ? t[candidate] : null;
    const cross = level => {
      const i = y.findIndex(v => v >= level);
      if (i < 0) return null;
      if (!i) return 0;
      return t[i - 1] + (t[i] - t[i - 1]) * (level - y[i - 1]) / (y[i] - y[i - 1]);
    };
    const t10 = cross(.1), t90 = cross(.9);
    const start = t.findIndex(v => v >= t.at(-1) - 1), tail = y.slice(Math.max(0, start));
    const average = tail.reduce((sum, v) => sum + v, 0) / tail.length;
    const span = tail.reduce((a, v) => Math.max(a, v), -Infinity) - tail.reduce((a, v) => Math.min(a, v), Infinity);
    const steady = !unstable && span <= .002;
    const error = Math.abs(1 - average) * 100;
    const passes = [!unstable && overshoot <= spec.overshoot + 1e-7, !unstable && settling !== null && settling <= spec.settling + 1e-7, steady && error <= spec.error + 1e-7];
    const count = passes.filter(Boolean).length;
    return { peak, overshoot, settling, rise: t10 !== null && t90 !== null ? t90 - t10 : null, error, steady, passes, count, score: Math.round(count / 3 * 100) };
  }
  const api = { createPlant, simulate, metrics };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PIDEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

// ========= PART B: INTERACTIVE PAGE =========
(function () {
  'use strict';
  const $ = id => document.getElementById(id), E = window.PIDEngine;
  const DEFAULT = { kp: 2, ki: 1, kd: .3 };
  const ranges = { kp: [0, 30, .05], ki: [0, 30, .05], kd: [0, 10, .01] };
  const state = { number: 0, plant: null, spec: null, attempts: 0, best: null, result: null, gains: null, preview: null, previewGains: null, baseline: null, restore: null };
  let chartMapping = null;
  let previewTimer = null;
  let isInitializing = false;
  const fmt = (n, digits = 1) => Number.isFinite(n) ? n.toFixed(digits) : '—';
  const labels = { kp: 'Kp', ki: 'Ki', kd: 'Kd' };
  const announce = message => { $('simulation-status').textContent = message; };
  function readGains() {
    const g = {};
    for (const [key, [lo, hi]] of Object.entries(ranges)) {
      const raw = $(key + '-number').value.trim(), value = Number(raw);
      if (!raw || !Number.isFinite(value) || value < lo || value > hi) throw Error(`${labels[key]} must be between ${lo} and ${hi}.`);
      g[key] = value;
    }
    return g;
  }
  function showError(error) { $('gain-error').textContent = error.message; $('gain-error').hidden = false; }
  function clearError() { $('gain-error').hidden = true; }
  function setGains(g) {
    for (const key of Object.keys(ranges)) { $(key + '-range').value = g[key]; $(key + '-number').value = g[key].toFixed(2); }
    updateExperiments();
  }
  // The scope can preview a trial without recording an attempt or grading it.
  // Only an explicit Run simulation (or Check & run) updates performance metrics.
  function sameGains(a, b) {
    return !!a && !!b && ['kp', 'ki', 'kd'].every(key => Math.abs(a[key] - b[key]) < 1e-9);
  }
  function describePlot() {
    const g = state.previewGains || state.gains || DEFAULT;
    const phase = state.preview ? 'Live preview · not scored' : state.result ? 'Last evaluated run' : 'Initial response · not scored';
    $('chart-note').textContent = `${phase}: Kp ${fmt(g.kp, 2)} · Ki ${fmt(g.ki, 2)} · Kd ${fmt(g.kd, 2)} · 24 s · RK4`;
  }
  function showPreview(gains) {
    state.preview = E.simulate(state.plant, gains);
    state.previewGains = { ...gains };
    describePlot();
    announce('LIVE PREVIEW · Press Run simulation to evaluate these settings.');
    drawChart();
  }
  function markStale() {
    clearTimeout(previewTimer);
    clearError();
    updateExperiments();
    if (isInitializing) return;
    if ($('live-update').checked) {
      previewTimer = setTimeout(() => {
        try {
          const gains = readGains();
          clearError();
          if (sameGains(gains, state.gains)) {
            state.preview = null; state.previewGains = null;
            describePlot(); drawChart();
          } else showPreview(gains);
        } catch (error) { showError(error); }
      }, 140);
    } else {
      // With Live scope off, the plot remains at the last committed result.
      state.preview = null; state.previewGains = null;
      describePlot(); drawChart();
    }
  }
  function changedGains(g, experiment) {
    const [key, direction] = experiment.split('-');
    const [min, max] = ranges[key];
    const current = g[key];
    let next;
    if (direction === 'up') next = current === 0 ? (key === 'kd' ? 0.1 : 0.5) : Math.min(max, current * 2);
    else next = current === 0 ? 0 : Math.max(min, current / 2);
    return { ...g, [key]: Number(next.toFixed(2)) };
  }
  function updateExperiments() {
    try {
      readGains();
      const names = { 'kp-up':'Increase Kp', 'kp-down':'Decrease Kp', 'ki-up':'Increase Ki', 'ki-down':'Decrease Ki', 'kd-up':'Increase Kd', 'kd-down':'Decrease Kd' };
      for (const option of $('experiment').options) option.textContent = names[option.value] || option.textContent;
      $('experiment-note').textContent = 'Only one gain changes in this mini experiment. The plant and the other gains stay fixed.';
    } catch (_) { /* Invalid numeric text is explained on submit. */ }
  }
  function setupControls() {
    for (const [key, [min, max, step]] of Object.entries(ranges)) {
      const row = document.createElement('div'); row.className = 'gain-row';
      row.innerHTML = `<label for="${key}-number">${labels[key]}</label><input id="${key}-range" type="range" min="${min}" max="${max}" step="${step}" aria-label="${labels[key]} slider"><input id="${key}-number" type="number" min="${min}" max="${max}" step="${step}" aria-label="${labels[key]} numeric value" required>`;
      $('gain-controls').append(row);
      $(key + '-range').addEventListener('input', event => { $(key + '-number').value = Number(event.target.value).toFixed(2); markStale(); });
      $(key + '-number').addEventListener('input', event => { if (event.target.value !== '') $(key + '-range').value = event.target.value; markStale(); });
    }
  }
  function updateStats() {
    $('challenge-number').textContent = String(state.number).padStart(2, '0');
    $('attempts').textContent = String(state.attempts).padStart(2, '0');
    $('best-score').textContent = state.best === null ? '—' : `${state.best} / 100`;
  }
  function displayResult(result, gains) {
    state.result = result; state.gains = { ...gains }; state.preview = null; state.previewGains = null;
    const m = E.metrics(result, state.spec);
    $('os-value').textContent = fmt(m.overshoot) + '%';
    $('ts-value').textContent = m.settling === null ? '—' : fmt(m.settling, 2) + ' s';
    $('error-value').textContent = fmt(m.error) + '%';
    $('rise-value').textContent = m.rise === null ? 'Not reached' : fmt(m.rise, 2) + ' s';
    ['os', 'ts', 'error'].forEach((key, i) => {
      const badge = $(key + '-badge'); badge.textContent = m.passes[i] ? 'PASS' : 'FAIL'; badge.className = 'badge ' + (m.passes[i] ? 'pass' : 'fail');
    });
    $('score').textContent = m.score; $('score-ring').style.setProperty('--progress', m.score + '%');
    $('score-ring').setAttribute('aria-label', `Score ${m.score} out of 100`);
    $('criteria').textContent = `${m.count} of 3 requirements met`;
    $('result-advice').textContent = result.unstable ? 'Numerical divergence detected. This run fails all requirements.' : !m.steady ? 'The final tail is still moving. Its displayed error is provisional and cannot pass.' : m.count === 3 ? 'All targets passed. Try another challenge or compare a different gain combination.' : 'Change one gain at a time and watch which requirements improve.';
    $('download').disabled = false;
    describePlot();
    $('performance-caption').textContent = `Last evaluated: Kp ${fmt(gains.kp, 2)} · Ki ${fmt(gains.ki, 2)} · Kd ${fmt(gains.kd, 2)}`;
    announce(result.unstable ? 'RUN COMPLETE · Unstable response; see performance results.' : 'RUN COMPLETE · Current PID response evaluated. Performance results updated.');
    drawChart(); return m;
  }
  function run(gains) {
    const result = E.simulate(state.plant, gains);
    state.attempts++; const m = displayResult(result, gains);
    state.best = Math.max(state.best ?? 0, m.score); updateStats(); return { result, metrics: m };
  }
  function clearMetrics() {
    ['os-value', 'ts-value', 'error-value', 'rise-value', 'score'].forEach(id => { $(id).textContent = '—'; });
    ['os-badge', 'ts-badge', 'error-badge'].forEach(id => { $(id).textContent = '—'; $(id).className = 'badge neutral'; });
    $('score-ring').style.setProperty('--progress', '0%'); $('criteria').textContent = 'Run your first test';
    $('result-advice').textContent = 'Results are calculated after you run a simulation.';
    $('performance-caption').textContent = 'Move the gains to preview. Press Run simulation to update PASS / FAIL.';
  }
  // Every challenge refreshes all three visible specifications, not just settling time.
  // A different value is guaranteed for each target compared with the preceding challenge.
  function chooseDifferent(options, oldValue) {
    const eligible = options.filter(value => value !== oldValue);
    return eligible[Math.floor(Math.random() * eligible.length)];
  }
  function makeChallengeSpec(plant, previous) {
    const overshoot = chooseDifferent([5, 8, 10, 12, 15, 18], previous?.overshoot);
    const error = chooseDifferent([0.5, 0.75, 1, 1.5, 2], previous?.error);
    const baseline = plant.kind === 'first' ? Math.max(3, 2 * plant.tau) : Math.max(3, 5 / plant.wn);
    const candidates = [-0.5, 0, 0.5, 1, 1.5].map(offset => Math.round(Math.max(2.5, baseline + offset) * 10) / 10);
    const settling = chooseDifferent([...new Set(candidates)].filter(value => value !== previous?.settling), previous?.settling);
    return { overshoot, settling, error };
  }
  function newChallenge() {
    clearTimeout(previewTimer);
    isInitializing = true;
    const previousSpec = state.spec;
    state.number++; state.plant = E.createPlant();
    state.spec = makeChallengeSpec(state.plant, previousSpec);
    state.attempts = 0; state.best = null; state.result = null; state.gains = null; state.preview = null; state.previewGains = null; state.restore = null;
    // Show an initial single response at the default gains before the first graded run.
    state.baseline = E.simulate(state.plant, DEFAULT);
    $('target-os').textContent = fmt(state.spec.overshoot, 0) + '%';
    $('target-ts').textContent = fmt(state.spec.settling) + ' s';
    $('target-error').textContent = fmt(state.spec.error, state.spec.error % 1 ? 2 : 0) + '%';
    $('os-label').textContent = 'Target ≤' + fmt(state.spec.overshoot, 0) + '%';
    $('ts-label').textContent = '±2% band · target ≤' + fmt(state.spec.settling) + ' s';
    $('error-label').textContent = 'Target ≤' + fmt(state.spec.error, 2) + '%';
    $('restore').disabled = true; $('download').disabled = true; $('prediction-feedback').hidden = true; $('prediction-feedback').replaceChildren();
    ['prediction-os', 'prediction-ts', 'prediction-error'].forEach(id => { $(id).value = ''; }); 
    setGains(DEFAULT); clearError(); clearMetrics(); updateStats();
    describePlot();
    announce('INITIAL PREVIEW · Adjust gains, then press Run simulation to score.'); drawChart();
    isInitializing = false;
  }
  // Grade predictions against two simulated responses, never against memorized PID "rules".
  // A nonsettling response is treated as an infinite settling time if exactly one run settles.
  function directionOfChange(before, after, tolerance) {
    if (before === null && after === null) return null;
    if (before === null) return 'decrease';
    if (after === null) return 'increase';
    if (!Number.isFinite(before) || !Number.isFinite(after)) return null;
    if (Math.abs(after - before) <= tolerance) return 'same';
    return after > before ? 'increase' : 'decrease';
  }
  function renderPredictionFeedback(action, before, after, bm, am) {
    const feedback = $('prediction-feedback');
    feedback.replaceChildren(); feedback.hidden = false;
    const make = (tag, cls, value) => {
      const el = document.createElement(tag);
      if (cls) el.className = cls;
      if (value !== undefined) el.textContent = value;
      return el;
    };
    feedback.append(make('div', 'prediction-result-title', `${action} · Before vs. after`));
    const grid = make('div', 'prediction-result-grid');
    const specs = [
      { name: 'Overshoot', id: 'prediction-os', earlier: bm.overshoot, later: am.overshoot, tol: .25, digits: 1, unit: '%', available: !before.unstable && !after.unstable },
      { name: 'Settling time', id: 'prediction-ts', earlier: bm.settling, later: am.settling, tol: .05, digits: 2, unit: ' s', available: !before.unstable && !after.unstable },
      { name: 'Final error', id: 'prediction-error', earlier: bm.steady ? bm.error : null, later: am.steady ? am.error : null, tol: .05, digits: 2, unit: '%', available: !before.unstable && !after.unstable && bm.steady && am.steady }
    ];
    let correct = 0, graded = 0;
    for (const metric of specs) {
      const actual = metric.available ? directionOfChange(metric.earlier, metric.later, metric.tol) : null;
      const predicted = $(metric.id).value;
      const gradedMetric = actual !== null;
      if (gradedMetric) graded++;
      if (gradedMetric && actual === predicted) correct++;
      const card = make('div', `prediction-result ${!gradedMetric ? 'is-unknown' : actual === predicted ? 'is-correct' : 'is-wrong'}`);
      card.append(make('strong', '', metric.name));
      const value = n => n === null ? (metric.name === 'Final error' ? 'Unsteady' : 'Not settled') : fmt(n, metric.digits) + metric.unit;
      card.append(make('span', 'comparison', `${value(metric.earlier)} → ${value(metric.later)}`));
      const text = actual === 'increase' ? 'Increased' : actual === 'decrease' ? 'Decreased' : actual === 'same' ? 'About the same' : 'Not measurable';
      card.append(make('span', 'result-status', !gradedMetric ? `Not graded · ${text}` : actual === predicted ? `✓ Correct · ${text}` : `✗ Different · ${text}`));
      grid.append(card);
    }
    feedback.append(grid);
    feedback.append(make('p', 'prediction-result-note', `${correct} / ${graded} measurable predictions correct. Change based on the same hidden plant; two simulations counted. Settling time is unavailable until the response remains inside ±2%, and final error is not graded if the output is still drifting.`));
  }
  function svgNode(tag, attrs = {}, content) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (content !== undefined) node.textContent = content;
    return node;
  }
  function autoWindow(result) {
    if (!result) return 6;
    const data = result.y, times = result.t, final = data[data.length - 1];
    let lastActivity = 0;
    // Detect the interesting transient and retain space after it.
    for (let i = 1; i < data.length; i += 5) {
      if (Math.abs(data[i] - 1) > .025 || Math.abs(data[i] - data[i - 1]) > .0004) lastActivity = times[i];
    }
    if (Math.abs(final - 1) > .025) return 24;
    return Math.min(24, Math.max(3, Math.ceil((lastActivity + 1) / 1.5) * 1.5));
  }
  function drawChart() {
    const svg = $('chart'), control = $('chart-mode').value === 'control';
    const result = state.preview || state.result || state.baseline;
    svg.replaceChildren();
    svg.append(svgNode('title', { id: 'chart-title' }, control ? 'PID control command with actuator limits' : 'PID closed-loop step response'));
    svg.append(svgNode('desc', { id: 'chart-description' }, `Simulated ${control ? 'control command' : 'output'} in the selected time window. Solid navy curve = ${state.preview ? 'live preview, not scored' : state.result ? 'evaluated result' : 'initial response'}. ${control ? 'Dashed red lines are actuator limits.' : 'Dashed gold line is the target setpoint.'}`));
    const W = 760, H = 470, x0 = 70, y0 = 24, w = 659, h = 373;
    const selected = $('chart-window').value;
    const xmax = selected === 'auto' ? autoWindow(result) : Number(selected);
    let ymin = control ? -22 : 0, ymax = control ? 22 : 1.4;
    const sources = [result].filter(Boolean);
    if (!control && sources.length) {
      for (const series of sources) {
        const stride = Math.max(1, Math.floor(series.y.length / 3000));
        for (let i = 0; i < series.y.length && series.t[i] <= xmax; i += stride) {
          const v = series.y[i]; ymin = Math.min(ymin, v); ymax = Math.max(ymax, v);
        }
      }
      const padding = Math.max(.07, (ymax - ymin) * .1);
      ymin = Math.min(-.05, ymin - padding);
      ymax += padding;
      const range = ymax - ymin;
      if (range < .3) { ymin -= (.3 - range) / 2; ymax += (.3 - range) / 2; }
    }
    const X = t => x0 + t / xmax * w, Y = y => y0 + h - (y - ymin) / (ymax - ymin) * h;
    const add = (tag, attrs, content) => { const n = svgNode(tag, attrs, content); svg.append(n); return n; };
    const textStyle = { fill: '#64748b', 'font-family': 'Inter,Arial,sans-serif', 'font-size': 12 };
    const defs = svgNode('defs'); const clip = svgNode('clipPath', { id: 'plot-clip' });
    clip.append(svgNode('rect', { x: x0, y: y0, width: w, height: h })); defs.append(clip); svg.append(defs);
    add('rect', { x: x0, y: y0, width: w, height: h, fill: '#fdfcf8', rx: 3 });
    if (!control) add('rect', { x: x0, y: Y(1.02), width: w, height: Math.max(1, Y(.98) - Y(1.02)), fill: '#d9e9df', 'clip-path': 'url(#plot-clip)' });
    for (let i = 0; i <= 8; i++) {
      const x = x0 + w * i / 8, tick = xmax * i / 8;
      add('line', { x1: x, x2: x, y1: y0, y2: y0 + h, stroke: '#e8e5dc', 'stroke-width': 1 });
      add('text', { x, y: y0 + h + 22, 'text-anchor': 'middle', ...textStyle }, Number(tick.toFixed(2)).toString());
    }
    for (let i = 0; i <= 7; i++) {
      const value = ymin + (ymax - ymin) * i / 7, y = Y(value);
      add('line', { x1: x0, x2: x0 + w, y1: y, y2: y, stroke: '#e8e5dc', 'stroke-width': 1 });
      add('text', { x: x0 - 10, y: y + 4, 'text-anchor': 'end', ...textStyle }, Math.abs(value) >= 100 ? value.toExponential(1) : value.toFixed(2));
    }
    add('path', { d: `M${x0},${y0}V${y0 + h}H${x0 + w}`, fill: 'none', stroke: '#8b98aa', 'stroke-width': 1.3 });
    add('text', { x: x0 + w / 2, y: H - 16, 'text-anchor': 'middle', ...textStyle }, 'Time (seconds)');
    add('text', { transform: `translate(18 ${y0 + h / 2}) rotate(-90)`, 'text-anchor': 'middle', ...textStyle }, control ? 'Control u(t)' : 'System output y(t)');
    const line = (value, color, dash) => add('line', { x1: x0, x2: x0 + w, y1: Y(value), y2: Y(value), stroke: color, 'stroke-width': 1.8, 'stroke-dasharray': dash, 'clip-path': 'url(#plot-clip)' });
    if (control) { line(20, '#bb5252', '7 6'); line(-20, '#bb5252', '7 6'); } else line(1, '#be935e', '8 6');
    function plot(series, color, dash = '') {
      const data = control ? series.u : series.y;
      const stride = Math.max(1, Math.floor(data.length / 2200));
      let d = '', last = 0;
      for (let i = 0; i < data.length && series.t[i] <= xmax; i += stride) {
        d += `${d ? 'L' : 'M'}${X(series.t[i]).toFixed(2)},${Y(data[i]).toFixed(2)}`; last = i;
      }
      const final = Math.min(data.length - 1, Math.ceil(xmax / series.end * (data.length - 1)));
      if (final > last) d += `L${X(series.t[final]).toFixed(2)},${Y(data[final]).toFixed(2)}`;
      add('path', { d, fill: 'none', stroke: color, 'stroke-width': 3.1, 'stroke-dasharray': dash, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'clip-path': 'url(#plot-clip)' });
    }
    if (result) plot(result, '#1f3556');
    else add('text', { x: x0 + w / 2, y: y0 + h / 2, 'text-anchor': 'middle', ...textStyle, 'font-size': 16 }, 'Adjust PID gains to start the live scope');
    document.querySelector('.output-key').textContent = state.preview ? (control ? 'Live preview u(t)' : 'Live preview y(t)') : (control ? 'Control u(t)' : 'Output y(t)');
    document.querySelector('.setpoint-key').textContent = control ? 'Actuator limits ±20' : 'Setpoint r = 1';
    chartMapping = { x0, y0, w, h, xmax, X, Y, control };
  }
  $('chart').addEventListener('pointermove', event => {
    const r = state.preview || state.result || state.baseline, map = chartMapping;
    if (!r || !map) return;
    const point = $('chart').createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
    const local = point.matrixTransform($('chart').getScreenCTM().inverse());
    if (local.x < map.x0 || local.x > map.x0 + map.w || local.y < map.y0 || local.y > map.y0 + map.h) { $('chart-tooltip').hidden = true; return; }
    const t = (local.x - map.x0) / map.w * map.xmax, i = Math.min(r.t.length - 1, Math.round(t / r.end * (r.t.length - 1)));
    const box = $('chart').parentElement.getBoundingClientRect(), tooltip = $('chart-tooltip');
    tooltip.textContent = `t ${fmt(r.t[i], 2)} s · ${map.control ? 'u' : 'y'} ${fmt((map.control ? r.u : r.y)[i], 3)}`;
    tooltip.hidden = false; tooltip.style.left = Math.max(0, Math.min(event.clientX - box.left + 12, box.width - 180)) + 'px'; tooltip.style.top = Math.max(0, event.clientY - box.top - 45) + 'px';
  });
  $('chart').addEventListener('pointerleave', () => { $('chart-tooltip').hidden = true; });
  $('gains-form').addEventListener('submit', event => {
    event.preventDefault();
    clearTimeout(previewTimer);
    try { const g = readGains(); clearError(); run(g); } catch (error) { showError(error); }
  });
  $('prediction-form').addEventListener('submit', event => {
    event.preventDefault();
    clearTimeout(previewTimer);
    try {
      const g = readGains(), experiment = $('experiment').value, [key, direction] = experiment.split('-'), next = changedGains(g, experiment);
      if (next[key] === g[key]) throw Error(`${direction === 'up' ? 'Increase' : 'Decrease'} ${labels[key]} cannot change further with the current value.`);
      clearError();
      const before = E.simulate(state.plant, g), bm = E.metrics(before, state.spec), after = E.simulate(state.plant, next), am = E.metrics(after, state.spec);
      state.restore = { gains: { ...g }, result: before, challenge: state.number };
      state.attempts += 2; setGains(next); displayResult(after, next);
      state.best = Math.max(state.best ?? 0, bm.score, am.score); updateStats();
      $('restore').disabled = false;
      renderPredictionFeedback(`${direction === 'up' ? 'Increase' : 'Decrease'} ${labels[key]}`, before, after, bm, am);
    } catch (error) { showError(error); }
  });
  $('restore').addEventListener('click', () => {
    clearTimeout(previewTimer);
    if (!state.restore || state.restore.challenge !== state.number) return;
    const saved = state.restore; state.restore = null; setGains(saved.gains); displayResult(saved.result, saved.gains);
    $('restore').disabled = true; $('prediction-feedback').hidden = false; $('prediction-feedback').textContent = 'Previous gains and their response restored. No new attempt was added.'; clearError();
  });
  $('experiment').addEventListener('change', updateExperiments);
  $('reset').addEventListener('click', () => { setGains(DEFAULT); markStale(); });
  $('new-challenge').addEventListener('click', newChallenge);
  $('chart-mode').addEventListener('change', () => { $('chart-tooltip').hidden = true; drawChart(); });
  $('chart-window').addEventListener('change', () => { $('chart-tooltip').hidden = true; drawChart(); });
  $('live-update').addEventListener('change', () => {
    if ($('live-update').checked) markStale();
    else {
      clearTimeout(previewTimer);
      state.preview = null; state.previewGains = null;
      describePlot(); drawChart();
      announce('LIVE PREVIEW PAUSED · Run simulation to evaluate current gains.');
    }
  });
  $('download').addEventListener('click', () => {
    if (!state.result) return;
    const { t, y, u } = state.result, g = state.gains, m = E.metrics(state.result, state.spec);
    const rows = ['# ENCS4380 P4 unit-step simulation', `# challenge=${state.number},Kp=${g.kp},Ki=${g.ki},Kd=${g.kd},score=${m.score}`, '# Columns reflect the last run, even if sliders have since changed.', 'time_s,setpoint,output,control_u'];
    for (let i = 0; i < t.length; i++) rows.push(`${t[i].toFixed(6)},1,${y[i].toPrecision(10)},${u[i].toPrecision(10)}`);
    const url = URL.createObjectURL(new Blob([rows.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `pid-challenge-${state.number}.csv`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  document.querySelectorAll('.step-link').forEach(button => {
    button.addEventListener('click', () => {
      const target = document.querySelector(button.dataset.scroll);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  setupControls(); newChallenge();
})();

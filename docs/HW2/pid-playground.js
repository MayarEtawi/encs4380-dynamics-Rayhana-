'use strict';
// RK4 integration of the continuous-time plant and controller integral state.
// First order: dy/dt = (K*u-y)/tau.
// Second order: dx/dt=v, dv/dt=(u-b*v-k*x)/m.
// Controller: u=clamp(Kp*(r-y)+Ki*I-Kd*dy/dt, ±Umax).
// Derivative-on-measurement avoids a setpoint derivative kick.
const $ = id => document.getElementById(id);
const inputs = ['plant', 'setpoint', 'kp', 'ki', 'kd', 'umax', 'duration', 'gain', 'tau', 'mass', 'damping', 'stiffness'];
const numeric = id => Number($(id).value);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fmt = (v, unit = '') => Number.isFinite(v) ? `${v.toFixed(3)}${unit}` : '—';
// toFixed() keeps the sign of tiny negative values ("-0.000"); display those as zero.
const fixedNoNegZero = (v, digits) => { const s = v.toFixed(digits); return Number(s) === 0 ? s.replace('-', '') : s; };
function settings() {
  const p = { type: $('plant').value, r: numeric('setpoint'), kp: numeric('kp'), ki: numeric('ki'), kd: numeric('kd'), umax: numeric('umax'), duration: numeric('duration'), K: numeric('gain'), tau: numeric('tau'), m: numeric('mass'), b: numeric('damping'), k: numeric('stiffness') };
  if (Object.values(p).some(v => typeof v === 'number' && !Number.isFinite(v)) || p.r <= 0 || p.umax <= 0 || p.duration <= 0 || p.K <= 0 || p.tau <= 0 || p.m <= 0 || p.b < 0 || p.k <= 0 || p.kp < 0 || p.ki < 0 || p.kd < 0) throw Error('Enter valid positive plant parameters and nonnegative gains.');
  // Typed number inputs are not limited by their min/max attributes, so enforce them here.
  // Values outside these ranges can make the model extremely stiff (e.g. K = 1000).
  const visible = p.type === 'first' ? ['gain', 'tau'] : ['mass', 'damping', 'stiffness'];
  for (const id of ['setpoint', 'kp', 'ki', 'kd', 'umax', 'duration', ...visible]) {
    const el = $(id), v = numeric(id), lo = el.min === '' ? -Infinity : Number(el.min), hi = el.max === '' ? Infinity : Number(el.max);
    if (v < lo || v > hi) throw Error(`${inputNames[id]} must be between ${lo} and ${hi}.`);
  }
  return p;
}
const inputNames = { setpoint: 'Setpoint', kp: 'Kp', ki: 'Ki', kd: 'Kd', umax: 'Umax', duration: 'Duration', gain: 'Plant gain K', tau: 'Time constant τ', mass: 'Mass m', damping: 'Damping b', stiffness: 'Stiffness k' };
function derivative(s, p) {
  const y = s[0], v = p.type === 'first' ? 0 : s[1], I = s[2], e = p.r - y;
  // For first order, dy/dt depends on u. Solve algebraically when Kd is nonzero.
  // Saturation can change this relation, so compute the saturated fixed point.
  let u;
  if (p.type === 'first') {
    const unsat = (p.kp * e + p.ki * I + p.kd * y / p.tau) / (1 + p.kd * p.K / p.tau);
    u = clamp(unsat, -p.umax, p.umax);
  } else u = clamp(p.kp * e + p.ki * I - p.kd * v, -p.umax, p.umax);
  const ydot = p.type === 'first' ? (p.K * u - y) / p.tau : v;
  const raw = p.kp * e + p.ki * I - p.kd * ydot;
  // Conditional integration anti-windup, based on actual saturated command.
  const blocked = (raw >= p.umax - 1e-9 && e > 0) || (raw <= -p.umax + 1e-9 && e < 0);
  return { ds: [ydot, p.type === 'first' ? 0 : (u - p.b * v - p.k * y) / p.m, blocked ? 0 : e], u, raw };
}
function rk4(s, h, p) {
  const a = derivative(s, p).ds;
  const add = (base, k, f) => base.map((x, i) => x + f * h * k[i]);
  const b = derivative(add(s, a, .5), p).ds;
  const c = derivative(add(s, b, .5), p).ds;
  const d = derivative(add(s, c, 1), p).ds;
  return s.map((x, i) => x + h * (a[i] + 2 * b[i] + 2 * c[i] + d[i]) / 6);
}
// RK4 is only stable for |λh| ≲ 2.78 on the real axis. Bound the fastest closed-loop
// pole with the Fujiwara bound of the characteristic polynomial and keep |λh| ≤ 1.
// First order: (τ+K·Kd)s² + (1+K·Kp)s + K·Ki; saturated: 1/τ.
// Second order: m s³ + (b+Kd)s² + (k+Kp)s + Ki; saturated: m s² + b s + k.
function stepSize(p) {
  let bound;
  if (p.type === 'first') {
    const lead = p.tau + p.K * p.kd;
    bound = Math.max(2 * Math.max((1 + p.K * p.kp) / lead, Math.sqrt(p.K * p.ki / lead)), 1 / p.tau);
  } else {
    bound = 2 * Math.max((p.b + p.kd) / p.m, Math.sqrt((p.k + p.kp) / p.m), Math.cbrt(p.ki / p.m));
  }
  return Math.min(.002, p.duration / 5000, 1 / bound);
}
function simulate(p) {
  const h = stepSize(p);
  const n = Math.ceil(p.duration / h), dt = p.duration / n;
  // t/y/u are decimated for plotting; `full` keeps every RK4 step so metrics are not
  // limited by the plot resolution (important for very fast closed loops).
  let s = [0, 0, 0], t = [], y = [], u = [];
  const full = { t: new Float64Array(n + 1), y: new Float64Array(n + 1) };
  for (let i = 0; i <= n; i++) {
    full.t[i] = i * dt; full.y[i] = s[0];
    if (i % Math.max(1, Math.floor(n / 2500)) === 0 || i === n) { t.push(i * dt); y.push(s[0]); u.push(derivative(s, p).u); }
    if (i < n) { s = rk4(s, dt, p); if (s.some(x => !Number.isFinite(x) || Math.abs(x) > 1e9)) throw Error('Simulation diverged. Reduce gains or use another plant.'); }
  }
  return { t, y, u, full };
}
function crossing(t, y, level) { for (let i = 1; i < y.length; i++)if (y[i - 1] < level && y[i] >= level) { const f = (level - y[i - 1]) / (y[i] - y[i - 1]); return t[i - 1] + f * (t[i] - t[i - 1]); } return NaN; }
// Metric definitions (same convention as P2/P3/P4: referenced to the setpoint r):
//  overshoot – how far y passes r in the direction of the step, as % of the step |r − y(0)|
//  settling  – time of the last entry into the ±2 % band around r (interpolated); the output
//              must then stay in the band for at least the final 1 s of the window
//  rise      – 10→90 % of the attained change y(0) → y_final (kept from the original P1, so
//              P-only responses with offset still have a rise time); needs a steady tail
//  error     – r − y_final; `steady` says whether the last 1 s varies by ≤ 0.2 % of r
function metrics(res, r) {
  const { t, y } = res.full || res, n = y.length, y0 = y[0], yf = y[n - 1];
  const step = Math.abs(r - y0) > 1e-12 ? r - y0 : r, dir = Math.sign(step);
  let lo = Infinity, hi = -Infinity;
  for (let i = n - 1; i >= 0 && t[i] >= t[n - 1] - 1; i--) { lo = Math.min(lo, y[i]); hi = Math.max(hi, y[i]); }
  const steady = hi - lo <= .002 * Math.abs(r);
  const span = yf - y0; let rise = NaN;
  if (steady && Math.abs(span) > 1e-9) {
    const z = y.map(v => (v - y0) / span), t10 = crossing(t, z, .1), t90 = crossing(t, z, .9);
    if (Number.isFinite(t10) && Number.isFinite(t90)) rise = t90 - t10;
  }
  let peak = y0; for (let i = 0; i < n; i++) if (dir * (y[i] - peak) > 0) peak = y[i];
  const overshoot = Math.max(0, dir * (peak - r) / Math.abs(step) * 100);
  const tol = .02 * Math.abs(step); let last = -1;
  for (let i = 0; i < n; i++) if (Math.abs(y[i] - r) > tol) last = i;
  let settle = NaN;
  if (last < 0) settle = 0;
  else if (last < n - 1) {
    const a = Math.abs(y[last] - r) - tol, b = Math.abs(y[last + 1] - r) - tol;
    settle = t[last] + a / (a - b) * (t[last + 1] - t[last]);
    if (t[n - 1] - settle < 1) settle = NaN; // re-entered the band too late to call it settled
  }
  return { rise, overshoot, settle, error: r - yf, steady };
}
const graphLayout = (title, ytitle) => ({ title: { text: title, font: { size: 15, family: 'Georgia, serif', color: '#233247' } }, paper_bgcolor: '#ffffff', plot_bgcolor: '#ffffff', font: { family: 'DM Sans, Arial, sans-serif', color: '#233247' }, margin: { l: 58, r: 18, t: 48, b: 45 }, xaxis: { title: 'Time (s)', gridcolor: '#ece8df' }, yaxis: { title: ytitle, gridcolor: '#ece8df' }, legend: { orientation: 'h', y: -.3 }, uirevision: 'pid' });
function draw(p, res) {
  const m = metrics(res, p.r); $('rise').textContent = fmt(m.rise, ' s'); $('overshoot').textContent = fmt(m.overshoot, '%'); $('settle').textContent = fmt(m.settle, ' s'); $('error').textContent = fmt(m.error);
  $('errorLabel').textContent = m.steady ? 'Steady-state error (estimated)' : 'Final tracking error (not yet steady)';
  const config = { responsive: true, displaylogo: false };
  Plotly.react('responsePlot', [{ x: res.t, y: res.y, name: 'Output y(t)', mode: 'lines', line: { color: '#233247', width: 3 } }, { x: [0, p.duration], y: [p.r, p.r], name: 'Setpoint', mode: 'lines', line: { color: '#be935e', dash: 'dash', width: 2 } }], graphLayout('Closed-loop step response', 'Output'), config);
  Plotly.react('controlPlot', [{ x: res.t, y: res.u, name: 'Actuator u(t)', mode: 'lines', line: { color: '#233247', width: 2 } }, { x: [0, p.duration], y: [p.umax, p.umax], name: '+Umax', mode: 'lines', line: { color: '#bb3434', dash: 'dash' } }, { x: [0, p.duration], y: [-p.umax, -p.umax], name: '−Umax', mode: 'lines', line: { color: '#bb3434', dash: 'dash' } }], graphLayout('Control effort with limits', 'u(t)'), config);
  $('diagramPlant').textContent = p.type === 'first' ? '1st-order' : '2nd-order';
}
// Any change to the plant or controller invalidates a displayed prediction result.
function clearPrediction() { $('predictionResult').hidden = true; $('predictionRetry').hidden = true; }
function refresh() { clearPrediction(); try { const p = settings(); $('firstFields').hidden = p.type !== 'first'; $('secondFields').hidden = p.type !== 'second'; for (const id of ['setpoint', 'kp', 'ki', 'kd', 'umax', 'duration']) $(id + 'Val').textContent = $(id).value; draw(p, simulate(p)); if (typeof refreshStateSpace === 'function') refreshStateSpace(); $('notice').textContent = 'Simulation updated.'; } catch (e) { $('notice').textContent = e.message; } }
// Value of a simulated trace at time tq (linear interpolation between stored samples).
function valueAt(res, tq) { const i = res.t.findIndex(t => t >= tq); if (i <= 0) return res.y[Math.max(0, i)]; const f = (tq - res.t[i - 1]) / (res.t[i] - res.t[i - 1]); return res.y[i - 1] + f * (res.y[i] - res.y[i - 1]); }
function runChecks() {
  // Every "measured" value comes from the same RK4 simulate() used by the playground.
  const base = { type: 'first', r: 1, kp: 9, ki: 0, kd: 0, umax: 100, duration: 12, K: 1, tau: 1, m: 1, b: 2, k: 1 };
  const rows = [];
  const row = (check, quantity, expected, measured, tol, unit = '') => rows.push({ check, quantity, expected, measured, tol, unit, ok: Math.abs(measured - expected) <= tol });
  // Check 1 · P only, K = τ = 1, Kp = 9 → τ_cl = τ/(1+K·Kp) = 0.1 s, e_ss = 1/(1+K·Kp) = 0.1.
  const c1 = 'Official check 1 · P only, K = τ = 1, Kp = 9', r1 = simulate(base), m1 = metrics(r1, 1), yf1 = r1.y.at(-1);
  row(c1, 'Steady-state error e_ss = 1/(1+K·Kp) = 10 %', .1, m1.error, .002);
  row(c1, 'Closed-loop τ = τ/(1+K·Kp), measured at 63.2 % of final', .1, crossing(r1.t, r1.y, (1 - Math.exp(-1)) * yf1), .005, ' s');
  row(c1, 'Supporting: time to 90 % of final = τ_cl·ln 10', -Math.log(.1) * .1, crossing(r1.t, r1.y, .9 * yf1), .015, ' s');
  // Check 2 · PI, Kp = Ki = 1 → s² + 2s + 1: ωn = 1, ζ = 1. The PI zero cancels the plant
  // pole, so the exact closed-loop step response is y(t) = 1 − e^(−t).
  const c2 = 'Official check 2 · PI, K = τ = 1, Kp = Ki = 1', pi = { ...base, kp: 1, ki: 1, duration: 40 }, r2 = simulate(pi), m2 = metrics(r2, 1);
  const wn = Math.sqrt(pi.K * pi.ki / pi.tau), zeta = (1 + pi.K * pi.kp) / (2 * pi.tau * wn);
  let dev = 0; r2.t.forEach((t, i) => dev = Math.max(dev, Math.abs(r2.y[i] - (1 - Math.exp(-t)))));
  row(c2, 'ωn from τs² + (1+K·Kp)s + K·Ki = s² + 2s + 1', 1, wn, 1e-9, ' rad/s');
  row(c2, 'ζ from s² + 2s + 1', 1, zeta, 1e-9);
  row(c2, 'Supporting: y(1 s) vs exact 1 − e⁻¹', 1 - Math.exp(-1), valueAt(r2, 1), .002);
  row(c2, 'Supporting: max |y(t) − (1 − e^(−t))|', 0, dev, .002);
  row(c2, 'Supporting: steady-state error', 0, m2.error, .005);
  // Check 3 · stable, unsaturated PI settings → zero step steady-state error.
  for (const [kp, ki] of [[1, 1], [2, 1], [3, 2]]) {
    const r3 = simulate({ ...pi, kp, ki }), m3 = metrics(r3, 1), umaxUsed = Math.max(...r3.u.map(Math.abs));
    row(`Official check 3 · PI, Kp = ${kp}, Ki = ${ki}`, 'Step steady-state error', 0, m3.error, .005);
    rows.push({ check: `Official check 3 · PI, Kp = ${kp}, Ki = ${ki}`, quantity: 'Assumption: no limiting saturation, max |u| < Umax', expected: `< ${pi.umax}`, measured: umaxUsed, tol: null, unit: '', ok: umaxUsed < pi.umax });
  }
  const f = v => typeof v === 'number' ? (Math.abs(v) < 1e-4 && v !== 0 ? v.toExponential(2) : v.toFixed(4)) : v;
  const passed = rows.filter(r => r.ok).length;
  $('validationResult').innerHTML = `<div class="ss-table-wrap"><table class="ss-table"><caption>${passed} / ${rows.length} quantities within tolerance · first-order plant K = 1, τ = 1, r = 1, Umax = 100</caption>` +
    '<thead><tr><th scope="col">Quantity</th><th scope="col">Expected</th><th scope="col">Measured (RK4)</th><th scope="col">|Error|</th><th scope="col">Tolerance</th><th scope="col">Result</th></tr></thead><tbody>' +
    // Each check name is shown once as a group heading; number cells never wrap.
    rows.map((r, i) => {
      const nw = 'style="white-space:nowrap"';
      const head = i === 0 || rows[i - 1].check !== r.check ? `<tr><th scope="colgroup" colspan="6">${r.check}</th></tr>` : '';
      return head + `<tr><td>${r.quantity}</td><td ${nw}>${f(r.expected)}${r.unit}</td><td ${nw}>${f(r.measured)}${r.unit}</td><td ${nw}>${r.tol === null ? '—' : f(Math.abs(r.measured - r.expected))}</td><td ${nw}>${r.tol === null ? '—' : '± ' + f(r.tol)}</td><td class="${r.ok ? 'pass' : 'fail'}" ${nw}>${r.ok ? '✓ PASS' : '✗ FAIL'}</td></tr>`;
    }).join('') +
    '</tbody></table></div><p class="muted">Rows marked “Supporting” are extra evidence beyond the three homework checks. ωn and ζ come from the closed-loop characteristic polynomial; every other measured value is read from the RK4 simulation. The third check applies to stable, unsaturated PI configurations; integral action alone does not guarantee stability or eliminate error under saturation.</p>';
}
let refreshTimer = null;
function scheduleRefresh() { clearPrediction(); clearTimeout(refreshTimer); refreshTimer = setTimeout(() => { refreshTimer = null; refresh(); }, 90); }
for (const id of inputs) $(id).addEventListener('input', scheduleRefresh);
$('reset').addEventListener('click', () => { Object.entries({ plant: 'first', setpoint: 1, kp: 9, ki: 0, kd: 0, umax: 100, duration: 12, gain: 1, tau: 1, mass: 1, damping: 2, stiffness: 1 }).forEach(([id, v]) => $(id).value = v); refresh(); });
$('piPreset').addEventListener('click', () => { Object.entries({ plant: 'first', setpoint: 1, kp: 1, ki: 1, kd: 0, umax: 100, duration: 12, gain: 1, tau: 1 }).forEach(([id, v]) => $(id).value = v); refresh(); });
$('runValidation').addEventListener('click', runChecks);
// Interactive prediction quiz: the answer is computed from two independent RK4 runs.
const predictionNames = { kp: 'Kp', ki: 'Ki', kd: 'Kd' };
const predictionMetricNames = { overshoot: 'Overshoot', rise: 'Rise time', error: 'Absolute final tracking error', settle: 'Settling time (2%)' };
function predictionChange() {
  const p = settings(), gain = $('predictionExperiment').value, metric = $('predictionMetric').value;
  // The experiment is always an increase by exactly the labelled step. If the current
  // slider value + step would exceed the slider maximum, the pair (value − step → value)
  // is compared instead, which is still an increase of exactly one step.
  const increments = { kp: 2, ki: 1, kd: 2 }, step = increments[gain];
  const max = Number($(gain).max), round = v => Math.round(v * 1e6) / 1e6;
  let lowGain = p[gain], highGain = round(p[gain] + step);
  if (highGain > max) { highGain = p[gain]; lowGain = round(p[gain] - step); }
  if (lowGain < 0) throw Error(`The ${predictionNames[gain]} slider range is too small for a +${step} experiment.`);
  const shifted = lowGain !== p[gain];
  // Both runs use the same horizon (at least 40 s) and the same plant and other settings.
  const comparison = { ...p, duration: Math.max(p.duration, 40) };
  const a = metrics(simulate({ ...comparison, [gain]: lowGain }), p.r);
  const b = metrics(simulate({ ...comparison, [gain]: highGain }), p.r);
  const before = metric === 'error' ? Math.abs(a.error) : a[metric];
  const after = metric === 'error' ? Math.abs(b.error) : b[metric];
  const base = { before, after, gain, metric, oldGain: lowGain, newGain: highGain, shifted, duration: comparison.duration };
  // Undefined metrics are never graded as "same".
  if (metric === 'settle') {
    const beforeSettled = Number.isFinite(before), afterSettled = Number.isFinite(after);
    if (!beforeSettled && !afterSettled) return { ...base, unmeasurable: true, reason: `Neither response settled inside the ±2% band within ${comparison.duration.toFixed(0)} s, so the two settling times cannot be compared.` };
    // One-sided (censored) case: an unsettled run has a settling time longer than the window,
    // so the direction is known even though that time itself is not.
    const answer = !beforeSettled ? 'decrease' : !afterSettled ? 'increase' : Math.abs(after - before) <= .025 ? 'same' : after > before ? 'increase' : 'decrease';
    return { ...base, answer, note: !beforeSettled || !afterSettled ? `One response did not settle within ${comparison.duration.toFixed(0)} s; its settling time is longer than the window, so the direction is still known.` : '' };
  }
  if ((metric === 'rise' || metric === 'error') && (!a.steady || !b.steady))
    return { ...base, unmeasurable: true, reason: `At least one response is still changing at the end of the ${comparison.duration.toFixed(0)} s window, so its final value — needed for the ${predictionMetricNames[metric].toLowerCase()} — is not defined.` };
  if (!Number.isFinite(before) || !Number.isFinite(after))
    return { ...base, unmeasurable: true, reason: `The ${predictionMetricNames[metric].toLowerCase()} is not defined for at least one response (for example, the output never changes).` };
  const tolerance = metric === 'overshoot' ? .1 : metric === 'error' ? Math.max(.0005, p.r * .0005) : .025;
  const answer = Math.abs(after - before) <= tolerance ? 'same' : after > before ? 'increase' : 'decrease';
  return { ...base, answer };
}
const predictionAnswerLabels = { increase: 'Increase', decrease: 'Decrease', same: 'Stay approximately the same' };
function checkPrediction() {
  const selected = document.querySelector('input[name="predictionChoice"]:checked');
  const result = $('predictionResult'); result.hidden = false;
  if (!selected) { result.className = 'prediction-result prediction-neutral'; result.textContent = 'Please choose a prediction first.'; return; }
  const button = $('reveal'); button.disabled = true;
  // Apply a pending slider change first, so its delayed refresh cannot hide this new result.
  if (refreshTimer !== null) { clearTimeout(refreshTimer); refreshTimer = null; refresh(); }
  result.hidden = false;
  try {
    const outcome = predictionChange();
    result.replaceChildren();
    if (outcome.unmeasurable) {
      // Explicit scientific outcome; never graded as Increase/Decrease/Same.
      result.className = 'prediction-result prediction-neutral';
      const title = document.createElement('strong'); title.textContent = 'Prediction cannot be graded for this experiment';
      const body = document.createElement('p'); body.textContent = `${predictionNames[outcome.gain]}: ${outcome.oldGain.toFixed(2)} → ${outcome.newGain.toFixed(2)}. ${outcome.reason} Try a different metric, gain or plant.`;
      result.append(title, body); $('predictionRetry').hidden = false; return;
    }
    const correct = selected.value === outcome.answer;
    result.className = 'prediction-result ' + (correct ? 'prediction-correct' : 'prediction-incorrect');
    const heading = document.createElement('strong'); heading.textContent = correct ? '✓ Correct prediction!' : '✗ Incorrect prediction!'; result.append(heading);
    const unit = outcome.metric === 'overshoot' ? '%' : outcome.metric === 'error' ? '' : ' s';
    const display = v => !Number.isFinite(v) ? 'Not settled within ' + outcome.duration.toFixed(0) + ' s' : v.toFixed(4) + unit;
    const explanation = document.createElement('p');
    explanation.textContent = `Correct answer: ${predictionAnswerLabels[outcome.answer]}. ${predictionNames[outcome.gain]}: ${outcome.oldGain.toFixed(2)} → ${outcome.newGain.toFixed(2)}. ${predictionMetricNames[outcome.metric]}: ${display(outcome.before)} → ${display(outcome.after)}. Compared over ${outcome.duration.toFixed(1)} s with the same plant and other settings.`;
    result.append(explanation);
    if (outcome.shifted) { const shift = document.createElement('p'); shift.textContent = `The current ${predictionNames[outcome.gain]} is too close to the slider maximum, so the same +${(outcome.newGain - outcome.oldGain).toFixed(0)} step was tested just below it.`; result.append(shift); }
    if (outcome.note) { const note = document.createElement('p'); note.textContent = outcome.note; result.append(note); }
    const compare = document.createElement('div'); compare.className = 'prediction-compare';
    for (const [label, value] of [['Before', outcome.before], ['After', outcome.after]]) {
      const cell = document.createElement('div'); cell.className = 'prediction-compare-cell';
      const title = document.createElement('span'); title.textContent = label;
      const number = document.createElement('strong'); number.textContent = !Number.isFinite(value) ? 'Not settled within ' + outcome.duration.toFixed(0) + ' s' : value.toFixed(3) + unit;
      cell.append(title, number); compare.append(cell);
    }
    result.append(compare); $('predictionRetry').hidden = false;
  } catch (e) { result.className = 'prediction-result prediction-incorrect'; result.textContent = '✗ Experiment could not be evaluated safely: ' + e.message; $('predictionRetry').hidden = false; }
  finally { button.disabled = false; }
}
$('reveal').addEventListener('click', checkPrediction);
$('predictionRetry').addEventListener('click', () => { document.querySelectorAll('input[name="predictionChoice"]').forEach(r => r.checked = false); $('predictionResult').hidden = true; $('predictionRetry').hidden = true; });
for (const id of ['predictionExperiment', 'predictionMetric']) $(id).addEventListener('change', () => { $('predictionResult').hidden = true; $('predictionRetry').hidden = true; document.querySelectorAll('input[name="predictionChoice"]').forEach(r => r.checked = false); });
// Changing the chosen answer after checking also invalidates the shown verdict.
document.querySelectorAll('input[name="predictionChoice"]').forEach(r => r.addEventListener('change', clearPrediction));
refresh();


// BONUS A: independent three-lag teaching plant, G(s)=1/(s+1)^3.
// RK4 uses the same numerical integration method as the main PID playground.
function znDerivative(x, kp) { const u = kp * (1 - x[2]); return [u - x[0], x[0] - x[1], x[1] - x[2]]; }
function znSimulate(kp, duration) {
  const h = .01, n = Math.round(duration / h), t = [], y = []; let x = [0, 0, 0];
  for (let i = 0; i <= n; i++) {
    if (i % 5 === 0) { t.push(i * h); y.push(x[2]); }
    if (i === n) break;
    const a = znDerivative(x, kp), b = znDerivative(x.map((v, j) => v + h * a[j] / 2), kp), c = znDerivative(x.map((v, j) => v + h * b[j] / 2), kp), d = znDerivative(x.map((v, j) => v + h * c[j]), kp);
    x = x.map((v, j) => v + h * (a[j] + 2 * b[j] + 2 * c[j] + d[j]) / 6);
    if (x.some(v => !Number.isFinite(v) || Math.abs(v) > 1e8)) break;
  }
  return { t, y };
}
function znPeakPeriod(res) {
  const peaks = [];
  // Parabolic interpolation through the three samples around each peak removes the
  // ±0.05 s quantisation of the stored samples.
  for (let i = 1; i < res.y.length - 1; i++)if (res.y[i] > res.y[i - 1] && res.y[i] >= res.y[i + 1] && res.t[i] > 8) {
    const a = res.y[i - 1], b = res.y[i], c = res.y[i + 1], den = a - 2 * b + c, dt = res.t[i + 1] - res.t[i];
    peaks.push(res.t[i] + (den !== 0 ? .5 * (a - c) / den * dt : 0));
  }
  if (peaks.length < 3) return NaN;
  const periods = peaks.slice(1).map((t, i) => t - peaks[i]);
  return periods.slice(-Math.min(5, periods.length)).reduce((a, b) => a + b, 0) / Math.min(5, periods.length);
}
function refreshZN() {
  const kp = numeric('znGain'), duration = numeric('znDuration'); $('znGainVal').textContent = kp.toFixed(1); $('znDurationVal').textContent = duration;
  const res = znSimulate(kp, duration), period = znPeakPeriod(res);
  const Pu = 2 * Math.PI / Math.sqrt(3);
  $('znMeasured').textContent = Number.isFinite(period) ? `${period.toFixed(3)} s (${fixedNoNegZero((period - Pu) / Pu * 100, 2)}% vs Pu)` : 'Not enough peaks';
  $('znStatus').textContent = Math.abs(kp - 8) < .051 ? 'At Kp = Ku = 8: sustained oscillations (marginal stability).' : kp < 8 ? 'Below Ku: damped oscillations / stable response.' : 'Above Ku: growing oscillations / unstable response.';
  Plotly.react('znPlot', [{ x: res.t, y: res.y, name: 'Output y(t)', mode: 'lines', line: { color: '#233247', width: 2.5 } }, { x: [0, duration], y: [1, 1], name: 'Setpoint', mode: 'lines', line: { color: '#be935e', dash: 'dash' } }], graphLayout('P-only response — third-order teaching plant', 'Output'), { responsive: true, displaylogo: false });
}
$('znGain').addEventListener('input', refreshZN); $('znDuration').addEventListener('input', refreshZN);
for (const [id, kp] of [['znCritical', 8], ['znBelow', 5], ['znAbove', 11]]) $(id).addEventListener('click', () => { $('znGain').value = kp; refreshZN(); });

// BONUS B: pole placement on xdot=[0 1; -k/m -b/m]x+[0;1/m]u.
// With u=-[k1 k2]x+Nr: k1=m*wn²-k, k2=2*m*zeta*wn-b, N=m*wn².
function stateSimulate(m, b, k, wn, zeta, r, x0, duration, umax) {
  const k1 = m * wn * wn - k, k2 = 2 * m * zeta * wn - b, N = m * wn * wn;
  const deriv = x => { const u = clamp(-k1 * x[0] - k2 * x[1] + N * r, -umax, umax); return [x[1], (u - b * x[1] - k * x[0]) / m]; };
  const h = .002, n = Math.ceil(duration / h), dt = duration / n, t = [], y = []; let x = [x0, 0];
  for (let i = 0; i <= n; i++) {
    if (i % Math.max(1, Math.floor(n / 2000)) === 0 || i === n) { t.push(i * dt); y.push(x[0]); }
    if (i === n) break;
    const a = deriv(x), bb = deriv(x.map((v, j) => v + dt * a[j] / 2)), c = deriv(x.map((v, j) => v + dt * bb[j] / 2)), d = deriv(x.map((v, j) => v + dt * c[j]));
    x = x.map((v, j) => v + dt * (a[j] + 2 * bb[j] + 2 * c[j] + d[j]) / 6);
    if (x.some(v => !Number.isFinite(v) || Math.abs(v) > 1e9)) throw Error('State feedback diverged.');
  }
  return { t, y, k1, k2, N };
}
function pidSecondWithInitial(p, x0) {
  const h = stepSize(p), n = Math.ceil(p.duration / h), dt = p.duration / n, t = [], y = []; let s = [x0, 0, 0];
  for (let i = 0; i <= n; i++) {
    if (i % Math.max(1, Math.floor(n / 2000)) === 0 || i === n) { t.push(i * dt); y.push(s[0]); }
    if (i === n) break; s = rk4(s, dt, p);
    if (s.some(v => !Number.isFinite(v) || Math.abs(v) > 1e9)) throw Error('PID comparison diverged.');
  }
  return { t, y };
}
function refreshStateSpace() {
  try {
    const m = numeric('ssMass'), b = numeric('ssDamping'), k = numeric('ssStiffness'), wn = numeric('ssWn'), zeta = numeric('ssZeta'), x0 = numeric('ssInitial'), base = settings();
    if (![m, b, k, wn, zeta, x0].every(Number.isFinite) || m <= 0 || b < 0 || k <= 0 || wn <= 0 || zeta <= 0) throw Error('Use m,k,ωn,ζ > 0 and b ≥ 0.');
    $('ssWnVal').textContent = wn; $('ssZetaVal').textContent = zeta;
    const re = -zeta * wn, disc = zeta * zeta - 1;
    $('ssPoles').textContent = disc < 0 ? `${re.toFixed(2)} ± j${(wn * Math.sqrt(-disc)).toFixed(2)}` : `${(re + wn * Math.sqrt(disc)).toFixed(2)}, ${(re - wn * Math.sqrt(disc)).toFixed(2)}`;
    const state = stateSimulate(m, b, k, wn, zeta, base.r, x0, base.duration, base.umax);
    $('ssGains').textContent = `[${state.k1.toFixed(3)}, ${state.k2.toFixed(3)}]`; $('ssPrefilter').textContent = state.N.toFixed(3);
    const pid = pidSecondWithInitial({ ...base, type: 'second', m, b, k }, x0);
    Plotly.react('ssPlot', [{ x: state.t, y: state.y, name: 'State feedback', mode: 'lines', line: { color: '#233247', width: 3 } }, { x: pid.t, y: pid.y, name: 'PID (same plant)', mode: 'lines', line: { color: '#6f88a3', width: 2.5 } }, { x: [0, base.duration], y: [base.r, base.r], name: 'Setpoint', mode: 'lines', line: { color: '#be935e', dash: 'dash' } }], graphLayout('State feedback vs PID — same initial conditions', 'Position y'), { responsive: true, displaylogo: false });
    $('ssStatus').textContent = `Selected poles are stable. Initial state: [${x0}, 0]. Both controllers use Umax = ${base.umax} and r = ${base.r}.`;
    // P4 bonus part: verify the placement and report the response metrics.
    const eig2 = M => {
      const tr = M[0][0] + M[1][1], det = M[0][0] * M[1][1] - M[0][1] * M[1][0], d = tr * tr - 4 * det;
      return d < 0 ? [{ re: tr / 2, im: Math.sqrt(-d) / 2 }, { re: tr / 2, im: -Math.sqrt(-d) / 2 }]
        : [{ re: (tr + Math.sqrt(d)) / 2, im: 0 }, { re: (tr - Math.sqrt(d)) / 2, im: 0 }];
    };
    const showPoles = ps => ps[0].im ? `${ps[0].re.toFixed(2)} ± j${Math.abs(ps[0].im).toFixed(2)}` : `${ps[0].re.toFixed(2)}, ${ps[1].re.toFixed(2)}`;
    const open = eig2([[0, 1], [-k / m, -b / m]]);
    const closed = eig2([[0, 1], [-(k + state.k1) / m, -(b + state.k2) / m]]); // A − BK
    // The placed poles are the roots of s² + 2ζωn·s + ωn²: sum = −2ζωn, product = ωn².
    const sumErr = Math.abs(closed[0].re + closed[1].re + 2 * zeta * wn), prodErr = Math.abs((closed[0].re * closed[1].re - closed[0].im * closed[1].im) - wn * wn);
    const placed = sumErr < 1e-9 * Math.max(1, wn) && prodErr < 1e-9 * Math.max(1, wn * wn);
    $('ssOpenPoles').textContent = showPoles(open);
    $('ssClosedPoles').textContent = showPoles(closed);
    $('ssCheck').textContent = `${placed ? '✓ PASS' : '✗ FAIL'} · eig(A − BK) ${placed ? 'equals' : 'differs from'} the desired poles. ` +
      `A − BK = [[0, 1], [${(-(k + state.k1) / m).toFixed(3)}, ${(-(b + state.k2) / m).toFixed(3)}]].`;
    $('ssCheck').className = 'muted ' + (placed ? 'pass' : 'fail');
    const sm = metrics(state, base.r), pm = metrics(pid, base.r);
    const rows = [['Rise time (10–90%)', 'rise', ' s'], ['Overshoot', 'overshoot', '%'], ['Settling time (2%)', 'settle', ' s'], ['Final error', 'error', '']];
    $('ssMetrics').replaceChildren(...rows.map(([name, key, unit]) => {
      const tr = document.createElement('tr'), th = document.createElement('th'); th.scope = 'row'; th.textContent = name; tr.append(th);
      for (const mm of [sm, pm]) {
        const td = document.createElement('td');
        td.textContent = Number.isFinite(mm[key]) ? fixedNoNegZero(mm[key], 3) + unit : key === 'settle' ? 'Not settled' : '—';
        tr.append(td);
      }
      return tr;
    }));
  } catch (e) { $('ssStatus').textContent = e.message; }
}
for (const id of ['ssMass', 'ssDamping', 'ssStiffness', 'ssWn', 'ssZeta', 'ssInitial']) $(id).addEventListener('input', refreshStateSpace);
refreshZN(); refreshStateSpace();

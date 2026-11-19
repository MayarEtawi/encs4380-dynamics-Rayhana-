/* Rayhana P3 interface. Native SVG plots keep this page usable offline. */
(function () {
  'use strict';
  const E = window.DigitalPID, $ = id => document.getElementById(id);
  const numericKeys = Object.keys(E.DEFAULTS).filter(k => typeof E.DEFAULTS[k] === 'number');
  let current = null, comparison = null, refreshFrame = null;
  const fmt = (v, digits = 2) => Number.isFinite(v) ? v.toFixed(digits) : '—';
  const labels = { first: 'First-order plant', second: 'Mass–spring–damper', third: 'Bonus: three-lag plant' };
  for (const [key, name, max, step] of [['kp', 'Proportional Kp', 100, 0.05], ['ki', 'Integral Ki', 100, 0.05], ['kd', 'Derivative Kd', 100, 0.01]]) {
    const label = document.createElement('label'); label.className = 'field'; label.htmlFor = key;
    label.append(document.createTextNode(name));
    const pair = document.createElement('div'); pair.className = 'range-pair';
    const slider = document.createElement('input'); slider.type = 'range'; slider.id = `${key}-range`;
    slider.min = 0; slider.max = max; slider.step = step; slider.setAttribute('aria-label', `${name} slider`);
    const number = document.createElement('input'); number.type = 'number'; number.id = key;
    number.min = 0; number.max = max; number.step = 'any'; number.required = true;
    pair.append(slider, number); label.append(pair); $('gain-controls').append(label);
  }
  function read() {
    const p = { plant: $('plant').value, antiWindup: $('antiWindup').checked, recovery: $('recovery').checked };
    numericKeys.forEach(k => { p[k] = $(k).value.trim() === '' ? NaN : Number($(k).value); });
    return E.settings(p);
  }
  function syncVisibility() {
    $('first-fields').hidden = $('plant').value !== 'first';
    $('second-fields').hidden = $('plant').value !== 'second';
    $('recovery-fields').hidden = !$('recovery').checked;
  }
  function write(values) {
    const p = E.settings(values);
    Object.entries(p).forEach(([key, v]) => {
      if (!$(key)) return;
      if (typeof v === 'boolean') $(key).checked = v; else $(key).value = v;
      if ($(`${key}-range`)) $(`${key}-range`).value = v;
    });
    syncVisibility();
  }
  function validActions(enabled) {
    for (const id of ['copy-code', 'download-code', 'export-csv', 'copy-link', 'compare-sampling', 'compare-windup']) $(id).disabled = !enabled;
  }
  function clearComparison() {
    comparison = null; $('prediction-feedback').hidden = true;
    if (current) renderCharts();
  }
  function invalidate() {
    comparison = null; $('prediction-feedback').hidden = true; $('copy-status').textContent = '';
    $('sampling-table').querySelector('tbody').replaceChildren();
    $('sampling-table').querySelector('caption').textContent = 'Settings changed. Run the comparison again for these settings.';
  }
  function showError(error) {
    $('settings-error').hidden = false; $('settings-error').textContent = error.message;
    $('simulation-status').textContent = 'Settings are invalid. Plots show the last valid run; exports are disabled.';
    validActions(false);
  }
  function scheduleRefresh() {
    if (refreshFrame !== null) return;
    refreshFrame = requestAnimationFrame(() => { refreshFrame = null; refresh(); });
  }
  function updateExperimentOptions(p) {
    const menu = $('experiment');
    for (const option of menu.options) {
      try { E.experiment(p, option.value); option.disabled = false; }
      catch (_) { option.disabled = true; }
    }
    if (menu.selectedOptions[0]?.disabled) {
      menu.value = Array.from(menu.options).find(option => !option.disabled).value;
      for (const id of ['os', 'settle', 'error']) $(`prediction-${id}`).value = '';
    }
  }
  function refresh() {
    if (refreshFrame !== null) { cancelAnimationFrame(refreshFrame); refreshFrame = null; }
    try {
      const p = read(); current = E.simulate(p); $('settings-error').hidden = true; updateExperimentOptions(p);
      $('sample-stat').textContent = `${fmt(p.ts, 3)} s`;
      $('updates-stat').textContent = current.samples.length.toLocaleString();
      const m = E.metrics(current); $('saturation-stat').textContent = `${fmt(m.saturation, 1)}%`;
      $('plant-tag').textContent = labels[p.plant];
      $('model-equation').textContent = p.plant === 'first' ? `G(s) = ${p.gain} / (${p.tau}s + 1)` :
        p.plant === 'second' ? `G(s) = 1 / (${p.mass}s² + ${p.damping}s + ${p.stiffness})` : 'G(s) = 1 / (s + 1)³';
      $('simulation-status').textContent = current.unstable ? 'Divergent response: the safety threshold was reached. Reduce gains or Ts.' :
        `Simulated ${fmt(p.duration, 1)} s · ${current.samples.length} controller updates · anti-windup ${p.antiWindup ? 'on' : 'off'}.`;
      if (p.recovery) $('simulation-status').textContent += ` Second step applied at ${fmt(current.recoveryTime, 3)} s.`;
      const names = [['Rise time', m.rise === null ? (p.recovery ? 'Not used' : 'Not reached') : `${fmt(m.rise, 3)} s`, '10–90% of target'],
      ['Overshoot', `${fmt(m.overshoot)}%`, p.recovery ? 'After second step' : 'Above target'],
      ['Settling time', m.settling === null ? 'Not settled' : `${fmt(m.settling, 3)} s`, '±2% · final 1 s in band'],
      [m.steady ? 'Steady-state error' : 'Final tracking error', `${fmt(m.error, 3)}%`, m.steady ? 'Settled final-second mean' : 'Tail not steady'],
      ['Saturation', `${fmt(m.saturation, 1)}%`, 'Fraction of simulation time'],
      ['Peak |integral term|', fmt(m.maxIntegral, 3), 'Includes Ki · units of u']];
      $('metrics').replaceChildren();
      names.forEach(([name, value, hint]) => {
        const item = document.createElement('div'); item.className = 'metric-card';
        for (const [tag, text] of [['span', name], ['strong', current.unstable ? 'Diverged' : value], ['small', hint]]) {
          const el = document.createElement(tag); el.textContent = text; item.append(el);
        }
        $('metrics').append(item);
      });
      $('metrics-note').textContent = p.recovery ? 'Recovery metrics refer to the second setpoint step; settling time is measured from that step. The initial target is intentionally unreachable in the windup lesson.' :
        'A response that never stays in the target band is “Not settled”. A non-steady tail is reported as final tracking error.';
      $('control-note').textContent = `Limits: [${p.min}, ${p.max}] · Each horizontal segment lasts Ts = ${p.ts} s. The first command includes the initial error derivative.`;
      $('arduino-source').textContent = E.arduinoCode(p);
      $('code-settings').textContent = `Kp = ${p.kp} · Ki = ${p.ki} · Kd = ${p.kd} · Ts = ${p.ts} s · Limits [${p.min}, ${p.max}] · Anti-windup ${p.antiWindup ? 'ON' : 'OFF'}`;
      validActions(true); renderCharts();
    } catch (error) { showError(error); }
  }
  function svgNode(tag, attrs = {}, text) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function chart(id, isControl) {
    const svg = $(id), width = 760, height = isControl ? 320 : 360;
    const margin = { l: 68, r: 20, t: 20, b: 48 }, pw = width - margin.l - margin.r, ph = height - margin.t - margin.b;
    const p = current.p, windowEnd = isControl && $('control-window').value !== 'all' ? Math.min(p.duration, Number($('control-window').value)) : p.duration, all = [current, ...(comparison ? [comparison.series] : [])];
    let lo = isControl ? p.min : 0, hi = isControl ? p.max : Math.max(p.setpoint, p.recovery ? p.recoveryTarget : 0);
    all.forEach(s => (isControl ? s.samples.filter(v => v.t < windowEnd).map(v => v.u) : s.y).forEach(v => { lo = Math.min(lo, v); hi = Math.max(hi, v); }));
    const pad = Math.max((hi - lo) * 0.12, 0.05); lo -= pad; hi += pad;
    const X = t => margin.l + t / windowEnd * pw, Y = v => margin.t + (hi - v) / (hi - lo) * ph;
    svg.replaceChildren(svgNode('title', { id: `${id}-title` }, isControl ? 'Held actuator command' : 'Output and setpoint'),
      svgNode('desc', {}, `${isControl ? 'Stair-step command with actuator limits.' : 'Output over time compared with the setpoint.'} ${comparison ? `Dashed blue: ${comparison.label}.` : ''}`));
    svg.setAttribute('aria-labelledby', `${id}-title`);
    const tickFormat = v => Math.abs(v) >= 10000 || (Math.abs(v) > 0 && Math.abs(v) < 0.001) ? v.toExponential(1) : String(Number(v.toFixed(3)));
    for (let i = 0; i <= 5; i++) {
      const v = lo + (hi - lo) * i / 5, time = windowEnd * i / 5;
      svg.append(svgNode('line', { x1: margin.l, x2: width - margin.r, y1: Y(v), y2: Y(v), stroke: '#e5e7e9' }),
        svgNode('text', { x: margin.l - 10, y: Y(v) + 4, 'text-anchor': 'end', fill: '#53647c', 'font-size': 12 }, tickFormat(v)),
        svgNode('text', { x: X(time), y: height - 22, 'text-anchor': 'middle', fill: '#53647c', 'font-size': 12 }, tickFormat(time)));
    }
    svg.append(svgNode('text', { x: width / 2, y: height - 3, 'text-anchor': 'middle', fill: '#53647c', 'font-size': 12 }, 'Time (s)'));
    const path = (points, color, dash, strokeWidth = 2.5) => svg.append(svgNode('path', {
      d: points,
      fill: 'none', stroke: color, 'stroke-width': strokeWidth, ...(dash ? { 'stroke-dasharray': dash } : {}), 'stroke-linejoin': 'round'
    }));
    if (isControl) {
      for (const v of [p.min, p.max]) path(`M${X(0)},${Y(v)}H${X(windowEnd)}`, '#a04d48', '7 5', 1.6);
    } else {
      const change = current.recoveryTime;
      path(change === null ? `M${X(0)},${Y(p.setpoint)}H${X(p.duration)}` :
        `M${X(0)},${Y(p.setpoint)}H${X(change)}V${Y(p.recoveryTarget)}H${X(p.duration)}`, '#be935e', '8 6', 2);
    }
    const seriesPath = s => {
      if (isControl) {
        let d = '';
        s.samples.filter(point => point.t < windowEnd).forEach((point, i) => { d += `${i ? 'H' + X(point.t).toFixed(2) + 'V' : 'M' + X(point.t).toFixed(2) + ','}${Y(point.u).toFixed(2)}`; });
        return d + `H${X(Math.min(windowEnd, s.t.at(-1))).toFixed(2)}`;
      }
      // Decimate display only. Metrics always use the full RK4 trajectory.
      const stride = Math.max(1, Math.ceil(s.t.length / 2400));
      let d = '';
      for (let i = 0; i < s.t.length; i += stride) d += `${i ? 'L' : 'M'}${X(s.t[i]).toFixed(2)},${Y(s.y[i]).toFixed(2)}`;
      return d + `L${X(s.t.at(-1)).toFixed(2)},${Y(s.y.at(-1)).toFixed(2)}`;
    };
    if (comparison) path(seriesPath(comparison.series), '#678aa0', '6 4', 2);
    path(seriesPath(current), '#233247', '', 2.6);
  }
  function renderCharts() {
    chart('output-chart', false); chart('control-chart', true);
    $('compare-key').hidden = !comparison;
    $('compare-key').textContent = comparison?.label ?? 'Comparison';
  }
  function describeMetric(key, m, s) {
    if (s.unstable) return 'Diverged';
    if (key === 'settling') return m.settling === null ? 'Not settled' : `${fmt(m.settling, 3)} s`;
    return `${fmt(m[key], key === 'error' ? 3 : 2)}%`;
  }
  function prediction() {
    try {
      const change = E.experiment(read(), $('experiment').value);
      const a = E.simulate(change.before), b = E.simulate(change.after), am = E.metrics(a), bm = E.metrics(b);
      current = a; comparison = { series: b, label: change.label };
      const box = $('prediction-feedback'); box.replaceChildren(); box.hidden = false;
      const heading = document.createElement('strong'); heading.textContent = `Current settings versus ${comparison.label}.`; box.append(heading);
      const grid = document.createElement('div'); grid.className = 'prediction-result-grid';
      for (const [key, field, label, tolerance] of [['overshoot', 'os', 'Overshoot', 0.1], ['settling', 'settle', 'Settling time', 0.025], ['error', 'error', 'Final tracking error', 0.05]]) {
        let answer;
        if (a.unstable || b.unstable) answer = null;
        else if (key === 'settling' && (am[key] === null || bm[key] === null))
          answer = am[key] === bm[key] ? 'same' : am[key] === null ? 'decrease' : 'increase';
        else answer = Math.abs(am[key] - bm[key]) <= tolerance ? 'same' : bm[key] > am[key] ? 'increase' : 'decrease';
        const right = answer === $(`prediction-${field}`).value;
        const item = document.createElement('div'); item.className = `prediction-result ${answer === null ? 'is-unknown' : right ? 'is-correct' : 'is-wrong'}`;
        for (const [tag, text] of [['strong', label], ['span', `${describeMetric(key, am, a)} → ${describeMetric(key, bm, b)}`],
        ['span', answer === null ? 'Cannot compare reliably: divergent run' : `${right ? 'Correct' : 'Try again'} · ${answer === 'same' ? (key === 'settling' ? 'About the same / same settling status' : 'About the same') : answer === 'increase' ? (key === 'settling' ? 'Increases / loses settling' : 'Increases') : (key === 'settling' ? 'Decreases / gains settling' : 'Decreases')}`]]) {
          const el = document.createElement(tag); el.textContent = text; item.append(el);
        }
        grid.append(item);
      }
      box.append(grid);
      const note = document.createElement('p'); note.className = 'hint';
      note.textContent = '“Neither settles” describes this observation window, not equal true settling times. Error is a final-window measurement, not necessarily steady-state error. The experiment does not alter your settings.'; box.append(note);
      renderCharts();
    } catch (error) { $('prediction-feedback').hidden = false; $('prediction-feedback').textContent = error.message; }
  }
  function preset(values) { invalidate(); write({ ...E.DEFAULTS, ...values }); refresh(); }
  $('sampling-preset').addEventListener('click', () => preset({ kp: 2, ki: 1, kd: 0, max: 3 }));
  $('windup-preset').addEventListener('click', () => preset({ kp: 1, ki: 4, kd: 0, max: 1, setpoint: 2, recovery: true, duration: 30 }));
  $('project-preset').addEventListener('click', () => {
    // Keep the entered model: no fabricated motor identification data.
    try {
      const p = read(); invalidate(); write({ ...p, plant: 'first', min: 0, max: 100 }); refresh();
      $('simulation-status').textContent += ' PWM limits selected. Enter your measured K and τ; existing values have not been identified as motor data.';
    } catch (error) { showError(error); }
  });
  $('reset').addEventListener('click', () => preset({}));
  $('settings-form').addEventListener('input', event => {
    const id = event.target.id;
    if (id.endsWith('-range')) $(id.replace('-range', '')).value = event.target.value;
    else if ($(`${id}-range`)) $(`${id}-range`).value = event.target.value;
    syncVisibility(); invalidate(); validActions(false); scheduleRefresh();
  });
  $('settings-form').addEventListener('submit', event => { event.preventDefault(); scheduleRefresh(); });
  $('prediction-form').addEventListener('submit', event => { event.preventDefault(); prediction(); });
  $('experiment').addEventListener('change', () => { clearComparison(); for (const id of ['os', 'settle', 'error']) $(`prediction-${id}`).value = ''; });
  $('clear-prediction').addEventListener('click', clearComparison);
  $('control-window').addEventListener('change', () => { if (current) renderCharts(); });
  $('compare-windup').addEventListener('click', () => {
    try {
      const p = read(); comparison = { series: E.simulate({ ...p, antiWindup: !p.antiWindup }), label: `Anti-windup ${p.antiWindup ? 'off' : 'on'}` }; renderCharts();
      const m = E.metrics(comparison.series); $('control-note').textContent = `Dashed blue: ${comparison.label}; peak |I| = ${fmt(m.maxIntegral, 3)}. Current peak |I| = ${fmt(current.maxIntegral, 3)}. Limits [${p.min}, ${p.max}].`;
    }
    catch (error) { showError(error); }
  });
  $('compare-sampling').addEventListener('click', () => {
    try {
      const p = read(), body = $('sampling-table').querySelector('tbody'); body.replaceChildren();
      for (const ts of [0.01, 0.1, 0.5, 1]) {
        const s = E.simulate({ ...p, ts }), m = E.metrics(s), row = document.createElement('tr');
        const cells = [ts.toFixed(2), describeMetric('overshoot', m, s), describeMetric('settling', m, s), describeMetric('error', m, s),
        s.unstable ? 'Diverged' : m.steady ? 'Steady tail' : 'Tail still changing'];
        cells.forEach((v, i) => { const cell = document.createElement(i ? 'td' : 'th'); if (!i) cell.scope = 'row'; cell.textContent = v; row.append(cell); }); body.append(row);
      }
      $('sampling-table').querySelector('caption').textContent = 'Independent runs: only Ts changes. Settling uses the ±2% band with a full final second in band.';
    } catch (error) { showError(error); }
  });
  async function copy(text, success) {
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
      else {
        const area = document.createElement('textarea'); area.value = text; area.style.position = 'fixed'; area.style.left = '-10000px'; document.body.append(area); area.select();
        const ok = document.execCommand('copy'); area.remove(); if (!ok) throw Error('Clipboard unavailable');
      }
      $('copy-status').textContent = success;
    } catch (_) { $('copy-status').textContent = 'Clipboard access is unavailable. Select the code to copy it, or use Download .ino.'; }
  }
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), link = document.createElement('a');
    link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $('copy-code').addEventListener('click', () => copy(E.arduinoCode(read()), 'Arduino code copied.'));
  $('download-code').addEventListener('click', () => download('rayhana-digital-pid.ino', E.arduinoCode(read()), 'text/plain'));
  $('copy-link').addEventListener('click', () => {
    const url = new URL(location.href); url.hash = ''; url.search = ''; url.searchParams.set('config', JSON.stringify(read()));
    copy(url.href, 'Settings link copied. Add it to My System after validating the measured model and final gains.');
  });
  $('export-csv').addEventListener('click', () => {
    const header = 'time_s,setpoint,output,error,proportional,integral,derivative,raw_command,applied_command,anti_windup_blocked';
    const rows = current.samples.map(s => [s.t, s.r, s.y, s.previousError, s.proportional, s.integral, s.derivative, s.raw, s.u, s.blocked].join(','));
    download('digital-pid-samples.csv', [header, ...rows].join('\n'), 'text/csv');
  });
  function updateZN() {
    try {
      const gains = E.znGains(Number($('ku').value), Number($('pu').value));
      $('zn-gains').textContent = `Kp = ${fmt(gains.kp, 4)} · Ki = ${fmt(gains.ki, 4)} · Kd = ${fmt(gains.kd, 4)}`; $('bonus-status').textContent = ''; return gains;
    } catch (error) { $('zn-gains').textContent = 'Enter positive Ku and Pu.'; throw error; }
  }
  for (const id of ['ku', 'pu']) $(id).addEventListener('input', () => { try { updateZN(); } catch (error) { $('bonus-status').textContent = error.message; } });
  $('apply-zn').addEventListener('click', () => {
    try {
      const exactGains = updateZN();
      const gains = Object.fromEntries(Object.entries(exactGains).map(([k, v]) => [k, Number(v.toPrecision(7))]));
      // Validate before touching any current settings.
      const p = E.settings({ ...E.DEFAULTS, ...gains, plant: 'third', ts: 0.01, min: -20, max: 20, duration: 40 });
      preset(p); const m = E.metrics(current);
      $('bonus-status').textContent = `Calculated gains applied to the three-lag teaching plant. Overshoot ${fmt(m.overshoot)}%; settling ${m.settling === null ? 'not reached' : fmt(m.settling) + ' s'}. Inspect the output and generated Arduino code above.`;
      $('lab').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    } catch (error) { $('bonus-status').textContent = error.message; }
  });
  let initial = E.DEFAULTS, configError = '';
  try {
    const saved = new URL(location.href).searchParams.get('config');
    if (saved) initial = E.settings(JSON.parse(saved));
  } catch (_) { configError = 'The settings link is invalid. The default teaching model has been loaded.'; }
  write(initial); refresh(); updateZN();
  if (configError) { $('settings-error').hidden = false; $('settings-error').textContent = configError; }
})();

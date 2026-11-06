(function () {
    'use strict';
    const D = window.Dynamics3;
    const $ = id => document.getElementById(id);
    const defaults = { m: 1, b: 2, k: 4, force: 1 };
    let parameters = { ...defaults }, snapshot, numerical, frame = null, previousExperiment = null;
    const subscribers = new Set();
    const number = n => Number.isFinite(n) ? Number(n.toPrecision(5)).toString() : '—';
    const seconds = t => t === null ? 'Outside window' : number(t) + ' s';
    const svgNS = 'http://www.w3.org/2000/svg';
    function node(tag, attrs = {}, text) {
        const n = document.createElementNS(svgNS, tag);
        Object.entries(attrs).forEach(([key, value]) => n.setAttribute(key, value));
        if (text !== undefined) n.textContent = text;
        return n;
    }
    function feedback(id, text = '', kind = '') {
        $(id).textContent = text; $(id).className = 'feedback ' + kind;
    }
    function syncControls() {
        for (const key of Object.keys(D.bounds)) {
            $(key + 'Number').value = parameters[key];
            $(key + 'Slider').value = parameters[key];
            $(key + 'Number').removeAttribute('aria-invalid');
            $(key + 'Slider').setAttribute('aria-valuetext', number(parameters[key]));
        }
    }
    function applyParameters(next) {
        parameters = D.validate({ ...parameters, ...next });
        syncControls(); feedback('controlMessage'); schedule();
    }
    function schedule() {
        if (frame !== null) cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => { frame = null; update(); });
    }
    function poleString(p) {
        return number(p.re) + (Math.abs(p.im) < 1e-10 ? '' : (p.im >= 0 ? ' + j' : ' − j') + number(Math.abs(p.im)));
    }
    function renderMeasurements() {
        const { derived: d, metrics: m } = snapshot;
        $('regimeLabel').textContent = d.regime;
        $('zetaValue').textContent = number(d.zeta);
        $('omegaValue').textContent = number(d.omegaN) + ' rad/s';
        $('finalValue').textContent = number(d.finalValue) + ' m';
        $('riseValue').textContent = seconds(m.riseTime);
        $('riseDetail').textContent = m.riseTime === null ? 'Extend the time window.' : `10%: ${number(m.t10)} s · 90%: ${number(m.t90)} s`;
        $('peakValue').textContent = m.peakExists ? seconds(m.peakTime) : 'Not applicable';
        $('peakDetail').textContent = m.peakExists ? 'First overshoot maximum.' : 'No finite overshoot peak.';
        $('overshootValue').textContent = m.overshootPercent === null ? 'Outside window' : number(m.overshootPercent) + '%';
        $('overshootDetail').textContent = m.peakTime === null ? 'Relative to equilibrium.' : `Peak: ${number(D.exactAt(m.peakTime, parameters, d).x)} m`;
        $('settlingValue').textContent = d.zeta === 0 ? 'Never settles' : seconds(m.settlingTime);
        $('settlingDetail').textContent = d.zeta === 0 ? 'Oscillations persist without decay.'
            : m.settlingTime === null ? 'No final band entry in this window.' : 'Remains within ±2% afterward.';
        $('poleValues').replaceChildren();
        d.poles.forEach((p, i) => {
            const row = document.createElement('div'); row.textContent = `p${i + 1} = ${poleString(p)} s⁻¹`;
            $('poleValues').append(row);
        });
        $('poleExplanation').textContent = d.zeta === 0
            ? 'Purely imaginary poles: sustained oscillation with no decay.'
            : d.zeta < 1 ? 'Complex-conjugate poles in the left half-plane: decaying oscillations.'
                : d.zeta === 1 || d.regime === 'Critically damped' ? 'A repeated negative real pole: critical damping without overshoot.'
                    : 'Two distinct negative real poles: a nonoscillatory approach to equilibrium.';
        const notes = [];
        if (snapshot.window.limited) notes.push('Auto duration is limited to 300 s. Some measurements may lie beyond the window.');
        if (snapshot.response.resolutionLimited) notes.push('Dense oscillations: select a shorter window to inspect individual cycles.');
        if (d.zeta === 0) notes.push('Zero damping: the dashed line is the equilibrium position, not a final settled value.');
        $('windowMessage').textContent = notes.join(' ');
        document.querySelectorAll('[data-preset]').forEach(button => {
            const preset = presets[button.dataset.preset];
            button.setAttribute('aria-pressed', String(Object.keys(defaults).every(k => parameters[k] === preset[k])));
        });
    }
    function runSolver() {
        const h = Number($('solverStep').value), method = $('solverMethod').value;
        $('solverLegend').textContent = (method === 'rk4' ? 'RK4' : 'Euler') + ' approximation';
        if ($('solverStep').value.trim() === '' || !Number.isFinite(h) || h < 0.0001 || h > 1) {
            numerical = { ok: false };
            $('solverStep').setAttribute('aria-invalid', 'true');
            feedback('solverStatus', 'Enter a step size from 0.0001 to 1 s. The exact response remains available.', 'error');
        } else {
            $('solverStep').removeAttribute('aria-invalid');
            numerical = D.integrate(parameters, snapshot.window.end, h, method);
            if (!numerical.ok) feedback('solverStatus', numerical.reason, 'error');
            else if (!D.stability(parameters, h, method)) {
                feedback('solverStatus', 'This step size is outside the method’s stability region for these poles. Reduce h; numerical growth is an integration error.', 'notice');
            } else feedback('solverStatus', `Comparison updated with h = ${number(h)} s. The green curve is the exact reference.`, 'success');
        }
        $('maxError').textContent = numerical.ok ? number(numerical.maxError) + ' m' : 'Unavailable';
        $('rmseValue').textContent = numerical.ok ? number(numerical.rmse) + ' m' : 'Unavailable';
        $('stepsValue').textContent = numerical.ok ? numerical.steps.toLocaleString() : '—';
        $('halveStep').disabled = !(h > 0.0001 && Number.isFinite(h));
    }
    function update() {
        const derived = D.derive(parameters), auto = D.autoWindow(derived);
        const windowConfig = $('timeWindow').value === 'auto' ? auto : { end: Number($('timeWindow').value), limited: false };
        const measures = D.metrics(parameters, windowConfig.end, derived);
        snapshot = {
            parameters: { ...parameters }, derived, metrics: measures, window: windowConfig,
            response: D.response(parameters, windowConfig.end, derived, measures)
        };
        renderMeasurements(); runSolver(); renderCharts();
        // Listeners receive independent copies, so extensions cannot alter simulator state.
        subscribers.forEach(callback => notify(callback));
        window.dispatchEvent(new CustomEvent('module3:update', { detail: cloneSnapshot() }));
    }
    function cloneSnapshot() { return structuredClone(snapshot); }
    function notify(callback) {
        try { callback(cloneSnapshot()); } catch (error) { console.error('Module 3 extension:', error); }
    }
    function interpolate(t, times, values) {
        let lo = 0, hi = times.length - 1;
        while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (times[mid] <= t) lo = mid; else hi = mid; }
        const fraction = (t - times[lo]) / (times[hi] - times[lo] || 1);
        return values[lo] + fraction * (values[hi] - values[lo]);
    }
    function chart(id, curves, withMetrics) {
        const host = $(id), width = Math.max(260, host.clientWidth), height = width < 430 ? 300 : 340;
        const left = 68, right = width - 22, top = 22, bottom = height - 53;
        const end = snapshot.window.end, f = snapshot.derived.finalValue;
        let low = 0, high = f * 1.04;
        curves.forEach(c => c.values.forEach(v => { low = Math.min(low, v); high = Math.max(high, v); }));
        const pad = Math.max((high - low) * 0.1, 1e-8); low -= pad; high += pad;
        const X = t => left + t / end * (right - left), Y = y => bottom - (y - low) / (high - low) * (bottom - top);
        const svg = node('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': host.getAttribute('aria-label') });
        svg.append(node('title', {}, host.getAttribute('aria-label')));
        svg.append(node('rect', { x: left, y: Y(1.02 * f), width: right - left, height: Y(.98 * f) - Y(1.02 * f), fill: '#e0f2dd' }));
        for (let i = 0; i <= 4; i++) {
            const val = low + i / 4 * (high - low), y = Y(val);
            svg.append(node('line', { x1: left, x2: right, y1: y, y2: y, stroke: '#e3ece1' }));
            svg.append(node('text', { x: left - 9, y: y + 4, 'text-anchor': 'end' }, Number(val.toPrecision(3)).toString()));
        }
        const ticks = width < 430 ? 3 : 5;
        for (let i = 0; i <= ticks; i++) {
            const time = i / ticks * end, x = X(time);
            svg.append(node('text', { x, y: bottom + 21, 'text-anchor': i === 0 ? 'start' : i === ticks ? 'end' : 'middle' }, number(Number(time.toPrecision(3)))));
        }
        svg.append(node('rect', { x: left, y: top, width: right - left, height: bottom - top, fill: 'none', stroke: '#a9c6ac' }));
        svg.append(node('line', { x1: left, x2: right, y1: Y(f), y2: Y(f), stroke: '#708378', 'stroke-dasharray': '6 4' }));
        curves.forEach(c => {
            const path = c.times.map((t, i) => `${i ? 'L' : 'M'}${X(t).toFixed(2)},${Y(c.values[i]).toFixed(2)}`).join(' ');
            svg.append(node('path', {
                d: path, fill: 'none', stroke: c.color, 'stroke-width': c.dashed ? 2 : 2.4,
                ...(c.dashed ? { 'stroke-dasharray': '6 4' } : {})
            }));
        });
        if (withMetrics) {
            const m = snapshot.metrics;
            for (const [key, label] of [['t10', '10%'], ['t90', '90%'], ['peakTime', 'Peak'], ['settlingTime', 'Settled']]) {
                if (m[key] === null) continue;
                const t = m[key], x = X(t), y = Y(D.exactAt(t, parameters, snapshot.derived).x);
                svg.append(node('line', { x1: x, x2: x, y1: y, y2: bottom, stroke: '#97b09b', 'stroke-dasharray': '3 4' }));
                const dot = node('circle', { cx: x, cy: y, r: 4, fill: '#075c31' });
                dot.append(node('title', {}, `${label}: ${number(t)} s`)); svg.append(dot);
            }
        }
        svg.append(node('text', { x: (left + right) / 2, y: height - 9, 'text-anchor': 'middle', class: 'axis-title' }, 'Time t (s)'));
        svg.append(node('text', { transform: `translate(17 ${(top + bottom) / 2}) rotate(-90)`, 'text-anchor': 'middle', class: 'axis-title' }, 'Displacement x (m)'));
        const guide = node('line', { y1: top, y2: bottom, stroke: '#798c7d', visibility: 'hidden' }); svg.append(guide);
        const dots = curves.map(c => { const dot = node('circle', { r: 4, fill: c.color, visibility: 'hidden' }); svg.append(dot); return dot; });
        const overlay = node('rect', { x: left, y: top, width: right - left, height: bottom - top, fill: 'transparent' });
        svg.append(overlay); host.replaceChildren(svg); host.tabIndex = 0;
        host.setAttribute('role', 'group'); host.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight Home End');
        host.setAttribute('aria-describedby', withMetrics ? 'responseReadout' : 'solverReadout');
        let selected = 0;
        const inspect = t => {
            selected = Math.max(0, Math.min(end, t));
            const x = X(selected), exact = D.exactAt(selected, parameters, snapshot.derived).x;
            guide.setAttribute('x1', x); guide.setAttribute('x2', x); guide.setAttribute('visibility', 'visible');
            curves.forEach((c, i) => { dots[i].setAttribute('cx', x); dots[i].setAttribute('cy', Y(i === 0 ? exact : interpolate(selected, c.times, c.values))); dots[i].setAttribute('visibility', 'visible'); });
            const readout = `t = ${number(selected)} s · Exact x = ${number(exact)} m`;
            $(withMetrics ? 'responseReadout' : 'solverReadout').textContent = readout + (!withMetrics && numerical.ok ? ` · Numerical x ≈ ${number(interpolate(selected, numerical.time, numerical.displacement))} m` : '');
        };
        const pointer = event => { const bounds = svg.getBoundingClientRect(); inspect(((event.clientX - bounds.left) * width / bounds.width - left) / (right - left) * end); };
        overlay.addEventListener('pointermove', pointer); overlay.addEventListener('pointerdown', pointer);
        host.onkeydown = event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault(); inspect(event.key === 'Home' ? 0 : event.key === 'End' ? end : selected + (event.key === 'ArrowRight' ? 1 : -1) * end / 100);
        };
        host.onfocus = () => inspect(selected);
    }
    function renderPoles() {
        const host = $('polesPlot'), width = Math.max(260, host.clientWidth), height = 270;
        const left = 68, right = width - 25, top = 25, bottom = height - 52;
        const poles = snapshot.derived.poles;
        const real = Math.max(1, ...poles.map(p => Math.abs(p.re)));
        const imag = snapshot.derived.zeta < 1 ? Math.max(1e-6, ...poles.map(p => Math.abs(p.im))) : .5;
        const xmin = -real * 1.25, xmax = real * .22, ymax = imag * 1.4;
        const X = x => left + (x - xmin) / (xmax - xmin) * (right - left), Y = y => bottom - (y + ymax) / (2 * ymax) * (bottom - top);
        const svg = node('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': 'Real and imaginary parts of the two system poles' });
        svg.append(node('rect', { x: left, y: top, width: right - left, height: bottom - top, fill: '#f8fcf6', stroke: '#c3ddc1' }));
        svg.append(node('line', { x1: left, x2: right, y1: Y(0), y2: Y(0), stroke: '#a9c6ac' }));
        svg.append(node('line', { x1: X(0), x2: X(0), y1: top, y2: bottom, stroke: '#a9c6ac' }));
        for (let i = 0; i <= 3; i++) {
            const re = xmin + i * (xmax - xmin) / 3;
            svg.append(node('text', { x: X(re), y: bottom + 20, 'text-anchor': i === 0 ? 'start' : i === 3 ? 'end' : 'middle' }, Number(re.toPrecision(3)).toString()));
        }
        for (const im of [-imag, 0, imag]) svg.append(node('text', { x: left - 9, y: Y(im) + 4, 'text-anchor': 'end' }, Number(im.toPrecision(3)).toString()));
        svg.append(node('text', { x: (left + right) / 2, y: height - 9, 'text-anchor': 'middle', class: 'axis-title' }, 'Real part (s⁻¹)'));
        svg.append(node('text', { transform: `translate(17 ${(top + bottom) / 2}) rotate(-90)`, 'text-anchor': 'middle', class: 'axis-title' }, 'Imaginary part (s⁻¹)'));
        const repeated = Math.abs(poles[0].re - poles[1].re) < 1e-10 && Math.abs(poles[0].im - poles[1].im) < 1e-10;
        (repeated ? [poles[0]] : poles).forEach((p, i) => {
            const x = X(p.re), y = Y(p.im), g = node('g');
            g.append(node('path', { d: `M${x - 5},${y - 5}L${x + 5},${y + 5}M${x - 5},${y + 5}L${x + 5},${y - 5}`, fill: 'none', stroke: '#087a3e', 'stroke-width': 2.5 }));
            g.append(node('title', {}, 'Pole ' + poleString(p)));
            g.append(node('text', { x: x + 9, y: y + (!repeated && i === 1 ? 18 : -9) }, repeated ? '×2' : 'p' + (i + 1))); svg.append(g);
        });
        host.replaceChildren(svg);
    }
    function renderCharts() {
        if (!snapshot) return;
        const exact = { times: snapshot.response.time, values: snapshot.response.displacement, color: '#10a329' };
        chart('stepResponsePlot', [exact], true);
        chart('solverPlot', numerical.ok ? [exact, { times: numerical.time, values: numerical.displacement, color: '#b36805', dashed: true }] : [exact], false);
        $('responseReadout').textContent = 'Move over the curve, tap it, or focus the plot and use the arrow keys to inspect values.';
        $('solverReadout').textContent = 'Inspect the plot to compare both curves at the same time.';
        renderPoles();
    }
    function renderValidation() {
        const rows = D.validations(); $('validationRows').replaceChildren();
        rows.forEach(result => {
            const tr = document.createElement('tr');
            [result.check, result.expected, number(result.value) + result.unit, result.pass ? 'PASS' : 'FAIL'].forEach((text, i) => {
                const td = document.createElement('td'); td.textContent = text;
                if (i === 3) td.className = result.pass ? 'pass' : 'fail'; tr.append(td);
            });
            $('validationRows').append(tr);
        });
        $('validationSummary').textContent = `${rows.filter(r => r.pass).length} of ${rows.length} reference checks passed. Check 4 uses b = 2 N·s/m; check 5 uses b = 4 N·s/m.`;
    }
    const presets = {
        under: { ...defaults }, critical: { ...defaults, b: 4 }, over: { ...defaults, b: 6 }, undamped: { ...defaults, b: 0 }
    };
    const experiments = {
        damping: {
            choices: ['Overshoot disappears; equilibrium stays the same.', 'Overshoot increases; equilibrium stays the same.', 'Equilibrium doubles; overshoot stays the same.'],
            correct: 0, end: { ...defaults, b: 4 },
            setup: 'Compare m = 1, k = 4, F₀ = 1 with b = 2, then b = 4. Only damping changes.',
            explanation: 'ζ increases from 0.5 to 1, so the response becomes critically damped. Overshoot falls from 16.3% to 0%; F₀/k remains 0.25 m.'
        },
        speed: {
            choices: ['Rise time doubles; percentage overshoot is unchanged.', 'Rise time halves; percentage overshoot is unchanged.', 'Percentage overshoot doubles; timing is unchanged.'],
            correct: 1, end: { m: .25, b: 1, k: 4, force: 1 },
            setup: 'Compare the default model with m = 0.25, b = 1, k = 4, F₀ = 1. ωn doubles from 2 to 4 rad/s; ζ stays at 0.5.',
            explanation: 'At fixed ζ, doubling ωn halves the time scale. Rise time halves, overshoot stays at 16.3%, and equilibrium remains 0.25 m.'
        },
        force: {
            choices: ['Equilibrium is unchanged; rise time halves.', 'Percentage overshoot doubles; equilibrium is unchanged.', 'Equilibrium doubles; relative timing and percentage overshoot stay the same.'],
            correct: 2, end: { ...defaults, force: 2 },
            setup: 'Compare the default model with F₀ = 2 N. Mass, damping, and stiffness stay fixed.',
            explanation: 'The linear response scales with force: equilibrium doubles from 0.25 to 0.5 m. The 10–90% rise time and percentage overshoot stay the same.'
        }
    };
    function preparePrediction() {
        const exp = experiments[$('predictionScenario').value];
        $('predictionAnswer').replaceChildren(new Option('Choose a prediction…', ''));
        exp.choices.forEach((text, i) => $('predictionAnswer').add(new Option(text, String(i))));
        $('predictionSetup').textContent = exp.setup; feedback('predictionFeedback');
    }
    for (const key of Object.keys(D.bounds)) {
        $(key + 'Slider').addEventListener('input', () => applyParameters({ [key]: Number($(key + 'Slider').value) }));
        $(key + 'Number').addEventListener('input', () => {
            const input = $(key + 'Number'), value = Number(input.value);
            try {
                if (input.value.trim() === '') throw new Error(`${key} is required.`);
                applyParameters({ [key]: value });
            } catch (error) { input.setAttribute('aria-invalid', 'true'); feedback('controlMessage', error.message + ' The last valid model remains displayed.', 'error'); }
        });
    }
    document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => applyParameters(presets[button.dataset.preset])));
    $('resetModel').addEventListener('click', () => {
        $('timeWindow').value = 'auto'; $('solverMethod').value = 'rk4'; $('solverStep').value = '0.02';
        previousExperiment = null; $('restorePrediction').disabled = true; preparePrediction(); applyParameters(defaults);
    });
    $('timeWindow').addEventListener('change', schedule);
    $('solverMethod').addEventListener('change', schedule);
    $('solverStep').addEventListener('input', schedule);
    $('halveStep').addEventListener('click', () => { $('solverStep').value = Math.max(.0001, Number($('solverStep').value) / 2); schedule(); });
    $('rerunValidation').addEventListener('click', renderValidation);
    $('predictionScenario').addEventListener('change', preparePrediction);
    $('predictionAnswer').addEventListener('change', () => feedback('predictionFeedback'));
    $('checkPrediction').addEventListener('click', () => {
        if ($('predictionAnswer').value === '') { feedback('predictionFeedback', 'Choose a prediction before running the experiment.', 'notice'); $('predictionAnswer').focus(); return; }
        if (!previousExperiment) previousExperiment = { parameters: { ...parameters }, timeWindow: $('timeWindow').value };
        const exp = experiments[$('predictionScenario').value];
        $('timeWindow').value = 'auto'; applyParameters(exp.end); $('restorePrediction').disabled = false;
        feedback('predictionFeedback', (Number($('predictionAnswer').value) === exp.correct ? 'Correct. ' : 'Review the result. ') + exp.explanation, Number($('predictionAnswer').value) === exp.correct ? 'success' : 'notice');
    });
    $('restorePrediction').addEventListener('click', () => {
        if (!previousExperiment) return;
        $('timeWindow').value = previousExperiment.timeWindow; applyParameters(previousExperiment.parameters);
        previousExperiment = null; $('restorePrediction').disabled = true; feedback('predictionFeedback', 'Your previous model and time window have been restored.', 'success');
    });
    // Stable extension API for Yasmin's state-space panel and Module 4.
    window.Module3 = Object.freeze({
        getSnapshot: cloneSnapshot,
        setParameters: applyParameters,
        subscribe(callback) {
            if (typeof callback !== 'function') throw new TypeError('A callback is required.');
            subscribers.add(callback); if (snapshot) notify(callback);
            return () => subscribers.delete(callback);
        }
    });
    syncControls(); preparePrediction(); renderValidation(); update();
    let resizeFrame;
    const observer = new ResizeObserver(() => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(renderCharts); });
    ['stepResponsePlot', 'solverPlot', 'polesPlot'].forEach(id => observer.observe($(id)));
})();

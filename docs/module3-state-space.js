/* Yasmin: state-space extension. Uses the shared Module3 controls and snapshot. */
(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else {
        root.Module3StateSpace = Object.freeze(api);
        api.mount(root.Module3, root.document);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const format = n => Number(n.toPrecision(6)).toString();
    const complex = p => format(p.re) + (p.im === 0 ? '' : (p.im > 0 ? ' + j' : ' − j') + format(Math.abs(p.im)));

    function matrices({ m, b, k }) {
        if (![m, b, k].every(Number.isFinite) || m <= 0 || b < 0 || k <= 0) {
            throw new RangeError('State space requires m > 0, b ≥ 0, k > 0.');
        }
        return { A: [[0, 1], [-k / m, -b / m]], B: [[0], [1 / m]] };
    }

    // Solve det(λI − A) = λ² − trace(A)λ + det(A), independently of Dynamics3.derive.
    function eigenvalues(A) {
        const trace = A[0][0] + A[1][1];
        const determinant = A[0][0] * A[1][1] - A[0][1] * A[1][0];
        const discriminant = trace * trace - 4 * determinant;
        const scale = Math.max(trace * trace, 4 * Math.abs(determinant), Number.MIN_VALUE);
        if (Math.abs(discriminant) <= 2e-10 * scale) {
            return [{ re: trace / 2, im: 0 }, { re: trace / 2, im: 0 }];
        }
        if (discriminant < 0) {
            const im = Math.sqrt(-discriminant) / 2;
            return [{ re: trace / 2, im }, { re: trace / 2, im: -im }];
        }
        // Compute the large root first; the product of the roots gives the small
        // root without subtracting nearly equal numbers in heavily damped cases.
        const large = (trace + (trace < 0 ? -1 : 1) * Math.sqrt(discriminant)) / 2;
        return [{ re: determinant / large, im: 0 }, { re: large, im: 0 }];
    }

    function poleError(values, poles) {
        const distance = (a, b) => Math.hypot(a.re - b.re, a.im - b.im);
        return Math.min(
            Math.max(distance(values[0], poles[0]), distance(values[1], poles[1])),
            Math.max(distance(values[0], poles[1]), distance(values[1], poles[0]))
        );
    }

    function referenceCheck() {
        const { A } = matrices({ m: 1, b: 2, k: 4 });
        const actual = eigenvalues(A);
        const expected = [{ re: -1, im: 1.732 }, { re: -1, im: -1.732 }];
        const referencePoles = [{ re: -1, im: Math.sqrt(3) }, { re: -1, im: -Math.sqrt(3) }];
        return { actual, pass: poleError(actual, expected) <= 0.001 && poleError(actual, referencePoles) <= 1e-9 };
    }

    function mount(shared, doc) {
        const panel = doc.getElementById('stateSpacePanel');
        if (!panel || !shared) return;
        const $ = id => doc.getElementById(id);
        const svgNS = 'http://www.w3.org/2000/svg';
        let latestSnapshot;
        function svgNode(tag, attrs = {}, text) {
            const node = doc.createElementNS(svgNS, tag);
            Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
            if (text !== undefined) node.textContent = text;
            return node;
        }
        function matrix(id, values) {
            const table = doc.createElement('table');
            table.setAttribute('aria-label', id === 'matrixA' ? 'State matrix A' : id === 'matrixB' ? 'Input matrix B' : 'Output matrix C');
            const body = doc.createElement('tbody');
            values.forEach(row => {
                const tr = doc.createElement('tr');
                row.forEach(value => {
                    const cell = doc.createElement('td'); cell.textContent = format(value); tr.append(cell);
                });
                body.append(tr);
            });
            table.append(body); $(id).replaceChildren(table);
        }
        function renderPhase(snapshot) {
            const host = $('phasePlanePlot');
            const width = Math.max(260, host.clientWidth), height = width < 430 ? 300 : 340;
            const left = 62, right = width - 22, top = 22, bottom = height - 53;
            const { displacement: xs, velocity: vs, time } = snapshot.response;
            const equilibrium = snapshot.parameters.force / snapshot.parameters.k;
            const xmin = Math.min(0, equilibrium, ...xs), xmax = Math.max(0, equilibrium, ...xs);
            const vmin = Math.min(0, ...vs), vmax = Math.max(0, ...vs);
            const dx = Math.max(xmax - xmin, equilibrium * 0.1, 1e-9);
            const dv = Math.max(vmax - vmin, dx / snapshot.window.end, 1e-9);
            const bounds = { x0: xmin - dx * 0.12, x1: xmax + dx * 0.12, v0: vmin - dv * 0.15, v1: vmax + dv * 0.15 };
            const X = x => left + (x - bounds.x0) / (bounds.x1 - bounds.x0) * (right - left);
            const Y = v => bottom - (v - bounds.v0) / (bounds.v1 - bounds.v0) * (bottom - top);
            const svg = svgNode('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-labelledby': 'phaseTitle phaseDescription' });
            svg.append(svgNode('title', { id: 'phaseTitle' }, 'Phase plane: displacement versus velocity'));
            svg.append(svgNode('desc', { id: 'phaseDescription' }, `Step response from rest over ${format(snapshot.window.end)} seconds. ${snapshot.derived.regime}. Arrows show increasing time; equilibrium is (${format(equilibrium)}, 0).`));
            for (let i = 0; i <= 4; i++) {
                const x = bounds.x0 + i / 4 * (bounds.x1 - bounds.x0);
                const v = bounds.v0 + i / 4 * (bounds.v1 - bounds.v0);
                svg.append(svgNode('line', { x1: X(x), x2: X(x), y1: top, y2: bottom, class: 'ss-grid' }));
                svg.append(svgNode('line', { x1: left, x2: right, y1: Y(v), y2: Y(v), class: 'ss-grid' }));
                svg.append(svgNode('text', { x: X(x), y: bottom + 21, 'text-anchor': 'middle' }, Number(x.toPrecision(3)).toString()));
                svg.append(svgNode('text', { x: left - 9, y: Y(v) + 4, 'text-anchor': 'end' }, Number(v.toPrecision(3)).toString()));
            }
            svg.append(svgNode('line', { x1: X(0), x2: X(0), y1: top, y2: bottom, class: 'ss-axis' }));
            svg.append(svgNode('line', { x1: left, x2: right, y1: Y(0), y2: Y(0), class: 'ss-axis' }));
            svg.append(svgNode('text', { x: (left + right) / 2, y: height - 9, 'text-anchor': 'middle' }, 'Displacement x₁ (m)'));
            svg.append(svgNode('text', { transform: `translate(17 ${(top + bottom) / 2}) rotate(-90)`, 'text-anchor': 'middle' }, 'Velocity x₂ (m/s)'));
            svg.append(svgNode('polyline', { points: xs.map((x, i) => `${X(x)},${Y(vs[i])}`).join(' '), class: 'ss-trajectory' }));
            // Place direction markers by distance along the curve, not by sample
            // number, so long settled tails do not hide all the arrows.
            const lengths = [0];
            for (let i = 1; i < xs.length; i++) lengths.push(lengths[i - 1] + Math.hypot(X(xs[i]) - X(xs[i - 1]), Y(vs[i]) - Y(vs[i - 1])));
            for (const fraction of [0.15, 0.4, 0.65, 0.85]) {
                const i = Math.max(1, lengths.findIndex(length => length >= lengths[lengths.length - 1] * fraction));
                const angle = Math.atan2(Y(vs[i]) - Y(vs[i - 1]), X(xs[i]) - X(xs[i - 1])) * 180 / Math.PI;
                svg.append(svgNode('path', { d: 'M -8 -4 L 0 0 L -8 4', transform: `translate(${X(xs[i])} ${Y(vs[i])}) rotate(${angle})`, class: 'ss-direction' }));
            }
            svg.append(svgNode('circle', { cx: X(0), cy: Y(0), r: 5, class: 'ss-start' }));
            const last = xs.length - 1;
            svg.append(svgNode('circle', { cx: X(xs[last]), cy: Y(vs[last]), r: 5, class: 'ss-end' }));
            svg.append(svgNode('path', { d: `M ${X(equilibrium) - 6} ${Y(0) - 6} l 12 12 m -12 0 l 12 -12`, class: 'ss-equilibrium' }));
            const dot = svgNode('circle', { r: 5, class: 'ss-inspect-dot', visibility: 'hidden' });
            svg.append(dot);
            host.replaceChildren(svg);
            host.tabIndex = 0;
            host.setAttribute('role', 'group');
            host.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight Home End');
            host.setAttribute('aria-describedby', 'phasePlaneReadout');
            let selected = 0;
            function inspect(index) {
                selected = Math.max(0, Math.min(last, index));
                dot.setAttribute('cx', X(xs[selected])); dot.setAttribute('cy', Y(vs[selected]));
                dot.setAttribute('visibility', 'visible');
                $('phasePlaneReadout').textContent = `t = ${format(time[selected])} s · x₁ = ${format(xs[selected])} m · x₂ = ${format(vs[selected])} m/s`;
            }
            function pointer(event) {
                const rect = svg.getBoundingClientRect();
                const x = (event.clientX - rect.left) / rect.width * width;
                const y = (event.clientY - rect.top) / rect.height * height;
                let nearest = 0, distance = Infinity;
                for (let i = 0; i <= last; i++) {
                    const next = (X(xs[i]) - x) ** 2 + (Y(vs[i]) - y) ** 2;
                    if (next < distance) { distance = next; nearest = i; }
                }
                inspect(nearest);
            }
            svg.addEventListener('pointermove', pointer); svg.addEventListener('pointerdown', pointer);
            host.onkeydown = event => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                inspect(event.key === 'Home' ? 0 : event.key === 'End' ? last
                    : selected + (event.key === 'ArrowRight' ? 1 : -1) * Math.max(1, Math.round(last / 100)));
            };
            host.onfocus = () => inspect(selected);
            $('phasePlaneReadout').textContent = 'Move over the path, tap it, or focus the plot and use the arrow keys to follow the motion in time.';
        }
        function render(snapshot) {
            latestSnapshot = snapshot;
            const { A, B } = matrices(snapshot.parameters), values = eigenvalues(A);
            matrix('matrixA', A); matrix('matrixB', B); matrix('matrixC', [[1, 0]]);
            $('eigenvalues').replaceChildren();
            values.forEach((value, i) => {
                const row = doc.createElement('div'); row.textContent = `λ${i + 1} = ${complex(value)} s⁻¹`;
                $('eigenvalues').append(row);
            });
            const error = poleError(values, snapshot.derived.poles);
            const tolerance = 1e-6 * Math.max(1, ...values.map(p => Math.hypot(p.re, p.im)));
            const match = error <= tolerance;
            const { m, b, k } = snapshot.parameters;
            $('poleCharacteristic').textContent = `${format(m)}s² + ${format(b)}s + ${format(k)} = 0`;
            $('stateSpaceCharacteristic').textContent = `λ² + ${format(b / m)}λ + ${format(k / m)} = 0`;
            $('stateSpaceMatch').textContent = `${match ? 'PASS · Poles and eigenvalues match.' : 'FAIL · Poles and eigenvalues do not match.'}`;
            $('stateSpaceMatch').className = 'small-note ss-comparison-result ' + (match ? 'pass' : 'fail');
            renderPhase(snapshot);
            renderReference();
            panel.hidden = false;
        }
        function renderReference() {
            const check = referenceCheck();
            const reference = { m: 1, b: 2, k: 4, force: 1 };
            const referenceError = poleError(check.actual, rootPoles(reference));
            $('stateSpaceCheckValue').textContent = check.actual.map(complex).join('; ') + ' s⁻¹';
            $('stateSpaceCheckResult').textContent = check.pass && referenceError <= 1e-9 ? 'PASS' : 'FAIL';
            $('stateSpaceCheckResult').className = check.pass && referenceError <= 1e-9 ? 'pass' : 'fail';
            const pass = check.pass && referenceError <= 1e-9;
            const originalChecks = globalThis.Dynamics3.validations();
            const passed = originalChecks.filter(row => row.pass).length + (pass ? 1 : 0);
            $('validationSummary').textContent = `${passed} of ${originalChecks.length + 1} reference checks passed. Check 4 uses b = 2 N·s/m; check 5 uses b = 4 N·s/m. Check 6 uses m = 1, b = 2, k = 4 and independently calculated eigenvalues.`;
        }
        function rootPoles(parameters) {
            // Only the comparison uses the simulator; eigenvalues above never do.
            return globalThis.Dynamics3.derive(parameters).poles;
        }
        $('rerunValidation').addEventListener('click', renderReference);
        const unsubscribe = shared.subscribe(render);
        const observer = new ResizeObserver(() => { if (latestSnapshot) renderPhase(latestSnapshot); });
        observer.observe($('phasePlanePlot'));
        return () => { unsubscribe(); observer.disconnect(); $('rerunValidation').removeEventListener('click', renderReference); };
    }
    return { matrices, eigenvalues, poleError, referenceCheck, mount };
});

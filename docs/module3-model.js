(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.Dynamics3 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const bounds = { m: [0.1, 10], b: [0, 30], k: [0.5, 100], force: [0.1, 10] };
    function validate(p) {
        for (const [key, [min, max]] of Object.entries(bounds)) {
            if (!Number.isFinite(p[key]) || p[key] < min || p[key] > max) {
                throw new RangeError(`${key} must be from ${min} to ${max}.`);
            }
        }
        return { m: p.m, b: p.b, k: p.k, force: p.force };
    }
    function derive(p) {
        validate(p);
        const omegaN = Math.sqrt(p.k / p.m);
        const zeta = p.b / (2 * Math.sqrt(p.m * p.k));
        let regime, poles;
        if (Math.abs(zeta - 1) <= 1e-10) {
            regime = 'Critically damped';
            poles = [{ re: -omegaN, im: 0 }, { re: -omegaN, im: 0 }];
        } else if (zeta < 1) {
            regime = zeta === 0 ? 'Undamped' : 'Underdamped';
            const im = omegaN * Math.sqrt(1 - zeta * zeta);
            poles = [{ re: -zeta * omegaN, im }, { re: -zeta * omegaN, im: -im }];
        } else {
            regime = 'Overdamped';
            const sum = zeta + Math.sqrt(zeta * zeta - 1);
            // Reciprocal form avoids cancellation for a heavily damped slow pole.
            poles = [{ re: -omegaN / sum, im: 0 }, { re: -omegaN * sum, im: 0 }];
        }
        return { omegaN, zeta, regime, poles, staticGain: 1 / p.k, finalValue: p.force / p.k };
    }
    function exactAt(t, p, d = derive(p)) {
        if (!Number.isFinite(t) || t < 0) throw new RangeError('Time must be finite and nonnegative.');
        const { omegaN: w, zeta: z, finalValue: f } = d;
        let x, v;
        if (d.regime === 'Critically damped') {
            const e = Math.exp(-w * t);
            x = f * (1 - e * (1 + w * t));
            v = f * w * w * t * e;
        } else if (z < 1) {
            const r = Math.sqrt(1 - z * z), wd = w * r, e = Math.exp(-z * w * t);
            x = f * (1 - e * (Math.cos(wd * t) + z / r * Math.sin(wd * t)));
            v = f * w / r * e * Math.sin(wd * t);
        } else {
            const a = d.poles[0].re, b = d.poles[1].re;
            const ea = Math.exp(a * t), eb = Math.exp(b * t);
            x = f * (1 + (b * ea - a * eb) / (a - b));
            v = f * a * b * (ea - eb) / (a - b);
        }
        return { x, v };
    }
    function autoWindow(d) {
        const decay = Math.min(...d.poles.map(p => -p.re));
        const requested = decay > 0 ? Math.max(6 / d.omegaN, 8 / decay) : 6 * 2 * Math.PI / d.omegaN;
        return { end: Math.min(300, requested), limited: requested > 300 };
    }
    // Solve a bracketed crossing. The predicate is true on the left of the crossing.
    function crossing(lo, hi, predicate) {
        for (let i = 0; i < 65; i++) {
            const mid = (lo + hi) / 2;
            if (predicate(mid)) lo = mid; else hi = mid;
        }
        return (lo + hi) / 2;
    }
    function metrics(p, end, d = derive(p)) {
        const normalized = t => exactAt(t, p, d).x / d.finalValue;
        const oscillates = d.zeta < 1;
        const theoreticalPeakTime = oscillates ? Math.PI / (d.omegaN * Math.sqrt(1 - d.zeta ** 2)) : null;
        const firstBracket = theoreticalPeakTime || end;
        const firstCrossing = level => normalized(firstBracket) >= level
            ? crossing(0, firstBracket, t => normalized(t) < level) : null;
        const inWindow = t => t !== null && t <= end ? t : null;
        const t10 = inWindow(firstCrossing(0.1)), t90 = inWindow(firstCrossing(0.9));
        const peakTime = inWindow(theoreticalPeakTime);
        const overshootPercent = oscillates
            ? (peakTime === null ? null : Math.max(0, (normalized(peakTime) - 1) * 100)) : 0;
        let settlingTime = null;
        if (d.zeta > 0 && oscillates) {
            const r = Math.sqrt(1 - d.zeta ** 2);
            // Extrema are n*pi/wd. Find the last extremum outside the 2% band,
            // then solve its final band entry. This avoids a false 'settled' result
            // when a short plot ends between two oscillations.
            const last = Math.max(0, Math.ceil(Math.log(50) * r / (Math.PI * d.zeta)) - 1);
            const lo = last * theoreticalPeakTime, hi = (last + 1) * theoreticalPeakTime;
            const finalEntry = crossing(lo, hi, t => Math.abs(normalized(t) - 1) > 0.02);
            settlingTime = inWindow(finalEntry);
        } else if (d.zeta >= 1 && normalized(end) >= 0.98) {
            settlingTime = crossing(0, end, t => normalized(t) < 0.98);
        }
        return {
            t10, t90, riseTime: t10 === null || t90 === null ? null : t90 - t10,
            peakTime, peakExists: oscillates, overshootPercent, settlingTime
        };
    }
    function response(p, end, d = derive(p), measures = metrics(p, end, d)) {
        const periods = end * d.omegaN * Math.sqrt(Math.max(0, 1 - d.zeta ** 2)) / (2 * Math.PI);
        const desired = Math.max(1400, Math.ceil(periods * 60));
        const count = Math.min(12000, desired);
        const times = Array.from({ length: count + 1 }, (_, i) => end * i / count);
        // Add exact measurement locations to the rendered curve.
        for (const key of ['t10', 't90', 'peakTime', 'settlingTime']) {
            if (measures[key] !== null) times.push(measures[key]);
        }
        const time = [...new Set(times)].sort((a, b) => a - b);
        const values = time.map(t => exactAt(t, p, d));
        return {
            time, displacement: values.map(v => v.x), velocity: values.map(v => v.v),
            resolutionLimited: desired > count
        };
    }
    function derivative(x, v, p) { return [v, (p.force - p.b * v - p.k * x) / p.m]; }
    function integrate(p, end, h, method = 'rk4') {
        validate(p);
        if (!Number.isFinite(end) || end <= 0 || !Number.isFinite(h) || h < 0.0001 || h > 1) {
            throw new RangeError('Use a positive duration and a step size from 0.0001 to 1 s.');
        }
        if (!['euler', 'rk4'].includes(method)) throw new RangeError('Unknown solver.');
        const steps = Math.ceil(end / h), d = derive(p);
        if (steps > 100000) return { ok: false, reason: 'More than 100,000 steps. Increase h or choose a shorter time window.' };
        const time = [0], displacement = [0], velocity = [0];
        const stride = Math.max(1, Math.ceil(steps / 6000));
        let x = 0, v = 0, maxError = 0, squareError = 0;
        for (let i = 0; i < steps; i++) {
            const t = i * h, dt = Math.min(h, end - t);
            const a = derivative(x, v, p);
            if (method === 'euler') {
                // Both components use the old state (explicit Euler).
                x += dt * a[0]; v += dt * a[1];
            } else {
                const b = derivative(x + dt * a[0] / 2, v + dt * a[1] / 2, p);
                const c = derivative(x + dt * b[0] / 2, v + dt * b[1] / 2, p);
                const e = derivative(x + dt * c[0], v + dt * c[1], p);
                x += dt / 6 * (a[0] + 2 * b[0] + 2 * c[0] + e[0]);
                v += dt / 6 * (a[1] + 2 * b[1] + 2 * c[1] + e[1]);
            }
            if (!Number.isFinite(x) || !Number.isFinite(v) || Math.abs(x) > 10000 * d.finalValue) {
                return { ok: false, reason: 'The numerical solution diverged. Reduce h; the physical model has not changed.' };
            }
            const next = Math.min(end, (i + 1) * h), error = Math.abs(x - exactAt(next, p, d).x);
            maxError = Math.max(maxError, error); squareError += error * error;
            if ((i + 1) % stride === 0 || i === steps - 1) {
                time.push(next); displacement.push(x); velocity.push(v);
            }
        }
        return {
            ok: true, time, displacement, velocity, steps, maxError,
            rmse: Math.sqrt(squareError / steps), method, h
        };
    }
    function stability(p, h, method) {
        const { poles } = derive(p);
        return poles.every(({ re, im }) => {
            const z = { re: h * re, im: h * im };
            let result = { re: 1, im: 0 }, term = { re: 1, im: 0 };
            for (let n = 1; n <= (method === 'euler' ? 1 : 4); n++) {
                term = {
                    re: (term.re * z.re - term.im * z.im) / n,
                    im: (term.re * z.im + term.im * z.re) / n
                };
                result.re += term.re; result.im += term.im;
            }
            return Math.hypot(result.re, result.im) <= 1 + 1e-12;
        });
    }
    function validations() {
        const p = { m: 1, b: 2, k: 4, force: 1 };
        const under = metrics(p, 10), critical = metrics({ ...p, b: 4 }, 10);
        return [
            {
                check: '4 · ζ = 0.5: peak overshoot', expected: '16.3% ± 0.1 percentage point',
                value: under.overshootPercent, unit: '%', pass: Math.abs(under.overshootPercent - 16.3) <= 0.1
            },
            {
                check: '5 · ζ = 1: no overshoot', expected: '0% (tolerance 0.001 percentage point)',
                value: critical.overshootPercent, unit: '%', pass: Math.abs(critical.overshootPercent) <= 0.001
            }
        ];
    }
    return { bounds, validate, derive, exactAt, autoWindow, metrics, response, integrate, stability, validations };
});

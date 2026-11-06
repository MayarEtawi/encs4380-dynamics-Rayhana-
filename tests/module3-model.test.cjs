'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const D = require('../docs/module3-model.js');
const p = { m: 1, b: 2, k: 4, force: 1 };
const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, `${a} should equal ${b} within ${tolerance}`);

test('reference poles, overshoot, and visible validation checks', () => {
    const d = D.derive(p), m = D.metrics(p, 10);
    near(d.zeta, .5); near(d.omegaN, 2); near(d.finalValue, .25);
    near(d.poles[0].re, -1); near(d.poles[0].im, Math.sqrt(3));
    near(m.peakTime, Math.PI / Math.sqrt(3));
    near(m.overshootPercent, 100 * Math.exp(-Math.PI / Math.sqrt(3)));
    assert.ok(D.validations().every(check => check.pass));
});

test('zero initial state and correct initial acceleration in all regimes', () => {
    for (const b of [0, 2, 4, 6, 30]) {
        const q = { ...p, b }, initial = D.exactAt(0, q);
        near(initial.x, 0); near(initial.v, 0);
        near(D.exactAt(1e-6, q).v / 1e-6, q.force / q.m, 2e-5);
    }
});

test('critical and overdamped exact responses are monotone, without overshoot', () => {
    for (const b of [4, 6, 30]) {
        let previous = 0;
        for (let i = 0; i <= 1000; i++) {
            const value = D.exactAt(i / 20, { ...p, b }).x;
            assert.ok(value >= previous - 1e-12 && value <= .25 + 1e-12);
            previous = value;
        }
    }
});

test('critical expression agrees continuously with nearby real and complex roots', () => {
    for (const t of [.01, .5, 2, 8]) {
        const critical = D.exactAt(t, { ...p, b: 4 });
        for (const b of [4 - 1e-7, 4 + 1e-7]) {
            const adjacent = D.exactAt(t, { ...p, b });
            near(adjacent.x, critical.x, 1e-8); near(adjacent.v, critical.v, 1e-8);
        }
    }
});

test('exact displacement and velocity satisfy the physical ODE', () => {
    for (const b of [0, .1, 2, 4, 6, 30]) for (const t of [.2, 1, 3]) {
        const q = { ...p, b }, delta = 1e-5;
        const left = D.exactAt(t-delta, q), at = D.exactAt(t, q), right = D.exactAt(t+delta, q);
        near((right.x-left.x)/(2*delta), at.v, 1e-7);
        near(q.m*(right.v-left.v)/(2*delta)+b*at.v+q.k*at.x, q.force, 1e-7);
    }
});

test('first rise crossings and final settling entry match the curve', () => {
    for (const b of [.1, 2, 4, 6, 30]) {
        const q = { ...p, b }, d = D.derive(q), end = D.autoWindow(d).end, m = D.metrics(q, end);
        near(D.exactAt(m.t10,q).x/d.finalValue,.1);
        near(D.exactAt(m.t90,q).x/d.finalValue,.9);
        assert.ok(m.riseTime > 0);
        assert.notEqual(m.settlingTime,null);
        near(Math.abs(D.exactAt(m.settlingTime,q).x/d.finalValue-1),.02,1e-8);
        for(let i=0;i<=2000;i++) {
            const t=m.settlingTime+(end-m.settlingTime)*i/2000;
            assert.ok(Math.abs(D.exactAt(t,q).x/d.finalValue-1)<=.02000001);
        }
    }
});

test('short windows do not falsely report future peaks or temporary settling', () => {
    const short = D.metrics(p, .5);
    assert.equal(short.peakTime,null);assert.equal(short.overshootPercent,null);
    assert.equal(short.riseTime,null);assert.equal(short.settlingTime,null);
    const weak={...p,b:.01};
    assert.equal(D.metrics(weak,1).settlingTime,null);
    assert.equal(D.metrics({...p,b:0},60).settlingTime,null);
});

test('force scaling preserves relative measurements and scales physical displacement', () => {
    const doubled={...p,force:2}, a=D.metrics(p,10), b=D.metrics(doubled,10);
    near(a.riseTime,b.riseTime);near(a.overshootPercent,b.overshootPercent);near(a.settlingTime,b.settlingTime);
    for(const t of [.1,1,3])near(D.exactAt(t,doubled).x,2*D.exactAt(t,p).x);
});

test('doubling natural frequency at constant zeta halves response times', () => {
    const a=D.metrics(p,10), b=D.metrics({...p,m:.25,b:1},10);
    near(b.riseTime,a.riseTime/2);near(b.peakTime,a.peakTime/2);near(b.settlingTime,a.settlingTime/2);
    near(a.overshootPercent,b.overshootPercent);
});

test('numerical solvers converge and finish at a nonmultiple endpoint', () => {
    const e=D.integrate(p,7.013,.04,'euler'), ef=D.integrate(p,7.013,.02,'euler');
    const r=D.integrate(p,7.013,.04,'rk4'), rf=D.integrate(p,7.013,.02,'rk4');
    assert.ok(e.ok&&ef.ok&&r.ok&&rf.ok);
    assert.ok(ef.maxError<e.maxError*.6);
    assert.ok(rf.maxError<r.maxError/10);
    assert.ok(r.maxError<1e-6);
    for(const solution of [e,ef,r,rf])near(solution.time.at(-1),7.013,1e-12);
});

test('solver independently matches critical and overdamped closed forms', () => {
    for(const b of [0,4,6,30]) {
        const q={...p,b}, numeric=D.integrate(q,5,.001,'rk4');
        assert.ok(numeric.ok);assert.ok(numeric.maxError<1e-8);
    }
});

test('stability and computation guards explain problematic settings', () => {
    assert.equal(D.stability(p,.02,'euler'),true);
    assert.equal(D.stability({...p,b:0},.02,'euler'),false);
    assert.equal(D.stability({...p,b:0},.02,'rk4'),true);
    assert.equal(D.stability({...p,b:30},1,'rk4'),false);
    assert.equal(D.integrate(p,300,.0001).ok,false);
    assert.equal(D.integrate({...p,b:30},10,1,'euler').ok,false);
    assert.throws(()=>D.derive({...p,m:0}),RangeError);
    assert.throws(()=>D.derive({...p,k:NaN}),RangeError);
    assert.throws(()=>D.integrate(p,1,0),RangeError);
});

test('shared trajectory includes exact measurement points and aligned velocity samples', () => {
    const d=D.derive(p), m=D.metrics(p,8), curve=D.response(p,8,d,m);
    assert.equal(curve.time.length,curve.displacement.length);
    assert.equal(curve.time.length,curve.velocity.length);
    assert.ok(curve.time.includes(m.peakTime));
    assert.ok(curve.time.includes(m.settlingTime));
    near(curve.time[0],0);near(curve.time.at(-1),8);
    for(let i=1;i<curve.time.length;i++)assert.ok(curve.time[i]>curve.time[i-1]);
});

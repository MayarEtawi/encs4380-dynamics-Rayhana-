# Module 3 — Model and implementation guide

Owner: Maryam. State-space extension owner: Yasmin.

## Files

| File | Purpose |
| --- | --- |
| `module3.html` | Page structure, controls, explanations, and Yasmin's panel location |
| `module3.css` | Page-specific styles extending the shared green theme |
| `module3-model.js` | Mathematical functions reusable in the browser or Node |
| `module3.js` | Events, plots, experiments, validation, and extension interface |
| `integration-yasmin.md` | Agreed parameters, IDs, data shape, and integration examples |
| `../tests/module3-model.test.cjs` | Mathematical regression tests |

## Model and units

The equation is `m*x'' + b*x' + k*x = F(t)`. Displacement is metres; velocity is metres per second. `m` is kg, `b` is N·s/m, `k` is N/m, and force is N. Initial displacement and velocity are zero. The input steps to `force` at time zero and remains constant.

`omegaN = sqrt(k/m)`, `zeta = b/(2*sqrt(m*k))`, `staticGain = 1/k`, and equilibrium displacement `f = force/k`. The UI shows physical displacement, not a normalized output. At zero damping, `f` is the equilibrium reference, but not the limit of the response.

## Exact step response

- Underdamped, including zero damping: let `r = sqrt(1-zeta²)`, `wd = omegaN*r`, and `e = exp(-zeta*omegaN*t)`. Then `x = f*(1-e*(cos(wd*t)+zeta/r*sin(wd*t)))`, and `v = f*omegaN/r*e*sin(wd*t)`.
- Critical: `x = f*(1-(1+omegaN*t)*exp(-omegaN*t))`; `v = f*omegaN²*t*exp(-omegaN*t)`.
- Overdamped: with real poles `a,b`, `x = f*(1+(b*exp(a*t)-a*exp(b*t))/(a-b))`, and `v = f*a*b*(exp(a*t)-exp(b*t))/(a-b)`.

The slow overdamped pole uses `-omegaN/(zeta+sqrt(zeta²-1))` to reduce cancellation. Damping ratios within `1e-10` of one use the critical expression to avoid the singular repeated-root formula.

## Live measurements

- Rise time: first 90% crossing minus first 10% crossing of equilibrium, using bisection on the exact response.
- First peak: `pi/wd` for an oscillatory system. There is no finite overshoot peak for critical or overdamped responses.
- Overshoot: exact displacement at the first peak relative to `f`, in percent. A peak beyond the plot window is reported as outside it.
- Settling time: final entry into the ±2% band. Underdamped extrema occur at `n*pi/wd`; error magnitudes are `exp(-n*pi*zeta/r)`. Find the last extremum outside the band, then bisect its subsequent final band crossing. Critical and overdamped responses are monotone, so solve the 98% crossing. Undamped motion never settles.

Automatic duration uses eight slow-mode decay time constants, capped at 300 seconds; it uses six periods for undamped motion. Fixed windows can truncate a response. Unavailable measurements are reported explicitly.

Plots use at least 1,400 intervals, increasing with oscillation count up to 12,000. Exact measurement locations are inserted. Dense plots are flagged. Shared displacement and velocity use identical time samples.

## Numerical bonus

The solvers integrate `q = [x,v]` with derivative `[v,(force-b*v-k*x)/m]`.

Euler updates both components from their old values. RK4 evaluates four slopes and combines them with weights 1,2,2,1 divided by six. The final integration step is shortened to reach the exact selected duration.

Maximum absolute displacement error and RMS error compare with the exact formula at **every integration step**. Displayed samples are limited to about 6,000 intervals independently of error calculation. More than 100,000 steps are rejected with an actionable message. Large divergence withholds the numerical overlay while preserving the exact plot.

Stability feedback evaluates `1+z` for Euler, or `1+z+z²/2+z³/6+z⁴/24` for RK4, at both `z = h*pole`. A magnitude above one flags the step size. Purely imaginary physical poles are marginally stable; explicit Euler produces growing numerical oscillations for any positive step.

## Demonstration cases

| Case | m | b | k | Force | Expected behavior |
| --- | --- | --- | --- | --- | --- |
| Default | 1 | 2 | 4 | 1 | ζ=0.5, ωn=2; 16.303% overshoot; equilibrium 0.25 m |
| Critical | 1 | 4 | 4 | 1 | ζ=1; no overshoot; repeated pole −2 |
| Overdamped | 1 | 6 | 4 | 1 | ζ=1.5; real negative poles; no overshoot |
| Undamped | 1 | 0 | 4 | 1 | Persistent oscillation; poles ±j2 |

Default measured values: 10% crossing 0.244115 s, 90% crossing 1.062901 s, rise time 0.818786 s, peak time 1.813799 s, peak displacement 0.290758 m, and 2% settling time 4.038174 s. Poles are −1±j√3.

## Prediction experiments

Each experiment compares a documented default baseline with a controlled final model. Damping changes `b` from 2 to 4; frequency doubling changes `m,b` to 0.25,1 while preserving `k,force`; force doubling changes `force` to 2. The button applies the final model and explains it. It preserves the visitor's prior model and time window for restoration. A prediction is required first.

## Validation and integration

Check 4 compares default overshoot with 16.3% using a 0.1 percentage-point tolerance. Check 5 checks critical overshoot against zero. Automated tests also independently sample the critical curve to verify it is monotone and below equilibrium.

Use `Module3.subscribe(callback)` for the initial data and subsequent independent snapshots. See `integration-yasmin.md` for the complete contract. Checks 1–3 belong to Modules 1 and 2; check 6 belongs to Yasmin's panel.

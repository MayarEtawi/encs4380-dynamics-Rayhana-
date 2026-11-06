# Module 3 integration — Yasmin and Maryam

Maryam owns the second-order response simulator, live measurements, poles, validation checks 4 and 5, and the Euler/RK4 comparison. Yasmin owns the state-space panel: matrices A and B, eigenvalues, phase-plane plot, and validation check 6.

## Where Yasmin should work

1. In `module3.html`, find the `YASMIN` comment and `<section id="stateSpacePanel">`, immediately after the poles section.
2. Add the panel content there, and remove `hidden` when it is working. Reuse `m3-section`, `m3-panel`, `panel-title`, and the existing green theme.
3. Create `module3-state-space.js` for the panel's behavior. Load it **after** `module3.js` with a deferred script tag. Add an optional, separate CSS file for panel-specific styling.
4. Leave `module3-model.js` and the shared controls in place. Subscribe to the shared data instead of adding new controls or a second simulation.

Suggested panel IDs: `matrixA`, `matrixB`, `eigenvalues`, `phasePlanePlot`, and `stateSpaceValidation`. IDs must be unique in the page.

## Agreed physical model

`m*x'' + b*x' + k*x = F(t)`, with `x(0) = 0` and `v(0) = 0`.

Input: positive force step `F(t) = force` for `t >= 0`.
Output: physical displacement in metres, **not normalized**. Equilibrium is `force/k`; velocity at equilibrium is zero.

| Parameter | Shared slider | Number field | Units | Bounds |
| --- | --- | --- | --- | --- |
| Mass | `mSlider` | `mNumber` | kg | 0.1–10 |
| Damping | `bSlider` | `bNumber` | N·s/m | 0–30 |
| Spring stiffness | `kSlider` | `kNumber` | N/m | 0.5–100 |
| Force step | `forceSlider` | `forceNumber` | N | 0.1–10 |

Default parameters: `{m: 1, b: 2, k: 4, force: 1}`. Then ζ = 0.5, ωn = 2 rad/s, and equilibrium displacement = 0.25 m.

Capital `K = 1/k` is the force-to-displacement static gain; it is not the spring stiffness `k`.

## Read the shared data

```js
// module3-state-space.js, loaded after module3.js
'use strict';

function renderStateSpace(data) {
    const { m, b, k, force } = data.parameters;
    const A = [[0, 1], [-k / m, -b / m]];
    const B = [[0], [1 / m]];
    const C = [[1, 0]];
    const D = 0;

    // Populate your matrix displays with A and B.
    // Independently calculate eigenvalues of A, then compare them with:
    const referencePoles = data.derived.poles; // [{re, im}, {re, im}]

    // Reuse the same trajectory for the phase plane:
    const x1 = data.response.displacement; // horizontal axis, m
    const x2 = data.response.velocity;     // vertical axis, m/s
    const time = data.response.time;       // seconds, same indices

    // Draw x2 against x1; do not plot time on a phase-plane axis.
    // Use force/k, 0 as the equilibrium point.
    // Reveal the panel only after its content is implemented.
}

const unsubscribe = window.Module3.subscribe(renderStateSpace);
// subscribe calls renderStateSpace immediately, then on every simulator update.
// Call unsubscribe() only if the panel is removed.
```

`Module3.getSnapshot()` returns an independent copy of the current data. `Module3.setParameters({b: 4})` changes validated shared parameters and schedules one update on the next animation frame. Get a fresh snapshot in a subscription after an update; a synchronous read immediately after `setParameters` still contains the previous frame.

An equivalent notification is available as:

```js
window.addEventListener('module3:update', event => renderStateSpace(event.detail));
```

Use **one** subscription mechanism, not both. With the event mechanism, also call `renderStateSpace(Module3.getSnapshot())` once for initial rendering. Subscriber errors are logged without disabling the main simulator. Snapshots are copied, so changing them will not change the model.

## Snapshot fields

```text
parameters: { m, b, k, force }
derived: { omegaN, zeta, regime, poles, staticGain, finalValue }
response: { time[], displacement[], velocity[], resolutionLimited }
metrics: { t10, t90, riseTime, peakTime, peakExists,
           overshootPercent, settlingTime }
window: { end, limited }
```

Times are seconds. A metric is `null` if unavailable within the selected time window; `peakExists` distinguishes a peak outside the window from no overshoot peak. Undamped response has no settling time.

The reusable mathematical API is `window.Dynamics3`. `exactAt(t, parameters)` returns `{x, v}`; `derive(parameters)` returns the derived parameters and poles. Reuse it in Module 4 if needed.

## Validation check 6

For `m = 1`, `b = 2`, `k = 4`:

```text
A = [[0, 1], [-4, -2]]
B = [[0], [1]]
Eigenvalues: -1 + j*sqrt(3), -1 - j*sqrt(3)
Expected displayed values: -1 ± j1.732 s^-1
```

Calculate eigenvalues from A's trace and determinant, rather than copying the pole labels. For a 2×2 matrix, solve `lambda² - trace(A)*lambda + det(A) = 0`. Show expected value, calculated value, and PASS/FAIL. A tolerance of 0.001 per real and imaginary component supports the rounded reference value. Compare both complex values without relying on ordering.

## Joint checks before merging

- Default model: matching poles and eigenvalues; phase trajectory approaches `(0.25, 0)`.
- Critical preset: repeated eigenvalue −2; no spiral.
- Overdamped preset: two real negative eigenvalues; no spiral.
- No damping preset: oscillation persists; the phase trajectory does not converge.
- Force change: A and B stay fixed, but the trajectory and equilibrium change.
- Slider, number-field, preset, prediction, and time-window changes all refresh the panel.
- Changing the time window may show only part of a trajectory. Both displays use the same samples.
- Check the panel at phone width and with keyboard controls.

## Collaboration

Branch for Maryam's work: `maryam/module3-second-order`. Merge it before Yasmin's panel branch, or base the panel branch on it. Keep the state-space files and panel additions in Yasmin's commits. Module 4 and the final group release remain their owners' responsibilities.

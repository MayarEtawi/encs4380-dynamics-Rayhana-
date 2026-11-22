/* Rayhana P3: sampled controller, RK4 plant, metrics and Arduino generator.
 * The controller runs only at k*Ts. RK4 substeps never update the PID state.
 * No browser dependencies, so the same core can also run in Node.
 */
(function (root) {
  'use strict';
  const DEFAULTS = Object.freeze({
    plant: 'first', gain: 1, tau: 1, mass: 1,
    damping: 2, stiffness: 1, kp: 2, ki: 1, kd: 0.1, ts: 0.02,
    setpoint: 1, min: 0, max: 3, duration: 16, antiWindup: true,
    recovery: false, recoveryAt: 6, recoveryTarget: 0.5
  });
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  function settings(values = {}) {
    const p = { ...DEFAULTS, ...values };
    const ranges = {
      gain: [0.001, 100], tau: [0.02, 20], mass: [0.1, 20],
      damping: [0, 50], stiffness: [0.1, 50], kp: [0, 100], ki: [0, 100],
      kd: [0, 100], ts: [0.005, 2], setpoint: [0.001, 1000],
      min: [-1000, 1000], max: [-1000, 1000], duration: [2, 120],
      recoveryAt: [0.005, 120], recoveryTarget: [0.001, 1000]
    };
    for (const [key, [lo, hi]] of Object.entries(ranges)) {
      if (!Number.isFinite(p[key]) || p[key] < lo || p[key] > hi)
        throw Error(`${key} must be a number between ${lo} and ${hi}.`);
    }
    if (!['first', 'second', 'third'].includes(p.plant)) throw Error('Choose a supported plant.');
    if (typeof p.antiWindup !== 'boolean' || typeof p.recovery !== 'boolean') throw Error('Invalid switch setting.');
    if (p.max <= p.min) throw Error('Upper actuator limit must be greater than the lower limit.');
    if (p.recovery && p.recoveryAt >= p.duration - p.ts)
      throw Error('The recovery step must leave at least one sampling interval before the end.');
    // An Arduino micros() interval is an integer number of microseconds.
    p.ts = Math.round(p.ts * 1e6) / 1e6;
    return p;
  }
  function experiment(values, action) {
    const before = settings(values), after = { ...before };
    let key, label;
    if (action === 'sampling' || action === 'sampling-down') {
      key = 'ts'; label = 'Ts';
      after.ts = action === 'sampling' ? Math.min(2, before.ts * 5) : Math.max(0.005, before.ts / 5);
      after.ts = Math.round(after.ts * 1e6) / 1e6;
    } else if (action === 'windup') {
      key = 'antiWindup'; label = 'Anti-windup'; after.antiWindup = !before.antiWindup;
    } else {
      const match = /^(kp|ki|kd)-(up|down)$/.exec(action);
      if (!match) throw Error('Choose a supported prediction experiment.');
      key = match[1]; label = { kp: 'Kp', ki: 'Ki', kd: 'Kd' }[key];
      const start = { kp: 0.5, ki: 0.25, kd: 0.05 }[key];
      after[key] = match[2] === 'up' ? Math.min(100, before[key] === 0 ? start : before[key] * 2)
        : before[key] <= 1e-6 ? 0 : before[key] / 2;
    }
    if (after[key] === before[key]) throw Error(`${label} is already at its limit for this experiment. Choose another experiment.`);
    const checked = settings(after);
    const display = v => typeof v === 'boolean' ? (v ? 'on' : 'off') : Number(v.toPrecision(7)) + (key === 'ts' ? ' s' : '');
    return { before, after: checked, key, label: `${label}: ${display(before[key])} → ${display(checked[key])}` };
  }
  function controllerStep(p, state, error) {
    // I stores the integral CONTRIBUTION, including Ki (units of u).
    const increment = p.ki * p.ts * error;
    const candidate = state.integral + increment;
    const proportional = p.kp * error;
    const derivative = p.kd * (error - state.previousError) / p.ts;
    const trial = proportional + candidate + derivative;
    const blocked = p.antiWindup && ((trial > p.max && increment > 0) ||
      (trial < p.min && increment < 0));
    const integral = blocked ? state.integral : candidate;
    const raw = proportional + integral + derivative;
    return {
      integral, previousError: error, proportional, derivative, raw,
      u: clamp(raw, p.min, p.max), blocked, saturated: raw > p.max || raw < p.min
    };
  }
  function rhs(p, x, u) {
    if (p.plant === 'first') return [(p.gain * u - x[0]) / p.tau];
    if (p.plant === 'second') return [x[1], (u - p.damping * x[1] - p.stiffness * x[0]) / p.mass];
    // Ziegler–Nichols teaching plant, shared with P1: 1/(s+1)^3.
    return [u - x[0], x[0] - x[1], x[1] - x[2]];
  }
  function rk4(p, x, u, h) {
    const add = (a, d, scale) => a.map((v, j) => v + scale * d[j]);
    const a = rhs(p, x, u), b = rhs(p, add(x, a, h / 2), u);
    const c = rhs(p, add(x, b, h / 2), u), d = rhs(p, add(x, c, h), u);
    return x.map((v, j) => v + h * (a[j] + 2 * b[j] + 2 * c[j] + d[j]) / 6);
  }
  function simulate(values = {}, options = {}) {
    const p = settings(values);
    // Resolve the plant dynamics independently of controller sampling time.
    const characteristic = p.plant === 'first' ? p.tau : p.plant === 'second'
      ? Math.min(Math.sqrt(p.mass / p.stiffness), p.mass / Math.max(0.01, p.damping)) : 1;
    const maxStep = Math.min(0.005, characteristic / 40, options.maxStep ?? 0.005);
    if (!(maxStep > 0 && Number.isFinite(maxStep)) || p.duration / maxStep > 300000)
      throw Error('Simulation resolution is too expensive. Use a shorter duration.');
    const recoveryTime = Math.ceil((p.recoveryAt - 1e-10) / p.ts) * p.ts;
    let x = p.plant === 'first' ? [0] : p.plant === 'second' ? [0, 0] : [0, 0, 0];
    let state = { integral: 0, previousError: 0 }, unstable = false, saturatedTime = 0, maxIntegral = 0;
    const t = [], y = [], u = [], r = [], samples = [];
    const output = () => x[p.plant === 'third' ? 2 : 0];
    const append = (time, target, command) => { t.push(time); y.push(output()); u.push(command); r.push(target); };
    const ticks = Math.ceil(p.duration / p.ts);
    for (let tick = 0; tick < ticks; tick++) {
      const time = tick * p.ts;
      const target = p.recovery && time >= recoveryTime - 1e-9 ? p.recoveryTarget : p.setpoint;
      state = controllerStep(p, state, target - output());
      samples.push({ t: time, y: output(), r: target, ...state });
      maxIntegral = Math.max(maxIntegral, Math.abs(state.integral));
      append(time, target, state.u);
      const end = Math.min((tick + 1) * p.ts, p.duration);
      const n = Math.max(1, Math.ceil((end - time) / maxStep)), h = (end - time) / n;
      for (let j = 1; j <= n; j++) {
        x = rk4(p, x, state.u, h);
        if (x.some(v => !Number.isFinite(v) || Math.abs(v) > 1e6) || Math.abs(state.integral) > 1e9) {
          unstable = true; break;
        }
        // Omit each interval's final point: the next tick owns its new command.
        if (j < n || tick === ticks - 1) append(time + j * h, target, state.u);
      }
      if (unstable) break;
      if (state.saturated) saturatedTime += end - time;
    }
    return {
      t, y, u, r, samples, unstable, saturatedTime, maxIntegral, p,
      recoveryTime: p.recovery ? recoveryTime : null
    };
  }
  function metrics(series) {
    const { t, y, p } = series;
    const start = series.recoveryTime ?? 0;
    const target = p.recovery ? p.recoveryTarget : p.setpoint;
    const i0 = Math.max(0, t.findIndex(time => time >= start - 1e-9));
    let peak = -Infinity, trough = Infinity, outside = -1;
    for (let i = i0; i < y.length; i++) {
      peak = Math.max(peak, y[i]);
      trough = Math.min(trough, y[i]);
      if (Math.abs(y[i] - target) > 0.02 * target + 1e-9) outside = i;
    }
    // Overshoot is measured past the target in the direction of the step.
    // The first step starts from rest, so it is relative to the target.
    // A recovery step may go down; it is relative to its own step size.
    let overshoot = Math.max(0, (peak - target) / target * 100);
    if (p.recovery) {
      const step = target - y[i0];
      if (Math.abs(step) > 1e-9 * target)
        overshoot = Math.max(0, (step > 0 ? peak - target : target - trough) / Math.abs(step) * 100);
    }
    const candidate = outside < 0 ? i0 : outside + 1;
    const settling = !series.unstable && candidate < t.length &&
      t.at(-1) - t[candidate] >= 1 ? t[candidate] - start : null;
    const cross = level => {
      for (let i = i0 + 1; i < y.length; i++) {
        if (y[i - 1] < level && y[i] >= level)
          return t[i - 1] + (t[i] - t[i - 1]) * (level - y[i - 1]) / (y[i] - y[i - 1]);
      }
      return null;
    };
    const a = cross(0.1 * target), b = cross(0.9 * target);
    const tail = y.filter((_, i) => t[i] >= Math.max(start, t.at(-1) - 1));
    const mean = tail.reduce((s, v) => s + v, 0) / tail.length;
    const span = tail.reduce((v, n) => Math.max(v, n), -Infinity) - tail.reduce((v, n) => Math.min(v, n), Infinity);
    const steady = !series.unstable && t.at(-1) - start >= 1 && span <= 0.002 * target;
    return {
      overshoot, settling,
      rise: !p.recovery && a !== null && b !== null ? b - a : null,
      error: Math.abs(target - mean) / target * 100, steady,
      saturation: series.saturatedTime / p.duration * 100, maxIntegral: series.maxIntegral
    };
  }
  function znGains(ku, pu) {
    if (![ku, pu].every(v => Number.isFinite(v) && v > 0)) throw Error('Ku and Pu must be positive numbers.');
    return { kp: 0.6 * ku, ki: 1.2 * ku / pu, kd: 0.075 * ku * pu };
  }
  function arduinoCode(values) {
    const p = settings(values), number = x => Number.isInteger(x) ? `${x}.0f` : `${Number(x.toPrecision(10))}f`;
    return `// Rayhana P3 — digital PID; values match the current page settings.
// Model: ${p.plant === 'first' ? `K=${p.gain}, tau=${p.tau} s` : p.plant === 'second' ? `m=${p.mass}, b=${p.damping}, k=${p.stiffness}` : '1/(s+1)^3 (bonus teaching plant)'}.
// Error derivative (including initial setpoint kick), as in the homework.
// Connect readMeasurement() and writeActuator() to your sensor/driver.
#include <Arduino.h>
const float KP = ${number(p.kp)}, KI = ${number(p.ki)}, KD = ${number(p.kd)};
const float TS = ${number(p.ts)};
const uint32_t SAMPLE_US = ${Math.round(p.ts * 1e6)}UL;
const float U_MIN = ${number(p.min)}, U_MAX = ${number(p.max)};
const float TARGET = ${number(p.setpoint)};
const bool ANTI_WINDUP = ${p.antiWindup};
const bool RECOVERY_STEP = ${p.recovery};
const float RECOVERY_SECONDS = ${number(p.recoveryAt)};
const float RECOVERY_TARGET = ${number(p.recoveryTarget)};
float integralTerm = 0.0f, previousError = 0.0f;
uint32_t lastTick, startTime;
bool firstSample = true;

float readMeasurement() {
  // TODO: return calibrated output in the SAME units as TARGET.
  // For a motor: calculate speed from encoder counts and elapsed time.
  return 0.0f; // Interface placeholder, not a real encoder measurement.
}

void writeActuator(float command) {
  // TODO: connect to your driver in the SAME units as U_MIN/U_MAX.
  // For a unidirectional 0..100 percent command on an Uno PWM pin:
  // analogWrite(9, (int)(constrain(command, 0.0f, 100.0f) * 255.0f / 100.0f + 0.5f));
  // Signed commands require a direction-capable motor driver.
  (void)command;
}

float pidUpdate(float error) {
  const float increment = KI * TS * error;
  const float candidate = integralTerm + increment;
  const float proportional = KP * error;
  const float derivative = KD * (error - previousError) / TS;
  const float trial = proportional + candidate + derivative;
  const bool blocked = ANTI_WINDUP &&
    ((trial > U_MAX && increment > 0.0f) || (trial < U_MIN && increment < 0.0f));
  if (!blocked) integralTerm = candidate;
  previousError = error;
  return constrain(proportional + integralTerm + derivative, U_MIN, U_MAX);
}

void setup() {
  // TODO: configure sensor, encoder interrupts, and motor-driver pins.
  startTime = lastTick = micros();
}

void loop() {
  const uint32_t now = micros();
  const uint32_t elapsed = now - lastTick; // Unsigned subtraction handles rollover.
  if (!firstSample && elapsed < SAMPLE_US) return;
  if (firstSample) firstSample = false;
  else if (elapsed >= 2UL * SAMPLE_US) {
    // A missed deadline cannot be recovered by replaying old measurements.
    // Re-synchronise; the simulated response assumes deadlines are met.
    lastTick = now;
  } else lastTick += SAMPLE_US;
  const float seconds = (uint32_t)(now - startTime) * 1.0e-6f;
  const float reference = RECOVERY_STEP && seconds >= RECOVERY_SECONDS ? RECOVERY_TARGET : TARGET;
  const float error = reference - readMeasurement();
  writeActuator(pidUpdate(error)); // Held by the driver until the next sample.
}
`;
  }
  const api = { DEFAULTS, settings, experiment, controllerStep, simulate, metrics, znGains, arduinoCode };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DigitalPID = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

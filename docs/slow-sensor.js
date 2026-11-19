
"use strict";

/*
  ENCS4380 Homework 2 — P2 Slow Sensor

  Independent simulation based on the same mathematical
  plant models as P1.

  State:
  [actual output, velocity, integral, sensor output]

  PID uses measured feedback:
  error = setpoint - sensor output

  Sensor:
  dys/dt = (y - ys) / sensorTau
*/

(() => {

  const get = id => document.getElementById(id);
  const num = id => Number(get(id).value);

  const clamp = (x, a, b) =>
    Math.max(a, Math.min(b, x));

  const finite = (v, digits = 3) =>
    Number.isFinite(v) ? v.toFixed(digits) : "—";

  const ids = [
    "p2Plant", "p2Sensor", "p2Setpoint",
    "p2Kp", "p2Ki", "p2Kd", "p2Limit",
    "p2Duration", "p2Gain", "p2Tau",
    "p2Mass", "p2Damping", "p2Stiffness"
  ];

  // 1. Read user settings
  function params() {

    const p = {
      type: get("p2Plant").value,
      sensorTau: num("p2Sensor"),
      r: num("p2Setpoint"),
      kp: num("p2Kp"),
      ki: num("p2Ki"),
      kd: num("p2Kd"),
      umax: num("p2Limit"),
      duration: num("p2Duration"),
      K: num("p2Gain"),
      tau: num("p2Tau"),
      m: num("p2Mass"),
      b: num("p2Damping"),
      k: num("p2Stiffness")
    };

    if (
      Object.values(p).some(
        v => typeof v === "number" && !Number.isFinite(v)
      ) ||
      p.sensorTau <= 0 ||
      p.r <= 0 ||
      p.duration <= 0 ||
      p.umax <= 0 ||
      p.K <= 0 ||
      p.tau <= 0 ||
      p.m <= 0 ||
      p.k <= 0 ||
      p.b < 0 ||
      p.kp < 0 ||
      p.ki < 0 ||
      p.kd < 0
    ) {
      throw Error("Invalid model or controller values.");
    }

    return p;
  }

  // 2. Closed-loop differential equations
  function derivative(s, p) {

    const [y, v, I, ys] = s;

    // Slow sensor dynamics
    const sensorDot = (y - ys) / p.sensorTau;

    // PID only sees sensor measurement
    const e = p.r - ys;

    // Derivative on sensor measurement
    const raw =
      p.kp * e +
      p.ki * I -
      p.kd * sensorDot;

    // Actuator saturation
    const u = clamp(raw, -p.umax, p.umax);

    // Conditional integration anti-windup
    const blocked =
      (raw >= p.umax && e > 0) ||
      (raw <= -p.umax && e < 0);

    // First-order or second-order plant
    const ydot = p.type === "first"
      ? (p.K * u - y) / p.tau
      : v;

    const vdot = p.type === "first"
      ? 0
      : (u - p.b * v - p.k * y) / p.m;

    return {
      ds: [
        ydot,
        vdot,
        blocked ? 0 : e,
        sensorDot
      ],
      u
    };
  }

  // 3. Fourth-order Runge-Kutta solver
  function rk4(s, h, p) {

    const add = (x, k, q) =>
      x.map((v, i) => v + q * h * k[i]);

    const a = derivative(s, p).ds;
    const b = derivative(add(s, a, 0.5), p).ds;
    const c = derivative(add(s, b, 0.5), p).ds;
    const d = derivative(add(s, c, 1), p).ds;

    return s.map(
      (v, i) =>
        v + h * (a[i] + 2 * b[i] + 2 * c[i] + d[i]) / 6
    );
  }

  // 4. Run full simulation
  function simulate(p) {

    const minScale = Math.min(
      p.sensorTau,
      p.type === "first"
        ? p.tau
        : Math.sqrt(p.m / p.k)
    );

    const requested = Math.min(
      0.005,
      minScale / 35,
      p.duration / 1500
    );

    const n = Math.min(
      160000,
      Math.max(1500, Math.ceil(p.duration / requested))
    );

    const dt = p.duration / n;

    let state = [0, 0, 0, 0];

    const t = [];
    const y = [];
    const ys = [];
    const u = [];

    const stride = Math.max(1, Math.floor(n / 2600));

    for (let i = 0; i <= n; i++) {

      if (i % stride === 0 || i === n) {
        t.push(i * dt);
        y.push(state[0]);
        ys.push(state[3]);
        u.push(derivative(state, p).u);
      }

      if (i < n) {

        state = rk4(state, dt, p);

        if (state.some(
          v => !Number.isFinite(v) || Math.abs(v) > 1e8
        )) {
          throw Error(
            "Simulation diverged. Try lower gains."
          );
        }
      }
    }

    return { t, y, ys, u };
  }

  // 5. Calculate performance metrics
  function metrics(res, p) {

    let lastOutside = -1;

    for (let i = 0; i < res.y.length; i++) {
      if (Math.abs(res.y[i] - p.r) > 0.02 * p.r) {
        lastOutside = i;
      }
    }

    const settle =
      lastOutside < 0
        ? 0
        : lastOutside === res.y.length - 1
          ? NaN
          : res.t[lastOutside + 1];

    const overshoot = Math.max(
      0,
      (Math.max(...res.y) - p.r) / p.r * 100
    );

    const error = p.r - res.y[res.y.length - 1];

    const lag = Math.max(
      ...res.y.map(
        (value, i) => Math.abs(value - res.ys[i])
      )
    );

    return { overshoot, settle, error, lag };
  }

  // 6. Graph layout
  function graphLayout(title, label) {

    return {
      title: {
        text: title,
        font: { size: 15, family: "Georgia, serif", color: "#233247" }
      },
      font: { family: "DM Sans, Arial, sans-serif", color: "#233247" },
      paper_bgcolor: "#fff",
      plot_bgcolor: "#fff",
      margin: { l: 60, r: 20, t: 50, b: 50 },
      xaxis: { title: "Time (s)", gridcolor: "#ece8df" },
      yaxis: { title: label, gridcolor: "#ece8df" },
      legend: { orientation: "h", y: -0.3 }
    };
  }

  let latest = null;

  // 7. Update simulation and plots
  function refresh() {

    try {

      const p = params();

      get("p2FirstFields").hidden = p.type !== "first";
      get("p2SecondFields").hidden = p.type !== "second";

      const outputs = [
        ["p2Sensor", "p2SensorVal", " s"],
        ["p2Setpoint", "p2SetpointVal", ""],
        ["p2Kp", "p2KpVal", ""],
        ["p2Ki", "p2KiVal", ""],
        ["p2Kd", "p2KdVal", ""],
        ["p2Limit", "p2LimitVal", ""],
        ["p2Duration", "p2DurationVal", " s"]
      ];

      for (const [id, out, unit] of outputs) {
        get(out).textContent = get(id).value + unit;
      }

      const res = simulate(p);
      const m = metrics(res, p);

      latest = { p, res, m };

      get("p2Overshoot").textContent =
        finite(m.overshoot, 2) + "%";

      get("p2Settling").textContent =
        Number.isFinite(m.settle)
          ? finite(m.settle) + " s"
          : "Not settled";

      get("p2Error").textContent = finite(m.error);
      get("p2Lag").textContent = finite(m.lag);

      if (typeof Plotly === "undefined") {
        throw Error("Plotly did not load.");
      }

      const config = {
        responsive: true,
        displaylogo: false
      };

      // Output vs measured sensor value
      Plotly.react(
        "p2ResponsePlot",
        [
          {
            x: res.t,
            y: res.y,
            name: "True output y(t)",
            mode: "lines",
            line: { color: "#233247", width: 3 }
          },
          {
            x: res.t,
            y: res.ys,
            name: "Sensor measurement ys(t)",
            mode: "lines",
            line: { color: "#6f88a3", width: 2.5 }
          },
          {
            x: [0, p.duration],
            y: [p.r, p.r],
            name: "Setpoint r(t)",
            mode: "lines",
            line: {
              color: "#be935e",
              dash: "dash",
              width: 2
            }
          }
        ],
        graphLayout(
          "True output vs sensor reading",
          "Output"
        ),
        config
      );

      // Control signal with saturation bounds
      Plotly.react(
        "p2ControlPlot",
        [
          {
            x: res.t,
            y: res.u,
            name: "Control u(t)",
            mode: "lines",
            line: { color: "#233247", width: 2 }
          },
          {
            x: [0, p.duration],
            y: [p.umax, p.umax],
            name: "+Umax",
            mode: "lines",
            line: { color: "#bb3434", dash: "dash" }
          },
          {
            x: [0, p.duration],
            y: [-p.umax, -p.umax],
            name: "−Umax",
            mode: "lines",
            line: { color: "#bb3434", dash: "dash" }
          }
        ],
        graphLayout(
          "Controller command with limits",
          "u(t)"
        ),
        config
      );

      get("p2Notice").textContent =
        "Simulation updated using RK4.";

    } catch (err) {
      latest = null;
      get("p2Notice").textContent = err.message;
    }
  }

  // 8. Presets and reset
  function setValues(values) {

    for (const [id, value] of Object.entries(values)) {
      get(id).value = value;
    }

    get("p2PredictionResult").hidden = true;
    refresh();
  }

  const defaults = {
    p2Plant: "first",
    p2Sensor: 0.1,
    p2Setpoint: 1,
    p2Kp: 9,
    p2Ki: 0,
    p2Kd: 0,
    p2Limit: 100,
    p2Duration: 12,
    p2Gain: 1,
    p2Tau: 1,
    p2Mass: 1,
    p2Damping: 2,
    p2Stiffness: 1
  };

  get("p2Reset").addEventListener(
    "click",
    () => setValues(defaults)
  );

  get("p2PresetFast").addEventListener(
    "click",
    () => setValues({
      ...defaults,
      p2Sensor: 0.05,
      p2Kp: 9,
      p2Duration: 16
    })
  );

  get("p2PresetSlow").addEventListener(
    "click",
    () => setValues({
      ...defaults,
      p2Sensor: 1.1,
      p2Kp: 9,
      p2Duration: 20
    })
  );

  let timer;

  ids.forEach(id =>
    get(id).addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 80);
      get("p2PredictionResult").hidden = true;
    })
  );

  // 9. Predict, then check
  get("p2Check").addEventListener("click", () => {

    const result = get("p2PredictionResult");
    result.hidden = false;

    const selected = document.querySelector(
      'input[name="p2Prediction"]:checked'
    );

    if (!selected) {
      result.className =
        "prediction-result prediction-neutral";
      result.textContent =
        "Choose a prediction first.";
      return;
    }

    try {

      const p = params();

      const afterTau = Math.min(
        3,
        Math.max(p.sensorTau + 0.2, p.sensorTau * 2)
      );

      if (afterTau <= p.sensorTau) {
        result.textContent =
          "Lower the sensor time constant first.";
        return;
      }

      // Two independent simulations
      const a = metrics(simulate(p), p).overshoot;

      const b = metrics(
        simulate({ ...p, sensorTau: afterTau }),
        p
      ).overshoot;

      const delta = b - a;

      const expected =
        Math.abs(delta) <= 0.1
          ? "same"
          : delta > 0
            ? "increase"
            : "decrease";

      const correct = selected.value === expected;

      result.className =
        "prediction-result " +
        (correct
          ? "prediction-correct"
          : "prediction-incorrect");

      result.textContent =
        (correct ? "✓ Correct! " : "✗ Not quite. ") +
        `Sensor τs: ${p.sensorTau.toFixed(2)} → ` +
        `${afterTau.toFixed(2)} s. ` +
        `Overshoot: ${a.toFixed(2)}% → ` +
        `${b.toFixed(2)}%. ` +
        `Correct prediction: ${expected}. ` +
        "All other settings remained unchanged.";

    } catch (err) {
      result.className =
        "prediction-result prediction-incorrect";
      result.textContent =
        "Experiment failed: " + err.message;
    }
  });

  get("p2Retry").addEventListener("click", () => {

    document.querySelectorAll(
      'input[name="p2Prediction"]'
    ).forEach(x => x.checked = false);

    get("p2PredictionResult").hidden = true;
  });

  // Independent from P1
  window.P2SlowSensor = {
    simulate,
    metrics
  };

  refresh();

})();

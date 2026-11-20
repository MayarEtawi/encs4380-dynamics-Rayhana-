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

    // Keep the model buttons and the experiment list in sync
    updateExperimentOptions();
    syncModelSwitch();

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
    clearRestore();
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

  // 9. Predict, then check (same idea as P4: three predictions at once)

  const experiments = {
    sensor: "p2Sensor",
    kp: "p2Kp",
    ki: "p2Ki",
    kd: "p2Kd",
    limit: "p2Limit",
    gain: "p2Gain",
    tau: "p2Tau",
    mass: "p2Mass",
    damping: "p2Damping",
    stiffness: "p2Stiffness"
  };

  const parameterNames = {
    sensor: "Sensor time constant τs",
    kp: "Proportional gain Kp",
    ki: "Integral gain Ki",
    kd: "Derivative gain Kd",
    limit: "Actuator limit Umax",
    gain: "Plant gain K",
    tau: "Plant time constant τ",
    mass: "Mass m",
    damping: "Damping b",
    stiffness: "Stiffness k"
  };

  const parameterKeys = {
    sensor: "sensorTau",
    kp: "kp",
    ki: "ki",
    kd: "kd",
    limit: "umax",
    gain: "K",
    tau: "tau",
    mass: "m",
    damping: "b",
    stiffness: "k"
  };

  // One prediction dropdown for each metric
  const predictions = [
    { metric: "overshoot", id: "p2PredOvershoot", name: "Overshoot" },
    { metric: "settle", id: "p2PredSettle", name: "Settling time" },
    { metric: "error", id: "p2PredError", name: "Final error" }
  ];

  const changeWords = {
    increase: "Increased",
    decrease: "Decreased",
    same: "About the same"
  };

  // Settings saved before the last "Check & run"
  let restorePoint = null;

  function clearRestore() {
    restorePoint = null;
    get("p2Restore").disabled = true;
  }

  function readSettings() {
    const values = {};
    for (const id of ids) {
      if (id !== "p2Plant") values[id] = get(id).value;
    }
    return values;
  }

  // Same tolerance rule as the old single-metric check
  function directionOfChange(a, b) {
    if (!Number.isFinite(a) && !Number.isFinite(b)) return "same";
    if (!Number.isFinite(b)) return "increase";
    if (!Number.isFinite(a)) return "decrease";

    const difference = b - a;
    const tolerance = Math.max(0.001, Math.abs(a) * 0.005);

    if (Math.abs(difference) <= tolerance) return "same";
    return difference > 0 ? "increase" : "decrease";
  }

  function showMetric(metric, value) {
    if (!Number.isFinite(value)) return "Not settled";
    if (metric === "overshoot") return value.toFixed(2) + "%";
    if (metric === "settle") return value.toFixed(2) + " s";
    return value.toFixed(3);
  }

  const shortNumber = v => String(Number(v.toFixed(3)));

  // Round to the input step, so the slider shows exactly the tested value
  function snapToStep(value, input) {
    const step = Number(input.step);
    if (!Number.isFinite(step) || step <= 0) return value;
    const base = input.min === "" ? 0 : Number(input.min);
    return Number(
      (base + Math.round((value - base) / step) * step).toFixed(6)
    );
  }

  function updateExperimentOptions() {
    const plant = get("p2Plant").value;
    const select = get("p2Experiment");

    for (const option of select.options) {
      const value = option.value;

      const firstOrder =
        value.startsWith("gain_") ||
        value.startsWith("tau_");

      const secondOrder =
        value.startsWith("mass_") ||
        value.startsWith("damping_") ||
        value.startsWith("stiffness_");

      option.disabled =
        (plant === "first" && secondOrder) ||
        (plant === "second" && firstOrder);

      option.hidden = option.disabled;
    }

    if (select.selectedOptions[0]?.disabled) {
      select.value = [...select.options].find(
        option => !option.disabled && option.value
      )?.value || "";
    }
  }

  // Plant model buttons inside the prediction card
  const modelButtons = document.querySelectorAll(
    "#p2PredictionSection [data-plant]"
  );

  function syncModelSwitch() {
    const plant = get("p2Plant").value;
    modelButtons.forEach(button =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.plant === plant)
      )
    );
  }

  modelButtons.forEach(button =>
    button.addEventListener("click", () => {
      const plant = get("p2Plant");
      if (plant.value === button.dataset.plant) return;

      plant.value = button.dataset.plant;

      // Same events as choosing the model in the settings card
      plant.dispatchEvent(new Event("input"));
      plant.dispatchEvent(new Event("change"));
    })
  );

  get("p2Plant").addEventListener("change", () => {
    updateExperimentOptions();
    syncModelSwitch();
  });

  updateExperimentOptions();
  syncModelSwitch();

  // Result cards (same structure as P4)
  function renderFeedback(title, rows, note) {
    const feedback = get("p2PredictionResult");

    const make = (tag, cls, text) => {
      const el = document.createElement(tag);
      if (cls) el.className = cls;
      if (text !== undefined) el.textContent = text;
      return el;
    };

    feedback.replaceChildren();
    feedback.className = "p2-feedback";
    feedback.append(make("div", "p2-result-title", title));

    const grid = make("div", "p2-result-grid");

    for (const row of rows) {
      const card = make(
        "div",
        "p2-result-card " + (row.ok ? "is-correct" : "is-wrong")
      );
      card.append(make("strong", "", row.name));
      card.append(make("span", "comparison", row.comparison));
      card.append(make(
        "span",
        "result-status",
        (row.ok ? "✓ Correct · " : "✗ Different · ") +
          changeWords[row.actual]
      ));
      grid.append(card);
    }

    feedback.append(grid);
    feedback.append(make("p", "p2-result-note", note));
    feedback.hidden = false;
  }

  function showMessage(text, isError) {
    const feedback = get("p2PredictionResult");
    feedback.replaceChildren();
    feedback.className = "p2-feedback" + (isError ? " is-error" : "");
    feedback.textContent = text;
    feedback.hidden = false;
  }

  // Check & run
  get("p2PredictionForm").addEventListener("submit", event => {
    event.preventDefault();

    try {
      const p = params();

      const experiment = get("p2Experiment").value;
      const [parameter, direction] = experiment.split("_");
      const id = experiments[parameter];

      if (!id || !parameterKeys[parameter]) {
        throw Error("Please select a valid experiment.");
      }

      const guesses = predictions.map(item => get(item.id).value);

      if (guesses.some(value => !value)) {
        throw Error("Choose a prediction for all three metrics first.");
      }

      const input = get(id);
      const oldValue = Number(input.value);

      let newValue = direction === "up"
        ? (oldValue === 0 ? 0.5 : oldValue * 1.5)
        : oldValue / 1.5;

      const min = input.min === "" ? -Infinity : Number(input.min);
      const max = input.max === "" ? Infinity : Number(input.max);

      newValue = clamp(snapToStep(newValue, input), min, max);

      if (newValue === oldValue) {
        throw Error(
          "This parameter cannot be changed further in that direction."
        );
      }

      // Original simulation
      const before = metrics(simulate(p), p);

      // Change only the selected parameter
      const changed = { ...p, [parameterKeys[parameter]]: newValue };
      const after = metrics(simulate(changed), changed);

      // Run: save the old settings, then show the new value on the page
      restorePoint = readSettings();
      input.value = newValue;
      get("p2Restore").disabled = false;
      refresh();

      // Check the three predictions
      let correct = 0;

      const rows = predictions.map((item, i) => {
        let a = before[item.metric];
        let b = after[item.metric];

        if (item.metric === "error") {
          a = Math.abs(a);
          b = Math.abs(b);
        }

        const actual = directionOfChange(a, b);
        const ok = guesses[i] === actual;
        if (ok) correct++;

        return {
          name: item.name,
          comparison:
            `${showMetric(item.metric, a)} → ${showMetric(item.metric, b)}`,
          ok,
          actual
        };
      });

      const plantName = p.type === "first" ? "first-order" : "second-order";
      const action = get("p2Experiment").selectedOptions[0].textContent.trim();

      renderFeedback(
        `${action} (${shortNumber(oldValue)} → ${shortNumber(newValue)}) · Before vs. after`,
        rows,
        `${correct} / 3 predictions correct. Only ${parameterNames[parameter]} ` +
        `changed; the ${plantName} plant and the other settings stayed fixed. ` +
        "The graphs below now use the new value."
      );

    } catch (err) {
      showMessage("Experiment failed: " + err.message, true);
    }
  });

  // Restore settings
  get("p2Restore").addEventListener("click", () => {
    if (!restorePoint) return;

    setValues(restorePoint);
    showMessage("Previous settings and their response restored.", false);
  });

  // Independent from P1
  window.P2SlowSensor = {
    simulate,
    metrics
  };

  refresh();

})();
const kSlider = document.getElementById("kSlider");
const tauSlider = document.getElementById("tauSlider");
const inputType = document.getElementById("inputType");

const kValue = document.getElementById("kValue");
const tauValue = document.getElementById("tauValue");

const timeWindow = document.getElementById("timeWindow");
timeWindow.onchange = drawResponse;
function windowEnd() {
    return timeWindow.value === "auto" ? 6 * Number(tauSlider.value) : Number(timeWindow.value);
}


kSlider.oninput = function () {
    kValue.textContent = kSlider.value;
    drawResponse();
};

tauSlider.oninput = function () {
    tauValue.textContent = tauSlider.value;
    drawResponse();
};

inputType.onchange = function () {
    drawResponse();
};


function drawResponse() {

    const K = parseFloat(kSlider.value);
    const tau = parseFloat(tauSlider.value);

    let time = [];
    let input = [];
    let output = [];


    const end = windowEnd();
    for (let i = 0; i <= 600; i++) {
        const t = end * i / 600;

        time.push(t);


        if (inputType.value === "step") {

            input.push(1);

            let y =
                K * (1 - Math.exp(-t / tau));

            output.push(y);
        }


        else {

            input.push(t);

            let y =
                K * (t - tau + tau * Math.exp(-t / tau));

            output.push(y);
        }
    }


    let inputGraph = {

        x: time,
        y: input,

        mode: "lines",

        name: "Input",

        line: {
            dash: "dash"
        }
    };


    let outputGraph = {

        x: time,
        y: output,

        mode: "lines",

        name: "Output"
    };


    let layout = {

        title: "First-Order Response",

        xaxis: {
            title: "Time (s)",
            range: [0, end]
        },

        yaxis: {
            title: "Amplitude",
            range: [0, 1.08 * Math.max(1, ...input, ...output)]
        }
    };


    Plotly.newPlot(
        "responsePlot",
        [inputGraph, outputGraph],
        layout,
        {
            responsive: true
        }
    );


    if (inputType.value === "step") {

    let yAtTau =
        K * (1 - Math.exp(-1));

    let yAtThreeTau =
        K * (1 - Math.exp(-3));

    let percentAtTau =
        (yAtTau / K) *100;

    let percentAtThreeTau =
        (yAtThreeTau / K)*100 ;


    document.getElementById("tauResult").textContent =
        yAtTau.toFixed(3);

    document.getElementById("threeTauResult").textContent =
        yAtThreeTau.toFixed(3);


    document.getElementById("tauValidation").textContent =
        Math.abs(percentAtTau - 63.2) < 0.2
            ? "PASS"
            : "FAIL";

    document.getElementById("threeTauValidation").textContent =
        Math.abs(percentAtThreeTau - 95) < 0.3
            ? "PASS"
            : "FAIL";


    document.getElementById("rampLagResult").textContent =
        "—";

    document.getElementById("steadyErrorResult").textContent =
        "—";


    drawError();
}

    else {

    document.getElementById("tauResult").textContent =
        "—";

    document.getElementById("threeTauResult").textContent =
        "—";

    document.getElementById("rampLagResult").textContent =
        tau.toFixed(1) + " s";

    document.getElementById("steadyErrorResult").textContent =
        (K * tau).toFixed(2);

    document.getElementById("tauValidation").textContent =
        "—";

    document.getElementById("threeTauValidation").textContent =
        "—";

    Plotly.purge("errorPlot");
}
}
function drawError() {

    const tau = parseFloat(tauSlider.value);

    let time = [];
    let error = [];


    const end = windowEnd();
    for (let i = 0; i <= 600; i++) {
        const t = end * i / 600;

        time.push(t);

        let errorValue =
            Math.exp(-t / tau);

        error.push(errorValue);
    }


    let errorGraph = {

        x: time,
        y: error,

        mode: "lines",

        name: "Error Fraction"
    };


    let layout = {

        title: "Error Fraction",

        xaxis: {
            title: "Time (s)",
            range: [0, end]
        },

        yaxis: {
            title: "Error",
            type: "log"
        }
    };
    Plotly.newPlot( "errorPlot",[errorGraph], layout,
        {
            responsive: true
        }
    );
}

const scenario = document.getElementById("predictionScenario");
const answer = document.getElementById("predictionAnswer");
const feedback = document.getElementById("predictionFeedback");
const restore = document.getElementById("restorePrediction");
let predictionStart = null;
let previousSettings = null;
function settings() {
    return { k: kSlider.value, tau: tauSlider.value, input: inputType.value, window: timeWindow.value };
}
function applySettings(value) {
    kSlider.value = value.k; tauSlider.value = value.tau;
    inputType.value = value.input; timeWindow.value = value.window;
    kValue.textContent = kSlider.value; tauValue.textContent = tauSlider.value;
    drawResponse();
}
function resetPrediction() {
    predictionStart = null;
    answer.replaceChildren();
    const choices = scenario.value === "tau"
        ? [["", "Choose an answer"], ["faster", "Response becomes faster"], ["slower", "Response becomes slower"], ["same", "Response speed stays the same"]]
        : [["", "Choose an answer"], ["increase", "Final output increases"], ["decrease", "Final output decreases"], ["same", "Final output stays the same"]];
    choices.forEach(([value, text]) => answer.add(new Option(text, value)));
    feedback.textContent = "";
}
scenario.onchange = resetPrediction;
answer.onchange = () => { predictionStart = answer.value ? settings() : null; feedback.textContent = ""; };
document.getElementById("runPrediction").onclick = () => {
    if (!answer.value || !predictionStart) { feedback.textContent = "Choose your prediction first."; answer.focus(); return; }
    const isTau = scenario.value === "tau";
    const key = isTau ? "tau" : "k";
    const slider = isTau ? tauSlider : kSlider;
    const old = Number(predictionStart[key]);
    const next = Math.min(Number(slider.max), old * 2);
    if (next <= old) { feedback.textContent = "This parameter is already at its maximum. Lower it and choose your prediction again."; return; }
    previousSettings = { ...predictionStart };
    restore.disabled = false;
    const applied = { ...predictionStart, [key]: String(next), input: "step" };
    applySettings(applied);
    const correct = answer.value === (isTau ? "slower" : "increase");
    feedback.textContent = (correct ? "Correct! " : "Not quite. ") +
        (isTau ? "Increasing τ slows the response while the final value stays the same. " : "Increasing K raises the final output while the time constant stays the same. ") +
        (isTau ? "τ" : "K") + " changed from " + old + " to " + next + ". Unit-step input applied.";
};
restore.onclick = () => {
    if (!previousSettings) return;
    applySettings(previousSettings); previousSettings = null; restore.disabled = true;
    resetPrediction(); feedback.textContent = "Your previous settings have been restored.";
};
resetPrediction();
kValue.textContent = kSlider.value;
tauValue.textContent = tauSlider.value;

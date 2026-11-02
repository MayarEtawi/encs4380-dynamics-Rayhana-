const kSlider = document.getElementById("kSlider");
const tauSlider = document.getElementById("tauSlider");
const inputType = document.getElementById("inputType");

const kValue = document.getElementById("kValue");
const tauValue = document.getElementById("tauValue");

const predictionTau = document.getElementById("predictionTau");
const checkPredictionTau = document.getElementById("checkPredictionTau");
const predictionResultTau = document.getElementById("predictionResultTau");

const predictionK = document.getElementById("predictionK");
const checkPredictionK = document.getElementById("checkPredictionK");
const predictionResultK = document.getElementById("predictionResultK");


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


    for (let t = 0; t <= 10; t += 0.05) {

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
            range: [0, 10]
        },

        yaxis: {
            title: "Amplitude",
            range: [0, 10]
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


    for (let t = 0; t <= 10; t += 0.05) {

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
            range: [0, 10]
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
checkPredictionTau.onclick = function () {

    if (predictionTau.value === "") {

        predictionResultTau.textContent =
            "Choose an answer first.";
    }
    else if (predictionTau.value === "slower") {

        predictionResultTau.textContent =
            "Correct!";
    }
    else {

        predictionResultTau.textContent =
            "Wrong. The response becomes slower.";
    }
};
checkPredictionK.onclick = function () {

    if (predictionK.value === "") {

        predictionResultK.textContent =
            "Choose an answer first.";
    }
    else if (predictionK.value === "increase") {

        predictionResultK.textContent =
            "Correct!";
    }
    else {

        predictionResultK.textContent =
            "Wrong. The final output increases.";
    }
};
kValue.textContent = kSlider.value;
tauValue.textContent = tauSlider.value;


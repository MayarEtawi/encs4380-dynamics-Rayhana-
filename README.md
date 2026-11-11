# Dynamic Characteristics Toolkit

**ENCS4380 · Interfacing Techniques · Birzeit University**

An interactive toolkit for exploring how sensors respond to changing inputs through live simulations, response plots, and prediction experiments.

🌐 **Live website:** [Open the toolkit](https://mayaretawi.github.io/encs4380-dynamics-Rayhana-/)

---

## 📈 Module 01 · Time Response

Explore first-order step and ramp responses, time constant, and error fraction.

<details>
<summary>👤 Contributor · About this module · AI assistance</summary>

**Developed by:** Mayar Etawi

**About this module:**  
Module 1 explores the time response of a first-order sensor using interactive simulations. Users can adjust the gain \(K\) and time constant \(\tau\) and immediately observe how these parameters affect the system response.

The module supports both **step** and **ramp** inputs, with dynamically updated input and output plots. It also provides adjustable and automatic time windows so important response points remain visible during the simulation.

For step inputs, the module evaluates the response at \(t=\tau\) and \(t=3\tau\), and validates the expected first-order response values of approximately **63.2%** and **95%**.

A logarithmic error plot is also included to illustrate how the response error decreases with time and to show the relationship between the slope and the time constant, where the slope is \(-1/\tau\).

The **Predict, Then Check** experiment allows users to predict how increasing \(K\) or \(\tau\) will affect the response before running the experiment, making the module more interactive and focused on understanding the physical meaning of first-order system parameters.

**AI assistance:**  
Assisted with interface styling, equation formatting, updating prediction interactions, and fixing the time-window controls.

</details>

---

## 🌊 Module 02 · Frequency Response

Explore sine responses, amplitude ratio, phase lag, Bode plots, and dynamic error.

<details>
<summary>👤 Contributor · About this module · AI assistance</summary>

**Developed by:** Yasmin Badwan.

**About this module:**  
Module 2 explores the frequency response of a first-order sensor using interactive simulations. Users can adjust the time constant τ and input frequency and observe how these changes affect the output amplitude and phase lag.

The module compares input and output sine waves and displays Bode magnitude and phase plots, with markers for the selected frequency and cutoff frequency. Live measurements show the amplitude ratio, phase lag, and cutoff frequency, while the dynamic-error calculator expresses the relative amplitude error.

The Predict, Then Check experiment allows users to predict how changing the frequency or time constant affects the response, run the experiment, and restore previous settings. The module also includes homework validation checks 2 and 3.


**AI assistance:**  
Assisted with improving visual consistency, styling titles and navigation links, formatting mathematical expressions, and reviewing the displayed validation calculations.

</details>

---

## ⚙️ Module 03 · Second-Order Response

Explore damping, response measurements, poles, state-space representation, and Euler/RK4 comparison.

<details>
<summary>👤 Contributors · About this module · AI assistance</summary>

**Developed by:** Maryam Maslamani  
**State-space panel:** Yasmin Badwan

**About this module:**  
Simulate a mass–spring–damper system with adjustable mass, damping, stiffness, and input force. Compare underdamped, critically damped, overdamped, and undamped responses. Inspect response measurements and system poles, and compare Euler and fourth-order Runge–Kutta numerical solutions against the exact response.

Yasmin’s state-space panel displays live matrices A, B, and C, independently calculated eigenvalues, and phase-plane trajectories. The panel updates with the shared simulator controls and compares the eigenvalues with the system poles. It also includes homework validation check 6.

**AI assistance:**  
Assisted with introduction styling, formatting mathematical expressions as fractions, reviewing the displayed validation checks, testing module functionality, and integrating Maryam’s simulator with Yasmin’s state-space panel.

</details>

---
## 🎯 Module 04 · Guess the Sensor

Estimate hidden sensor parameters from noisy responses and score your guesses.

<details>
<summary>👤 Contributor · About this module · AI assistance</summary>

**Developed by:** Hala Shojaiah 

**About this module:**  
Module 4 provides an interactive challenge where users estimate the parameters of an unknown sensor by analyzing its response curve. Each round randomly generates either a first-order or second-order sensor with hidden parameters and adds a small amount of noise to simulate realistic measurements.

For first-order sensors, users estimate the time constant (τ) by analyzing the response curve, using methods such as the 63.2% response point. For second-order sensors, users estimate the damping ratio (ζ) and natural frequency (ωₙ) by observing response characteristics such as overshoot and peak time.

The module includes a **Hint** feature to guide users without immediately revealing the correct parameters. After submitting their estimates, users can reveal the actual sensor values and compare their predicted response with the true response on the same plot.

A scoring system evaluates the accuracy of the estimates, awarding full marks when the relative error is within 10%. The module also keeps a running score throughout the session and provides a **New Sensor** button to generate another challenge.

This module helps users apply the concepts learned in the previous modules by interpreting response curves and estimating sensor parameters instead of adjusting known values.

**AI assistance:**  
Assisted with interface styling, equation formatting, and debugging.

</details>

---


## 🚀 Run locally

1. Download or clone the repository.
2. Open `docs/index.html` in a browser.
3. Choose a module to start exploring.

An internet connection is required to load Plotly for Modules 1 and 4.

## 🛠️ Built with

HTML · CSS · JavaScript · Plotly.js

# Dynamic Characteristics Toolkit

**ENCS4380 · Interfacing Techniques · Birzeit University**

An interactive toolkit for exploring how sensors respond to changing inputs through live simulations, response plots, and prediction experiments.

🌐 **Live website:** [Open the toolkit](YOUR_GITHUB_PAGES_URL)

---

## 📈 Module 01 · Time Response

Explore first-order step and ramp responses, time constant, and error fraction.

<details>
<summary>👤 Contributor · About this module · AI assistance</summary>

**Developed by:** [Name]

**About this module:**  
Interactive gain and time-constant controls show how a sensor responds to step and ramp inputs. Includes prediction experiments, adjustable time windows, and validation of the 63.2% and 95% response values.

**AI assistance:**  
Assisted with interface styling, equation formatting, updating prediction interactions, and fixing the time-window controls.

</details>

---

## 🌊 Module 02 · Frequency Response

Explore sine responses, amplitude ratio, phase lag, Bode plots, and dynamic error.

<details>
<summary>👤 Contributor · About this module · AI assistance</summary>

**Developed by:** [Name]

**About this module:**  
Compare input and output sine waves while changing the time constant and frequency. Inspect the cutoff frequency and calculate dynamic error using live plots and calculators.

**AI assistance:**  
Assisted with visual consistency, title and navigation styling, equation formatting, and reviewing validation calculations.

</details>

---

## ⚙️ Module 03 · Second-Order Response

Explore damping, response measurements, poles, state-space representation, and Euler/RK4 comparison.

<details>
<summary>👤 Contributors · About this module · AI assistance</summary>

**Developed by:** [Name]  
**State-space panel:** [Name]

**About this module:**  
Simulate a mass–spring–damper system and compare underdamped, critically damped, and overdamped responses. View response measurements, poles, eigenvalues, phase-plane trajectories, and numerical solver results.

**AI assistance:**  
Assisted with introduction styling, formatting mathematical expressions as fractions, and reviewing the displayed validation checks.

</details>

---

## 🎯 Module 04 · Guess the Sensor

Estimate hidden sensor parameters from noisy responses and score your guesses.

<details>
<summary>👤 Contributor · About this module · AI assistance</summary>

**Developed by:** [Name]

**About this module:**  
A randomly generated sensor produces a noisy response. Estimate its parameters, request a hint, reveal the true values, and compare your guess with the true response. Scores accumulate throughout the session.

**AI assistance:**  
Assisted with equation formatting and reviewing scoring and new-round interactions.

</details>

---

## 🚀 Run locally

1. Download or clone the repository.
2. Open `docs/index.html` in a browser.
3. Choose a module to start exploring.

An internet connection is required to load Plotly for Modules 1 and 4.

## 🛠️ Built with

HTML · CSS · JavaScript · Plotly.js

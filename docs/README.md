# Rayhana integrated website — ENCS4380 Homework 2

## How to launch

1. Extract this ZIP; do not move CSS/JS files away from their HTML files.
2. Open `index.html`, then **Enter Homework 2**. Alternatively open `control.html` directly.
3. Use the Control Home module cards or site-wide header links to navigate between P1, P2, P4 and My System.

## Integrated routes

- `index.html`: team toolkit landing page.
- `control.html`: Homework 2 landing page; P4 card and hero action now link to the functional P4 page.
- `pid-playground.html`: P1, PID playground, reference validation and existing bonus teaching exercises.
- `slow-sensor.html`: P2, slow sensor simulation.
- `tuning-challenge.html` + `.css` + `.js`: P4, hidden-plant tuning, live preview, prediction, scored runs and CSV export.
- `project-model.html`: Micromouse project documentation and navigation to P4.

P4 retains its three-file structure (HTML, CSS, and JS); it uses its own numerical solver and needs no backend or CDN. P1/P2 load Plotly from a CDN, so their charts require an internet connection. We preserved the uploaded simulations.

## Unfinished parts (do not claim the whole HW is complete yet)

- **P3 Digital PID:** no P3 HTML/CSS/JS was supplied. Its card remains a disabled placeholder until Partner 3 adds the files.
- **Homework 1:** original pages not provided. `homework1.html` is an explicit informational placeholder instead of a broken link. `unlinked-homework1-assets/module1-script.js` is retained from uploads but not automatically loaded; it requires its matching original Homework 1 HTML.
- **My System:** contains `TODO` values for measured motor K, tau, PWM/speed measurements, specifications, final gains, plot and Arduino evidence. Do not present it as completed measurements.
- **Bonus:** P1 includes demonstrations for Ziegler-Nichols and state-space control, but group-selected bonus integration/results in P4 have not been added.
- **Shared metrics:** P1/P2 use a signed tracking-error amplitude estimate; P4 reports final error in **percent** and requires a settled tail. Do not compare these values without converting units and matching the measurement convention. This package integrates the pages/navigation, not a single shared numerical metrics implementation across modules.

## Integration changes

- Normalized names from `(1)` `(2)` `(3)` to filenames expected by relative links.
- Site-wide navigation on Control Home, P1, P2, P4 and My System.
- Replaced P4 `Coming from team member` with a real link, added P4 to Control Home hero.
- Scoped P4 header styling to visually follow the existing Rayhana navy/cream/camel branding.
- Added visible project/lesson cross-links while keeping all original numerical simulations.

## Publishing

Copy **all the files at the top level** of the extracted project to your repository's GitHub Pages publishing directory (often the repo root or `/docs`). Keep file names unchanged. Do not upload the ZIP alone if you want GitHub Pages to serve the individual pages. Verify the P4 and My System links after pushing.

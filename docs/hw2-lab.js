/*
 * RAYHANA — Homework 2 shared layout helper (visual only).
 * Keeps the "Interactive settings" column beside the results while scrolling.
 * If the column is taller than the screen, it scrolls with the page until its
 * last control is visible and then stays fixed, so nothing is ever hidden.
 */
(function () {
  const columns = document.querySelectorAll('.lab-workspace > .lab-sticky');
  if (!columns.length) return;
  const GAP = 16;
  function place() {
    columns.forEach(function (col) {
      const fits = col.offsetHeight + GAP * 2 <= window.innerHeight;
      col.style.top = (fits ? GAP : window.innerHeight - col.offsetHeight - GAP) + 'px';
    });
  }
  window.addEventListener('resize', place);
  window.addEventListener('load', place);
  // the column can change height (e.g. switching plant model shows other fields)
  if ('ResizeObserver' in window) columns.forEach(function (c) { new ResizeObserver(place).observe(c); });
  place();
})();

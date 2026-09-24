// Runs before first paint (loaded as a blocking file, not inline, so the CSP
// needs no inline-script exception). Applies the saved theme and marks that
// JavaScript is available.
(function () {
  var root = document.documentElement;
  root.classList.add('js');
  try {
    var saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') root.setAttribute('data-theme', saved);
  } catch (e) {
    /* Storage unavailable: follow the OS preference. */
  }
})();

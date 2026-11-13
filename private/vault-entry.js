/* Catalog-only cinematic vault entrance.
 * Decorative: no secrets, checkout, product reservations, or network calls.
 * Skips for reduced motion and after the first visit per browser tab.
 */
(() => {
  "use strict";
  const portal = document.getElementById("locker-entry-portal");
  const replay = document.getElementById("locker-entry-replay");
  const skip = portal?.querySelector(".locker-entry-skip");
  const heading = document.querySelector(".private-title h1");
  const background = [...document.querySelectorAll(".private-header,.private-notice,.private-title,.catalog-grid,.private-footer")];
  if (!portal || !replay || !skip) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const key = "tgl:vault-entry:v1";
  const durationMs = 1950;
  let active = false;
  let timeout = null;

  const seen = () => {
    try { return sessionStorage.getItem(key) === "1"; }
    catch { return false; }
  };
  const remember = () => {
    try { sessionStorage.setItem(key, "1"); }
    catch { /* Browsers that block storage still get a usable catalog. */ }
  };
  const finish = () => {
    if (!active) return;
    active = false;
    if (timeout !== null) clearTimeout(timeout);
    timeout = null;
    portal.classList.remove("is-opening");
    for (const element of background) element.inert = false;
    const wasFocused = document.activeElement === skip;
    if (wasFocused) skip.blur();
    portal.hidden = true;
    if (wasFocused && heading) {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
  };
  const begin = () => {
    if (reducedMotion.matches || document.visibilityState === "hidden") {
      remember();
      finish();
      return;
    }
    if (active) finish();
    active = true;
    remember();
    portal.hidden = false;
    portal.classList.remove("is-opening");
    void portal.offsetWidth;
    portal.classList.add("is-opening");
    for (const element of background) element.inert = true;
    skip.focus({ preventScroll: true });
    timeout = window.setTimeout(finish, durationMs);
  };
  replay.hidden = reducedMotion.matches;
  if (!reducedMotion.matches && !seen()) begin();
  else remember();

  replay.addEventListener("click", begin);
  skip.addEventListener("click", finish);
  document.addEventListener("keydown", event => {
    if (!active) return;
    if (event.key === "Escape") {
      event.preventDefault();
      finish();
    } else if (event.key === "Tab") {
      event.preventDefault();
      skip.focus({ preventScroll: true });
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") finish();
  });
  reducedMotion.addEventListener?.("change", () => {
    replay.hidden = reducedMotion.matches;
    if (reducedMotion.matches) finish();
  });
})();

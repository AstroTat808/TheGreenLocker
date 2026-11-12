(() => {
  "use strict";
  const nav = document.querySelector("#primaryNav");
  const toggle = document.querySelector("#navToggle");
  toggle?.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!expanded));
    nav?.classList.toggle("open", !expanded);
  });
  nav?.querySelectorAll("a").forEach(a => a.addEventListener("click", () => {
    nav.classList.remove("open");
    toggle?.setAttribute("aria-expanded", "false");
  }));
  const year = document.querySelector("#year");
  if (year) year.textContent = String(new Date().getFullYear());

  // Cosmetic age acknowledgement only: NOT a licensed-store age-verification mechanism.
  const dialog = document.querySelector("#ageDialog");
  let approved = false;
  try { approved = sessionStorage.getItem("tgl_adult_preview") === "yes"; } catch {}
  if (!approved && !new URLSearchParams(location.search).has("preview")) dialog?.showModal();
  document.querySelector("#ageYes")?.addEventListener("click", () => {
    try { sessionStorage.setItem("tgl_adult_preview", "yes"); } catch {}
    dialog?.close();
  });
  document.querySelector("#ageNo")?.addEventListener("click", () => {
    document.body.innerHTML = '<main style="background:#06160e;color:#f4ead6;min-height:100vh;display:grid;place-items:center;text-align:center;font:18px Arial;padding:40px"><div><h1 style="font:38px Georgia;color:#d8b16d">Preview unavailable</h1><p>This brand concept is for adults 21 and older.</p></div></main>';
  });
  dialog?.addEventListener("cancel", e => e.preventDefault());
})();

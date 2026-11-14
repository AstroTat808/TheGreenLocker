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
    const main = document.createElement("main");
    main.className = "preview-unavailable";
    const heading = document.createElement("h1");
    heading.textContent = "Preview unavailable";
    const message = document.createElement("p");
    message.textContent = "This brand concept is for adults 21 and older.";
    main.append(heading, message);
    document.body.replaceChildren(main);
    document.body.classList.add("preview-denied");
  });
  dialog?.addEventListener("cancel", e => e.preventDefault());
})();

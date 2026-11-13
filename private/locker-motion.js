/* The Locker Files — cinematic, visual-only vault reveal.
 * No network calls, cart state, availability checks, or order processing.
 */
(() => {
  "use strict";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const pending = new WeakMap();
  const labels = document.querySelectorAll(".locker-tier-choices");

  for (const group of labels) {
    const output = group.querySelector(".locker-tier-status");
    const choices = group.querySelectorAll('input[type="radio"]');
    for (const choice of choices) {
      choice.addEventListener("change", () => {
        if (!choice.checked) return;
        const selected = choice.closest(".locker-tier");
        for (const label of group.querySelectorAll(".locker-tier")) {
          const timer = pending.get(label);
          if (timer !== undefined) clearTimeout(timer);
          label.classList.remove("is-unlocking");
        }
        const packageName = choice.dataset.packageName || "Selected package";
        const exactWeight = choice.dataset.weight || "";
        if (output) output.textContent = packageName + " · " + exactWeight + " · Preview unlocked · No sales";
        if (reducedMotion.matches) return;
        // Restart the compositor-only animation on every new package choice.
        void selected.offsetWidth;
        selected.classList.add("is-unlocking");
        const timer = setTimeout(() => {
          selected.classList.remove("is-unlocking");
          pending.delete(selected);
        }, 1100);
        pending.set(selected, timer);
      });
    }
  }
})();

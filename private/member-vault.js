(() => {
  "use strict";
  // Mount after the DOM is ready on all browsers; the component may be loaded
  // with defer, dynamically, or after a responsive full-page navigation.
  function mount() {
    const root = document.getElementById("vault-command-deck");
    if (!root || root.dataset.vaultDeckReady === "true") return;
    const tabs = Array.from(root.querySelectorAll('[role="tab"][data-vault-deck-tab]'));
    const panels = Array.from(root.querySelectorAll('[role="tabpanel"][data-vault-deck-panel]'));
    if (!tabs.length || !panels.length) return;
    const select = (tab, focus = false) => {
      const panelId = tab.getAttribute("aria-controls");
      const selectedPanel = panels.find(panel => panel.id === panelId);
      if (!selectedPanel) return;
      for (const t of tabs) {
        const selected = t === tab;
        t.setAttribute("aria-selected", String(selected));
        t.tabIndex = selected ? 0 : -1;
      }
      for (const panel of panels) panel.hidden = panel !== selectedPanel;
      root.dataset.activePanel = tab.dataset.vaultDeckTab || "";
      if (focus) tab.focus({preventScroll:true});
    };
    tabs.forEach((tab,index) => {
      tab.addEventListener("click", () => select(tab));
      tab.addEventListener("keydown", event => {
        if (!["ArrowRight","ArrowLeft","Home","End"].includes(event.key)) return;
        event.preventDefault();
        const direction = document.documentElement.dir === "rtl" ? -1 : 1;
        const next = event.key === "Home" ? 0 :
          event.key === "End" ? tabs.length-1 :
          (index + (event.key === "ArrowRight" ? direction : -direction) + tabs.length) % tabs.length;
        select(tabs[next],true);
      });
    });
    root.dataset.vaultDeckReady = "true";
    select(tabs.find(tab => tab.getAttribute("aria-selected") === "true") || tabs[0]);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, {once:true});
  } else {
    mount();
  }
})();

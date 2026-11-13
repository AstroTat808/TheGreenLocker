/**
 * Decorative, accessible compartment-door transition for private member links.
 * Links work normally when scripts are disabled or reduced motion is requested.
 */
(() => {
  "use strict";
  const doors=[...document.querySelectorAll("[data-vault-compartment]")];
  if (!doors.length) return;
  const reduced=window.matchMedia("(prefers-reduced-motion: reduce)");
  const duration=440;
  let active=null;
  let timer=null;

  const cancel=()=>{
    if (timer !== null) window.clearTimeout(timer);
    timer=null;
    if(active) {
      active.classList.remove("is-opening");
      active.removeAttribute("aria-busy");
    }
    active=null;
  };
  for(const door of doors) {
    door.addEventListener("click",event=>{
      // Preserve open-in-new-tab, download, context-menu and modified clicks.
      if(event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey||
         door.target==="_blank"||door.hasAttribute("download")||reduced.matches) return;
      const href=door.getAttribute("href");
      if(!href || !(href.startsWith("/")||href.startsWith("#"))) return;
      event.preventDefault();
      if(active) return;
      active=door;
      door.classList.add("is-opening");
      door.setAttribute("aria-busy","true");
      timer=window.setTimeout(()=>{
        cancel();
        if(href.startsWith("#")) {
          const target=document.getElementById(href.slice(1));
          if(target) {
            window.history.pushState(null,"",href);
            target.scrollIntoView({behavior:"auto",block:"start"});
            target.focus({preventScroll:true});
            return;
          }
        }
        window.location.assign(href);
      },duration);
    });
  }
  document.addEventListener("keydown",event=>{
    if(event.key==="Escape" && active) {
      event.preventDefault();
      const focused=active;
      cancel();
      focused.focus({preventScroll:true});
    }
  });
  document.addEventListener("visibilitychange",()=>{if(document.hidden)cancel();});
  window.addEventListener("pagehide",cancel);
  reduced.addEventListener?.("change",()=>{if(reduced.matches)cancel();});
})();

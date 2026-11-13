/**
 * The Green Locker's progressive-enhancement card flip.
 * No user data is written to client storage and no network requests are made.
 */
(() => {
  "use strict";
  const scene=document.querySelector("[data-card-scene]");
  const trigger=document.querySelector("[data-card-flip]");
  const front=document.querySelector("[data-card-front]");
  const back=document.querySelector("[data-card-back]");
  if(!scene||!trigger||!front||!back)return;
  const reduced=window.matchMedia("(prefers-reduced-motion: reduce)");

  function setFlipped(next){
    scene.classList.toggle("is-flipped",next);
    scene.dataset.cardFace=next?"back":"front";
    trigger.setAttribute("aria-pressed",String(next));
    trigger.setAttribute("aria-label",next?"Flip to front of membership card":"Flip to back of membership card");
    trigger.firstChild.textContent=next?"Flip card to front ":"Flip card to reveal back ";
    front.setAttribute("aria-hidden",String(next));
    back.setAttribute("aria-hidden",String(!next));
  }
  setFlipped(false);
  trigger.addEventListener("click",()=>setFlipped(!scene.classList.contains("is-flipped")));
  // Tilt is purely decorative; never intercepts taps, keyboard, or reduced-motion.
  if(window.matchMedia("(hover:hover) and (pointer:fine)").matches){
    scene.addEventListener("pointermove",event=>{
      if(reduced.matches)return;
      const rect=scene.getBoundingClientRect();
      const x=((event.clientX-rect.left)/rect.width-.5)*7;
      const y=((event.clientY-rect.top)/rect.height-.5)*-5;
      scene.style.setProperty("--member-card-yaw",x.toFixed(2)+"deg");
      scene.style.setProperty("--member-card-pitch",y.toFixed(2)+"deg");
    });
    scene.addEventListener("pointerleave",()=>{
      scene.style.removeProperty("--member-card-yaw");
      scene.style.removeProperty("--member-card-pitch");
    });
  }
  reduced.addEventListener?.("change",()=>{
    if(reduced.matches){
      scene.style.removeProperty("--member-card-yaw");
      scene.style.removeProperty("--member-card-pitch");
    }
  });
})();

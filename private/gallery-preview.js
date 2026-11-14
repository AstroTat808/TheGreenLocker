/**
 * Read-only private preview gallery: keyboard/touch-friendly image navigation.
 * No network requests, checkout controls, or product action tracking.
 */
(() => {
 "use strict";
 for(const gallery of document.querySelectorAll("[data-concept-gallery]")){
  const photos=Array.from(gallery.querySelectorAll("[data-concept-image]"));
  if(photos.length<=1)continue;
  let active=0;
  const count=gallery.querySelector("[data-gallery-counter]");
  const show=index=>{
   active=(index+photos.length)%photos.length;
   photos.forEach((photo,i)=>{
    photo.hidden=i!==active;
    photo.setAttribute("aria-hidden",i!==active?"true":"false");
   });
   if(count)count.textContent=(active+1)+" / "+photos.length;
  };
  gallery.addEventListener("click",event=>{
   const button=event.target.closest("[data-gallery-dir]");
   if(!button)return;
   show(active+Number(button.dataset.galleryDir));
  });
  gallery.addEventListener("keydown",event=>{
   if(!["ArrowLeft","ArrowRight"].includes(event.key))return;
   if(!event.target.closest("button"))return;
   event.preventDefault();
   show(active+(event.key==="ArrowRight"?1:-1));
  });
  show(0);
 }
})();
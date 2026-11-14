/**
 * Assortment Studio image pipeline.
 * User-selected PNG/JPEG/WebP files are decoded in the browser, drawn to a
 * clean canvas and re-encoded to bounded WebP bytes. Never upload metadata,
 * GPS/EXIF or a raw filename; no third-party endpoints.
 */
(() => {
 "use strict";
 const forms=document.querySelectorAll("[data-concept-upload]");
 if(!forms.length)return;
 const LIMIT=12*1024*1024;
 const MAX_SIDE=1600;
 const WEBP_MAX=2*1024*1024;
 const IMAGE_TYPES=new Set(["image/png","image/jpeg","image/webp"]);
 // Calling location.assign() with the exact same URL is a same-document
 // navigation, NOT a refresh. Repeated uploads used to display stale photos.
 const refreshEditor=(notice,slot)=>{
  const target="/admin/assortment?notice="+encodeURIComponent(notice)+"#edit-"+encodeURIComponent(slot);
  if(window.location.href===new URL(target,window.location.href).href)window.location.reload();
  else window.location.assign(target);
 };


 // Browsers can reattach ICC color profiles even to a newly encoded canvas.
 // Strip those container chunks and their VP8X flags so EXIF, XMP, ICC and
 // animation data are never persisted in private collection media.
 async function sanitizeWebp(blob){
  const input=new Uint8Array(await blob.arrayBuffer());
  if(input.length<30||String.fromCharCode(...input.subarray(0,4))!=="RIFF"||
     String.fromCharCode(...input.subarray(8,12))!=="WEBP")
   throw Error("The browser did not produce a valid WebP image.");
  const get32=(bytes,o)=>(bytes[o]|bytes[o+1]<<8|bytes[o+2]<<16|bytes[o+3]<<24)>>>0;
  if(get32(input,4)!==input.length-8)throw Error("WebP image has an invalid container length.");
  const chunks=[];let offset=12,total=12,hasImage=false;
  while(offset+8<=input.length){
   const tag=String.fromCharCode(...input.subarray(offset,offset+4));
   const size=get32(input,offset+4);
   const end=offset+8+size+(size%2);
   if(size>WEBP_MAX||end>input.length)throw Error("WebP container is invalid.");
   if(["ANIM","ANMF"].includes(tag))throw Error("Animated artwork is not accepted.");
   if(["VP8X","VP8 ","VP8L","ALPH"].includes(tag)){
    const chunk=input.slice(offset,end);
    if(tag==="VP8X"){
     if(chunk.length<18)throw Error("Invalid WebP extended header.");
     chunk[8]&=0x10; // Keep only a possible alpha flag.
    }
    if(tag==="VP8 "||tag==="VP8L")hasImage=true;
    chunks.push(chunk);total+=chunk.length;
   }else if(!["ICCP","EXIF","XMP "].includes(tag)){
    throw Error("Unsupported WebP metadata chunk.");
   }
   offset=end;
  }
  if(offset!==input.length||!hasImage)throw Error("WebP lacks a valid image payload.");
  if(total>WEBP_MAX)throw Error("Optimized artwork is still too large.");
  const output=new Uint8Array(total);
  output.set(input.subarray(0,12));
  const size=total-8;
  output[4]=size&255;output[5]=size>>>8&255;
  output[6]=size>>>16&255;output[7]=size>>>24&255;
  let cursor=12;
  for(const chunk of chunks){output.set(chunk,cursor);cursor+=chunk.length;}
  return new Blob([output],{type:"image/webp"});
 }

 const fileToWebp=async file=>{
  if(!IMAGE_TYPES.has(file.type)||file.size>LIMIT||!file.size)
   throw Error("Select a PNG, JPEG or WebP image no larger than 12 MB.");
  const objectUrl=URL.createObjectURL(file);
  let bitmap;
  try{
   bitmap=await createImageBitmap(file,{imageOrientation:"from-image"});
  }catch{
   URL.revokeObjectURL(objectUrl);
   throw Error("The image cannot be decoded. Choose another photograph.");
  }
  URL.revokeObjectURL(objectUrl);
  try{
   if(bitmap.width<1||bitmap.height<1||bitmap.width>10000||
      bitmap.height>10000||bitmap.width*bitmap.height>40000000)
     throw Error("Image dimensions are outside the allowed range.");
   const scale=Math.min(1,MAX_SIDE/Math.max(bitmap.width,bitmap.height));
   const w=Math.max(1,Math.round(bitmap.width*scale));
   const h=Math.max(1,Math.round(bitmap.height*scale));
   const canvas=document.createElement("canvas");
   canvas.width=w;canvas.height=h;
   const ctx=canvas.getContext("2d",{alpha:false});
   if(!ctx)throw Error("Image processing is not available.");
   ctx.fillStyle="#071a12";
   ctx.fillRect(0,0,w,h);
   ctx.imageSmoothingQuality="high";
   ctx.drawImage(bitmap,0,0,w,h);
   for(const quality of [0.88,0.76,0.62,0.46]){
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/webp",quality));
    if(blob&&blob.type==="image/webp"&&blob.size>0&&blob.size<=WEBP_MAX){
     return await sanitizeWebp(blob);
    }
   }
   throw Error("This image is too detailed to optimize to 2 MB. Try a smaller photograph.");
  }finally{bitmap.close?.();}
 };
 for(const form of forms){
  form.addEventListener("submit",async event=>{
   event.preventDefault();
   const button=form.querySelector('button[type="submit"]');
   const label=form.querySelector(".upload-result");
   const input=form.querySelector('input[type="file"]');
   const csrf=form.querySelector('input[name="csrf"]')?.value||"";
   const slot=form.dataset.slot;
   const version=form.dataset.version;
   if(!input?.files?.length)return;
   button.disabled=true;button.textContent="Optimizing artwork…";
   if(label)label.textContent="Processing artwork securely on this device…";
   try{
    const blob=await fileToWebp(input.files[0]);
    const response=await fetch(
     "/admin/assortment/image?slot_id="+encodeURIComponent(slot)+"&version="+encodeURIComponent(version),
     {method:"POST",credentials:"same-origin",
      headers:{"Content-Type":"image/webp","X-CSRF-Token":csrf},body:blob,redirect:"manual"});
    if(response.status===409)throw Error("Another edit changed this slot. Refresh and try again.");
    if(!response.ok)throw Error((await response.text()).slice(0,170)||"Image upload was rejected.");
    if(label)label.textContent="Artwork uploaded. Reloading the latest concept…";
    refreshEditor("Artwork uploaded",slot);
   }catch(error){
    if(label)label.textContent=error?.message||"Unable to upload image.";
    button.disabled=false;button.textContent="Optimize & upload image";
   }
  });
 }
 // Native pointer drag/drop on desktop; accessible Up/Down/Cover controls
 // provide the same ordering feature on touch devices and keyboards.
 const saveRequest=async(gallery,endpoint,payload)=>{
  const response=await fetch("/admin/assortment/gallery/"+endpoint,{
   method:"POST",credentials:"same-origin",
   headers:{"Content-Type":"application/json","X-CSRF-Token":gallery.dataset.csrf||""},
   body:JSON.stringify({
    slot_id:gallery.dataset.slot,version:Number(gallery.dataset.version),...payload
   })
  });
  if(response.status===409)throw Error("This gallery was changed elsewhere. Reload the page before editing.");
  if(!response.ok)throw Error((await response.text()).slice(0,180)||"Gallery update was rejected.");
  return response.json();
 };
 for(const gallery of document.querySelectorAll("[data-gallery]")){
  const list=gallery.querySelector(".assortment-gallery-list");
  const status=gallery.querySelector(".assortment-gallery-status");
  const entries=()=>Array.from(list.querySelectorAll("[data-photo-id]"));
  const notify=message=>{if(status)status.textContent=message;};
  const refreshPositions=()=>{
   entries().forEach((item,i,all)=>{
    const label=item.querySelector(".assortment-gallery-position");
    if(label)label.textContent=i===0?"Cover image":"Image "+(i+1);
    for(const action of ["up","down","cover"]){
     const b=item.querySelector('[data-gallery-action="'+action+'"]');
     if(!b)continue;
     b.disabled=(action==="up"||action==="cover")?i===0:i===all.length-1;
    }
   });
   notify("Order updated locally. Select Save image order to keep changes.");
  };
  let dragging=null;
  list.addEventListener("dragstart",event=>{
   const item=event.target.closest("[data-photo-id]");
   if(!item)return;
   dragging=item;
   event.dataTransfer.effectAllowed="move";
   event.dataTransfer.setData("text/plain",item.dataset.photoId);
   item.classList.add("is-dragging");
  });
  list.addEventListener("dragover",event=>{
   if(!dragging)return;
   event.preventDefault();
   event.dataTransfer.dropEffect="move";
  });
  list.addEventListener("drop",event=>{
   if(!dragging)return;
   event.preventDefault();
   const target=event.target.closest("[data-photo-id]");
   if(!target||target===dragging)return;
   const rect=target.getBoundingClientRect();
   list.insertBefore(dragging,event.clientY>rect.top+rect.height/2?target.nextSibling:target);
   refreshPositions();
  });
  list.addEventListener("dragend",()=>{
   dragging?.classList.remove("is-dragging");
   dragging=null;
  });
  let saving=false;
  const perform=async(endpoint,payload,message)=>{
   if(saving)return;
   saving=true;notify("Saving changes…");
   try{
    await saveRequest(gallery,endpoint,payload);
    notify(message+" Refreshing the current gallery…");
    refreshEditor("Gallery updated",gallery.dataset.slot);
   }catch(error){
    notify(error?.message||"Unable to save changes.");
   }finally{saving=false;}
  };
  list.addEventListener("click",event=>{
   const button=event.target.closest("[data-gallery-action]");
   if(!button||button.disabled)return;
   const item=button.closest("[data-photo-id]");
   if(!item)return;
   const action=button.dataset.galleryAction;
   if(action==="up"){
    const previous=item.previousElementSibling;
    if(previous?.matches("[data-photo-id]"))list.insertBefore(item,previous);
    refreshPositions();
   }else if(action==="down"){
    const next=item.nextElementSibling;
    if(next?.matches("[data-photo-id]"))list.insertBefore(next,item);
    refreshPositions();
   }else if(action==="cover"){
    list.insertBefore(item,entries()[0]);
    refreshPositions();
   }else if(action==="delete"){
    if(window.confirm("Remove this concept image? This cannot be undone.")){
     perform("delete",{image_id:Number(item.dataset.photoId)},"Image removed.");
    }
   }else if(action==="caption"){
    const description=item.querySelector(".assortment-gallery-caption")?.value||"";
    perform("caption",{image_id:Number(item.dataset.photoId),description},"Description saved.");
   }
  });
  gallery.querySelector(".assortment-gallery-save")?.addEventListener("click",()=>{
   perform("order",{ids:entries().map(item=>Number(item.dataset.photoId))},"Image order saved.");
  });
 }

})();
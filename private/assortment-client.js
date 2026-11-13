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
    window.location.assign("/admin/assortment?notice=Artwork%20uploaded#edit-"+encodeURIComponent(slot));
   }catch(error){
    if(label)label.textContent=error?.message||"Unable to upload image.";
    button.disabled=false;button.textContent="Optimize & upload image";
   }
  });
 }
})();
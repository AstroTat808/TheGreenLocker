(() => {
 "use strict";
 for(const input of document.querySelectorAll("[data-csv-file]")){
   input.addEventListener("change",async()=>{
     const file=input.files?.[0],target=document.getElementById(input.dataset.csvFile);
     if(!file||!target)return;
     if(file.size>100000){window.alert("CSV files must be 100KB or smaller.");input.value="";return;}
     target.value=await file.text();
   });
 }
 for(const form of document.querySelectorAll("[data-upload-form]")){
   form.addEventListener("submit",async event=>{
     event.preventDefault();
     const status=form.querySelector(".upload-result"),file=form.querySelector('input[name="image"]').files?.[0],id=form.querySelector('select[name="product_id"]').value,csrf=form.querySelector('input[name="csrf"]').value;
     if(!file||!id)return;
     if(file.size>2097152||!["image/png","image/jpeg","image/webp"].includes(file.type)){status.textContent="Select a PNG, JPG or WebP image up to 2MB.";return;}
     status.textContent="Uploading...";
     try{
       const response=await fetch("/admin/images?product_id="+encodeURIComponent(id),{method:"POST",credentials:"same-origin",headers:{"Content-Type":file.type,"X-CSRF-Token":csrf},body:file});
       if(!response.ok){status.textContent="Upload rejected: "+(await response.text()).slice(0,160);return;}
       status.textContent="Image saved. Refreshing gallery...";
       window.location.reload();
     }catch{status.textContent="Upload failed. Check your connection and try again.";}
   });
 }
})();
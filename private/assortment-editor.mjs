/**
 * Private, MFA-gated concept assortment editor.
 *
 * This is independent of the legacy inventory ledger and does NOT implement
 * pricing, stock, orders, shipment, checkout or publishing to a public store.
 * All media remains behind the existing session + private-preview gateway.
 */
import fs from "node:fs";
import path from "node:path";
import {randomBytes} from "node:crypto";
import {CONCEPT_COLLECTIONS} from "./catalog-collections.mjs";

const escapeHtml=x=>String(x??"").replace(/[&<>"']/g,ch=>({
 "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[ch]));
const slotCatalog=Object.freeze(Object.entries(CONCEPT_COLLECTIONS).flatMap(([family,slots])=>
 slots.map((s,i)=>Object.freeze({id:s.id,family,sort:i+1,defaultTitle:s.title,
   defaultDescription:s.note||"Identity, ingredient and compliance information pending.",
   initialVisible:true}))));
const slotMap=new Map(slotCatalog.map(x=>[x.id,x]));
const limits={title:90,description:420,notes:1000,brand:90};
const allowed=mime=>mime==="image/webp";
const maxImageBytes=2*1024*1024;
const isValidName=(s,max)=>typeof s==="string"&&s.trim().length>=2&&
 s.trim().length<=max&&!/[\u0000-\u001f\u007f]/.test(s);
const isValidText=(s,max)=>typeof s==="string"&&s.length<=max&&
 !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s);
const clean=s=>String(s??"").trim();
const validVersion=v=>/^[1-9]\d{0,9}$/.test(String(v))?Number(v):null;
const now=()=>Date.now();

export function installAssortment(db){
 db.exec("CREATE TABLE IF NOT EXISTS collection_concepts ("+
  "id TEXT PRIMARY KEY,family TEXT NOT NULL CHECK(family IN ('botanicals','vapes','treats')),"+
  "slot_order INTEGER NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',"+
  "notes TEXT NOT NULL DEFAULT '',image_key TEXT,preview_visible INTEGER NOT NULL DEFAULT 1 "+
  "CHECK(preview_visible IN (0,1)),version INTEGER NOT NULL DEFAULT 1,"+
  "updated_at INTEGER NOT NULL,updated_by INTEGER REFERENCES users(id));");
 db.exec("CREATE INDEX IF NOT EXISTS idx_collection_concepts_family ON collection_concepts(family,slot_order);");
 db.exec("CREATE TABLE IF NOT EXISTS collection_branding ("+
  "key TEXT PRIMARY KEY,value TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,"+
  "updated_at INTEGER NOT NULL,updated_by INTEGER REFERENCES users(id));");
 db.exec("CREATE TABLE IF NOT EXISTS collection_edits ("+
  "id INTEGER PRIMARY KEY AUTOINCREMENT,slot_id TEXT NOT NULL,"+
  "editor_id INTEGER NOT NULL REFERENCES users(id),change_kind TEXT NOT NULL,"+
  "version INTEGER NOT NULL,created_at INTEGER NOT NULL);");
 const insert=db.prepare("INSERT OR IGNORE INTO collection_concepts("+
  "id,family,slot_order,title,description,preview_visible,updated_at) VALUES(?,?,?,?,?,?,?)");
 for(const s of slotCatalog)
  insert.run(s.id,s.family,s.sort,s.defaultTitle,s.defaultDescription,
    s.initialVisible?1:0,now());
 db.prepare("INSERT OR IGNORE INTO collection_branding(key,value,updated_at) VALUES('vape_brand',?,?)")
   .run("Brand name pending",now());
}

export function readAssortment(db){
 const rows=db.prepare("SELECT id,family,slot_order,title,description,notes,image_key,preview_visible,version,updated_at FROM collection_concepts ORDER BY family,slot_order").all();
 const entries={botanicals:[],vapes:[],treats:[]};
 for(const row of rows){
  if(!slotMap.has(row.id)||row.family!==slotMap.get(row.id).family)continue;
  entries[row.family].push(row);
 }
 const brand=db.prepare("SELECT value,version,updated_at FROM collection_branding WHERE key='vape_brand'").get();
 return {entries,brand:brand||{value:"Brand name pending",version:1}};
}
function doAudit(db,{id,userId,kind,version}){
 db.prepare("INSERT INTO collection_edits(slot_id,editor_id,change_kind,version,created_at) VALUES(?,?,?,?,?)")
  .run(id,userId,kind,version,now());
}
function transactional(db,handler){
 db.exec("BEGIN IMMEDIATE");
 try{const result=handler();db.exec("COMMIT");return result;}
 catch(err){db.exec("ROLLBACK");throw err;}
}
function checkedSlot(id){return slotMap.get(id)||null;}
export class AssortmentConflict extends Error{constructor(){super("Another change was saved. Refresh the editor before trying again.");this.status=409;}}
export class AssortmentInvalid extends Error{constructor(reason="Invalid concept details"){super(reason);this.status=400;}}

export function updateConcept(db,{id,version,title,description,notes,visible,editorId}){
 if(!checkedSlot(id))throw new AssortmentInvalid("Unknown assortment slot");
 const v=validVersion(version);
 if(!v||!isValidName(title,limits.title)||
    !isValidText(description,limits.description)||
    !isValidText(notes,limits.notes)||
    !Number.isSafeInteger(editorId))throw new AssortmentInvalid();
 const t=clean(title),d=clean(description),n=clean(notes);
 return transactional(db,()=>{
  const current=db.prepare("SELECT version FROM collection_concepts WHERE id=?").get(id);
  if(!current||current.version!==v)throw new AssortmentConflict();
  db.prepare("UPDATE collection_concepts SET title=?,description=?,notes=?,"+
    "preview_visible=?,version=version+1,updated_at=?,updated_by=? WHERE id=?")
    .run(t,d,n,visible?1:0,now(),editorId,id);
  doAudit(db,{id,userId:editorId,kind:"content",version:v+1});
  return v+1;
 });
}
export function updateBrand(db,{version,value,editorId}){
 const v=validVersion(version);
 if(!v||!isValidName(value,limits.brand)||!Number.isSafeInteger(editorId))
  throw new AssortmentInvalid("Enter a valid brand name (2–90 characters).");
 return transactional(db,()=>{
  const current=db.prepare("SELECT version FROM collection_branding WHERE key='vape_brand'").get();
  if(!current||current.version!==v)throw new AssortmentConflict();
  db.prepare("UPDATE collection_branding SET value=?,version=version+1,updated_at=?,updated_by=? WHERE key='vape_brand'")
   .run(clean(value),now(),editorId);
  doAudit(db,{id:"vape_brand",userId:editorId,kind:"brand",version:v+1});
  return v+1;
 });
}

function webpDimensions(buffer){
 // Re-encoded by the admin browser to discard EXIF metadata before transfer.
 if(buffer.length<30||buffer.toString("ascii",0,4)!=="RIFF"||
    buffer.toString("ascii",8,12)!=="WEBP"||
    buffer.readUInt32LE(4)!==buffer.length-8)return null;
 const fourcc=buffer.toString("ascii",12,16);
 let width,height;
 if(fourcc==="VP8X"){
  width=1+buffer.readUIntLE(24,3);height=1+buffer.readUIntLE(27,3);
 }else if(fourcc==="VP8 "){
  if(buffer.length<30||buffer[23]!==0x9d||buffer[24]!==0x01||buffer[25]!==0x2a)return null;
  width=buffer.readUInt16LE(26)&0x3fff;height=buffer.readUInt16LE(28)&0x3fff;
 }else if(fourcc==="VP8L"){
  if(buffer.length<25||buffer[20]!==0x2f)return null;
  const bits=buffer.readUInt32LE(21);
  width=(bits&0x3fff)+1;height=((bits>>>14)&0x3fff)+1;
 }else return null;
 if(!width||!height||width>2400||height>2400||width*height>4000000)return null;
 // Scan all chunks server-side: a manually crafted upload must not
 // smuggle EXIF location data, XMP, ICC, animation or unknown metadata.
 let cursor=12,seenImage=false;
 while(cursor+8<=buffer.length){
  const type=buffer.toString("ascii",cursor,cursor+4),size=buffer.readUInt32LE(cursor+4);
  if(size>maxImageBytes||cursor+8+size>buffer.length)return null;
  if(!["VP8X","VP8 ","VP8L","ALPH"].includes(type))return null;
  if(type==="VP8X" && (buffer[cursor+8]&0x3e)!==0)return null;
  if(type==="VP8 "||type==="VP8L")seenImage=true;
  cursor+=8+size+(size%2);
 }
 if(cursor!==buffer.length||!seenImage)return null;
 return {width,height};
}
async function bodyBytes(req){
 const chunks=[];let total=0;
 for await (const chunk of req){
  total+=chunk.length;
  if(total>maxImageBytes)throw new AssortmentInvalid("Artwork must be 2 MB or smaller.");
  chunks.push(chunk);
 }
 return Buffer.concat(chunks);
}
const keyValid=key=>/^[a-f0-9]{32}\.webp$/.test(key);
export function createAssortmentEditor({db,dbPath,respond,redirect,formBody,layout}){
 installAssortment(db);
 const fileDirectory=path.join(
  dbPath===":memory:"?process.cwd():path.dirname(path.resolve(dbPath)),"concept-art");
 // Keep mounted /data storage and SQLite next to each other.
 const rel=(key)=>path.join(fileDirectory,key);
 function renderEditor({user,notice=""}){
  const state=readAssortment(db);
  const csrf=escapeHtml(user.csrf);
  const nav='<nav class="assortment-editor-nav" aria-label="Assortment editor collections">'+
   '<a href="#edit-botanicals">Botanical varieties <b>4 slots</b></a>'+
   '<a href="#edit-vapes">Vape flavors <b>12 slots</b></a>'+
   '<a href="#edit-treats">Treat recipes <b>2 slots</b></a></nav>';
  const groups=[
   ["botanicals","Botanical varieties","Two core concept slots; two optional expansion slots"],
   ["vapes","Vape flavors","One brand with twelve editable flavor-design slots"],
   ["treats","Crispy treats","Two editable recipe and ingredient concept slots"]
  ].map(([family,title,subtitle])=>{
   const items=state.entries[family].map(row=>{
    const image=row.image_key&&keyValid(row.image_key)
      ?'<img src="/concept-media/'+row.image_key+'" alt="Uploaded concept artwork for '+escapeHtml(row.title)+'" loading="lazy">'
      :'<img src="/assets/collection-'+(family==="botanicals"?"botanical":family==="vapes"?"vape":"treat")+'.svg" alt="Original gold and emerald packaging concept" loading="lazy">';
    return '<article class="assortment-editor-card" id="edit-'+row.id+'">'+
      '<div class="assortment-editor-thumb">'+image+
      '<span>'+String(row.slot_order).padStart(2,"0")+'</span></div>'+
      '<div class="assortment-editor-content"><div class="assortment-editor-row"><strong>'+
       escapeHtml(row.title)+'</strong><small>v'+row.version+' · '+(row.preview_visible?"Preview visible":"Hidden")+'</small></div>'+
      '<details class="assortment-editor-details"><summary>Edit details &amp; artwork</summary>'+
      '<form method="post" action="/admin/assortment/entry" class="assortment-editor-form">'+
       '<input type="hidden" name="csrf" value="'+csrf+'">'+
       '<input type="hidden" name="slot_id" value="'+row.id+'">'+
       '<input type="hidden" name="version" value="'+row.version+'">'+
       '<label>Display name<input name="title" maxlength="90" minlength="2" required value="'+escapeHtml(row.title)+'"></label>'+
       '<label>Short description<textarea name="description" maxlength="420" rows="3">'+escapeHtml(row.description)+'</textarea></label>'+
       '<label>Full concept notes<textarea name="notes" maxlength="1000" rows="4">'+escapeHtml(row.notes)+'</textarea></label>'+
       '<label class="assortment-editor-check"><input type="checkbox" name="preview_visible" value="1"'+(row.preview_visible?" checked":"")+'><span>Show this draft slot in the private preview</span></label>'+
       '<button type="submit" class="private-button">Save concept</button>'+
      '</form>'+
      '<form data-concept-upload data-slot="'+row.id+'" data-version="'+row.version+'" class="assortment-upload-form">'+
       '<input type="hidden" name="csrf" value="'+csrf+'">'+
       '<label>Replace image (PNG/JPEG/WebP, up to 12MB before optimization)<input type="file" accept="image/png,image/jpeg,image/webp" required></label>'+
       '<button type="submit" class="private-button">Optimize &amp; upload image</button>'+
       '<p class="upload-result" role="status" aria-live="polite"></p>'+
      '</form>'+
      (row.image_key?'<form method="post" action="/admin/assortment/image/remove" class="assortment-remove-form">'+
        '<input type="hidden" name="csrf" value="'+csrf+'"><input type="hidden" name="slot_id" value="'+row.id+'">'+
        '<input type="hidden" name="version" value="'+row.version+'"><button type="submit">Remove custom image</button></form>':'')+
      '<p class="assortment-editor-hint">Artwork is stored on the private Railway volume; no stock, price, delivery or checkout changes.</p>'+
      '</details></div></article>';
   }).join("");
   return '<section class="assortment-editor-section" id="edit-'+family+'">'+
     '<h2>'+title+'</h2><p>'+subtitle+'</p>'+
     '<div class="assortment-editor-grid">'+items+'</div></section>';
  }).join("");
  const brand='<section class="assortment-brand-panel"><h2>Vape brand identity</h2>'+
    '<p>Edit the one brand name used above all twelve vape flavor concepts.</p>'+
    '<form action="/admin/assortment/brand" method="post">'+
     '<input type="hidden" name="csrf" value="'+csrf+'">'+
     '<input type="hidden" name="version" value="'+state.brand.version+'">'+
     '<label>Brand name<input name="brand" maxlength="90" minlength="2" required value="'+escapeHtml(state.brand.value)+'"></label>'+
     '<button type="submit" class="private-button">Save brand identity</button>'+
    '</form></section>';
  const audit=db.prepare(
   "SELECT e.slot_id,e.change_kind,e.version,e.created_at FROM collection_edits e "+
   "ORDER BY e.id DESC LIMIT 10").all()
   .map(x=>'<tr><td>'+escapeHtml(x.slot_id)+'</td><td>'+escapeHtml(x.change_kind)+
    '</td><td>v'+x.version+'</td><td>'+
    new Date(x.created_at).toISOString().slice(0,16).replace("T"," ")+' UTC</td></tr>').join("");
  const page='<section class="private-title assortment-title">'+
   '<span class="eyebrow">ADMINISTRATION / THE COLLECTION VAULT</span>'+
   '<h1>Assortment <em>Studio.</em></h1>'+
   '<p>Edit the planned 4 botanical, 12 vape and 2 treat concept slots. Preview updates save to persistent SQLite and appear in the private shop without redeployment.</p>'+
   '<p class="assortment-editor-limits">Private design environment only. No pricing, ordering, shipping or sale availability is managed here.</p>'+
   '<a class="wallet-monitor-return" href="/admin">← Back to operations</a>'+
   (notice?'<p class="form-ok" role="status">'+escapeHtml(notice)+'</p>':'')+
   '</section>'+nav+groups+brand+
   '<section class="assortment-editor-section"><h2>Recent edit activity</h2>'+
   '<div class="scroll-table"><table><thead><tr><th>Slot</th><th>Change</th><th>Version</th><th>UTC</th></tr></thead>'+
   '<tbody>'+(audit||'<tr><td colspan="4">No edits yet</td></tr>')+'</tbody></table></div></section>'+
   '<script src="/assortment-client.js" defer></script>';
  return layout("Assortment Studio",page,user,user.csrf);
 }
 const redirectMessage=(res,text,id="")=>redirect(res,"/admin/assortment?notice="+encodeURIComponent(text)+(id?"#edit-"+id:""));
 const formCsrf=(params,user)=>params.get("csrf")===user.csrf;
 function handleError(res,err){
  const code=Number.isInteger(err?.status)?err.status:400;
  return respond(res,code,err?.message||"Unable to save assortment changes","text/plain; charset=utf-8");
 }
 async function mediaRoute({req,res,pathname}){
  if(req.method!=="GET"||!pathname.startsWith("/concept-media/"))return false;
  const key=pathname.slice("/concept-media/".length);
  if(!keyValid(key))return respond(res,404,"Not found","text/plain; charset=utf-8"),true;
  const row=db.prepare("SELECT 1 FROM collection_concepts WHERE image_key=?").get(key);
  if(!row)return respond(res,404,"Not found","text/plain; charset=utf-8"),true;
  try {
   const data=fs.readFileSync(rel(key));
   return respond(res,200,data,"image/webp",{
    "Content-Security-Policy":"default-src 'none'; object-src 'none'; frame-ancestors 'none'",
    "Content-Disposition":'inline; filename="concept-art.webp"'
   }),true;
  }catch{return respond(res,404,"Not found","text/plain; charset=utf-8"),true;}
 }
 async function adminRoute({req,res,user,pathname,method,url}){
  if(!pathname.startsWith("/admin/assortment"))return false;
  if(user.role!=="admin"){
   respond(res,403,"Administrator access required","text/plain; charset=utf-8");
   return true;
  }
  if(method==="GET"&&pathname==="/admin/assortment"){
   const possible=new Set(["Concept saved","Brand name saved","Artwork uploaded","Artwork removed"]);
   const message=url.searchParams.get("notice");
   respond(res,200,renderEditor({user,notice:possible.has(message)?message:""}));
   return true;
  }
  if(method==="POST"&&pathname==="/admin/assortment/entry"){
   const params=await formBody(req);
   if(!formCsrf(params,user))return respond(res,403,"Invalid CSRF token","text/plain; charset=utf-8"),true;
   try{
    const id=clean(params.get("slot_id"));
    updateConcept(db,{
     id,version:params.get("version"),title:params.get("title"),
     description:params.get("description")??"",notes:params.get("notes")??"",
     visible:params.get("preview_visible")==="1",editorId:user.id
    });
    redirectMessage(res,"Concept saved",id);
   }catch(e){handleError(res,e);}
   return true;
  }
  if(method==="POST"&&pathname==="/admin/assortment/brand"){
   const params=await formBody(req);
   if(!formCsrf(params,user))return respond(res,403,"Invalid CSRF token","text/plain; charset=utf-8"),true;
   try{
    updateBrand(db,{version:params.get("version"),value:params.get("brand"),editorId:user.id});
    redirectMessage(res,"Brand name saved","vapes");
   }catch(e){handleError(res,e);}
   return true;
  }
  if(method==="POST"&&pathname==="/admin/assortment/image/remove"){
   const params=await formBody(req);
   if(!formCsrf(params,user))return respond(res,403,"Invalid CSRF token","text/plain; charset=utf-8"),true;
   try{
    const id=clean(params.get("slot_id")),v=validVersion(params.get("version"));
    if(!checkedSlot(id)||!v)throw new AssortmentInvalid();
    const previous=transactional(db,()=>{
     const current=db.prepare("SELECT image_key,version FROM collection_concepts WHERE id=?").get(id);
     if(!current||current.version!==v)throw new AssortmentConflict();
     db.prepare("UPDATE collection_concepts SET image_key=NULL,version=version+1,updated_by=?,updated_at=? WHERE id=?")
      .run(user.id,now(),id);
     doAudit(db,{id,userId:user.id,kind:"image_removed",version:v+1});
     return current.image_key;
    });
    if(previous&&keyValid(previous)){try{fs.unlinkSync(rel(previous));}catch{}}
    redirectMessage(res,"Artwork removed",id);
   }catch(e){handleError(res,e);}
   return true;
  }
  if(method==="POST"&&pathname==="/admin/assortment/image"){
   if(req.headers["x-csrf-token"]!==user.csrf){
    respond(res,403,"Invalid CSRF token","text/plain; charset=utf-8");return true;
   }
   const id=url.searchParams.get("slot_id"),version=validVersion(url.searchParams.get("version"));
   if(!checkedSlot(id)||!version||!allowed((req.headers["content-type"]||"").split(";")[0])){
    respond(res,400,"Invalid slot or artwork format","text/plain; charset=utf-8");return true;
   }
   let key,previous;
   try{
    const bytes=await bodyBytes(req);
    if(!webpDimensions(bytes))throw new AssortmentInvalid("Upload a valid WebP image no larger than 2400px and 2 MB.");
    fs.mkdirSync(fileDirectory,{recursive:true,mode:0o700});
    key=randomBytes(16).toString("hex")+".webp";
    fs.writeFileSync(rel(key),bytes,{flag:"wx",mode:0o600});
    previous=transactional(db,()=>{
     const existing=db.prepare("SELECT image_key,version FROM collection_concepts WHERE id=?").get(id);
     if(!existing||existing.version!==version)throw new AssortmentConflict();
     db.prepare("UPDATE collection_concepts SET image_key=?,version=version+1,updated_by=?,updated_at=? WHERE id=?")
      .run(key,user.id,now(),id);
     doAudit(db,{id,userId:user.id,kind:"image",version:version+1});
     return existing.image_key;
    });
    if(previous&&keyValid(previous))try{fs.unlinkSync(rel(previous));}catch{}
    respond(res,201,JSON.stringify({ok:true,version:version+1,src:"/concept-media/"+key}),
      "application/json; charset=utf-8");
   }catch(e){
    if(key)try{fs.unlinkSync(rel(key));}catch{}
    handleError(res,e);
   }
   return true;
  }
  return false;
 }
 return {renderEditor,mediaRoute,adminRoute,read:()=>readAssortment(db)};
}

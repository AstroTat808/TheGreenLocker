/**
 * Durable private galleries for concept artwork. A slot can hold up to eight
 * optimized WebP images. First image is the cover; changes use version checks.
 * No pricing, transactions, inventory, orders, or public image access.
 */
const FILE=/^[a-f0-9]{32}\.webp$/;
export const MAX_GALLERY_IMAGES=8;
export class GalleryError extends Error {
 constructor(message="Invalid gallery request",status=400){super(message);this.status=status;}
}
const version=v=>/^[1-9]\d{0,9}$/.test(String(v))?Number(v):null;
const transaction=(db,fn)=>{
 db.exec("BEGIN IMMEDIATE");
 try{const result=fn();db.exec("COMMIT");return result;}
 catch(e){db.exec("ROLLBACK");throw e;}
};
const galleryRows=(db,id)=>db.prepare("SELECT id,slot_id,file_key,alt_text,sort_order,uploaded_at "+
 "FROM collection_media WHERE slot_id=? ORDER BY sort_order,id").all(id);
const checked=(db,id,v,actor)=>{
 if(!Number.isSafeInteger(actor)||actor<=0)throw new GalleryError("Invalid editor");
 const row=db.prepare("SELECT version FROM collection_concepts WHERE id=?").get(id);
 if(!version(v)||!row||row.version!==version(v))
  throw new GalleryError("Gallery changed. Refresh this page before editing.",409);
 return row.version;
};
const bump=(db,id,actor,kind,v)=>{
 db.prepare("UPDATE collection_concepts SET version=version+1,updated_by=?,updated_at=? WHERE id=?")
  .run(actor,Date.now(),id);
 db.prepare("INSERT INTO collection_edits(slot_id,editor_id,change_kind,version,created_at) VALUES(?,?,?,?,?)")
  .run(id,actor,kind,v+1,Date.now());
};
const updateCover=(db,id)=>{
 const first=db.prepare("SELECT file_key FROM collection_media WHERE slot_id=? ORDER BY sort_order,id LIMIT 1").get(id);
 db.prepare("UPDATE collection_concepts SET image_key=? WHERE id=?").run(first?.file_key||null,id);
};
export function installGallery(db){
 db.exec(
  "CREATE TABLE IF NOT EXISTS collection_media ("+
  "id INTEGER PRIMARY KEY,slot_id TEXT NOT NULL REFERENCES collection_concepts(id) ON DELETE CASCADE,"+
  "file_key TEXT NOT NULL UNIQUE,alt_text TEXT NOT NULL DEFAULT '',"+
  "sort_order INTEGER NOT NULL,uploaded_by INTEGER REFERENCES users(id),uploaded_at INTEGER NOT NULL);"+
  "CREATE INDEX IF NOT EXISTS idx_collection_media_slot ON collection_media(slot_id,sort_order,id);"
 );
 // Preserve prior single-image artwork without changing its filename or record.
 const existing=db.prepare("SELECT id,image_key FROM collection_concepts WHERE image_key IS NOT NULL").all();
 const insert=db.prepare("INSERT OR IGNORE INTO collection_media(slot_id,file_key,alt_text,sort_order,uploaded_at) VALUES(?,?,?,?,?)");
 for(const item of existing){
  if(FILE.test(item.image_key))insert.run(item.id,item.image_key,"",1,Date.now());
 }
}
export const galleryFor=(db,id)=>galleryRows(db,id);
export function galleriesForAll(db){
 const all=db.prepare("SELECT id,slot_id,file_key,alt_text,sort_order,uploaded_at FROM collection_media ORDER BY slot_id,sort_order,id").all();
 const result=new Map();
 for(const item of all){
  if(!result.has(item.slot_id))result.set(item.slot_id,[]);
  result.get(item.slot_id).push(item);
 }
 return result;
}
export function appendGalleryImage(db,{slotId,expectedVersion,key,description="",editorId}){
 if(!FILE.test(key)||typeof description!=="string"||description.length>140||
   /[\u0000-\u001f\u007f]/.test(description))throw new GalleryError("Invalid image or description");
 return transaction(db,()=>{
  const v=checked(db,slotId,expectedVersion,editorId),rows=galleryRows(db,slotId);
  if(rows.length>=MAX_GALLERY_IMAGES)throw new GalleryError("Maximum eight images per concept");
  const inserted=db.prepare("INSERT INTO collection_media(slot_id,file_key,alt_text,sort_order,uploaded_by,uploaded_at) VALUES(?,?,?,?,?,?)")
    .run(slotId,key,description.trim(),(rows.at(-1)?.sort_order||0)+1,editorId,Date.now());
  updateCover(db,slotId);bump(db,slotId,editorId,"gallery_add",v);
  return {id:Number(inserted.lastInsertRowid),version:v+1,count:rows.length+1};
 });
}
export function reorderGallery(db,{slotId,expectedVersion,ids,editorId}){
 if(!Array.isArray(ids)||ids.length>MAX_GALLERY_IMAGES||ids.some(x=>!Number.isSafeInteger(x)||x<=0)||
   new Set(ids).size!==ids.length)throw new GalleryError("Invalid image ordering");
 return transaction(db,()=>{
  const v=checked(db,slotId,expectedVersion,editorId),existing=galleryRows(db,slotId);
  const known=new Set(existing.map(x=>x.id));
  if(ids.length!==existing.length||ids.some(x=>!known.has(x)))
    throw new GalleryError("Order must include all images from this concept exactly once");
  for(const [index,id] of ids.entries())
   db.prepare("UPDATE collection_media SET sort_order=? WHERE id=? AND slot_id=?").run(index+1,id,slotId);
  updateCover(db,slotId);bump(db,slotId,editorId,"gallery_order",v);
  return {version:v+1,coverId:ids[0]||null};
 });
}
export function removeGalleryImage(db,{slotId,expectedVersion,imageId,editorId}){
 if(!Number.isSafeInteger(imageId)||imageId<=0)throw new GalleryError("Invalid image ID");
 return transaction(db,()=>{
  const v=checked(db,slotId,expectedVersion,editorId);
  const item=db.prepare("SELECT file_key FROM collection_media WHERE id=? AND slot_id=?").get(imageId,slotId);
  if(!item)throw new GalleryError("Image not found",404);
  db.prepare("DELETE FROM collection_media WHERE id=? AND slot_id=?").run(imageId,slotId);
  for(const [index,row] of galleryRows(db,slotId).entries())
   db.prepare("UPDATE collection_media SET sort_order=? WHERE id=? AND slot_id=?").run(index+1,row.id,slotId);
  updateCover(db,slotId);bump(db,slotId,editorId,"gallery_remove",v);
  return {removedKey:item.file_key,version:v+1};
 });
}
export function setGalleryCaption(db,{slotId,expectedVersion,imageId,description,editorId}){
 if(!Number.isSafeInteger(imageId)||imageId<=0||typeof description!=="string"||
    description.length>140||/[\u0000-\u001f\u007f]/.test(description))
   throw new GalleryError("Invalid image description");
 return transaction(db,()=>{
  const v=checked(db,slotId,expectedVersion,editorId);
  const changed=db.prepare("UPDATE collection_media SET alt_text=? WHERE id=? AND slot_id=?")
   .run(description.trim(),imageId,slotId);
  if(!changed.changes)throw new GalleryError("Image not found",404);
  bump(db,slotId,editorId,"gallery_caption",v);
  return {version:v+1};
 });
}

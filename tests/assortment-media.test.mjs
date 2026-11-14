import test from "node:test";
import assert from "node:assert/strict";
import {openDb} from "../private/server.mjs";
import {createAssortmentEditor} from "../private/assortment-editor.mjs";
import {
 installGallery,galleryFor,galleriesForAll,appendGalleryImage,reorderGallery,
 removeGalleryImage,setGalleryCaption,GalleryError,MAX_GALLERY_IMAGES
} from "../private/assortment-media.mjs";
import {renderCollectionConcepts} from "../private/catalog-collections.mjs";
const file=i=>i.toString(16).padStart(32,"0")+".webp";
const layout=(_title,body)=>body;
function setup(){
 const db=openDb(":memory:");
 const id=Number(db.prepare(
   "INSERT INTO users(email,salt,password_hash,role) VALUES(?,?,?,'admin')"
 ).run("gallery@example.test","salt","hash").lastInsertRowid);
 const editor=createAssortmentEditor({
  db,dbPath:":memory:",layout,formBody:async req=>new URLSearchParams(req.body||""),
  respond:(res,code,body,type)=>{res.status=code;res.body=body;res.type=type;},
  redirect:(res,url)=>{res.status=303;res.location=url;}
 });
 return {db,editor,id};
}
const add=(db,editorId,slotId,v,i)=>appendGalleryImage(db,{
 slotId,expectedVersion:v,key:file(i),description:"Image "+i,editorId
});
test("legacy cover migration preserves the existing single-image record",()=>{
 const {db,id}=setup();
 try{
  db.prepare("UPDATE collection_concepts SET image_key=? WHERE id='botanical-01'").run(file(1));
  installGallery(db);
  installGallery(db);
  assert.equal(galleryFor(db,"botanical-01").length,1);
  assert.equal(galleryFor(db,"botanical-01")[0].file_key,file(1));
  assert.equal(db.prepare("SELECT image_key FROM collection_concepts WHERE id='botanical-01'").get().image_key,file(1));
 }finally{db.close();}
});
test("eight private photos, reordering, cover synchronization and captioning survive reads",()=>{
 const {db,editor,id}=setup();
 try{
  for(let i=1;i<=MAX_GALLERY_IMAGES;i++)assert.equal(add(db,id,"botanical-01",i,i).version,i+1);
  assert.equal(galleryFor(db,"botanical-01").length,8);
  assert.throws(()=>add(db,id,"botanical-01",9,15),GalleryError);
  assert.equal(db.prepare("SELECT image_key FROM collection_concepts WHERE id='botanical-01'").get().image_key,file(1));
  let photos=galleryFor(db,"botanical-01");
  const reversed=photos.map(x=>x.id).reverse();
  const reordered=reorderGallery(db,{slotId:"botanical-01",expectedVersion:9,ids:reversed,editorId:id});
  assert.equal(reordered.version,10);
  photos=galleryFor(db,"botanical-01");
  assert.deepEqual(photos.map(x=>x.id),reversed);
  assert.equal(db.prepare("SELECT image_key FROM collection_concepts WHERE id='botanical-01'").get().image_key,file(8));
  assert.throws(()=>reorderGallery(db,{slotId:"botanical-01",expectedVersion:10,ids:[reversed[0],reversed[0]],editorId:id}),GalleryError);
  assert.throws(()=>reorderGallery(db,{slotId:"botanical-01",expectedVersion:10,ids:[...reversed.slice(0,7),99999],editorId:id}),GalleryError);
  assert.throws(()=>reorderGallery(db,{slotId:"vape-flavor-01",expectedVersion:1,ids:reversed,editorId:id}),GalleryError);
  assert.equal(setGalleryCaption(db,{slotId:"botanical-01",expectedVersion:10,imageId:reversed[0],description:"Gold pouch front",editorId:id}).version,11);
  const state=editor.read();
  assert.equal(state.entries.botanicals[0].images.length,8);
  assert.equal(state.entries.botanicals[0].images[0].alt_text,"Gold pouch front");
  assert.equal(state.entries.botanicals[0].image_key,file(8));
  assert.equal(galleriesForAll(db).get("botanical-01").length,8);
  const shop=renderCollectionConcepts(state);
  assert.match(shop,/data-concept-gallery/);
  assert.match(shop,/Previous Variety 01 image/);
  assert.match(shop,/8 \/ 8/);
  assert.match(shop,/Gold pouch front/);
  assert.doesNotMatch(shop,/<form|\/checkout|\/cart|shipping-fee/i);
  const del=removeGalleryImage(db,{slotId:"botanical-01",expectedVersion:11,imageId:reversed[0],editorId:id});
  assert.equal(del.removedKey,file(8));
  assert.equal(del.version,12);
  assert.equal(db.prepare("SELECT image_key FROM collection_concepts WHERE id='botanical-01'").get().image_key,file(7));
  assert.deepEqual(galleryFor(db,"botanical-01").map(x=>x.sort_order),[1,2,3,4,5,6,7]);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM collection_edits WHERE slot_id='botanical-01'").get().n,11);
 }finally{db.close();}
});
test("stale revisions, cross-slot image deletion, invalid names and metadata are rejected",()=>{
 const {db,id}=setup();
 try{
  add(db,id,"treat-01",1,66);
  const photo=galleryFor(db,"treat-01")[0];
  assert.throws(()=>reorderGallery(db,{slotId:"treat-01",expectedVersion:1,ids:[photo.id],editorId:id}),
    e=>e instanceof GalleryError && e.status===409);
  assert.throws(()=>removeGalleryImage(db,{slotId:"treat-02",expectedVersion:1,imageId:photo.id,editorId:id}),
    e=>e.status===404);
  assert.throws(()=>setGalleryCaption(db,{slotId:"treat-01",expectedVersion:2,imageId:photo.id,description:"X".repeat(141),editorId:id}),GalleryError);
  assert.throws(()=>appendGalleryImage(db,{slotId:"treat-01",expectedVersion:2,key:"../private",editorId:id}),GalleryError);
  assert.throws(()=>appendGalleryImage(db,{slotId:"treat-01",expectedVersion:2,key:file(77),description:"bad\ncontrol",editorId:id}),GalleryError);
  assert.equal(galleryFor(db,"treat-01").length,1);
  assert.equal(galleryFor(db,"treat-02").length,0);
 }finally{db.close();}
});
test("member cannot operate galleries and JSON mutations require the correct CSRF header",async()=>{
 const {db,editor,id}=setup();
 const request=(body,csrf="incorrect")=>({
  headers:{"content-type":"application/json","x-csrf-token":csrf},
  async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify(body));}
 });
 try{
  add(db,id,"botanical-01",1,12);
  let response={};
  await editor.adminRoute({
   req:request({slot_id:"botanical-01",version:2,ids:galleryFor(db,"botanical-01").map(x=>x.id)},"good"),
   res:response,user:{id,csrf:"good",role:"member"},
   pathname:"/admin/assortment/gallery/order",method:"POST",
   url:new URL("https://example.test/admin/assortment/gallery/order")
  });
  assert.equal(response.status,403);
  response={};
  await editor.adminRoute({
   req:request({slot_id:"botanical-01",version:2,ids:galleryFor(db,"botanical-01").map(x=>x.id)},"wrong"),
   res:response,user:{id,csrf:"good",role:"admin"},
   pathname:"/admin/assortment/gallery/order",method:"POST",
   url:new URL("https://example.test/admin/assortment/gallery/order")
  });
  assert.equal(response.status,403);
  response={};
  await editor.adminRoute({
   req:request({slot_id:"botanical-01",version:2,ids:galleryFor(db,"botanical-01").map(x=>x.id)},"good"),
   res:response,user:{id,csrf:"good",role:"admin"},
   pathname:"/admin/assortment/gallery/order",method:"POST",
   url:new URL("https://example.test/admin/assortment/gallery/order")
  });
  assert.equal(response.status,200);
  assert.equal(JSON.parse(response.body).version,3);
 }finally{db.close();}
});

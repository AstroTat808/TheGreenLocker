import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {openDb} from "../private/server.mjs";
import {CONCEPT_COLLECTIONS,renderCollectionConcepts} from "../private/catalog-collections.mjs";
import {
 createAssortmentEditor,readAssortment,updateConcept,updateBrand,
 AssortmentConflict,AssortmentInvalid
} from "../private/assortment-editor.mjs";
const webp=Buffer.from("UklGRi4AAABXRUJQVlA4ICIAAABwAQCdASoKAAoAAkA8JYgCdAF1AAD+9pUpufXrp7v+4AAA","base64");
const p=(req)=>new URLSearchParams(req.body||"");
const r=(res,status,body,type="text/html; charset=utf-8")=>{
 res.status=status;res.body=body;res.type=type;
};
const red=(res,to)=>{res.status=303;res.to=to;};
const layout=(_title,body)=>body;
const harness=(db,dbPath)=>createAssortmentEditor({db,dbPath,respond:r,redirect:red,formBody:async req=>p(req),layout});
function user(db){
 return {id:Number(db.prepare("INSERT INTO users(email,salt,password_hash,role) VALUES(?,?,?,'admin')")
  .run("studio@example.test","salt","hash").lastInsertRowid),csrf:"unit-csrf",role:"admin"};
}
const snapshot=editor=>editor.read();
test("18 persistent concept slots, one vape brand, no changes to legacy product inventory",t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"tgl-assortment-"));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const dbPath=path.join(dir,"staging.sqlite");
 const db=openDb(dbPath);
 const admin=user(db);
 const before=db.prepare("SELECT COUNT(*) n FROM products").get().n;
 const studio=harness(db,dbPath);
 const state=snapshot(studio);
 assert.equal(state.entries.botanicals.length,4);
 assert.equal(state.entries.vapes.length,12);
 assert.equal(state.entries.treats.length,2);
 assert.equal(state.brand.value,"Brand name pending");
 assert.ok(Object.values(state.entries).flat().every(x=>x.preview_visible===1));
 assert.equal(db.prepare("SELECT COUNT(*) n FROM products").get().n,before);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM movements").get().n,0);
 studio.read();
 const again=harness(db,dbPath);
 assert.deepEqual(again.read().entries,state.entries);
 const version=updateConcept(db,{id:"botanical-01",version:1,title:"Ocean Glimmer",
   description:"A premium design-only concept with editable notes.",notes:"Internal draft notes.",
   visible:true,editorId:admin.id});
 assert.equal(version,2);
 assert.throws(()=>updateConcept(db,{id:"botanical-01",version:1,title:"Stale write",
  description:"",notes:"",visible:true,editorId:admin.id}),AssortmentConflict);
 assert.throws(()=>updateConcept(db,{id:"botanical-01",version:2,title:"a",description:"",
  notes:"",visible:true,editorId:admin.id}),AssortmentInvalid);
 assert.equal(updateBrand(db,{version:1,value:"The Night Vault",editorId:admin.id}),2);
 assert.throws(()=>updateBrand(db,{version:1,value:"Different",editorId:admin.id}),AssortmentConflict);
 assert.equal(updateConcept(db,{id:"botanical-04",version:1,title:"Variety 04",
  description:"Optional expansion concept",notes:"",visible:false,editorId:admin.id}),2);
 const html=renderCollectionConcepts(studio.read());
 assert.match(html,/Ocean Glimmer/);
 assert.match(html,/The Night Vault/);
 assert.equal((html.match(/collection-concept-botanical"/g)||[]).length,3);
 assert.equal((html.match(/class="collection-flavor"/g)||[]).length,12);
 assert.equal((html.match(/collection-concept-treat"/g)||[]).length,2);
 assert.doesNotMatch(html,/\/checkout|\/cart|<form|shipping-fee|\$10/i);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM collection_edits").get().n,3);
 db.close();
 const reopened=openDb(dbPath);
 const reloaded=harness(reopened,dbPath);
 assert.equal(reloaded.read().entries.botanicals[0].title,"Ocean Glimmer");
 assert.equal(reloaded.read().brand.value,"The Night Vault");
 assert.equal(reloaded.read().entries.botanicals[3].preview_visible,0);
 reopened.close();
});

test("escaped HTML, length limits and admin-only handling protect concept fields",async()=>{
 const db=openDb(":memory:");
 try{
  const admin=user(db),editor=harness(db,":memory:");
  updateConcept(db,{id:"vape-flavor-02",version:1,title:"<script>alert(1)</script>",
   description:"<img src=x onerror=alert(1)>",notes:"Internal only",visible:true,editorId:admin.id});
  const shop=renderCollectionConcepts(editor.read());
  assert.match(shop,/&lt;script&gt;/);
  assert.doesNotMatch(shop,/<script>alert|<img src=x onerror=/);
  const form=editor.renderEditor({user:admin});
  assert.match(form,/&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(form,/<h1>Assortment <em>Studio\.<\/em><\/h1>/);
  assert.throws(()=>updateConcept(db,{id:"treat-01",version:1,title:"x".repeat(91),
   description:"",notes:"",visible:true,editorId:admin.id}),AssortmentInvalid);
  const notAdmin={...admin,role:"member"};
  let result={};
  await editor.adminRoute({req:{},res:result,user:notAdmin,pathname:"/admin/assortment",
    method:"GET",url:new URL("http://local/admin/assortment")});
  assert.equal(result.status,403);
  result={};
  await editor.adminRoute({req:{body:"csrf=incorrect&slot_id=treat-01&version=1&title=Testing"},res:result,user:admin,
    pathname:"/admin/assortment/entry",method:"POST",url:new URL("http://local/admin/assortment/entry")});
  assert.equal(result.status,403);
  result={};
  await editor.adminRoute({req:{body:new URLSearchParams({
   csrf:admin.csrf,slot_id:"treat-01",version:"1",title:"Amber Cocoa",
   description:"A neutral recipe design.",notes:"No factual ingredients confirmed.",preview_visible:"1"
  }).toString()},res:result,user:admin,pathname:"/admin/assortment/entry",
   method:"POST",url:new URL("http://local/admin/assortment/entry")});
  assert.equal(result.status,303);
  assert.match(result.to,/Concept%20saved/);
  assert.equal(editor.read().entries.treats[0].title,"Amber Cocoa");
 }finally{db.close();}
});

test("artwork upload verifies user CSRF, WebP magic, dimensions, metadata and optimistic version",async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"tgl-assortment-media-"));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const dbPath=path.join(dir,"stage.sqlite"),db=openDb(dbPath);
 t.after(()=>db.close());
 const admin=user(db),editor=harness(db,dbPath);
 const url=new URL("http://local/admin/assortment/image?slot_id=treat-02&version=1");
 const upload=async(bytes,csrf=admin.csrf,versionUrl=url)=>{
  const res={};
  const req={headers:{"x-csrf-token":csrf,"content-type":"image/webp"},
   async *[Symbol.asyncIterator](){yield bytes;}};
  const handled=await editor.adminRoute({req,res,user:admin,pathname:"/admin/assortment/image",
    method:"POST",url:versionUrl});
  assert.equal(handled,true);
  return res;
 };
 let result=await upload(webp,"incorrect");
 assert.equal(result.status,403);
 result=await upload(Buffer.from("<script>bad</script>"));
 assert.equal(result.status,400);
 const withMeta=Buffer.concat([webp,Buffer.from("EXIF"),Buffer.from([4,0,0,0]),Buffer.from("TEST")]);
 withMeta.writeUInt32LE(withMeta.length-8,4);
 result=await upload(withMeta);
 assert.equal(result.status,400,"XMP/EXIF payload cannot be stored.");
 result=await upload(webp);
 assert.equal(result.status,201);
 const payload=JSON.parse(result.body);
 assert.equal(payload.ok,true);
 assert.equal(payload.version,2);
 assert.match(payload.src,/^\/concept-media\/[a-f0-9]{32}\.webp$/);
 const mediaKey=payload.src.split("/").at(-1);
 assert.deepEqual(fs.readFileSync(path.join(dir,"concept-art",mediaKey)),webp);
 assert.equal(fs.statSync(path.join(dir,"concept-art",mediaKey)).mode&0o777,0o600);
 result=await upload(webp);
 assert.equal(result.status,409,"Stale image upload refused.");
 const media={};
 await editor.mediaRoute({req:{method:"GET"},res:media,pathname:payload.src});
 assert.equal(media.status,200);
 assert.equal(media.type,"image/webp");
 assert.deepEqual(media.body,webp);
 let hidden={};
 await editor.mediaRoute({req:{method:"GET"},res:hidden,pathname:"/concept-media/../../etc/passwd"});
 assert.equal(hidden.status,404);
 const shop=renderCollectionConcepts(editor.read());
 assert.ok(shop.includes(payload.src));
 let removed={};
 await editor.adminRoute({req:{
  body:new URLSearchParams({csrf:admin.csrf,slot_id:"treat-02",version:"2"}).toString()
 },res:removed,user:admin,pathname:"/admin/assortment/image/remove",
 method:"POST",url:new URL("http://local/admin/assortment/image/remove")});
 assert.equal(removed.status,303);
 assert.equal(editor.read().entries.treats[1].image_key,null);
 assert.ok(!fs.existsSync(path.join(dir,"concept-art",mediaKey)));
});

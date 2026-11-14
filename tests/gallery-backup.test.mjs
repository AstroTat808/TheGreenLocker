import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {openDb} from "../private/server.mjs";
import {createAssortmentEditor} from "../private/assortment-editor.mjs";
import {appendGalleryImage} from "../private/assortment-media.mjs";
import {createGallerySnapshot,verifyGallerySnapshot} from "../scripts/gallery-backup.mjs";
const sample=Buffer.from("UklGRi4AAABXRUJQVlA4ICIAAABwAQCdASoKAAoAAkA8JYgCdAF1AAD+9pUpufXrp7v+4AAA","base64");
const imageKey="abc123ab".repeat(4)+".webp";
test("SQLite gallery snapshot restores media, passes integrity and detects tampering",async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"tgl-gallery-backup-"));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const sourceDir=path.join(root,"live"),outside=path.join(root,"offsite");
 fs.mkdirSync(sourceDir,{mode:0o700});
 const sqlite=path.join(sourceDir,"preview.sqlite"),db=openDb(sqlite);
 const userId=Number(db.prepare("INSERT INTO users(email,salt,password_hash,role) VALUES(?,?,?,'admin')")
  .run("backup@example.test","salt","hash").lastInsertRowid);
 createAssortmentEditor({db,dbPath:sqlite,layout:(_t,body)=>body,
  respond:()=>{},redirect:()=>{},formBody:async()=>new URLSearchParams()});
 const dir=path.join(sourceDir,"concept-art");
 fs.mkdirSync(dir,{mode:0o700});
 fs.writeFileSync(path.join(dir,imageKey),sample,{mode:0o600});
 const result=appendGalleryImage(db,{
  slotId:"botanical-01",expectedVersion:1,key:imageKey,editorId:userId
 });
 assert.equal(result.version,2);
 const snapshot=path.join(outside,"snapshot-001");
 const receipt=await createGallerySnapshot({dbPath:sqlite,dataDirectory:sourceDir,destination:snapshot});
 assert.equal(receipt.ok,true);
 assert.equal(receipt.images,1);
 assert.deepEqual(fs.readFileSync(path.join(snapshot,"concept-art",imageKey)),sample);
 assert.equal(verifyGallerySnapshot(snapshot).images,1);
 assert.throws(()=>fs.readFileSync(path.join(outside,"snapshot-002","manifest.json")));
 assert.equal(fs.statSync(path.join(snapshot,"snapshot.sqlite")).mode&0o777,0o600);
 fs.writeFileSync(path.join(snapshot,"concept-art",imageKey),Buffer.from("modified"));
 assert.throws(()=>verifyGallerySnapshot(snapshot),/digest mismatch/i);
 await assert.rejects(()=>createGallerySnapshot({
  dbPath:sqlite,dataDirectory:sourceDir,destination:path.join(sourceDir,"unsafe-backup")
 }),/outside the source data volume/);
 db.close();
});
test("backup fails closed for missing original gallery media and cleans partial snapshot",async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"tgl-gallery-missing-"));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const data=path.join(root,"data");fs.mkdirSync(data);
 const source=path.join(data,"gallery.sqlite"),db=openDb(source);
 const id=Number(db.prepare("INSERT INTO users(email,salt,password_hash,role) VALUES(?,?,?,'admin')")
  .run("gallery2@example.test","salt","hash").lastInsertRowid);
 createAssortmentEditor({db,dbPath:source,layout:(_t,b)=>b,
  respond:()=>{},redirect:()=>{},formBody:async()=>new URLSearchParams()});
 appendGalleryImage(db,{slotId:"vape-flavor-01",expectedVersion:1,key:imageKey,editorId:id});
 const dest=path.join(root,"external","backup");
 await assert.rejects(()=>createGallerySnapshot({dbPath:source,dataDirectory:data,destination:dest}),
  /Missing or oversized gallery image/);
 assert.equal(fs.existsSync(dest),false,"Never retain a silently incomplete backup.");
 db.close();
});

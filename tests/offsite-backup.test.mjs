import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import {randomBytes} from "node:crypto";
import {openDb} from "../private/server.mjs";
import {createAssortmentEditor} from "../private/assortment-editor.mjs";
import {appendGalleryImage} from "../private/assortment-media.mjs";
import {installBackupWriteGuard,runAndVerifyOffsiteBackup,
 restoreEncryptedBackup} from "../scripts/offsite-backup.mjs";
const tinyWebp=Buffer.from("UklGRi4AAABXRUJQVlA4ICIAAABwAQCdASoKAAoAAkA8JYgCdAF1AAD+9pUpufXrp7v+4AAA","base64");
const key=randomBytes(32).toString("hex");
const fixture={
 inviteCode:"fixture-invite-12345",mfaKey:randomBytes(32).toString("base64"),
 memberEmail:"preview-member@example.test",memberPassword:"private-member-pass",
 adminEmail:"preview-admin@example.test",adminPassword:"private-admin-pass"
};
test("encrypted offsite upload/readback restores SQLite, gallery and MFA credentials",async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"tgl-backup-ci-"));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const data=path.join(root,"live"),objects=path.join(root,"remote");
 fs.mkdirSync(data);fs.mkdirSync(objects);
 const dbPath=path.join(data,"preview.sqlite"),db=openDb(dbPath);
 const userId=Number(db.prepare("INSERT INTO users(email,salt,password_hash,role) VALUES(?,?,?,'admin')")
  .run("backup-admin@example.test","salt","hash").lastInsertRowid);
 createAssortmentEditor({db,dbPath,layout:(_title,html)=>html,
  respond:()=>{},redirect:()=>{},formBody:async()=>new URLSearchParams()});
 const art=path.join(data,"concept-art");fs.mkdirSync(art);
 const fileKey="deadbeef".repeat(4)+".webp";
 fs.writeFileSync(path.join(art,fileKey),tinyWebp);
 appendGalleryImage(db,{slotId:"botanical-01",expectedVersion:1,key:fileKey,editorId:userId});
 fs.writeFileSync(path.join(data,"credentials.json"),JSON.stringify(fixture));
 fs.writeFileSync(path.join(data,"email-outbox.ndjson"),JSON.stringify({to:"sample@example.test"})+"\n");
 const store={
  async putFile(k,f){const dest=path.join(objects,k);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(f,dest);},
  async getFile(k,f){fs.copyFileSync(path.join(objects,k),f);}
 };
 const first=await runAndVerifyOffsiteBackup({dataDirectory:data,dbPath,masterHex:key,objectStore:store});
 assert.equal(first.images,1);
 assert.equal(first.users,1);
 assert.equal(first.credentialsIncluded,true);
 assert.match(first.objectKey,/^daily\/\d{4}-\d{2}-\d{2}\/[a-f0-9]{24}\.tglbk$/);
 const marker=JSON.parse(fs.readFileSync(path.join(data,"backup-status.json"),"utf8"));
 assert.equal(marker.encryptedSha256,first.encryptedSha256);
 const second=await runAndVerifyOffsiteBackup({dataDirectory:data,dbPath,masterHex:key,objectStore:store});
 assert.equal(second.skipped,true);
 const encrypted=path.join(objects,first.objectKey);
 const restored=path.join(root,"restore-copy");
 const details=await restoreEncryptedBackup({encrypted,masterHex:key,targetDirectory:restored});
 assert.equal(details.images,1);assert.equal(details.users,1);
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(restored,"credentials.json"),"utf8")),fixture);
 assert.deepEqual(fs.readFileSync(path.join(restored,"concept-art",fileKey)),tinyWebp);
 assert.ok(fs.existsSync(path.join(restored,"preview.sqlite")));
 assert.equal(fs.statSync(path.join(restored,"credentials.json")).mode&0o777,0o600);
 await assert.rejects(()=>restoreEncryptedBackup({
  encrypted,masterHex:randomBytes(32).toString("hex"),
  targetDirectory:path.join(root,"wrong-key")
 }),/authentication|decryption/i);
 assert.equal(fs.existsSync(path.join(root,"wrong-key")),false);
 const tampered=path.join(root,"tampered.tglbk");fs.copyFileSync(encrypted,tampered);
 const handle=fs.openSync(tampered,"r+");const at=Buffer.from([0x80]);fs.writeSync(handle,at,0,1,32);fs.closeSync(handle);
 await assert.rejects(()=>restoreEncryptedBackup({
  encrypted:tampered,masterHex:key,targetDirectory:path.join(root,"tampered-output")
 }),/authentication|decryption/i);
 assert.equal(fs.existsSync(path.join(root,"tampered-output")),false);
 assert.rejects(()=>restoreEncryptedBackup({
  encrypted,masterHex:key,targetDirectory:restored
 }),/destination exists/);
 db.close();
});
test("write quiescence rejects incoming updates without interrupting safe reads",async t=>{
 const server=http.createServer((req,res)=>{
  res.writeHead(200,{"Content-Type":"text/plain"});res.end(req.method==="POST"?"written":"readable");
 });
 const guard=installBackupWriteGuard(server);
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 t.after(()=>server.close());
 const url="http://127.0.0.1:"+server.address().port;
 await guard.exclusive(async()=>{
  const read=await fetch(url);assert.equal(read.status,200);
  const write=await fetch(url,{method:"POST"});assert.equal(write.status,503);
  assert.equal(write.headers.get("retry-after"),"20");
 });
 const after=await fetch(url,{method:"POST"});
 assert.equal(after.status,200);
});
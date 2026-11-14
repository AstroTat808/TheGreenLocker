import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {randomBytes} from "node:crypto";
import {backupOperationsSnapshot,saveBackupPolicy,readBackupPolicy,
 recordBackupEvent,dispatchBackupFailureAlert,renderBackupOperationsPage} from "../private/backup-operations.mjs";
import {openDb} from "../private/server.mjs";
import {createAssortmentEditor} from "../private/assortment-editor.mjs";
import {appendGalleryImage} from "../private/assortment-media.mjs";
import {runAndVerifyOffsiteBackup,previewBackupRetention,
 enforceBackupRetention} from "../scripts/offsite-backup.mjs";

const fixture={
 inviteCode:"invite-code-for-test",mfaKey:randomBytes(32).toString("base64"),
 memberEmail:"member@example.test",memberPassword:"mock-password",
 adminEmail:"admin@example.test",adminPassword:"mock-admin-password"
};
const sample=Buffer.from("UklGRi4AAABXRUJQVlA4ICIAAABwAQCdASoKAAoAAkA8JYgCdAF1AAD+9pUpufXrp7v+4AAA","base64");
const newRoot=t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"tgl-backup-ops-"));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 return dir;
};
test("authenticated dashboard snapshot handles missing, healthy, stale and degraded copies",t=>{
 const dir=newRoot(t),now=Date.parse("2026-11-14T18:00:00Z");
 let snapshot=backupOperationsSnapshot(dir,{},now);
 assert.equal(snapshot.status,"missing");
 assert.equal(snapshot.ageHours,null);
 fs.writeFileSync(path.join(dir,"backup-status.json"),JSON.stringify({
  verifiedAt:"2026-11-14T12:00:00Z",images:3,users:2,objectKey:"daily/2026-11-14/"+"a".repeat(24)+".tglbk",bytes:400
 }));
 snapshot=backupOperationsSnapshot(dir,{},now);
 assert.equal(snapshot.status,"healthy");
 assert.equal(snapshot.ageHours,6);
 assert.equal(snapshot.images,3);
 snapshot=backupOperationsSnapshot(dir,{TGL_BACKUP_SECONDARY_S3_ENDPOINT:"https://external.example"},now);
 assert.equal(snapshot.status,"degraded");
 snapshot=backupOperationsSnapshot(dir,{},now+27*60*60*1000);
 assert.equal(snapshot.status,"stale");
 const markup=renderBackupOperationsPage(snapshot,{
  layout:(_title,body)=>body,user:{role:"admin"},csrf:"csrf-value"
 });
 assert.match(markup,/Encrypted Backup Operations/);
 assert.match(markup,/name="csrf"/);
 assert.doesNotMatch(markup,/mfaKey|inviteCode|adminPassword/);
});
test("retention policy is conservative and never enables deletion without verified mirror",t=>{
 const dir=newRoot(t);
 assert.deepEqual(readBackupPolicy(dir),{retentionDays:90,mode:"dry-run",minimumCopies:14});
 assert.throws(()=>saveBackupPolicy(dir,{retentionDays:7,mode:"enforce",confirmation:"DELETE EXPIRED BACKUPS",secondaryVerified:true}));
 assert.throws(()=>saveBackupPolicy(dir,{retentionDays:90,mode:"enforce",confirmation:"DELETE EXPIRED BACKUPS",secondaryVerified:false}));
 let policy=saveBackupPolicy(dir,{retentionDays:120,mode:"dry-run"});
 assert.equal(policy.mode,"dry-run");
 assert.equal(readBackupPolicy(dir).retentionDays,120);
 assert.throws(()=>saveBackupPolicy(dir,{retentionDays:120,mode:"enforce",confirmation:"wrong",secondaryVerified:true}));
 policy=saveBackupPolicy(dir,{retentionDays:120,mode:"enforce",confirmation:"DELETE EXPIRED BACKUPS",secondaryVerified:true});
 assert.equal(policy.mode,"enforce");
});
test("backup history is persisted without confidential file contents",t=>{
 const dir=newRoot(t);
 recordBackupEvent(dir,{type:"failure",target:"railway",code:"S3_TIMEOUT",reason:"network fault [secret]"});
 recordBackupEvent(dir,{type:"verified",target:"dual",code:"TWO_RESTORES"});
 const s=backupOperationsSnapshot(dir);
 assert.equal(s.failureCount,1);
 assert.equal(s.successCount,1);
 assert.equal(s.consecutiveFailures,0);
 assert.equal(s.events.length,2);
 assert.ok(!JSON.stringify(s).includes("[secret]"));
});
test("failure alerts use verified sender configuration and never serialize credentials",async t=>{
 const dir=newRoot(t),calls=[];
 const env={TGL_BACKUP_ALERT_ENABLED:"1",TGL_BACKUP_ALERT_FROM:"ops@example.test",
  TGL_BACKUP_ALERT_TO:"owner@example.test",TGL_BACKUP_ALERT_API_KEY:"secret-not-in-message"};
 const fetchImpl=async(url,options)=>{
  calls.push({url,options});
  return {ok:true,status:200,body:{cancel:async()=>{}}};
 };
 const result=await dispatchBackupFailureAlert({directory:dir,reason:"Integrity mismatch",
  env,fetchImpl});
 assert.equal(result.delivery,"accepted");
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,"https://api.resend.com/emails");
 assert.equal(JSON.parse(calls[0].options.body).to[0],"owner@example.test");
 assert.ok(!calls[0].options.body.includes("secret-not-in-message"));
 assert.equal(backupOperationsSnapshot(dir,env).alertDelivery,"accepted");
 const duplicate=await dispatchBackupFailureAlert({directory:dir,reason:"Integrity mismatch",env,fetchImpl});
 assert.equal(duplicate.delivery,"deduplicated");
 assert.equal(calls.length,1);
});
test("two separately verified encrypted replicas survive primary corruption and protect retention",async t=>{
 const root=newRoot(t),data=path.join(root,"live");
 fs.mkdirSync(data);
 const dbPath=path.join(data,"preview.sqlite"),db=openDb(dbPath);
 const uid=Number(db.prepare("INSERT INTO users(email,salt,password_hash,role) VALUES(?,?,?,'admin')")
  .run("backup@example.test","salt","hash").lastInsertRowid);
 createAssortmentEditor({db,dbPath,layout:(_t,h)=>h,
  respond:()=>{},redirect:()=>{},formBody:async()=>new URLSearchParams()});
 const art=path.join(data,"concept-art");fs.mkdirSync(art);
 const fileName="facebead".repeat(4)+".webp";
 fs.writeFileSync(path.join(art,fileName),sample);
 appendGalleryImage(db,{slotId:"botanical-01",expectedVersion:1,key:fileName,editorId:uid});
 fs.writeFileSync(path.join(data,"credentials.json"),JSON.stringify(fixture));
 let failMirrorRead=false;
 const stores=new Map();
 function mock(name){
  const objects=new Map();stores.set(name,objects);
  return {
   async putFile(key,filename){objects.set(key,fs.readFileSync(filename));},
   async getFile(key,filename){if(name==="secondary"&&failMirrorRead)throw Error("not found");if(!objects.has(key))throw Error("not found");fs.writeFileSync(filename,objects.get(key),{flag:"wx"});},
   async listFiles(){return [...objects.keys()].map(key=>({key,lastModified:"2026-01-01T00:00:00Z"}));},
   async deleteFile(key){objects.delete(key);}
  };
 }
 const primary=mock("primary"),secondary=mock("secondary");
 const key=randomBytes(32).toString("hex");
 const result=await runAndVerifyOffsiteBackup({dataDirectory:data,dbPath,masterHex:key,
  objectStore:primary,secondaryStore:secondary,requireSecondary:true});
 assert.equal(result.targets.primary.images,1);
 assert.equal(result.targets.secondary.images,1);
 assert.equal(result.targets.primary.encryptedSha256,result.targets.secondary.encryptedSha256);
 assert.deepEqual(stores.get("primary").get(result.objectKey),stores.get("secondary").get(result.objectKey));
 assert.equal(backupOperationsSnapshot(data,{TGL_BACKUP_SECONDARY_S3_ENDPOINT:"https://remote.example"}).secondaryVerified,true);
 // Even a very old archive cannot be deleted when it is the most recent verified copy.
 const plan=await previewBackupRetention({dataDirectory:data,objectStore:primary,
  secondaryStore:secondary,retentionDays:30});
 assert.equal(plan.eligible.length,0);
 const cleanup=await enforceBackupRetention({dataDirectory:data,objectStore:primary,secondaryStore:secondary,
  policy:{retentionDays:30,minimumCopies:14,mode:"enforce"},env:{TGL_BACKUP_RETENTION_ALLOW_DELETE:"1"}});
 assert.equal(cleanup.deleted,0);
 assert.equal(stores.get("primary").size,1);
 failMirrorRead=true;
 await assert.rejects(()=>runAndVerifyOffsiteBackup({
  dataDirectory:data,dbPath,masterHex:key,objectStore:primary,
  secondaryStore:secondary,requireSecondary:true,force:true
 }),/not found/); // mirror verification must fail closed
 db.close();
});
/**
 * Isolated disaster-recovery drill entry point. Never writes to the live
 * service's volume; the new Railway recovery service requires a fresh volume.
 * No public domain is configured. Original snapshot and MFA seed are restored
 * before the protected private preview is allowed to listen.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {randomBytes} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {createS3Store,restoreEncryptedBackup} from "./offsite-backup.mjs";

const keyPattern=/^daily\/\d{4}-\d{2}-\d{2}\/[a-f0-9]{24}\.tglbk$/;
const required=(name)=>{
 const value=process.env[name];
 if(!value)throw Error("Missing isolated recovery configuration: "+name);
 return value;
};
const dataRoot=path.resolve(process.env.TGL_DR_DATA_ROOT||"/data");
const destination=path.join(dataRoot,"recovered-preview");
const receipt=path.join(destination,"dr-restore-receipt.json");
const key=required("TGL_DR_OBJECT_KEY");
if(!keyPattern.test(key))throw Error("Invalid restoration object key.");
if(required("TGL_DR_RECOVERY_MODE")!=="1")throw Error("Isolated recovery mode must be enabled.");
if(dataRoot==="/"||dataRoot===process.cwd()||dataRoot==="/app")
 throw Error("Recovery volume path is unsafe.");
const master=required("TGL_BACKUP_ENCRYPTION_KEY");
required("TGL_PREVIEW_GATE_PASSWORD");
required("TGL_PREVIEW_GATE_USER");

function validateRestoredApp(){
 const dbPath=path.join(destination,"preview.sqlite"),creds=path.join(destination,"credentials.json");
 if(!fs.existsSync(dbPath)||!fs.existsSync(creds))
  throw Error("Restored preview database or MFA credential material is missing.");
 const fixture=JSON.parse(fs.readFileSync(creds,"utf8"));
 if(!fixture.inviteCode||Buffer.from(fixture.mfaKey||"","base64").length!==32)
  throw Error("Recovered MFA seed cannot decrypt member secrets.");
 const db=new DatabaseSync(dbPath,{readOnly:true});
 try{
  if(Object.values(db.prepare("PRAGMA integrity_check").get())[0]!=="ok")throw Error("Restored database integrity failed.");
  const users=Number(db.prepare("SELECT COUNT(*) AS total FROM users").get().total);
  const hasMedia=!!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='collection_media'").get();
  const files=hasMedia?db.prepare("SELECT file_key FROM collection_media").all():[];
  for(const item of files){
   if(!/^[a-f0-9]{32}\.webp$/.test(item.file_key)||!fs.statSync(path.join(destination,"concept-art",item.file_key)).isFile())
    throw Error("Recovered gallery references unavailable media.");
  }
  return {users,images:files.length};
 }finally{db.close();}
}
async function recover(){
 fs.mkdirSync(dataRoot,{recursive:true,mode:0o700});
 if(fs.existsSync(destination)){
  if(!fs.existsSync(receipt))throw Error("Recovery directory already exists without a verified receipt.");
  const prior=JSON.parse(fs.readFileSync(receipt,"utf8"));
  if(prior.objectKey!==key)throw Error("Recovery volume holds a different archive; will not overwrite.");
  const check=validateRestoredApp();
  return {...check,objectKey:key,reused:true};
 }
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),"tgl-drill-"));
 try{
  const encrypted=path.join(temp,"snapshot.tglbk");
  const store=createS3Store(process.env,process.env.TGL_DR_SOURCE_PREFIX||"TGL_BACKUP_S3_");
  await store.getFile(key,encrypted);
  const result=await restoreEncryptedBackup({encrypted,masterHex:master,targetDirectory:destination});
  if(!result.credentialsIncluded)throw Error("Archive failed MFA credential verification.");
  const checked=validateRestoredApp();
  if(checked.users!==result.users||checked.images!==result.images)
   throw Error("Recovered application data differs from archive validation.");
  const info={objectKey:key,at:new Date().toISOString(),users:checked.users,
   images:checked.images,drill:true};
  fs.writeFileSync(receipt,JSON.stringify(info)+"\n",{flag:"wx",mode:0o600});
  return {...checked,objectKey:key,reused:false};
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
try{
 const result=await recover();
 console.log("ISOLATED_GREEN_LOCKER_RECOVERY_VERIFIED",
  JSON.stringify({users:result.users,images:result.images,reused:result.reused}));
 process.env.TGL_WORKSHOP_DIR=destination;
 process.env.TGL_BACKUP_ENABLED="0";
 process.env.TGL_PREVIEW_SHOW_CREDENTIALS="0";
 // Workshop entry point still enforces preview Basic access, account login
 // and MFA. No external domain is provisioned for this recovery service.
 await import("./workshop-preview.mjs");
}catch(error){
 console.error("ISOLATED_GREEN_LOCKER_RECOVERY_FAILED",
   String(error?.message||"Unclassified recovery error").slice(0,180));
 process.exitCode=1;
}

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {randomBytes} from "node:crypto";
import {openDb,createApp} from "../private/server.mjs";
import {createAssortmentEditor} from "../private/assortment-editor.mjs";
import {enforcePreviewGate} from "../scripts/preview-gate.mjs";
import {runAndVerifyOffsiteBackup,restoreEncryptedBackup} from "../scripts/offsite-backup.mjs";

test("isolated, recovered database boots a separate protected member application",async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"tgl-dr-test-"));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const data=path.join(root,"original-volume");
 fs.mkdirSync(data);
 const dbPath=path.join(data,"preview.sqlite"),db=openDb(dbPath);
 const fixture={
  inviteCode:randomBytes(30).toString("hex"),mfaKey:randomBytes(32).toString("base64"),
  memberEmail:"dr-member@example.test",memberPassword:"dr-pass-should-not-be-logged",
  adminEmail:"dr-admin@example.test",adminPassword:"dr-admin-pass-should-not-be-logged"
 };
 fs.writeFileSync(path.join(data,"credentials.json"),JSON.stringify(fixture),{mode:0o600});
 const id=Number(db.prepare("INSERT INTO users(email,salt,password_hash,role,email_verified_at) VALUES(?,?,?,'admin',?)")
   .run(fixture.adminEmail,"salt","hash",Date.now()).lastInsertRowid);
 createAssortmentEditor({db,dbPath,layout:(_t,body)=>body,
  respond:()=>{},redirect:()=>{},formBody:async()=>new URLSearchParams()});
 const key=randomBytes(32).toString("hex"),remote=new Map();
 const store={
  async putFile(k,file){remote.set(k,fs.readFileSync(file));},
  async getFile(k,file){fs.writeFileSync(file,remote.get(k),{flag:"wx"});}
 };
 const archive=await runAndVerifyOffsiteBackup({dataDirectory:data,dbPath,
  masterHex:key,objectStore:store});
 assert.equal(archive.users,1);
 const encrypted=path.join(root,"backup.tglbk");
 fs.writeFileSync(encrypted,remote.get(archive.objectKey));
 const recovery=path.join(root,"fresh-separate-volume","recovered-preview");
 await restoreEncryptedBackup({encrypted,masterHex:key,targetDirectory:recovery});
 const originalEnv={TGL_MFA_ENCRYPTION_KEY:process.env.TGL_MFA_ENCRYPTION_KEY,
  TGL_PREVIEW_GATE_USER:process.env.TGL_PREVIEW_GATE_USER,
  TGL_PREVIEW_GATE_PASSWORD:process.env.TGL_PREVIEW_GATE_PASSWORD,
  TGL_MAIL_MODE:process.env.TGL_MAIL_MODE};
 t.after(()=>{for(const [key,value] of Object.entries(originalEnv)){
  if(value===undefined)delete process.env[key];else process.env[key]=value;
 }});
 process.env.TGL_MFA_ENCRYPTION_KEY=fixture.mfaKey;
 process.env.TGL_PREVIEW_GATE_USER="dr-recovery-only";
 process.env.TGL_PREVIEW_GATE_PASSWORD=randomBytes(32).toString("base64url");
 process.env.TGL_MAIL_MODE="outbox";
 const app=createApp({inviteCode:fixture.inviteCode,
  dbPath:path.join(recovery,"preview.sqlite"),publicOrigin:"http://127.0.0.1:4174"});
 enforcePreviewGate(app.server);
 t.after(async()=>{app.stopWalletWorker?.();app.stopWalletCertificateWatch?.();
  await new Promise(resolve=>app.server.close(resolve));app.db.close();});
 await new Promise(resolve=>app.server.listen(0,"127.0.0.1",resolve));
 const origin="http://127.0.0.1:"+app.server.address().port;
 const health=await fetch(origin+"/healthz");
 assert.equal(health.status,200);
 const anonymous=await fetch(origin+"/admin/backups",{redirect:"manual"});
 assert.equal(anonymous.status,401);
 const token=Buffer.from(process.env.TGL_PREVIEW_GATE_USER+":"+
  process.env.TGL_PREVIEW_GATE_PASSWORD).toString("base64");
 const gated=await fetch(origin+"/admin/backups",
  {headers:{Authorization:"Basic "+token},redirect:"manual"});
 assert.equal(gated.status,303); // Anonymous app session must still log in.
 assert.equal(gated.headers.get("location"),"/login");
 const restoredDb=app.db.prepare("SELECT COUNT(*) AS n FROM users").get();
 assert.equal(Number(restoredDb.n),1);
 assert.equal(app.db.prepare("SELECT role FROM users WHERE id=?").get(id).role,"admin");
 assert.ok(fs.existsSync(path.join(recovery,"credentials.json")));
 assert.notEqual(data,recovery);
});

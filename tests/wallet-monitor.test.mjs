import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { openDb } from "../private/server.mjs";
import {
  inspectWalletCertificates,walletOperationsSnapshot,renderWalletOperationsPage,
  emailAlertsConfigured,dispatchWalletCertificateAlerts,installWalletMonitorSchema
} from "../private/wallet-monitor.mjs";

const certificateFixture=()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"tgl-wallet-monitor-"));
  const keyFile=path.join(directory,"issuer.key");
  const certFile=path.join(directory,"issuer.pem");
  execFileSync("openssl",[
    "req","-x509","-newkey","rsa:2048","-nodes",
    "-keyout",keyFile,"-out",certFile,"-days","100",
    "-subj","/CN=Wallet Operations Test/OU=TESTTEAM12/O=Private Test/C=US"
  ],{timeout:20000,stdio:["ignore","ignore","pipe"]});
  const key=fs.readFileSync(keyFile).toString("base64");
  const cert=fs.readFileSync(certFile).toString("base64");
  return {
    env:{
      TGL_WALLET_PASS_TYPE_ID:"pass.com.thegreenlocker.member",
      TGL_WALLET_TEAM_ID:"TESTTEAM12",
      TGL_WALLET_SIGNER_CERT_B64:cert,
      TGL_WALLET_PRIVATE_KEY_B64:key,
      TGL_WALLET_WWDR_CERT_B64:cert,
      TGL_WALLET_ALERTS_ENABLED:"1",
      TGL_WALLET_ALERT_EMAIL:"ops@example.test",
      TGL_MAIL_MODE:"resend",
      TGL_RESEND_API_KEY:"re-test-placeholder",
      TGL_EMAIL_FROM:"alerts@example.test"
    },
    dispose:()=>fs.rmSync(directory,{recursive:true,force:true})
  };
};

test("Wallet Operations on an unconfigured instance shows accurate zero metrics and no sensitive data",()=>{
 const db=openDb(":memory:");
 try{
   installWalletMonitorSchema(db); // repeated startup migrations must be safe
   const snap=walletOperationsSnapshot(db,{env:{},at:Date.parse("2026-11-13T18:00:00Z")});
   assert.equal(snap.signingConfigured,false);
   assert.equal(snap.updatesConfigured,false);
   assert.equal(snap.metrics.devices,0);
   assert.equal(snap.metrics.registrations,0);
   assert.equal(snap.metrics.optedIn,0);
   assert.equal(snap.metrics.failed,0);
   assert.equal(snap.metrics.accepted,0);
   assert.equal(snap.emailAlertEnabled,false);
   assert.equal(snap.certificates.length,2);
   assert.ok(snap.certificates.every(x=>x.state==="missing"));
   const html=renderWalletOperationsPage(snap,{user:{role:"admin",csrf:"fake-csrf"},csrf:"fake-csrf",
     layout:(_title,body)=>body});
   assert.match(html,/<h1>Wallet <em>Operations\.<\/em><\/h1>/);
   assert.match(html,/Apple Wallet signing is not configured/);
   assert.match(html,/No Wallet device registrations yet/);
   assert.match(html,/No update notifications have been queued/);
   assert.match(html,/APNs accepted/);
   assert.doesNotMatch(html,/push_token|private.key|TGL_WALLET_SIGNER_CERT_B64|Bearer|ApplePass/);
 }finally{db.close();}
});

test("Wallet Operations counts registrations and job states without exposing device or push-token values",()=>{
 const db=openDb(":memory:");
 try{
   const u=Number(db.prepare("INSERT INTO users(email,salt,password_hash,member_code,wallet_updates_enabled) VALUES(?,?,?,?,1)")
     .run("member@example.test","salt","hash","GL-ABCD-1234-5678-9ABC").lastInsertRowid);
   db.prepare("INSERT INTO wallet_devices(device_id,push_token,updated_at) VALUES(?,?,?)")
     .run("private-wallet-device-123456","4".repeat(64),Date.parse("2026-11-13T00:00:00Z"));
   db.prepare("INSERT INTO wallet_registrations(device_id,user_id,registered_at) VALUES(?,?,?)")
     .run("private-wallet-device-123456",u,Date.parse("2026-11-13T01:00:00Z"));
   const add=(state,attempts,index)=>{
     db.prepare("INSERT INTO wallet_push_jobs(user_id,device_id,revision,attempts,state,next_attempt_at,created_at,sent_at,last_attempt_at) VALUES(?,?,?,?,?,?,?,?,?)")
       .run(u,"private-wallet-device-123456",index,attempts,state,Date.now(),Date.now(),state==="sent"?Date.now():null,attempts?Date.now():null);
   };
   add("pending",0,1);
   add("pending",2,2);
   add("sent",1,3);
   add("failed",5,4);
   const snap=walletOperationsSnapshot(db,{env:{}});
   assert.deepEqual(snap.metrics,{
     devices:1,registrations:1,membersWithPasses:1,optedIn:1,
     queued:2,retries:1,accepted:1,failed:1
   });
   assert.equal(snap.registrations[0].member,"••••9ABC");
   assert.equal(snap.registrations[0].updatesEnabled,true);
   assert.equal(snap.jobs.length,4);
   assert.ok(snap.alerts.some(x=>x.message.includes("exhausted all retries")));
   const html=renderWalletOperationsPage(snap,{user:{role:"admin"},csrf:"csrf",
     layout:(_title,body)=>body});
   assert.match(html,/Accepted by APNs/);
   assert.match(html,/Pending retries/);
   assert.doesNotMatch(html,/private-wallet-device-123456|member@example\.test|4444444444444444|password_hash|csrf/);
 }finally{db.close();}
});

test("certificate expiry grades are determined from actual X.509 notAfter, never from guesses",t=>{
 const fixture=certificateFixture();
 t.after(fixture.dispose);
 const {env}=fixture;
 const first=inspectWalletCertificates(env);
 const expiration=Date.parse(first.certificates[0].expiresAt);
 assert.ok(Number.isFinite(expiration));
 assert.equal(first.signingConfigured,true);
 assert.equal(first.keyCheck,"valid");
 assert.ok(first.certificates.every(c=>c.state==="healthy"));
 for(const [days,state] of [[40,"healthy"],[25,"warning"],[14,"warning"],[7,"critical"],[2,"critical"],[-1,"expired"]]){
   const checked=inspectWalletCertificates(env,{at:expiration-days*86400000});
   assert.equal(checked.certificates[0].state,state,"Expired in "+days+" days");
 }
 const incorrect={...env,TGL_WALLET_PRIVATE_KEY_B64:Buffer.from("malformed private key").toString("base64")};
 assert.equal(inspectWalletCertificates(incorrect).keyCheck,"invalid");
 const unknown=inspectWalletCertificates({...env,TGL_WALLET_SIGNER_CERT_B64:"bad"});
 assert.equal(unknown.certificates[0].state,"invalid");
 assert.ok(unknown.certificates.every(x=>!Object.hasOwn(x,"pemCertificate")),
   "No certificate object escapes monitoring state");
});

test("certificate notification milestones deduplicate, retry failed sends, and never leak secrets",async t=>{
 const fixture=certificateFixture();
 t.after(fixture.dispose);
 const {env}=fixture;
 const db=openDb(":memory:");
 t.after(()=>db.close());
 assert.equal(emailAlertsConfigured(env),true);
 assert.equal(emailAlertsConfigured({...env,TGL_WALLET_ALERTS_ENABLED:"0"}),false);
 assert.equal(emailAlertsConfigured({...env,TGL_WALLET_ALERT_EMAIL:"bad"}),false);
 const expiration=Date.parse(inspectWalletCertificates(env).certificates[0].expiresAt);
 const stamp=days=>expiration-days*86400000;
 const mails=[];
 const send=async email=>{mails.push(email);};
 let result=await dispatchWalletCertificateAlerts(db,{env,at:stamp(40),send});
 assert.equal(result.sent,false);assert.equal(result.events,0);
 let failure=await dispatchWalletCertificateAlerts(db,{
   env,at:stamp(25),send:async()=>{throw Error("Mailer unavailable");}
 });
 assert.equal(failure.failed,true);
 assert.equal(db.prepare("SELECT COUNT(*) total FROM wallet_certificate_alerts").get().total,0);
 result=await dispatchWalletCertificateAlerts(db,{env,at:stamp(25),send});
 assert.equal(result.sent,true);assert.equal(result.events,2);
 assert.equal(mails.length,1);
 assert.equal(mails[0].to,"ops@example.test");
 assert.doesNotMatch(JSON.stringify(mails[0]),/BEGIN PRIVATE KEY|BEGIN CERTIFICATE|TGL_WALLET_/);
 result=await dispatchWalletCertificateAlerts(db,{env,at:stamp(25),send});
 assert.equal(result.sent,false);assert.equal(result.events,0);
 for(const days of [13,6,-1]){
   result=await dispatchWalletCertificateAlerts(db,{env,at:stamp(days),send});
   assert.equal(result.sent,true,"milestone "+days);
   assert.equal(result.events,2);
 }
 assert.equal(mails.length,4);
 assert.equal(db.prepare("SELECT COUNT(*) total FROM wallet_certificate_alerts").get().total,8);
});

import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { enforcePreviewGate } from "../scripts/preview-gate.mjs";

test("cloud preview gate blocks anonymous requests and wrong passwords before application handling",async t=>{
 const previousUser=process.env.TGL_PREVIEW_GATE_USER,previousPassword=process.env.TGL_PREVIEW_GATE_PASSWORD;
 process.env.TGL_PREVIEW_GATE_USER="private-preview";
 process.env.TGL_PREVIEW_GATE_PASSWORD="test-only-long-random-preview-passphrase-54321";
 const server=createServer((req,res)=>{res.writeHead(200);res.end("app private content");});
 try{
  enforcePreviewGate(server);
  server.listen(0,"127.0.0.1"); await once(server,"listening");
  const origin="http://127.0.0.1:"+server.address().port;
  let res=await fetch(origin+"/healthz");assert.equal(res.status,200);
  assert.equal(res.headers.get("strict-transport-security"),"max-age=31536000");
  assert.equal(res.headers.get("x-robots-tag"),"noindex, nofollow");
  res=await fetch(origin+"/");assert.equal(res.status,401);
  assert.match(res.headers.get("www-authenticate"),/Basic/);
  assert.equal(res.headers.get("x-robots-tag"),"noindex, nofollow");
  assert.equal(res.headers.get("x-frame-options"),"DENY");
  assert.equal(res.headers.get("strict-transport-security"),"max-age=31536000");
  res=await fetch(origin+"/catalog",{headers:{authorization:"Basic "+Buffer.from("private-preview:wrong-password").toString("base64")}});
  assert.equal(res.status,401);
  res=await fetch(origin+"/catalog",{headers:{authorization:"Basic "+Buffer.from("private-preview:"+process.env.TGL_PREVIEW_GATE_PASSWORD).toString("base64")}});
  assert.equal(res.status,200);assert.equal(await res.text(),"app private content");
 }finally{
  await new Promise(resolve=>server.close(resolve));
  if(previousUser===undefined)delete process.env.TGL_PREVIEW_GATE_USER;else process.env.TGL_PREVIEW_GATE_USER=previousUser;
  if(previousPassword===undefined)delete process.env.TGL_PREVIEW_GATE_PASSWORD;else process.env.TGL_PREVIEW_GATE_PASSWORD=previousPassword;
 }
});
test("preview gate refuses to start with missing or weak password",()=>{
 const prev=process.env.TGL_PREVIEW_GATE_PASSWORD;process.env.TGL_PREVIEW_GATE_PASSWORD="short";
 const server=createServer((req,res)=>res.end("hidden"));
 try{assert.throws(()=>enforcePreviewGate(server),/requires/);}
 finally{if(prev===undefined)delete process.env.TGL_PREVIEW_GATE_PASSWORD;else process.env.TGL_PREVIEW_GATE_PASSWORD=prev;}
});

test("Apple Wallet callback carveout is disabled by default and limited to signed-service paths",async t=>{
 const names=[
   "TGL_PREVIEW_GATE_USER","TGL_PREVIEW_GATE_PASSWORD",
   "TGL_WALLET_UPDATES_ENABLED","TGL_WALLET_PASS_TYPE_ID","TGL_WALLET_TEAM_ID",
   "TGL_WALLET_SIGNER_CERT_B64","TGL_WALLET_PRIVATE_KEY_B64",
   "TGL_WALLET_WWDR_CERT_B64","TGL_WALLET_UPDATE_SECRET_B64","TGL_WALLET_SERVICE_URL"
 ];
 const old=Object.fromEntries(names.map(name=>[name,process.env[name]]));
 t.after(()=>{
   for(const name of names) {
     if(old[name]===undefined)delete process.env[name];else process.env[name]=old[name];
   }
 });
 const {randomBytes}=await import("node:crypto");
 process.env.TGL_PREVIEW_GATE_USER="private-preview";
 process.env.TGL_PREVIEW_GATE_PASSWORD="test-only-long-random-preview-passphrase-54321";
 process.env.TGL_WALLET_UPDATES_ENABLED="0";
 process.env.TGL_WALLET_PASS_TYPE_ID="pass.com.thegreenlocker.member";
 process.env.TGL_WALLET_TEAM_ID="A1B2C3D4E5";
 const fake=Buffer.from("-----BEGIN CERTIFICATE-----\n"+"X".repeat(190)+"\n-----END CERTIFICATE-----").toString("base64");
 process.env.TGL_WALLET_SIGNER_CERT_B64=fake;
 process.env.TGL_WALLET_PRIVATE_KEY_B64=fake;
 process.env.TGL_WALLET_WWDR_CERT_B64=fake;
 process.env.TGL_WALLET_UPDATE_SECRET_B64=randomBytes(32).toString("base64");
 process.env.TGL_WALLET_SERVICE_URL="https://wallet.example.test/";
 const server=createServer((req,res)=>{
   res.writeHead(200,{"Content-Type":"text/plain"});
   res.end("callback path reached");
 });
 enforcePreviewGate(server);
 server.listen(0,"127.0.0.1");await once(server,"listening");
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const origin="http://127.0.0.1:"+server.address().port;
 const endpoint="/v1/passes/pass.com.thegreenlocker.member/GL-A1B2-C3D4-E5F6-1234";
 let res=await fetch(origin+endpoint);assert.equal(res.status,401,"Callback is blocked while disabled.");
 process.env.TGL_WALLET_UPDATES_ENABLED="1";
 res=await fetch(origin+endpoint);assert.equal(res.status,200,"Enabled pass callbacks reach per-pass authentication.");
 res=await fetch(origin+"/member");assert.equal(res.status,401,"Member area stays private.");
 res=await fetch(origin+"/admin");assert.equal(res.status,401,"Admin area stays private.");
 res=await fetch(origin+"/v1/other");assert.equal(res.status,401,"Only documented callback routes bypass preview gate.");
});

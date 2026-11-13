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
  res=await fetch(origin+"/");assert.equal(res.status,401);
  assert.match(res.headers.get("www-authenticate"),/Basic/);
  assert.equal(res.headers.get("x-robots-tag"),"noindex, nofollow");
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

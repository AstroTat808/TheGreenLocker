import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawn,spawnSync} from "node:child_process";
import {setTimeout as delay} from "node:timers/promises";
import {createServer} from "node:net";

function reserveRandomPort(){
  return new Promise((resolve,reject)=>{
    const tcp=createServer();
    tcp.once("error",reject);
    tcp.listen(0,"127.0.0.1",()=>{
      const port=tcp.address().port;
      tcp.close(e=>e?reject(e):resolve(port));
    });
  });
}
test("Workshop launcher rejects production mode and public binding without authorization",async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"tgl-workshop-block-"));
  try{
    const base={...process.env,TGL_WORKSHOP_DIR:dir,WORKSHOP_PREVIEW_BIND:"127.0.0.1"};
    const p=spawnSync(process.execPath,["scripts/workshop-preview.mjs"],{env:{...base,NODE_ENV:"production"},encoding:"utf8"});
    assert.notEqual(p.status,0,"Production runtime must not run demo fixtures");
    assert.match(p.stderr,/development-only/i);
    const pub=spawnSync(process.execPath,["scripts/workshop-preview.mjs"],{env:{...base,NODE_ENV:"development",WORKSHOP_PREVIEW_BIND:"0.0.0.0",WORKSHOP_ALLOW_CLOUD_PREVIEW:"0"},encoding:"utf8"});
    assert.notEqual(pub.status,0,"Public network bind must not be enabled by default");
    assert.match(pub.stderr,/Explicitly enable cloud preview/i);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test("Workshop private preview starts with demo users, navigable catalog and MFA-gated admin",async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"tgl-workshop-smoke-"));
  const port=await reserveRandomPort();
  const env={...process.env,PORT:String(port),NODE_ENV:"development",TGL_ENV:"development",TGL_WORKSHOP_DIR:dir,WORKSHOP_PREVIEW_BIND:"127.0.0.1"};
  const child=spawn(process.execPath,["scripts/workshop-preview.mjs"],{env,stdio:["ignore","pipe","pipe"]});
  let errorText="";
  child.stderr.on("data",buf=>{errorText+=buf.toString();});
  t.after(async()=>{
    if(child.exitCode===null)child.kill("SIGTERM");
    fs.rmSync(dir,{recursive:true,force:true});
  });
  const base="http://127.0.0.1:"+port;
  let ready=false;
  for(let i=0;i<60;i++){
    if(child.exitCode!==null)throw new Error("Preview exited early: "+errorText.slice(-400));
    try{
      const res=await fetch(base+"/healthz");
      if(res.ok){ready=true;break;}
    }catch{}
    await delay(100);
  }
  assert.ok(ready,"Preview failed to start: "+errorText.slice(-400));
  const fixture=JSON.parse(fs.readFileSync(path.join(dir,"credentials.json"),"utf8"));
  assert.ok(fixture.memberPassword.length>16);
  const login=await fetch(base+"/login");
  assert.equal(login.status,200);
  assert.match(await login.text(),/Welcome back/);
  let r=await fetch(base+"/catalog",{redirect:"manual"});
  assert.equal(r.status,303);
  assert.equal(r.headers.get("location"),"/login");
  r=await fetch(base+"/login",{method:"POST",redirect:"manual",headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({email:fixture.memberEmail,password:fixture.memberPassword})});
  assert.equal(r.status,303);
  const cookie=r.headers.get("set-cookie").split(";")[0];
  r=await fetch(base+"/",{headers:{Cookie:cookie}});
  assert.equal(r.status,200);
  const homepage=await r.text();
  assert.match(homepage,/THE GOOD STUFF/);
  assert.match(homepage,/assets\/shield-logo\.webp/);
  r=await fetch(base+"/assets/shield-logo.webp",{headers:{Cookie:cookie}});
  assert.equal(r.status,200);
  assert.equal(r.headers.get("content-type"),"image/webp");
  const asset=Buffer.from(await r.arrayBuffer());
  assert.ok(asset.byteLength>1000,"Official shield logo must load from local repository asset");
  assert.equal(asset.subarray(0,4).toString("ascii"),"RIFF");
  assert.equal(asset.subarray(8,12).toString("ascii"),"WEBP");
  r=await fetch(base+"/favicon.ico");
  assert.equal(r.status,200);
  assert.equal(r.headers.get("content-type"),"image/png");
  assert.equal(Buffer.from(await r.arrayBuffer()).subarray(0,8).toString("hex"),"89504e470d0a1a0a");
  r=await fetch(base+"/locker-motion.js",{headers:{Cookie:cookie}});
  assert.equal(r.status,200);
  assert.match(await r.text(),/prefers-reduced-motion/);
  r=await fetch(base+"/catalog",{headers:{Cookie:cookie}});
  assert.equal(r.status,200);
  assert.match(await r.text(),/Concept Accessory/);
  r=await fetch(base+"/admin",{headers:{Cookie:cookie}});
  assert.equal(r.status,403);
  r=await fetch(base+"/login",{method:"POST",redirect:"manual",headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({email:fixture.adminEmail,password:fixture.adminPassword})});
  assert.equal(r.status,303);
  assert.equal(r.headers.get("location"),"/admin/mfa");
  const adminCookie=r.headers.get("set-cookie").split(";")[0];
  r=await fetch(base+"/admin",{headers:{Cookie:adminCookie},redirect:"manual"});
  assert.equal(r.status,303);
  assert.equal(r.headers.get("location"),"/admin/mfa");
  r=await fetch(base+"/admin/mfa",{headers:{Cookie:adminCookie}});
  assert.equal(r.status,200);
  assert.match(await r.text(),/Begin authenticator setup/);
  assert.ok(!homepage.includes("checkout"),"Homepage must not contain live checkout");
});

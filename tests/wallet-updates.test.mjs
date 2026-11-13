import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { openDb } from "../private/server.mjs";
import { walletPassJson } from "../private/wallet-pass.mjs";
import {
  createWalletUpdateService,walletUpdatesConfigured,walletWebServicePath,
  passAuthenticationToken,recordWalletRevision,processWalletPushQueue,
  revokeWalletRegistrations
} from "../private/wallet-updates.mjs";

const code="GL-A1B2-C3D4-E5F6-1234";
const cert=Buffer.from("-----BEGIN CERTIFICATE-----\n"+"A".repeat(200)+"\n-----END CERTIFICATE-----").toString("base64");
const key=Buffer.from("-----BEGIN PRIVATE KEY-----\n"+"A".repeat(200)+"\n-----END PRIVATE KEY-----").toString("base64");
const env={
  TGL_WALLET_UPDATES_ENABLED:"1",
  TGL_WALLET_PASS_TYPE_ID:"pass.com.thegreenlocker.member",
  TGL_WALLET_TEAM_ID:"A1B2C3D4E5",
  TGL_WALLET_SIGNER_CERT_B64:cert,
  TGL_WALLET_PRIVATE_KEY_B64:key,
  TGL_WALLET_WWDR_CERT_B64:cert,
  TGL_WALLET_SERVICE_URL:"https://wallet.thegreenlocker.example/",
  TGL_WALLET_UPDATE_SECRET_B64:randomBytes(32).toString("base64")
};
const auth="ApplePass "+passAuthenticationToken(code,env);

test("Wallet web service activation is explicit, requires Apple signer and high-entropy secret",()=>{
  assert.equal(walletUpdatesConfigured({}),false);
  assert.equal(walletUpdatesConfigured({...env,TGL_WALLET_UPDATES_ENABLED:"0"}),false);
  assert.equal(walletUpdatesConfigured({...env,TGL_WALLET_UPDATE_SECRET_B64:"abc"}),false);
  assert.equal(walletUpdatesConfigured({...env,TGL_WALLET_SERVICE_URL:"http://example.org/"}),false);
  assert.equal(walletUpdatesConfigured({...env,TGL_WALLET_SERVICE_URL:"https://localhost/"}),false);
  assert.equal(walletUpdatesConfigured(env),true);
  assert.equal(walletWebServicePath("/v1/passes/pass.com.thegreenlocker.member/"+code),true);
  assert.equal(walletWebServicePath("/v1/devices/deviceIdentifier_abcdef/registrations/pass.com.thegreenlocker.member/"+code),true);
  assert.equal(walletWebServicePath("/admin"),false);
  assert.notEqual(passAuthenticationToken(code,env),code);
  assert.equal(passAuthenticationToken(code,env).length,43);
  const signed=walletPassJson({
    memberCode:code,displayName:"Test Member",env,
    walletUpdate:{webServiceURL:env.TGL_WALLET_SERVICE_URL,authenticationToken:passAuthenticationToken(code,env)}
  });
  assert.equal(signed.authenticationToken,auth.slice("ApplePass ".length));
  assert.equal(signed.webServiceURL,env.TGL_WALLET_SERVICE_URL);
  const noUpdates=walletPassJson({memberCode:code,displayName:"Test Member",env});
  assert.equal(noUpdates.authenticationToken,undefined);
  assert.equal(noUpdates.webServiceURL,undefined);
  assert.doesNotMatch(JSON.stringify(signed),/password|checkout|barcode/i);
});

test("pass registration and revisions are per-member, private, opt-in and queue pushes safely",async t=>{
  const db=openDb(":memory:");
  const memberId=Number(db.prepare(
    "INSERT INTO users(email,salt,password_hash,member_code,wallet_updates_enabled) VALUES(?,?,?,?,1)"
  ).run("first@example.com","salt","hash",code).lastInsertRowid);
  const otherCode="GL-1111-2222-3333-4444";
  const otherId=Number(db.prepare(
    "INSERT INTO users(email,salt,password_hash,member_code,wallet_updates_enabled) VALUES(?,?,?,?,0)"
  ).run("other@example.com","salt","hash",otherCode).lastInsertRowid);
  const respond=(res,code,body,type="text/plain; charset=utf-8",headers={})=>{
    res.writeHead(code,{"Content-Type":type,"Cache-Control":"no-store, private",...headers});
    res.end(body);
  };
  const service=createWalletUpdateService({db,respond,buildPass:member=>Buffer.from("signed-pass-"+member.member_code),env});
  assert.equal(service.configured,true);
  const server=createServer(async(req,res)=>{
    const url=new URL(req.url,"http://localhost");
    try{
      if(await service.handle({req,res,url,method:req.method}))return;
      respond(res,404,"Not found");
    }catch{
      respond(res,500,"Failed");
    }
  });
  server.listen(0,"127.0.0.1");await once(server,"listening");
  t.after(async()=>{
    await new Promise(resolve=>server.close(resolve));
    db.close();
  });
  const origin="http://127.0.0.1:"+server.address().port;
  const req=(url,method="GET",headers={},body)=>fetch(origin+url,{method,headers,body,redirect:"manual"});
  const dev="privateDeviceIdentifier_123456";
  const route="/v1/devices/"+dev+"/registrations/"+env.TGL_WALLET_PASS_TYPE_ID+"/"+code;
  const collection="/v1/devices/"+dev+"/registrations/"+env.TGL_WALLET_PASS_TYPE_ID;
  const pass="/v1/passes/"+env.TGL_WALLET_PASS_TYPE_ID+"/"+code;

  let response=await req(route,"POST",{"Content-Type":"application/json"},JSON.stringify({pushToken:"a".repeat(64)}));
  assert.equal(response.status,401,"Registration demands per-pass ApplePass auth.");
  response=await req(route,"POST",{"Content-Type":"application/json",authorization:"ApplePass invalid"},JSON.stringify({pushToken:"a".repeat(64)}));
  assert.equal(response.status,401);
  response=await req(route,"POST",{"Content-Type":"application/json",authorization:auth},JSON.stringify({pushToken:"not-a-token"}));
  assert.equal(response.status,400,"Malformed push tokens rejected.");
  response=await req(route,"POST",{"Content-Type":"application/json",authorization:auth},JSON.stringify({pushToken:"a".repeat(64)}));
  assert.equal(response.status,201);
  response=await req(route,"POST",{"Content-Type":"application/json",authorization:auth},JSON.stringify({pushToken:"b".repeat(64)}));
  assert.equal(response.status,200,"Re-registration updates existing token.");
  assert.equal(db.prepare("SELECT push_token FROM wallet_devices WHERE device_id=?").get(dev).push_token,"b".repeat(64));

  let revision=recordWalletRevision(db,memberId,{at:1000});
  assert.ok(revision>0);
  assert.equal(recordWalletRevision(db,otherId,{at:1100}),null,"Opted-out member cannot queue updates.");
  let due=db.prepare("SELECT id,state,attempts FROM wallet_push_jobs WHERE user_id=?").all(memberId);
  assert.equal(due.length,1);
  response=await req(collection+"?passesUpdatedSince=0");
  assert.equal(response.status,200);
  const list=await response.json();
  assert.deepEqual(list.serialNumbers,[code]);
  assert.equal(Number(list.lastUpdated),revision);
  response=await req(collection+"?passesUpdatedSince="+revision);
  assert.equal(response.status,204);
  response=await req(collection+"?passesUpdatedSince=invalid");
  assert.equal(response.status,400);
  response=await req(pass);
  assert.equal(response.status,401);
  response=await req(pass,"GET",{authorization:auth});
  assert.equal(response.status,200);
  assert.equal(response.headers.get("content-type"),"application/vnd.apple.pkpass");
  assert.equal(await response.text(),"signed-pass-"+code);
  const sent=[];
  let result=await processWalletPushQueue(db,{env,at:1000,send:async token=>{
    sent.push(token);
    return {status:200,reason:""};
  }});
  assert.equal(result.sent,1);
  assert.deepEqual(sent,["b".repeat(64)]);
  result=await processWalletPushQueue(db,{env,at:1100,send:async()=>{throw Error("should not resend");}});
  assert.equal(result.processed,0,"Successful push isn't re-sent.");
  const otherAuth="ApplePass "+passAuthenticationToken(otherCode,env);
  response=await req("/v1/passes/"+env.TGL_WALLET_PASS_TYPE_ID+"/"+otherCode,"GET",{authorization:otherAuth});
  assert.equal(response.status,401,"Unsubscribed member cannot receive updates.");

  response=await req(route,"DELETE",{authorization:auth});
  assert.equal(response.status,200);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM wallet_registrations").get().count,0);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM wallet_devices").get().count,0);
  response=await req(collection+"?passesUpdatedSince=0");
  assert.equal(response.status,204);
  // An explicit opt-out also revokes any registrations and queued notifications.
  revokeWalletRegistrations(db,memberId);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM wallet_push_jobs").get().count,0);
});

test("transient APNs failures back off; invalid device tokens are pruned",async()=>{
  const db=openDb(":memory:");
  try{
    const id=Number(db.prepare("INSERT INTO users(email,salt,password_hash,member_code,wallet_updates_enabled) VALUES(?,?,?,?,1)")
      .run("queue@example.com","salt","hash",code).lastInsertRowid);
    db.prepare("INSERT INTO wallet_devices(device_id,push_token,updated_at) VALUES(?,?,0)").run("deviceIdentity_123456","c".repeat(64));
    db.prepare("INSERT INTO wallet_registrations(device_id,user_id) VALUES(?,?)").run("deviceIdentity_123456",id);
    recordWalletRevision(db,id,{at:1000});
    let sent=await processWalletPushQueue(db,{env,at:1000,send:async()=>({status:503,reason:"temporary"})});
    assert.equal(sent.failed,1);
    let job=db.prepare("SELECT attempts,state,next_attempt_at FROM wallet_push_jobs").get();
    assert.equal(job.attempts,1);
    assert.equal(job.state,"pending");
    assert.ok(job.next_attempt_at>1000);
    sent=await processWalletPushQueue(db,{env,at:job.next_attempt_at,send:async()=>({status:410,reason:"Unregistered"})});
    assert.equal(sent.failed,1);
    assert.equal(db.prepare("SELECT COUNT(*) count FROM wallet_devices").get().count,0);
  }finally{db.close();}
});

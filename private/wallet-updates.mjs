/**
 * Optional Apple Wallet update service.
 *
 * Disabled unless separately provisioned by the operator and explicitly
 * enabled by the individual member. Authentication tokens are deterministic
 * HMACs derived from a sealed per-environment secret, never from the display
 * reference alone. This is not an authorization/payment/identity system.
 *
 * Follows Apple Wallet Passes v1 endpoints. Pass push updates require real
 * production APNs access and Apple-issued Pass Type ID credentials.
 */
import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { connect as openH2 } from "node:http2";
import { walletConfigured } from "./wallet-pass.mjs";

const serialRE=/^GL-(?:[A-F0-9]{4}-){3}[A-F0-9]{4}$/;
const deviceRE=/^[A-Za-z0-9_-]{12,128}$/;
const pushRE=/^[A-Fa-f0-9]{32,256}$/;
const safeEqual=(a,b)=>timingSafeEqual(
  createHash("sha256").update(String(a)).digest(),
  createHash("sha256").update(String(b)).digest()
);
function b64PEM(value){
  if(typeof value!=="string" || value.length>100000 || !/^[A-Za-z0-9+/\r\n=]+$/.test(value))
    throw new Error("Invalid APNs provider certificate configuration");
  const data=Buffer.from(value,"base64").toString("utf8");
  if(!data.includes("-----BEGIN ") || !data.includes("-----END "))
    throw new Error("APNs certificate PEM missing");
  return data;
}
export function walletUpdatesConfigured(env=process.env){
  if(env.TGL_WALLET_UPDATES_ENABLED!=="1" || !walletConfigured(env)) return false;
  try{
    const secret=Buffer.from(env.TGL_WALLET_UPDATE_SECRET_B64||"","base64");
    const url=new URL(env.TGL_WALLET_SERVICE_URL||"");
    return secret.length>=32 && secret.length<=128 &&
      url.protocol==="https:" && url.username==="" && url.password==="" &&
      url.hostname!=="" && url.hostname!=="localhost" &&
      !url.hostname.endsWith(".local") && url.pathname==="/" &&
      !url.search && !url.hash && !url.port;
  }catch{return false;}
}
export function walletServiceURL(env=process.env){
  if(!walletUpdatesConfigured(env)) throw new Error("Wallet updates are not configured");
  return new URL(env.TGL_WALLET_SERVICE_URL).origin+"/";
}
export function passAuthenticationToken(serial,env=process.env){
  if(!walletUpdatesConfigured(env)||!serialRE.test(serial))throw new Error("Wallet pass update credentials unavailable");
  return createHmac("sha256",Buffer.from(env.TGL_WALLET_UPDATE_SECRET_B64,"base64"))
    .update("tgl-wallet-pass-v1:"+serial).digest("base64url");
}
export function walletWebServicePath(pathname) {
  return /^\/v1\/(?:devices\/[^/]+\/registrations\/[^/]+(?:\/[^/]+)?|passes\/[^/]+\/[^/]+)$/.test(pathname);
}

export function installWalletUpdateSchema(db){
  const columns=db.prepare("PRAGMA table_info(users)").all().map(row=>row.name);
  if(!columns.includes("wallet_updates_enabled"))
    db.exec("ALTER TABLE users ADD COLUMN wallet_updates_enabled INTEGER NOT NULL DEFAULT 0 CHECK(wallet_updates_enabled IN (0,1));");
  if(!columns.includes("wallet_pass_revision"))
    db.exec("ALTER TABLE users ADD COLUMN wallet_pass_revision INTEGER NOT NULL DEFAULT 0;");
  db.exec(
    "CREATE TABLE IF NOT EXISTS wallet_devices ("+
      "device_id TEXT PRIMARY KEY,push_token TEXT NOT NULL,updated_at INTEGER NOT NULL);"+
    "CREATE TABLE IF NOT EXISTS wallet_registrations ("+
      "device_id TEXT NOT NULL REFERENCES wallet_devices(device_id) ON DELETE CASCADE,"+
      "user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,"+
      "PRIMARY KEY(device_id,user_id));"+
    "CREATE INDEX IF NOT EXISTS idx_wallet_reg_user ON wallet_registrations(user_id);"+
    "CREATE TABLE IF NOT EXISTS wallet_revisions ("+
      "id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,created_at INTEGER NOT NULL);"+
    "CREATE TABLE IF NOT EXISTS wallet_push_jobs ("+
      "id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,"+
      "device_id TEXT NOT NULL REFERENCES wallet_devices(device_id) ON DELETE CASCADE,"+
      "revision INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,"+
      "state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sent','failed')),"+
      "next_attempt_at INTEGER NOT NULL,created_at INTEGER NOT NULL,"+
      "UNIQUE(user_id,device_id,revision));"+
    "CREATE INDEX IF NOT EXISTS idx_wallet_push_due ON wallet_push_jobs(state,next_attempt_at);"
  );
}

export function recordWalletRevision(db,userId,{at=Date.now()}={}){
  const user=db.prepare("SELECT wallet_updates_enabled FROM users WHERE id=?").get(userId);
  if(!user || Number(user.wallet_updates_enabled)!==1)return null;
  const revision=Number(db.prepare("INSERT INTO wallet_revisions(user_id,created_at) VALUES(?,?)")
    .run(userId,at).lastInsertRowid);
  db.prepare("UPDATE users SET wallet_pass_revision=? WHERE id=?").run(revision,userId);
  db.prepare(
    "INSERT OR IGNORE INTO wallet_push_jobs(user_id,device_id,revision,next_attempt_at,created_at) "+
    "SELECT user_id,device_id,?,?,? FROM wallet_registrations WHERE user_id=?"
  ).run(revision,at,at,userId);
  return revision;
}

export function revokeWalletRegistrations(db,userId) {
  db.prepare("DELETE FROM wallet_push_jobs WHERE user_id=?").run(userId);
  db.prepare("DELETE FROM wallet_registrations WHERE user_id=?").run(userId);
  db.exec("DELETE FROM wallet_devices WHERE NOT EXISTS ("+
    "SELECT 1 FROM wallet_registrations WHERE wallet_registrations.device_id=wallet_devices.device_id)");
}

async function jsonBody(req,maxBytes=4096) {
  const chunks=[];let used=0;
  for await(const chunk of req){
    used+=chunk.length;
    if(used>maxBytes)throw new Error("Request too large");
    chunks.push(chunk);
  }
  const parsed=JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if(!parsed||Array.isArray(parsed)||typeof parsed!=="object")throw new Error("Invalid JSON");
  return parsed;
}
function pathSegments(pathname){
  try {
    const parts=pathname.split("/").slice(1).map(decodeURIComponent);
    return parts.some(part=>part.includes("/")||part.includes("\\")||part.includes("\0")) ? [] : parts;
  }catch{return [];}
}

export function createWalletUpdateService({db,respond,buildPass,env=process.env}){
  if(!db||typeof respond!=="function"||typeof buildPass!=="function")throw new Error("Wallet service missing dependencies");
  // The deployment does not expose callbacks until explicitly configured.
  const configured=walletUpdatesConfigured(env);
  const typeId=env.TGL_WALLET_PASS_TYPE_ID||"";
  const authMember=(serial,req)=>{
    if(!serialRE.test(serial))return null;
    const member=db.prepare("SELECT id,member_code,wallet_updates_enabled,wallet_pass_revision,"+
      "display_name,email,card_theme,card_title,card_motto FROM users WHERE member_code=?").get(serial);
    if(!member||member.wallet_updates_enabled!==1)return null;
    const header=req.headers.authorization||"";
    if(!/^ApplePass [A-Za-z0-9_-]{32,128}$/.test(header))return null;
    return safeEqual(header.slice("ApplePass ".length),passAuthenticationToken(serial,env))
      ? member : null;
  };
  const plain=(res,status,body="")=>respond(res,status,body,"text/plain; charset=utf-8");
  const handle=async({req,res,url,method})=>{
    if(!configured || !walletWebServicePath(url.pathname))return false;
    const parts=pathSegments(url.pathname);
    if(parts[0]!=="v1")return false;
    const isPass=parts[1]==="passes"&&parts.length===4;
    const isList=parts[1]==="devices"&&parts[3]==="registrations"&&parts.length===5;
    const isRegistration=parts[1]==="devices"&&parts[3]==="registrations"&&parts.length===6;
    if(!(isPass||isList||isRegistration))return false;
    const requestedType=isPass?parts[2]:parts[4];
    if(requestedType!==typeId){
      plain(res,401,"Request not authorized");return true;
    }
    if(isPass){
      if(method!=="GET"){plain(res,405,"Method not allowed");return true;}
      const member=authMember(parts[3],req);
      if(!member){plain(res,401,"Request not authorized");return true;}
      try{
        const pass=buildPass(member);
        respond(res,200,pass,"application/vnd.apple.pkpass",{
          "X-Content-Type-Options":"nosniff",
          "Content-Disposition":'attachment; filename="the-green-locker-member.pkpass"'
        });
      }catch{
        plain(res,503,"Signed pass temporarily unavailable");
      }
      return true;
    }
    const device=parts[2];
    if(!deviceRE.test(device)){plain(res,401,"Request not authorized");return true;}
    if(isList){
      if(method!=="GET"){plain(res,405,"Method not allowed");return true;}
      // Apple treats deviceLibraryIdentifier as the device-scoped shared secret.
      const registered=db.prepare("SELECT 1 FROM wallet_devices WHERE device_id=?").get(device);
      if(!registered){plain(res,204);return true;}
      const tag=url.searchParams.get("passesUpdatedSince");
      if(tag!==null && !/^(?:0|[1-9][0-9]{0,14})$/.test(tag)){
        plain(res,400,"Invalid update tag");return true;
      }
      const previous=tag===null?-1:Number(tag);
      const rows=db.prepare(
        "SELECT u.member_code,u.wallet_pass_revision FROM wallet_registrations r "+
        "JOIN users u ON u.id=r.user_id "+
        "WHERE r.device_id=? AND u.wallet_updates_enabled=1 AND u.wallet_pass_revision>? "+
        "ORDER BY u.wallet_pass_revision LIMIT 100"
      ).all(device,previous);
      if(!rows.length){plain(res,204);return true;}
      const last=Math.max(...rows.map(row=>row.wallet_pass_revision));
      respond(res,200,JSON.stringify({
        serialNumbers:rows.map(row=>row.member_code),
        lastUpdated:String(last)
      }),"application/json; charset=utf-8");
      return true;
    }
    const member=authMember(parts[5],req);
    if(!member){plain(res,401,"Request not authorized");return true;}
    if(method==="POST"){
      let data;
      try{
        if(!/^application\/json(?:;|$)/i.test(req.headers["content-type"]||""))
          throw new Error("Invalid content type");
        data=await jsonBody(req);
        if(!pushRE.test(data.pushToken))throw new Error("Invalid push token");
      }catch{plain(res,400,"Invalid registration");return true;}
      const at=Date.now();
      db.exec("BEGIN IMMEDIATE");
      try{
        const registered=db.prepare(
          "SELECT 1 FROM wallet_registrations WHERE device_id=? AND user_id=?"
        ).get(device,member.id);
        db.prepare("INSERT INTO wallet_devices(device_id,push_token,updated_at) VALUES(?,?,?) "+
          "ON CONFLICT(device_id) DO UPDATE SET push_token=excluded.push_token,updated_at=excluded.updated_at")
          .run(device,data.pushToken,at);
        db.prepare("INSERT OR IGNORE INTO wallet_registrations(device_id,user_id,registered_at) VALUES(?,?,?)")
          .run(device,member.id,at);
        db.exec("COMMIT");
        plain(res,registered?200:201);
      }catch(err){db.exec("ROLLBACK");plain(res,503,"Registration unavailable");}
      return true;
    }
    if(method==="DELETE"){
      db.exec("BEGIN IMMEDIATE");
      try{
        db.prepare("DELETE FROM wallet_registrations WHERE device_id=? AND user_id=?")
          .run(device,member.id);
        db.prepare("DELETE FROM wallet_push_jobs WHERE device_id=? AND user_id=?")
          .run(device,member.id);
        db.prepare("DELETE FROM wallet_devices WHERE device_id=? AND NOT EXISTS ("+
          "SELECT 1 FROM wallet_registrations WHERE device_id=?)").run(device,device);
        db.exec("COMMIT");
        plain(res,200);
      }catch{db.exec("ROLLBACK");plain(res,503,"Unregistration unavailable");}
      return true;
    }
    plain(res,405,"Method not allowed");
    return true;
  };
  return {configured,handle};
}

export async function sendWalletApns(pushToken,{env=process.env,connector=openH2}={}){
  if(!walletUpdatesConfigured(env)||!pushRE.test(pushToken))
    throw new Error("APNs update transport is not configured");
  // Pass Type ID signing cert also authenticates Apple Wallet pass pushes.
  const cert=b64PEM(env.TGL_WALLET_SIGNER_CERT_B64);
  const key=b64PEM(env.TGL_WALLET_PRIVATE_KEY_B64);
  const client=connector("https://api.push.apple.com",{cert,key,ALPNProtocols:["h2"]});
  return new Promise((resolve,reject)=>{
    let done=false,code=0,buffer="";
    const finish=(error,value)=>{
      if(done)return;done=true;
      clearTimeout(timer);
      try{client.close();}catch{}
      if(error)reject(error);else resolve(value);
    };
    const timer=setTimeout(()=>finish(new Error("APNs request timeout")),12000);
    client.on("error",()=>finish(new Error("APNs connection unavailable")));
    let req;
    try {
      req=client.request({
        ":method":"POST",
        ":path":"/3/device/"+pushToken,
        "apns-topic":env.TGL_WALLET_PASS_TYPE_ID,
        "apns-push-type":"background",
        "apns-priority":"5",
        "content-type":"application/json"
      });
    }catch{return finish(new Error("APNs request could not start"));}
    req.on("response",headers=>{code=Number(headers[":status"]||0);});
    req.on("data",chunk=>{if(buffer.length<256)buffer+=chunk.toString("utf8");});
    req.on("error",()=>finish(new Error("APNs push failed")));
    req.on("end",()=>{
      let reason="";
      try{reason=JSON.parse(buffer).reason||"";}catch{}
      finish(null,{status:code,reason:String(reason).slice(0,80)});
    });
    req.end("{}");
  });
}

export async function processWalletPushQueue(db,{
  env=process.env,send=sendWalletApns,at=Date.now(),max=10
}={}){
  if(!walletUpdatesConfigured(env))return {processed:0,disabled:true};
  const due=db.prepare(
    "SELECT j.id,j.attempts,j.device_id,j.user_id,d.push_token "+
    "FROM wallet_push_jobs j JOIN wallet_devices d ON d.device_id=j.device_id "+
    "JOIN users u ON u.id=j.user_id "+
    "WHERE j.state='pending' AND j.next_attempt_at<=? AND u.wallet_updates_enabled=1 "+
    "ORDER BY j.id LIMIT ?"
  ).all(at,Math.max(1,Math.min(20,max)));
  let ok=0,failed=0;
  for(const job of due){
    let result;
    try{result=await send(job.push_token,{env});}
    catch{result={status:503,reason:"transport"};}
    if(result.status>=200&&result.status<300){
      db.prepare("UPDATE wallet_push_jobs SET state='sent',attempts=attempts+1,sent_at=?,last_attempt_at=? WHERE id=?").run(at,at,job.id);
      ok++;
    }else if([400,404,410].includes(result.status) &&
             ["BadDeviceToken","DeviceTokenNotForTopic","Unregistered"].includes(result.reason)){
      db.exec("BEGIN IMMEDIATE");
      try{
        db.prepare("DELETE FROM wallet_devices WHERE device_id=?").run(job.device_id);
        db.exec("COMMIT");
      }catch{db.exec("ROLLBACK");}
      failed++;
    }else{
      const attempts=job.attempts+1;
      const state=attempts>=5?"failed":"pending";
      const retryAt=at+Math.min(3600000,15000*2**attempts);
      db.prepare("UPDATE wallet_push_jobs SET state=?,attempts=?,next_attempt_at=?,last_attempt_at=? WHERE id=?")
        .run(state,attempts,retryAt,at,job.id);
      failed++;
    }
  }
  return {processed:due.length,sent:ok,failed};
}

export function startWalletPushWorker(db,{env=process.env,intervalMs=30000,send=sendWalletApns}={}){
  if(!walletUpdatesConfigured(env))return ()=>{};
  let running=false;
  const run=async()=>{
    if(running)return;
    running=true;
    try{await processWalletPushQueue(db,{env,send});}
    catch{ /* Fail closed; next poll retries. No credentials or device tokens are logged. */ }
    finally{running=false;}
  };
  const timer=setInterval(run,Math.max(10000,intervalMs));
  timer.unref?.();
  return ()=>clearInterval(timer);
}

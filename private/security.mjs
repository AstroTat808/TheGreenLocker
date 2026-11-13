import fs from "node:fs";
import path from "node:path";
import { createCipheriv, createDecipheriv, createHmac, randomBytes, createHash, timingSafeEqual, scryptSync } from "node:crypto";

const clock = () => Date.now();
const digest = value => createHash("sha256").update(String(value)).digest("hex");
const randomToken = () => randomBytes(32).toString("base64url");
const safeEqual = (a,b) => timingSafeEqual(createHash("sha256").update(String(a)).digest(),createHash("sha256").update(String(b)).digest());
const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const base32Encode = bytes => {
  let bits=0, value=0, result="";
  for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=5){result+=base32Alphabet[(value>>>(bits-=5))&31];}}
  return bits>0?result+base32Alphabet[(value<<(5-bits))&31]:result;
};
const base32Decode = input => {
  const data=String(input).toUpperCase().replace(/=+$/,"");
  if(!/^[A-Z2-7]+$/.test(data))throw new Error("Invalid MFA secret");
  let bits=0, value=0;const result=[];
  for(const letter of data){value=(value<<5)|base32Alphabet.indexOf(letter);bits+=5;if(bits>=8){result.push((value>>>(bits-=8))&255);}}
  return Buffer.from(result);
};
export function totpAt(secret, step=Math.floor(clock()/30000)) {
  const key=base32Decode(secret), bytes=Buffer.alloc(8);
  bytes.writeBigUInt64BE(BigInt(step));
  const mac=createHmac("sha1",key).update(bytes).digest(), offset=mac[19]&15;
  const value=(mac.readUInt32BE(offset)&0x7fffffff)%1000000;
  return String(value).padStart(6,"0");
}
function addColumn(db,table,name,sql) {
 const cols=db.prepare("PRAGMA table_info("+table+")").all().map(row=>row.name);
 if(!cols.includes(name))db.exec("ALTER TABLE "+table+" ADD COLUMN "+name+" "+sql);
}
export function installSecurity(db){
 addColumn(db,"users","email_verified_at","INTEGER");
 addColumn(db,"users","mfa_secret_enc","TEXT");
 addColumn(db,"users","mfa_pending_enc","TEXT");
 addColumn(db,"users","mfa_last_step","INTEGER NOT NULL DEFAULT -1");
 addColumn(db,"sessions","mfa_verified_at","INTEGER");
 db.exec("CREATE TABLE IF NOT EXISTS auth_tokens (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, purpose TEXT NOT NULL CHECK(purpose IN ('verify','reset')), expires_at INTEGER NOT NULL, consumed_at INTEGER, created_at INTEGER NOT NULL);");
 db.exec("CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id,purpose,consumed_at);");
 db.exec("CREATE TABLE IF NOT EXISTS mfa_recovery (code_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, used_at INTEGER);");
}
function makeEmailSender(dbPath, origin) {
 const mode=process.env.TGL_MAIL_MODE || (process.env.NODE_ENV==="production"?"": "outbox");
 if(mode==="outbox"){
   if(process.env.NODE_ENV==="production")throw new Error("Development mail outbox cannot be enabled in production or staging.");
   const filename=process.env.TGL_OUTBOX_PATH || (dbPath===":memory:"?path.join(process.cwd(),"data","dev-outbox.ndjson"):dbPath+".outbox.ndjson");
   return async ({to,subject,text})=>{
     fs.mkdirSync(path.dirname(filename),{recursive:true,mode:0o700});
     fs.appendFileSync(filename,JSON.stringify({to,subject,text,created_at:new Date().toISOString()})+"\n",{encoding:"utf8",mode:0o600});
   };
 }
 if(mode!=="resend")throw new Error("Set TGL_MAIL_MODE=resend for staging or production.");
 const apiKey=process.env.TGL_RESEND_API_KEY,from=process.env.TGL_EMAIL_FROM;
 if(!apiKey||!from)throw new Error("Set TGL_RESEND_API_KEY and verified sender TGL_EMAIL_FROM.");
 return async ({to,subject,text})=>{
   const response=await fetch("https://api.resend.com/emails",{
    method:"POST",headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json"},
    body:JSON.stringify({from,to:[to],subject,text})
   });
   if(!response.ok)throw new Error("Transactional mail transport rejected the message.");
 };
}
const attempts=new Map();
function throttle(ip,route,limit=10){
 const key=ip+":"+route,now=clock(),current=attempts.get(key);
 const item=current&&current.expires>now?current:{count:0,expires:now+900000};
 item.count++; if(attempts.size>5000) attempts.clear(); attempts.set(key,item);
 return item.count>limit;
}
const header=(title,content)=>'<section class="auth-panel"><span class="eyebrow">SECURE PRIVATE ACCESS</span><h1>'+title+'</h1>'+content+'</section>';
const input=(label,name,type="text",extra="")=>'<label>'+label+'<input type="'+type+'" name="'+name+'" '+extra+' required></label>';
const escapeHtml = v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const normalizeCode=v=>String(v??"").trim().toLowerCase().replace(/[^a-f0-9]/g,"");
const challengeForm=(csrf,action,label="Authentication code")=>'<form action="'+action+'" method="post"><input type="hidden" name="csrf" value="'+escapeHtml(csrf)+'">'+input(label,"code","text",'inputmode="numeric" autocomplete="one-time-code" minlength="6" maxlength="40"')+'<button class="private-button" type="submit">Verify identity</button></form>';
export function createSecurity({db,dbPath,origin,mailSender,respond,redirect,formBody,layout,csrfField}) {
 installSecurity(db);
 const mail=mailSender??makeEmailSender(dbPath,origin);
 const mfaKeyEncoded=process.env.TGL_MFA_ENCRYPTION_KEY;
 const mfaKey=mfaKeyEncoded?Buffer.from(mfaKeyEncoded,"base64"):null;
 if(mfaKey&&mfaKey.length!==32)throw new Error("TGL_MFA_ENCRYPTION_KEY must be exactly 32 random bytes encoded in base64.");
 if(process.env.NODE_ENV==="production"&&!mfaKey)throw new Error("TGL_MFA_ENCRYPTION_KEY is required for staging and production.");
 if(!origin || (process.env.NODE_ENV==="production"&&!origin.startsWith("https://")))throw new Error("Set TGL_PUBLIC_ORIGIN to an HTTPS URL for staging.");
 function encrypt(text){
  if(!mfaKey)throw new Error("MFA encryption key is not configured.");
  const nonce=randomBytes(12),cipher=createCipheriv("aes-256-gcm",mfaKey,nonce);
  const ciphertext=Buffer.concat([cipher.update(text,"utf8"),cipher.final()]);
  return [nonce.toString("base64url"),cipher.getAuthTag().toString("base64url"),ciphertext.toString("base64url")].join(".");
 }
 function decrypt(encrypted){
  if(!mfaKey)throw new Error("MFA encryption key is not configured.");
  const [n,t,c]=String(encrypted).split(".");
  if(!n||!t||!c)throw new Error("Invalid encrypted MFA secret");
  const decipher=createDecipheriv("aes-256-gcm",mfaKey,Buffer.from(n,"base64url"));
  decipher.setAuthTag(Buffer.from(t,"base64url"));
  return Buffer.concat([decipher.update(Buffer.from(c,"base64url")),decipher.final()]).toString("utf8");
 }
 async function issue(email,purpose){
  const user=db.prepare("SELECT id,email,email_verified_at FROM users WHERE email=?").get(String(email).toLowerCase());
  if(!user|| (purpose==="verify"&&user.email_verified_at!==null))return;
  const token=randomToken(),expires=clock()+(purpose==="verify"?24*3600000:30*60000);
  db.exec("BEGIN IMMEDIATE");
  try {
   db.prepare("UPDATE auth_tokens SET consumed_at=? WHERE user_id=? AND purpose=? AND consumed_at IS NULL").run(clock(),user.id,purpose);
   db.prepare("INSERT INTO auth_tokens(token_hash,user_id,purpose,expires_at,created_at) VALUES(?,?,?,?,?)").run(digest(token),user.id,purpose,expires,clock());
   db.exec("COMMIT");
  }catch(e){db.exec("ROLLBACK");throw e;}
  const url=origin+(purpose==="verify"?"/verify-email":"/reset-password")+"?token="+encodeURIComponent(token);
  try{
   await mail({to:user.email,subject:purpose==="verify"?"Verify your private Green Locker account":"Reset your Green Locker password",
    text:purpose==="verify"?"Confirm your private preview email address using this one-time link (expires in 24 hours):\n"+url:
    "A password reset was requested. If you requested it, use this one-time link within 30 minutes:\n"+url+"\nIf you did not request it, ignore this email."});
  }catch(e){console.error("Transactional mail delivery failed (no token content logged).");}
 }
 const tokenLookup=(raw,purpose)=>raw&&db.prepare("SELECT t.*,u.email FROM auth_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=? AND t.purpose=? AND t.consumed_at IS NULL AND t.expires_at>?").get(digest(raw),purpose,clock());
 function consume(raw,purpose,password){
  const token=tokenLookup(raw,purpose);
  if(!token)return false;
  db.exec("BEGIN IMMEDIATE");
  try{
   const claimed=db.prepare("UPDATE auth_tokens SET consumed_at=? WHERE token_hash=? AND consumed_at IS NULL AND expires_at>?").run(clock(),digest(raw),clock());
   if(claimed.changes!==1){db.exec("ROLLBACK");return false;}
   if(purpose==="verify")db.prepare("UPDATE users SET email_verified_at=COALESCE(email_verified_at,?) WHERE id=?").run(clock(),token.user_id);
   else{
     const salt=randomBytes(16).toString("hex");
     const hashPassword=(value,salt)=>scryptSync(value,salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024}).toString("hex");
     db.prepare("UPDATE users SET salt=?,password_hash=? WHERE id=?").run(salt,hashPassword(password,salt),token.user_id);
     db.prepare("DELETE FROM sessions WHERE user_id=?").run(token.user_id);
     db.prepare("UPDATE auth_tokens SET consumed_at=? WHERE user_id=? AND purpose='reset' AND consumed_at IS NULL").run(clock(),token.user_id);
   }
   db.exec("COMMIT");return true;
  }catch(e){db.exec("ROLLBACK");throw e;}
 }
 function response(res,title,content,code=200){
   return respond(res,code,layout(title,header(title,content)), "text/html; charset=utf-8",{"Referrer-Policy":"no-referrer"});
 }
 const basicForm=(action,fields,button)=>'<form action="'+action+'" method="post">'+fields+'<button class="private-button" type="submit">'+button+'</button></form>';
 async function publicRoutes({req,res,url,pathname,method}){
  const ip=req.socket.remoteAddress||"unknown";
  if(pathname==="/check-email"&&method==="GET"){
    response(res,"Check your email",'<p>Check your inbox for a private verification link. An account cannot log in until its email address has been verified.</p><p><a href="/resend-verification">Resend verification</a></p>');return true;
  }
  if(pathname==="/resend-verification"||pathname==="/forgot-password"){
    const forgot=pathname==="/forgot-password",title=forgot?"Reset your password":"Resend email verification";
    if(method==="GET"){response(res,title,basicForm(pathname,input("Email address","email","email",'maxlength="254" autocomplete="email"'),"Send instructions"));return true;}
    if(method==="POST"){
      if(!throttle(ip,pathname,5)){
        const data=await formBody(req),email=String(data.get("email")||"").trim().toLowerCase();
        if(email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))await issue(email,forgot?"reset":"verify");
      }
      response(res,"Check your email","<p>If the account is eligible, instructions will be sent. Check your inbox and spam folder.</p>");return true;
    }
  }
  if(pathname==="/verify-email"){
    const token=method==="GET"?url.searchParams.get("token"):"";
    if(method==="GET"){response(res,"Confirm your email", tokenLookup(token,"verify")?basicForm("/verify-email",'<input type="hidden" name="token" value="'+escapeHtml(token)+'">',"Confirm email address"):"<p>This verification link is expired or has already been used.</p>");return true;}
    if(method==="POST"){
      const data=await formBody(req);
      const success=consume(String(data.get("token")||""),"verify");
      response(res,success?"Email verified":"Invalid link",success?'<p>Your email is confirmed. <a href="/login">Log in to your private account</a>.</p>':"<p>This verification link is expired or has already been used.</p>",success?200:400);return true;
    }
  }
  if(pathname==="/reset-password"){
    const token=method==="GET"?url.searchParams.get("token"):"";
    if(method==="GET"){
      response(res,"Choose a new password",tokenLookup(token,"reset")?basicForm("/reset-password",'<input type="hidden" name="token" value="'+escapeHtml(token)+'">'+input("New password","password","password",'minlength="12" maxlength="128" autocomplete="new-password"'),"Set a new password"):"<p>This reset link is expired or has already been used.</p>");return true;
    }
    if(method==="POST"){
      const data=await formBody(req),pass=String(data.get("password")||"");
      const success=pass.length>=12&&pass.length<=128&&consume(String(data.get("token")||""),"reset",pass);
      response(res,success?"Password updated":"Invalid reset",success?'<p>Your previous sessions were revoked. <a href="/login">Log in again</a>.</p>':"<p>Password must have at least 12 characters and the reset link must be unused and unexpired.</p>",success?200:400);return true;
    }
  }
  return false;
 }
 function verifyStep(secret,code,last=-1) {
  if(!/^\d{6}$/.test(String(code)))return null;
  const current=Math.floor(clock()/30000);
  for(const step of [current,current-1,current+1])if(step>last&&safeEqual(totpAt(secret,step),code))return step;
  return null;
 }
 function mfaPage(res,user,content,code=200){return respond(res,code,layout("Administrator verification",header("Administrator verification",content),user,user.csrf));}
 async function mfaRoutes({req,res,user,pathname,method}){
  if(!pathname.startsWith("/admin/mfa")||user?.role!=="admin")return false;
  if(!user)return false;
  const account=db.prepare("SELECT mfa_secret_enc,mfa_pending_enc,mfa_last_step,email FROM users WHERE id=?").get(user.id);
  const csrfValid=p=>safeEqual(String(p.get("csrf")||""),user.csrf);
  const csrf=csrfField(user.csrf);
  if(method==="GET"&&(pathname==="/admin/mfa"||pathname==="/admin/mfa/verify")){
   if(account.mfa_secret_enc){
    if(user.mfa_verified_at){
      mfaPage(res,user,'<p>Two-factor authentication is enabled for this administrator account.</p><p><a href="/admin">Return to the dashboard</a>.</p>');
    }else{
      mfaPage(res,user,'<p>Enter a current authenticator app code or an unused recovery code to continue.</p>'+challengeForm(user.csrf,"/admin/mfa/verify","Authenticator or recovery code"));
    }
   }else{
    const pending=account.mfa_pending_enc?decrypt(account.mfa_pending_enc):null;
    const instructions=pending?'<p>Enter this secret into your authenticator app, then confirm a six-digit code to activate MFA.</p><p class="mfa-secret"><code>'+escapeHtml(pending)+'</code></p><p>Account: '+escapeHtml(account.email)+'</p>'+challengeForm(user.csrf,"/admin/mfa/confirm"):'<p>Administrator access requires an authenticator app. Generate a secret to begin enrollment.</p>'+basicForm("/admin/mfa/start",csrf,"Begin authenticator setup");
    mfaPage(res,user,instructions);
   }
   return true;
  }
  if(method==="POST"&&pathname==="/admin/mfa/start"){
    const p=await formBody(req);
    if(!csrfValid(p))return respond(res,403,"Invalid request token","text/plain; charset=utf-8"),true;
    if(!account.mfa_secret_enc){
      if(!mfaKey)return mfaPage(res,user,"<p>MFA encryption is not configured. Administrator access remains unavailable.</p>",503),true;
      const secret=base32Encode(randomBytes(20));
      db.prepare("UPDATE users SET mfa_pending_enc=? WHERE id=?").run(encrypt(secret),user.id);
    }
    return redirect(res,"/admin/mfa"),true;
  }
  if(method==="POST"&&pathname==="/admin/mfa/confirm"){
    if(throttle(req.socket.remoteAddress||"unknown","mfa-confirm",10))return mfaPage(res,user,"<p>Too many attempts. Try again later.</p>",429),true;
    const p=await formBody(req);
    if(!csrfValid(p)||!account.mfa_pending_enc||account.mfa_secret_enc)return mfaPage(res,user,"<p>Unable to confirm enrollment.</p>",403),true;
    const secret=decrypt(account.mfa_pending_enc);
    const step=verifyStep(secret,String(p.get("code")||""));
    if(step===null)return mfaPage(res,user,'<p>Invalid authenticator code. <a href="/admin/mfa">Try again</a>.</p>',400),true;
    const codes=Array.from({length:8},()=>randomBytes(12).toString("hex").match(/.{1,4}/g).join("-"));
    db.exec("BEGIN IMMEDIATE");
    try{
      db.prepare("UPDATE users SET mfa_secret_enc=?,mfa_pending_enc=NULL,mfa_last_step=? WHERE id=?").run(account.mfa_pending_enc,step,user.id);
      for(const code of codes)db.prepare("INSERT INTO mfa_recovery(code_hash,user_id) VALUES(?,?)").run(digest(normalizeCode(code)),user.id);
      db.prepare("UPDATE sessions SET mfa_verified_at=? WHERE id_hash=?").run(clock(),user.id_hash);
      db.exec("COMMIT");
    }catch(e){db.exec("ROLLBACK");throw e;}
    mfaPage(res,{...user,mfa_verified_at:clock()},'<p><strong>MFA enabled.</strong> Save these single-use recovery codes securely now; they cannot be displayed again.</p><pre class="mfa-codes">'+codes.map(escapeHtml).join("\n")+'</pre><p><a href="/admin">Continue to administration</a></p>');return true;
  }
  if(method==="POST"&&pathname==="/admin/mfa/verify"){
    if(throttle(req.socket.remoteAddress||"unknown","mfa-login",10))return mfaPage(res,user,"<p>Too many MFA attempts.</p>",429),true;
    const p=await formBody(req);
    if(!csrfValid(p)||!account.mfa_secret_enc)return mfaPage(res,user,"<p>Invalid authentication request.</p>",403),true;
    const code=String(p.get("code")||"").trim();
    let valid=false;
    db.exec("BEGIN IMMEDIATE");
    try{
      const step=verifyStep(decrypt(account.mfa_secret_enc),code,account.mfa_last_step);
      if(step!==null){
        valid=Boolean(db.prepare("UPDATE users SET mfa_last_step=? WHERE id=? AND mfa_last_step<?").run(step,user.id,step).changes);
      }else {
        const normalized=normalizeCode(code);
        if(normalized.length===24)valid=Boolean(db.prepare("UPDATE mfa_recovery SET used_at=? WHERE user_id=? AND code_hash=? AND used_at IS NULL").run(clock(),user.id,digest(normalized)).changes);
      }
      if(valid)db.prepare("UPDATE sessions SET mfa_verified_at=? WHERE id_hash=?").run(clock(),user.id_hash);
      db.exec("COMMIT");
    }catch(e){db.exec("ROLLBACK");throw e;}
    if(!valid)return mfaPage(res,user,'<p>Invalid or previously used code. <a href="/admin/mfa">Try again</a>.</p>',401),true;
    return redirect(res,"/admin"),true;
  }
  return false;
 }
 return {issue,publicRoutes,mfaRoutes};
}

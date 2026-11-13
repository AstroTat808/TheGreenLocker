/**
 * Admin-only Wallet operations dashboard and certificate-expiration monitoring.
 * Never serializes signing PEM, private keys, APNs tokens, HMAC secrets or raw device IDs.
 * APNs "sent" means provider accepted a push; it does NOT prove iPhone delivery.
 */
import { X509Certificate, createHash, createPrivateKey } from "node:crypto";
import { walletConfigured } from "./wallet-pass.mjs";
import { walletUpdatesConfigured } from "./wallet-updates.mjs";

const MS_DAY=86400000;
const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,c=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));
const statusStyle=state=>["healthy","warning","critical","expired","invalid","missing"].includes(state)?state:"unknown";
const formatUTC=value=>{
  if(!Number.isFinite(value)||value<=0)return "Not recorded";
  return new Date(value).toISOString().replace("T"," ").slice(0,16)+" UTC";
};
const number=value=>Number(value||0);
const count=(db,sql)=>number(db.prepare(sql).get()?.total);
const plausibleEmail=value=>typeof value==="string"&&value.length<=254&&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const readPem=(b64)=>{
  if(typeof b64!=="string"||b64.length>100000||
     !/^[A-Za-z0-9+/\r\n=]+$/.test(b64))throw Error("Invalid certificate encoding");
  const value=Buffer.from(b64,"base64").toString("utf8");
  if(!value.includes("-----BEGIN CERTIFICATE-----")||!value.includes("-----END CERTIFICATE-----"))
    throw Error("Expected X.509 PEM certificate");
  return value;
};

export function inspectWalletCertificates(env=process.env,{at=Date.now()}={}){
  const specs=[
    ["signer","Apple Pass Type signing certificate","TGL_WALLET_SIGNER_CERT_B64"],
    ["wwdr","Apple WWDR certificate chain","TGL_WALLET_WWDR_CERT_B64"]
  ];
  const certificates=specs.map(([key,label,variable])=>{
    const val=env[variable];
    if(!val)return {key,label,state:"missing",daysRemaining:null,expiresAt:null,fingerprint:null};
    try{
      const cert=new X509Certificate(readPem(val));
      const expiry=Date.parse(cert.validTo);
      if(!Number.isFinite(expiry))throw Error("Invalid certificate expiration");
      const daysRemaining=Math.ceil((expiry-at)/MS_DAY);
      const state=expiry<=at?"expired":daysRemaining<=7?"critical":daysRemaining<=30?"warning":"healthy";
      return {
        key,label,state,daysRemaining,
        expiresAt:new Date(expiry).toISOString(),
        fingerprint:cert.fingerprint256.replace(/:/g,"").slice(0,16),
        pemCertificate:cert // private internal metadata; never serialize
      };
    }catch{
      return {key,label,state:"invalid",daysRemaining:null,expiresAt:null,fingerprint:null};
    }
  });
  const signer=certificates[0],signerB64=env.TGL_WALLET_SIGNER_CERT_B64;
  let keyCheck="missing";
  if(env.TGL_WALLET_PRIVATE_KEY_B64){
    if(signer.pemCertificate){
      try{
        const pem=Buffer.from(env.TGL_WALLET_PRIVATE_KEY_B64,"base64").toString("utf8");
        const key=createPrivateKey(pem);
        keyCheck=signer.pemCertificate.checkPrivateKey(key)?"valid":"mismatch";
      }catch{keyCheck="invalid";}
    }else keyCheck="unverifiable";
  }
  // Strip certificate handles and fingerprints from serialized admin data.
  return {
    certificates:certificates.map(({key,label,state,daysRemaining,expiresAt})=>({
      key,label,state,daysRemaining,expiresAt
    })),
    keyCheck,
    signingConfigured:walletConfigured(env),
    updatesConfigured:walletUpdatesConfigured(env)
  };
}

export function walletOperationsSnapshot(db,{env=process.env,at=Date.now()}={}){
  const cert=inspectWalletCertificates(env,{at});
  const metrics={
    devices:count(db,"SELECT COUNT(*) total FROM wallet_devices"),
    registrations:count(db,"SELECT COUNT(*) total FROM wallet_registrations"),
    membersWithPasses:count(db,"SELECT COUNT(DISTINCT user_id) total FROM wallet_registrations"),
    optedIn:count(db,"SELECT COUNT(*) total FROM users WHERE wallet_updates_enabled=1"),
    queued:count(db,"SELECT COUNT(*) total FROM wallet_push_jobs WHERE state='pending'"),
    retries:count(db,"SELECT COUNT(*) total FROM wallet_push_jobs WHERE state='pending' AND attempts>0"),
    accepted:count(db,"SELECT COUNT(*) total FROM wallet_push_jobs WHERE state='sent'"),
    failed:count(db,"SELECT COUNT(*) total FROM wallet_push_jobs WHERE state='failed'")
  };
  const registrations=db.prepare(
    "SELECT substr(COALESCE(u.member_code,'----'),-4) member_suffix,"+
    "r.registered_at,u.wallet_updates_enabled FROM wallet_registrations r "+
    "JOIN users u ON u.id=r.user_id ORDER BY r.registered_at DESC,r.user_id DESC LIMIT 12"
  ).all().map(row=>({
    member:"••••"+row.member_suffix,
    registeredAt:Number(row.registered_at||0),
    updatesEnabled:Number(row.wallet_updates_enabled)===1
  }));
  const jobs=db.prepare(
    "SELECT j.id,j.state,j.attempts,j.created_at,j.next_attempt_at,j.sent_at,j.last_attempt_at,"+
    "substr(COALESCE(u.member_code,'----'),-4) member_suffix "+
    "FROM wallet_push_jobs j JOIN users u ON u.id=j.user_id ORDER BY j.id DESC LIMIT 15"
  ).all().map(row=>({
    id:row.id,
    member:"••••"+row.member_suffix,
    state:row.state,attempts:Number(row.attempts),
    createdAt:Number(row.created_at),
    nextAttemptAt:Number(row.next_attempt_at),
    sentAt:Number(row.sent_at||0),lastAttemptAt:Number(row.last_attempt_at||0)
  }));
  const alerts=[];
  if(!cert.signingConfigured)alerts.push({
    level:"warning",message:"Apple Wallet signing is not configured. No installable passes can be issued."
  });
  else if(cert.keyCheck==="mismatch"||cert.keyCheck==="invalid"||cert.keyCheck==="unverifiable"){
    alerts.push({level:"critical",message:"Signing key cannot be verified against the Pass Type certificate."});
  }
  for(const x of cert.certificates){
    if(x.state==="healthy")continue;
    const message=x.state==="missing"?x.label+" is not configured.":
      x.state==="invalid"?x.label+" cannot be parsed.":
      x.state==="expired"?x.label+" is expired.":
      x.label+" expires in "+x.daysRemaining+" day"+(x.daysRemaining===1?"":"s")+".";
    alerts.push({level:statusStyle(x.state),message});
  }
  if(metrics.failed>0)alerts.push({
    level:"critical",message:metrics.failed+" Wallet update job(s) exhausted all retries. Review APNs delivery."
  });
  if(metrics.retries>0)alerts.push({
    level:"warning",message:metrics.retries+" Wallet update job(s) are awaiting retry."
  });
  return {
    checkedAt:at,certificates:cert.certificates,keyCheck:cert.keyCheck,
    signingConfigured:cert.signingConfigured,updatesConfigured:cert.updatesConfigured,
    emailAlertEnabled:emailAlertsConfigured(env),
    metrics,registrations,jobs,alerts
  };
}

export function renderWalletOperationsPage(snapshot,{layout,user,csrf}){
  const {metrics,alerts,certificates,jobs,registrations}=snapshot;
  const badges=items=>items.map(item=>
    '<article class="wallet-monitor-metric"><strong>'+number(item[1])+'</strong>'+
    '<span>'+escapeHtml(item[0])+'</span></article>').join("");
  const certMarkup=certificates.map(x=>{
    const title=escapeHtml(x.label);
    const expiry=x.expiresAt?formatUTC(Date.parse(x.expiresAt)):"Not available";
    const time=x.daysRemaining===null?"Certificate is missing or invalid":
      x.state==="expired"?"Expired":x.daysRemaining+" day"+(x.daysRemaining===1?"":"s")+" remaining";
    return '<article class="wallet-cert-row wallet-monitor-'+statusStyle(x.state)+'">'+
      '<div><strong>'+title+'</strong><span>Expires: '+escapeHtml(expiry)+'</span></div>'+
      '<span class="wallet-monitor-pill">'+escapeHtml(x.state.toUpperCase())+'</span>'+
      '<small>'+escapeHtml(time)+'</small></article>';
  }).join("");
  const recentReg=registrations.map(row=>
    '<tr><td>'+escapeHtml(row.member)+'</td><td>'+escapeHtml(formatUTC(row.registeredAt))+
    '</td><td>'+(row.updatesEnabled?"Opted in":"Disabled")+'</td></tr>'
  ).join("");
  const recentJobs=jobs.map(row=>{
    const state=row.state==="sent"?"Accepted by APNs":
      row.state==="failed"?"Failed after retries":
      row.attempts>0?"Retry scheduled":"Queued";
    const time=row.state==="sent"?row.sentAt:row.state==="pending"?row.nextAttemptAt:row.lastAttemptAt||row.createdAt;
    return '<tr><td>'+escapeHtml(row.member)+'</td><td>'+
      '<span class="wallet-monitor-pill wallet-monitor-'+
      (row.state==="failed"?"critical":row.state==="sent"?"healthy":"warning")+'">'+
      escapeHtml(state)+'</span></td><td>'+number(row.attempts)+'</td><td>'+
      escapeHtml(formatUTC(time))+'</td></tr>';
  }).join("");
  const alertMarkup=alerts.map(x=>
    '<li class="wallet-monitor-alert wallet-monitor-'+statusStyle(x.level)+'">'+escapeHtml(x.message)+'</li>'
  ).join("");
  const alertHealth=snapshot.emailAlertEnabled
    ?"Enabled: opt-in certificate alerts go to the configured operations mailbox."
    :"Disabled: certificate warnings are visible here; email requires explicit operations configuration.";
  const body=
    '<section class="private-title wallet-monitor-title">'+
      '<span class="eyebrow">ADMINISTRATOR / WALLET OPERATIONS</span>'+
      '<h1>Wallet <em>Operations.</em></h1>'+
      '<p>Monitor private membership registrations, Apple Wallet push acceptance, and signing-certificate expiry. No private keys, device IDs, or push tokens are displayed.</p>'+
      '<a class="wallet-monitor-return" href="/admin">Return to operations dashboard</a>'+
    '</section>'+
    '<section class="wallet-monitor-summary" aria-label="Wallet service readiness">'+
      '<div><span>Pass issuance</span><strong>'+ (snapshot.signingConfigured?"Configured (signing unverified)":"Not configured")+'</strong></div>'+
      '<div><span>Auto-updates</span><strong>'+(snapshot.updatesConfigured?"Enabled":"Disabled")+'</strong></div>'+
      '<div><span>Key match</span><strong>'+escapeHtml(snapshot.keyCheck==="valid"?"Verified":snapshot.keyCheck==="missing"?"Not configured":"Needs attention")+'</strong></div>'+
      '<div><span>Checked</span><strong>'+escapeHtml(formatUTC(snapshot.checkedAt))+'</strong></div>'+
    '</section>'+
    '<section class="wallet-monitor-section" aria-labelledby="wallet-monitor-alert-heading">'+
      '<h2 id="wallet-monitor-alert-heading">Operational alerts</h2>'+
      (alertMarkup?'<ul class="wallet-monitor-alerts" role="list">'+alertMarkup+'</ul>':
       '<p class="wallet-monitor-clear">No active Wallet or certificate alerts.</p>')+
      '<p class="wallet-monitor-hint">'+escapeHtml(alertHealth)+'</p>'+
    '</section>'+
    '<section class="wallet-monitor-section" aria-labelledby="wallet-monitor-metrics-heading">'+
      '<h2 id="wallet-monitor-metrics-heading">Registrations and update delivery</h2>'+
      '<div class="wallet-monitor-metrics">'+badges([
        ["Registered devices",metrics.devices],["Active registrations",metrics.registrations],
        ["Registered members",metrics.membersWithPasses],["Members opted in",metrics.optedIn],
        ["Queued updates",metrics.queued],["Pending retries",metrics.retries],
        ["APNs accepted",metrics.accepted],["Terminal failures",metrics.failed]
      ])+'</div>'+
      '<p class="wallet-monitor-hint">“APNs accepted” means Apple’s push service accepted the notification; it is not confirmation that an iPhone installed the updated pass.</p>'+
    '</section>'+
    '<section class="wallet-monitor-section" aria-labelledby="wallet-monitor-certs-heading">'+
      '<h2 id="wallet-monitor-certs-heading">Signing certificate watch</h2>'+
      '<p class="wallet-monitor-hint">Read-only X.509 validity checks. Warning at 30 days, critical at 7 days; optional email milestones at 30, 14, and 7 days.</p>'+
      '<div class="wallet-monitor-certificates">'+certMarkup+'</div>'+
    '</section>'+
    '<div class="wallet-monitor-tables">'+
      '<section class="wallet-monitor-section" aria-labelledby="wallet-monitor-registrations-heading">'+
        '<h2 id="wallet-monitor-registrations-heading">Recent registrations</h2>'+
        '<div class="scroll-table"><table><thead><tr><th>Member reference</th><th>Recorded (UTC)</th><th>Preference</th></tr></thead>'+
        '<tbody>'+(recentReg||'<tr><td colspan="3">No Wallet device registrations yet.</td></tr>')+'</tbody></table></div>'+
      '</section>'+
      '<section class="wallet-monitor-section" aria-labelledby="wallet-monitor-delivery-heading">'+
        '<h2 id="wallet-monitor-delivery-heading">Recent update jobs</h2>'+
        '<div class="scroll-table"><table><thead><tr><th>Member</th><th>Delivery status</th><th>Attempts</th><th>Time (UTC)</th></tr></thead>'+
        '<tbody>'+(recentJobs||'<tr><td colspan="4">No update notifications have been queued.</td></tr>')+'</tbody></table></div>'+
      '</section>'+
    '</div>'+
    '<p class="wallet-monitor-footer">This is a private, non-transactional concept environment. Wallet cards do not establish age, identity, entry, or purchase eligibility.</p>';
  return layout("Wallet Operations",body,user,csrf);
}

export function installWalletMonitorSchema(db){
  const regCols=db.prepare("PRAGMA table_info(wallet_registrations)").all().map(x=>x.name);
  if(!regCols.includes("registered_at"))
    db.exec("ALTER TABLE wallet_registrations ADD COLUMN registered_at INTEGER NOT NULL DEFAULT 0;");
  const jobCols=db.prepare("PRAGMA table_info(wallet_push_jobs)").all().map(x=>x.name);
  if(!jobCols.includes("sent_at"))
    db.exec("ALTER TABLE wallet_push_jobs ADD COLUMN sent_at INTEGER;");
  if(!jobCols.includes("last_attempt_at"))
    db.exec("ALTER TABLE wallet_push_jobs ADD COLUMN last_attempt_at INTEGER;");
  db.exec("CREATE TABLE IF NOT EXISTS wallet_certificate_alerts ("+
    "alert_key TEXT PRIMARY KEY,created_at INTEGER NOT NULL);");
}

export function emailAlertsConfigured(env=process.env){
  // Alert mail is independent of the workshop's local account-email outbox.
  // Explicit opt-in and verified Resend sender are both required.
  return env.TGL_WALLET_ALERTS_ENABLED==="1" &&
    plausibleEmail(env.TGL_WALLET_ALERT_EMAIL) &&
    Boolean(env.TGL_RESEND_API_KEY && plausibleEmail(env.TGL_EMAIL_FROM));
}

function alertEvent(cert){
  if(cert.state==="healthy")return null;
  const milestone=cert.state==="missing"?"missing":cert.state==="invalid"?"invalid":
    cert.state==="expired"?"expired":
    cert.daysRemaining<=7?"7-day":cert.daysRemaining<=14?"14-day":"30-day";
  const label=cert.label;
  const message=cert.state==="missing"?"is missing":
    cert.state==="invalid"?"is invalid":
    cert.state==="expired"?"has expired":
    "expires in "+cert.daysRemaining+" day"+(cert.daysRemaining===1?"":"s");
  return {key:cert.key+":"+milestone+":"+(cert.expiresAt||"none"),
    label,message,milestone};
}

export async function dispatchWalletCertificateAlerts(db,{
  env=process.env,at=Date.now(),send
}={}){
  if(!emailAlertsConfigured(env))return {sent:false,disabled:true,events:0};
  const certs=inspectWalletCertificates(env,{at}).certificates;
  const news=certs.map(alertEvent).filter(Boolean).filter(event=>{
    const key=createHash("sha256").update(event.key).digest("hex");
    return !db.prepare("SELECT 1 FROM wallet_certificate_alerts WHERE alert_key=?").get(key);
  });
  if(!news.length)return {sent:false,disabled:false,events:0};
  const subject="[Green Locker Wallet] Certificate action required";
  const body="Private Wallet operations certificate alert.\n\n"+
    news.map(e=>e.label+" "+e.message+".").join("\n")+
    "\n\nInspect the authenticated Wallet Operations dashboard. "+
    "This message includes no credentials or private keys.\n";
  const sender=send || (async ({to,subject,text})=>{
    const response=await fetch("https://api.resend.com/emails",{
      method:"POST",
      headers:{
        Authorization:"Bearer "+env.TGL_RESEND_API_KEY,
        "Content-Type":"application/json"
      },
      body:JSON.stringify({from:env.TGL_EMAIL_FROM,to:[to],subject,text})
    });
    if(!response.ok)throw Error("Wallet certificate alert transport rejected the message");
  });
  try{
    await sender({to:env.TGL_WALLET_ALERT_EMAIL,subject,text:body});
  }catch{
    return {sent:false,disabled:false,events:news.length,failed:true};
  }
  db.exec("BEGIN IMMEDIATE");
  try{
    for(const event of news){
      const key=createHash("sha256").update(event.key).digest("hex");
      db.prepare("INSERT OR IGNORE INTO wallet_certificate_alerts(alert_key,created_at) VALUES(?,?)")
        .run(key,at);
    }
    db.exec("COMMIT");
  }catch{
    db.exec("ROLLBACK");
    return {sent:true,disabled:false,events:news.length,unrecorded:true};
  }
  return {sent:true,disabled:false,events:news.length};
}

export function startWalletCertificateWatch(db,{
  env=process.env,intervalMs=6*60*60*1000,send
}={}){
  if(!emailAlertsConfigured(env))return ()=>{};
  let busy=false;
  const tick=async()=>{
    if(busy)return;
    busy=true;
    try{await dispatchWalletCertificateAlerts(db,{env,send});}
    catch{ /* fail closed; next inspection will retry */ }
    finally{busy=false;}
  };
  const first=setTimeout(tick,2500);
  first.unref?.();
  const interval=setInterval(tick,Math.max(60000,intervalMs));
  interval.unref?.();
  return ()=>{clearTimeout(first);clearInterval(interval);};
}

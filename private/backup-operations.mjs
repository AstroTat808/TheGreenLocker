/** Private backup-operations dashboard and fail-closed retention policy. */
import fs from "node:fs";
import path from "node:path";
import {randomBytes} from "node:crypto";

const escape=x=>String(x??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const safeRead=(file)=>{try{return JSON.parse(fs.readFileSync(file,"utf8"));}catch{return null;}};
const number=x=>Number.isFinite(Number(x))?Number(x):0;
const dateLabel=x=>{const d=new Date(x||0);return Number.isFinite(d.getTime())?d.toISOString().replace("T"," ").slice(0,19)+" UTC":"Not recorded";};
const statusLabel=(s)=>s==="healthy"?"Healthy":s==="stale"?"Overdue":s==="degraded"?"Degraded":"Not verified";
const textRow=(title,value)=>'<div class="backup-item"><span>'+escape(title)+'</span><strong>'+escape(value)+'</strong></div>';
const badge=(value)=>'<span class="backup-status '+escape(value)+'">'+escape(statusLabel(value))+'</span>';
export function backupPaths(directory){
 const root=path.resolve(directory);
 return {status:path.join(root,"backup-status.json"),operations:path.join(root,"backup-operations.json"),policy:path.join(root,"backup-policy.json")};
}
export function readBackupPolicy(directory,env=process.env){
 const saved=safeRead(backupPaths(directory).policy)||{};
 const configured=Number(env.TGL_BACKUP_RETENTION_DAYS||90);
 const retentionDays=Number.isInteger(saved.retentionDays)&&saved.retentionDays>=30&&saved.retentionDays<=365?
   saved.retentionDays:Number.isInteger(configured)&&configured>=30&&configured<=365?configured:90;
 const mode=saved.mode==="enforce"?"enforce":"dry-run";
 return {retentionDays,mode,minimumCopies:14};
}
export function saveBackupPolicy(directory,{retentionDays,mode,confirmation,secondaryVerified}){
 const days=Number(retentionDays);
 if(!Number.isInteger(days)||days<30||days>365||!["dry-run","enforce"].includes(mode))
  throw Error("Retention must be between 30 and 365 days.");
 if(mode==="enforce" && (confirmation!=="DELETE EXPIRED BACKUPS"||!secondaryVerified))
  throw Error("Enforced deletion requires a verified independent copy and explicit confirmation.");
 const folder=path.resolve(directory);
 fs.mkdirSync(folder,{recursive:true,mode:0o700});
 const dest=backupPaths(folder).policy;
 const tmp=dest+"."+randomBytes(8).toString("hex")+".tmp";
 const result={retentionDays:days,mode,updatedAt:new Date().toISOString()};
 fs.writeFileSync(tmp,JSON.stringify(result,null,2)+"\n",{flag:"wx",mode:0o600});
 fs.renameSync(tmp,dest);
 return result;
}
export function backupOperationsSnapshot(directory,env=process.env,when=Date.now()){
 const paths=backupPaths(directory);
 const success=safeRead(paths.status);
 const ops=safeRead(paths.operations)||{};
 const verifiedAt=success?.verifiedAt;
 const ageMs=verifiedAt?when-Date.parse(verifiedAt):Infinity;
 const dueMs=26*60*60*1000;
 const base=Number.isFinite(ageMs)&&ageMs>=0&&ageMs<=dueMs?"healthy":
  verifiedAt?"stale":"missing";
 const primary=success?.targets?.primary||null;
 const mirror=success?.targets?.secondary||null;
 const secondaryConfigured=Boolean(env.TGL_BACKUP_SECONDARY_S3_ENDPOINT);
 const secondaryVerified=Boolean(mirror?.verifiedAt&&
   when-Date.parse(mirror.verifiedAt)<dueMs);
 const required=env.TGL_BACKUP_REQUIRE_SECONDARY==="1";
 const status=required&&!secondaryVerified?"degraded":base;
 const policy=readBackupPolicy(directory,env);
 const events=Array.isArray(ops.history)?ops.history.slice(-20).reverse().filter(x=>x&&typeof x==="object"):[];
 return {status,ageHours:Number.isFinite(ageMs)?Math.max(0,Math.round(ageMs/360000)/10):null,
   verifiedAt:verifiedAt||null,latestObjectKey:success?.objectKey||null,
   images:number(success?.images),users:number(success?.users),bytes:number(success?.bytes),
   successCount:number(ops.successCount),failureCount:number(ops.failureCount),
   consecutiveFailures:number(ops.consecutiveFailures),lastAttemptAt:ops.lastAttemptAt||null,
   lastFailureAt:ops.lastFailureAt||null,lastFailureReason:ops.lastFailureReason||null,
   lastAlertAt:ops.lastAlertAt||null,alertDelivery:ops.alertDelivery||"not-configured",
   primaryVerified:!!primary||!!verifiedAt,secondaryConfigured,secondaryVerified,secondaryRequired:required,
   alertConfigured:env.TGL_BACKUP_ALERT_ENABLED==="1"&&!!env.TGL_BACKUP_ALERT_API_KEY&&
    !!env.TGL_BACKUP_ALERT_FROM&&!!env.TGL_BACKUP_ALERT_TO,
   policy,events};
}
export function renderBackupOperationsPage(snapshot,{layout,user,csrf,notice=""}){
 const s=snapshot,policy=s.policy;
 const rows=s.events.map(e=>'<tr><td>'+escape(dateLabel(e.at))+'</td><td>'+escape(e.type)+'</td><td>'+
   escape(e.target||"—")+'</td><td>'+escape(e.code||"—")+'</td></tr>').join("");
 const controls='<section class="private-panel"><h2>Retention controls</h2>'+
   '<p>Expired archives are preserved until a verified independent copy exists and enforcement is explicitly enabled.</p>'+
   '<form method="post" action="/admin/backups/policy" class="backup-form">'+
   '<input type="hidden" name="csrf" value="'+escape(csrf)+'">'+
   '<label>Keep archives for at least this many days<input type="number" name="retention_days" min="30" max="365" step="1" value="'+policy.retentionDays+'"></label>'+
   '<label>Cleanup mode<select name="mode"><option value="dry-run"'+(policy.mode==="dry-run"?" selected":"")+'>Preview only (no deletions)</option>'+
   '<option value="enforce"'+(policy.mode==="enforce"?" selected":"")+'>Enforce after independent recovery is verified</option></select></label>'+
   '<label>Enable-deletion confirmation (only for enforcement)<input name="confirmation" type="text" maxlength="32" autocomplete="off" placeholder="DELETE EXPIRED BACKUPS"></label>'+
   '<button class="private-button" type="submit">Save retention policy</button></form>'+
   '<p>Safety floor: '+policy.minimumCopies+' recent archives retained; nothing deletes while offsite mirror verification is missing.</p></section>';
 const body='<section class="private-title"><span class="eyebrow">ADMIN / OPERATIONS</span><h1>Encrypted Backup Operations</h1>'+
   '<p>Private staging only · timestamps UTC · no credentials or decryption keys are displayed.</p></section>'+
   (notice?'<p role="status" class="form-ok">'+escape(notice)+'</p>':"")+
   '<section class="private-panel"><h2>Verified restore readiness '+badge(s.status)+'</h2>'+
   '<div class="backup-grid">'+
   textRow("Last verified backup",dateLabel(s.verifiedAt))+
   textRow("Last attempt",dateLabel(s.lastAttemptAt))+
   textRow("Archive age",s.ageHours===null?"Unknown":s.ageHours+" hours")+
   textRow("Recovered users",s.users)+
   textRow("Gallery images",s.images)+
   textRow("Ciphertext size",s.bytes.toLocaleString()+" bytes")+
   textRow("Verified successful runs",s.successCount)+
   textRow("Consecutive failures",s.consecutiveFailures)+
   '</div><p>Most recent encrypted object: <code>'+escape(s.latestObjectKey||"None")+'</code></p></section>'+
   '<section class="private-panel"><h2>Locations and alert delivery</h2><div class="backup-grid">'+
   textRow("Railway IAD backup",s.primaryVerified?"Verified":"Not verified")+
   textRow("Independent provider",s.secondaryVerified?"Verified":s.secondaryConfigured?"Configured; not verified":"Not connected")+
   textRow("Independent copy required",s.secondaryRequired?"Yes":"No")+
   textRow("Failure notifications",s.alertConfigured?"Configured":"Not configured")+
   textRow("Last alert",dateLabel(s.lastAlertAt))+
   textRow("Alert delivery",s.alertDelivery)+
   '</div>'+(s.lastFailureAt?'<p role="alert">Last backup failure: '+escape(dateLabel(s.lastFailureAt))+
     ' · '+escape(s.lastFailureReason||"Unknown failure")+'</p>':"")+'</section>'+
   controls+
   '<section class="private-panel"><h2>Recent backup events</h2><div class="scroll-table"><table><thead>'+
   '<tr><th>UTC</th><th>Event</th><th>Destination</th><th>Result</th></tr></thead><tbody>'+
   (rows||'<tr><td colspan="4">No recorded events yet</td></tr>')+'</tbody></table></div></section>';
 return layout("Backup operations",body,user,csrf);
}

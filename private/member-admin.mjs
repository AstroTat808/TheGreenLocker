import {randomBytes,createHash} from "node:crypto";
import {revokeWalletRegistrations} from "./wallet-updates.mjs";

const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const digest=value=>createHash("sha256").update(String(value)).digest("hex");
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAY=24*60*60*1000;
export const MEMBER_STATES=["pending","active","suspended"];

export function installMemberAdministration(db){
  const cols=db.prepare("PRAGMA table_info(users)").all().map(x=>x.name);
  if(!cols.includes("membership_state"))
    db.exec("ALTER TABLE users ADD COLUMN membership_state TEXT NOT NULL DEFAULT 'active' CHECK(membership_state IN ('pending','active','suspended'))");
  if(!cols.includes("membership_changed_at"))
    db.exec("ALTER TABLE users ADD COLUMN membership_changed_at INTEGER");
  db.exec(
    "CREATE TABLE IF NOT EXISTS member_invitations("+
    "id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT NOT NULL COLLATE NOCASE,"+
    "token_hash TEXT NOT NULL UNIQUE,created_by INTEGER NOT NULL REFERENCES users(id),"+
    "created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,"+
    "used_at INTEGER,used_by INTEGER REFERENCES users(id),revoked_at INTEGER);"+
    "CREATE INDEX IF NOT EXISTS idx_member_invitations_email ON member_invitations(email);"+
    "CREATE INDEX IF NOT EXISTS idx_member_invitations_expiry ON member_invitations(expires_at);"+
    "CREATE TABLE IF NOT EXISTS member_admin_audit("+
    "id INTEGER PRIMARY KEY AUTOINCREMENT,actor_id INTEGER NOT NULL REFERENCES users(id),"+
    "target_user_id INTEGER REFERENCES users(id),invitation_id INTEGER REFERENCES member_invitations(id),"+
    "action TEXT NOT NULL,created_at INTEGER NOT NULL);"+
    "CREATE INDEX IF NOT EXISTS idx_member_admin_audit_time ON member_admin_audit(created_at);"
  );
}
export function normalizeInviteEmail(value){
  const email=String(value??"").trim().toLowerCase();
  return email.length<=254&&emailPattern.test(email)?email:null;
}
export function createMemberInvitation(db,{actorId,email,validDays=3,at=Date.now()}){
  const target=normalizeInviteEmail(email),days=Number(validDays);
  if(!target||![1,3,7].includes(days)||!Number.isSafeInteger(actorId)||actorId<1)
    throw new TypeError("Invalid invitation details");
  const existing=db.prepare("SELECT id FROM users WHERE email=?").get(target);
  if(existing)throw new Error("This email already has a member account");
  const token=randomBytes(32).toString("base64url"),expiresAt=at+days*DAY;
  db.exec("BEGIN IMMEDIATE");
  try{
    db.prepare("UPDATE member_invitations SET revoked_at=? WHERE email=? "+
      "AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?")
      .run(at,target,at);
    const info=db.prepare("INSERT INTO member_invitations("+
      "email,token_hash,created_by,created_at,expires_at) VALUES(?,?,?,?,?)")
      .run(target,digest(token),actorId,at,expiresAt);
    const id=Number(info.lastInsertRowid);
    db.prepare("INSERT INTO member_admin_audit(actor_id,invitation_id,action,created_at) VALUES(?,?,?,?)")
      .run(actorId,id,"invite_created",at);
    db.exec("COMMIT");
    return {id,email:target,token,expiresAt};
  }catch(error){db.exec("ROLLBACK");throw error;}
}

/** Account creation and one-time token consumption are atomic. Never store the raw token. */
export function registerInvitedMember(db,{email,token,salt,passwordHash,at=Date.now()}){
  const target=normalizeInviteEmail(email);
  if(!target||typeof token!=="string"||token.length<32||token.length>128||
      !/^[A-Za-z0-9_-]+$/.test(token)||typeof salt!=="string"||typeof passwordHash!=="string")
    return null;
  db.exec("BEGIN IMMEDIATE");
  try{
    const invitation=db.prepare("SELECT id FROM member_invitations "+
      "WHERE email=? AND token_hash=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?")
      .get(target,digest(token),at);
    if(!invitation||db.prepare("SELECT id FROM users WHERE email=?").get(target)){
      db.exec("ROLLBACK");return null;
    }
    const userId=Number(db.prepare("INSERT INTO users(email,salt,password_hash,membership_state) "+
      "VALUES(?,?,?,'pending')").run(target,salt,passwordHash).lastInsertRowid);
    const claim=db.prepare("UPDATE member_invitations SET used_at=?,used_by=? "+
      "WHERE id=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?")
      .run(at,userId,invitation.id,at);
    if(claim.changes!==1)throw new Error("Invitation was already used");
    db.prepare("INSERT INTO member_admin_audit(actor_id,target_user_id,invitation_id,action,created_at) "+
      "SELECT created_by,?,id,'invite_claimed',? FROM member_invitations WHERE id=?")
      .run(userId,at,invitation.id);
    db.exec("COMMIT");return {userId,invitationId:invitation.id};
  }catch(error){db.exec("ROLLBACK");if(error.code?.startsWith("SQLITE_CONSTRAINT"))return null;throw error;}
}
export function revokeMemberInvitation(db,{actorId,id,at=Date.now()}){
  if(!Number.isSafeInteger(id)||id<=0)throw new TypeError("Invalid invitation");
  const result=db.prepare("UPDATE member_invitations SET revoked_at=? "+
    "WHERE id=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?")
    .run(at,id,at);
  if(result.changes===1)db.prepare("INSERT INTO member_admin_audit(actor_id,invitation_id,action,created_at) "+
    "VALUES(?,?,?,?)").run(actorId,id,"invite_revoked",at);
  return result.changes===1;
}
export function changeMembershipState(db,{actorId,userId,action,at=Date.now()}){
  const next={approve:"active",suspend:"suspended",reactivate:"active"}[action];
  if(!next||!Number.isSafeInteger(userId)||userId<=0)throw new TypeError("Invalid member action");
  db.exec("BEGIN IMMEDIATE");
  try{
    const target=db.prepare("SELECT id,role,membership_state,email_verified_at FROM users WHERE id=?").get(userId);
    if(!target||target.role!=="member"||((action==="approve"||action==="reactivate")&&target.email_verified_at===null)||
        (action==="approve"&&target.membership_state!=="pending")||
        (action==="reactivate"&&target.membership_state!=="suspended")||
        (action==="suspend"&&target.membership_state==="suspended")){
      db.exec("ROLLBACK");return false;
    }
    db.prepare("UPDATE users SET membership_state=?,membership_changed_at=? WHERE id=?")
      .run(next,at,userId);
    if(action==="suspend"){
      db.prepare("DELETE FROM sessions WHERE user_id=?").run(userId);
      revokeWalletRegistrations(db,userId);
    }
    db.prepare("INSERT INTO member_admin_audit(actor_id,target_user_id,action,created_at) VALUES(?,?,?,?)")
      .run(actorId,userId,action,at);
    db.exec("COMMIT");return true;
  }catch(e){db.exec("ROLLBACK");throw e;}
}
export function memberAdministrationSnapshot(db,{at=Date.now()}={}){
  const counts=db.prepare("SELECT membership_state,COUNT(*) total FROM users "+
    "WHERE role='member' GROUP BY membership_state").all();
  const states=Object.fromEntries(MEMBER_STATES.map(s=>[s,0]));
  for(const row of counts)states[row.membership_state]=row.total;
  const members=db.prepare("SELECT id,email,display_name,email_verified_at,membership_state,"+
    "membership_changed_at,created_at FROM users WHERE role='member' ORDER BY id DESC LIMIT 75").all();
  const invitations=db.prepare("SELECT i.id,i.email,i.created_at,i.expires_at,i.used_at,i.revoked_at,"+
    "u.email actor_email FROM member_invitations i JOIN users u ON u.id=i.created_by "+
    "ORDER BY i.id DESC LIMIT 75").all().map(i=>({
      ...i,status:i.revoked_at?"revoked":i.used_at?"claimed":i.expires_at<=at?"expired":"available"
    }));
  const audits=db.prepare("SELECT a.action,a.created_at,u.email actor_email,"+
    "t.email target_email FROM member_admin_audit a JOIN users u ON u.id=a.actor_id "+
    "LEFT JOIN users t ON t.id=a.target_user_id ORDER BY a.id DESC LIMIT 20").all();
  return {states,members,invitations,audits,at};
}
function rowAction(label,userId,action,csrf){
  return '<form method="post" action="/admin/members/status" class="member-admin-inline-form">'+
    '<input type="hidden" name="csrf" value="'+esc(csrf)+'">'+
    '<input type="hidden" name="user_id" value="'+userId+'">'+
    '<input type="hidden" name="action" value="'+action+'">'+
    '<button type="submit" class="member-admin-action">'+esc(label)+'</button></form>';
}
function when(at){return at?new Date(at).toISOString().slice(0,16).replace("T"," ")+" UTC":"—";}
export function renderMemberAdministration(snapshot,{layout,user,csrf,notice="",issued=null,delivery=null}){
  const inviteLines=snapshot.invitations.map(i=>
    '<tr><td>'+esc(i.email)+'</td><td>'+esc(i.status)+'</td><td>'+when(i.expires_at)+'</td>'+
    '<td>'+esc(i.actor_email)+'</td><td>'+
    (i.status==="available"?'<form method="post" action="/admin/invitations/revoke">'+
      '<input type="hidden" name="csrf" value="'+esc(csrf)+'">'+
      '<input type="hidden" name="invite_id" value="'+i.id+'">'+
      '<button class="member-admin-action" type="submit">Revoke</button></form>':'—')+
    '</td></tr>').join("");
  const memberLines=snapshot.members.map(m=>{
    const options=m.membership_state==="pending"?
      (m.email_verified_at?rowAction("Approve",m.id,"approve",csrf):'<span>Email verification pending</span>')+
      rowAction("Suspend",m.id,"suspend",csrf):
      m.membership_state==="active"?rowAction("Suspend",m.id,"suspend",csrf):
      rowAction("Reactivate",m.id,"reactivate",csrf);
    return '<tr><td>'+esc(m.email)+'</td><td>'+esc(m.display_name||"Not set")+'</td>'+
      '<td>'+esc(m.membership_state)+'</td><td>'+(m.email_verified_at?"Yes":"Pending")+'</td>'+
      '<td>'+options+'</td></tr>';
  }).join("");
  const actionSummary='<section class="member-admin-summary">'+
    [["Pending",snapshot.states.pending],["Approved",snapshot.states.active],["Suspended",snapshot.states.suspended]]
      .map(([name,val])=>'<article><span>'+name+'</span><strong>'+Number(val)+'</strong></article>').join("")+
    '</section>';
  const inviteBox=issued?'<section class="private-panel member-admin-issued" role="status">'+
    '<h2>Invitation generated</h2><p>For <strong>'+esc(issued.email)+'</strong>. This invitation URL is displayed only once; keep it private.</p>'+
    '<label>Private registration link<input type="text" readonly aria-label="One-time invitation link" value="'+esc(issued.url)+'"></label>'+
    '<p>'+esc(delivery==="accepted"?"The mail transport accepted an invitation email; delivery is not guaranteed.":"Copy this link securely; email delivery is not connected.")+
    '</p></section>':"";
  const inviteForm='<section class="private-panel"><h2>Invite a member</h2>'+
    '<p>Individual invitations are email-bound, expire automatically and can be claimed once. New accounts await administrator approval.</p>'+
    '<form method="post" action="/admin/invitations/new" class="member-admin-create">'+
    '<input type="hidden" name="csrf" value="'+esc(csrf)+'">'+
    '<label>Member email<input type="email" name="email" autocomplete="off" maxlength="254" required></label>'+
    '<label>Expires after<select name="valid_days"><option value="1">24 hours</option>'+
    '<option value="3" selected>3 days</option><option value="7">7 days</option></select></label>'+
    '<button class="private-button" type="submit">Generate secure invitation</button></form></section>';
  const section=(title,cols,rows,empty)=>'<section class="private-panel"><h2>'+title+'</h2>'+
    '<div class="scroll-table"><table><thead><tr>'+cols.map(x=>'<th>'+esc(x)+'</th>').join("")+
    '</tr></thead><tbody>'+(rows||'<tr><td colspan="'+cols.length+'">'+empty+'</td></tr>')+
    '</tbody></table></div></section>';
  const people=section("Member accounts",["Email","Display name","Status","Email verified","Actions"],
    memberLines,"No private accounts have been added.");
  const invites=section("Individual invitations",["Email","Status","Expiry","Created by","Action"],
    inviteLines,"No invitations created.");
  const audit=snapshot.audits.map(row=>'<tr><td>'+esc(row.action)+'</td><td>'+when(row.created_at)+
    '</td><td>'+esc(row.actor_email)+'</td><td>'+esc(row.target_email||"—")+'</td></tr>').join("");
  const head='<section class="private-title"><span class="eyebrow">PRIVATE ADMINISTRATION / MEMBERS</span>'+
    '<h1>Membership <em>Control.</em></h1>'+
    '<p>Issue one-time invitations, approve verified members, suspend access and review a minimal audit trail. No retail access is granted.</p>'+
    '<nav class="wallet-monitor-nav"><a class="wallet-monitor-nav-link" href="/admin/members">Membership reporting</a>'+
    '<a class="wallet-monitor-nav-link" href="/admin/wallet">Apple Wallet operations</a>'+
    '<a class="wallet-monitor-nav-link" href="/admin">Operations dashboard</a></nav>'+
    (notice?'<p role="status" class="form-ok">'+esc(notice)+'</p>':"")+'</section>';
  return layout("Membership administration",head+actionSummary+inviteBox+inviteForm+people+invites+
    section("Recent administration",["Action","UTC","Admin","Target member"],audit,"No recorded actions."),user,csrf);
}

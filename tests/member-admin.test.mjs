import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { openDb } from "../private/server.mjs";
import { installSecurity } from "../private/security.mjs";
import {
  createMemberInvitation,registerInvitedMember,revokeMemberInvitation,
  changeMembershipState,memberAdministrationSnapshot,
  renderMemberAdministration,normalizeInviteEmail,installMemberAdministration
} from "../private/member-admin.mjs";
import { renderMemberVaultDeck } from "../private/member-vault.mjs";

function fixture(){
  const db=openDb(":memory:");
  installSecurity(db);
  installMemberAdministration(db);
  const admin=Number(db.prepare("INSERT INTO users(email,salt,password_hash,role,email_verified_at) VALUES(?,?,?,'admin',?)")
    .run("admin@example.test","salt","hash",1000).lastInsertRowid);
  const member=Number(db.prepare("INSERT INTO users(email,salt,password_hash,role,email_verified_at) VALUES(?,?,?,'member',?)")
    .run("existing@example.test","salt","hash",1000).lastInsertRowid);
  return {db,admin,member};
}
test("single-use invitations are email-bound, hashed, time limited and claim atomically",()=>{
  const {db,admin,member}=fixture();
  try{
    assert.equal(normalizeInviteEmail(" MEMBER@EXAMPLE.COM "),"member@example.com");
    assert.equal(normalizeInviteEmail("bad-email"),null);
    assert.throws(()=>createMemberInvitation(db,{actorId:member,email:"new@example.com"}),/Administrator/);
    const first=createMemberInvitation(db,{actorId:admin,email:"new@example.com",validDays:3,at:1000});
    assert.equal(first.expiresAt,1000+3*86400000);
    assert.match(first.token,/^[A-Za-z0-9_-]{40,50}$/);
    const hash=createHash("sha256").update(first.token).digest("hex");
    const stored=db.prepare("SELECT token_hash FROM member_invitations WHERE id=?").get(first.id);
    assert.equal(stored.token_hash,hash);
    assert.ok(!JSON.stringify(stored).includes(first.token));
    assert.equal(registerInvitedMember(db,{email:"wrong@example.com",token:first.token,salt:"s",passwordHash:"h",at:2000}),null);
    assert.equal(registerInvitedMember(db,{email:"new@example.com",token:"wrong",salt:"s",passwordHash:"h",at:2000}),null);
    const result=registerInvitedMember(db,{email:"NEW@example.com",token:first.token,salt:"s",passwordHash:"h",at:2000});
    assert.ok(result?.userId>0);
    assert.equal(db.prepare("SELECT membership_state FROM users WHERE id=?").get(result.userId).membership_state,"pending");
    assert.equal(registerInvitedMember(db,{email:"new@example.com",token:first.token,salt:"s",passwordHash:"h",at:3000}),null);
    const second=createMemberInvitation(db,{actorId:admin,email:"other@example.com",validDays:1,at:1000});
    assert.equal(registerInvitedMember(db,{email:"other@example.com",token:second.token,salt:"s",passwordHash:"h",at:1000+86400000}),null);
    assert.equal(db.prepare("SELECT COUNT(*) total FROM member_invitations WHERE used_at IS NOT NULL").get().total,1);
  }finally{db.close();}
});
test("reissued links revoke originals, revocation blocks claims and audit is durable",()=>{
  const {db,admin}=fixture();
  try{
    const old=createMemberInvitation(db,{actorId:admin,email:"person@example.com",at:1000});
    const next=createMemberInvitation(db,{actorId:admin,email:"person@example.com",at:2000});
    assert.equal(db.prepare("SELECT revoked_at FROM member_invitations WHERE id=?").get(old.id).revoked_at,2000);
    assert.equal(registerInvitedMember(db,{email:"person@example.com",token:old.token,salt:"s",passwordHash:"h",at:3000}),null);
    assert.equal(revokeMemberInvitation(db,{actorId:admin,id:next.id,at:3000}),true);
    assert.equal(revokeMemberInvitation(db,{actorId:admin,id:next.id,at:4000}),false);
    assert.equal(registerInvitedMember(db,{email:"person@example.com",token:next.token,salt:"s",passwordHash:"h",at:4000}),null);
    const log=db.prepare("SELECT action FROM member_admin_audit ORDER BY id").all().map(x=>x.action);
    assert.deepEqual(log,["invite_created","invite_created","invite_revoked"]);
    assert.equal(db.prepare("SELECT COUNT(*) total FROM users WHERE email='person@example.com'").get().total,0);
  }finally{db.close();}
});
test("approval requires verified email, suspension invalidates sessions and Wallet registrations",()=>{
  const {db,admin,member}=fixture();
  try{
    const inv=createMemberInvitation(db,{actorId:admin,email:"join@example.com",at:1000});
    const account=registerInvitedMember(db,{email:"join@example.com",token:inv.token,salt:"s",passwordHash:"h",at:2000});
    assert.ok(account?.userId);
    assert.equal(changeMembershipState(db,{actorId:admin,userId:account.userId,action:"approve",at:3000}),false);
    db.prepare("UPDATE users SET email_verified_at=? WHERE id=?").run(3000,account.userId);
    assert.equal(changeMembershipState(db,{actorId:admin,userId:account.userId,action:"approve",at:3100}),true);
    db.prepare("INSERT INTO sessions(id_hash,user_id,csrf,expires_at) VALUES(?,?,?,?)")
      .run("session-1",account.userId,"csrf",Date.now()+60000);
    db.prepare("UPDATE users SET wallet_updates_enabled=1 WHERE id=?").run(account.userId);
    db.prepare("INSERT INTO wallet_devices(device_id,push_token,updated_at) VALUES(?,?,?)")
      .run("member-device-123456","a".repeat(64),3200);
    db.prepare("INSERT INTO wallet_registrations(device_id,user_id,registered_at) VALUES(?,?,?)")
      .run("member-device-123456",account.userId,3300);
    assert.equal(changeMembershipState(db,{actorId:admin,userId:account.userId,action:"suspend",at:4000}),true);
    assert.equal(db.prepare("SELECT COUNT(*) total FROM sessions WHERE user_id=?").get(account.userId).total,0);
    assert.equal(db.prepare("SELECT COUNT(*) total FROM wallet_registrations WHERE user_id=?").get(account.userId).total,0);
    assert.equal(db.prepare("SELECT wallet_updates_enabled,membership_state FROM users WHERE id=?")
      .get(account.userId).wallet_updates_enabled,0);
    assert.equal(changeMembershipState(db,{actorId:admin,userId:account.userId,action:"reactivate",at:5000}),true);
    assert.equal(db.prepare("SELECT membership_state FROM users WHERE id=?").get(account.userId).membership_state,"active");
    assert.equal(changeMembershipState(db,{actorId:admin,userId:admin,action:"suspend",at:6000}),false);
    assert.throws(()=>changeMembershipState(db,{actorId:member,userId:account.userId,action:"suspend"}),/Administrator/);
    const snapshot=memberAdministrationSnapshot(db,{at:6000});
    assert.equal(snapshot.states.active,2);
    assert.equal(snapshot.states.pending,0);
    assert.ok(snapshot.audits.some(x=>x.action==="suspend"));
    const html=renderMemberAdministration(snapshot,{
      layout:(_title,body)=>body,user:{role:"admin"},csrf:"safe-token"
    });
    assert.match(html,/Membership <em>Control/);
    assert.match(html,/Invite a member/);
    assert.match(html,/Reactivate|Suspend/);
    assert.doesNotMatch(html,/password_hash|session-1|push_token/);
  }finally{db.close();}
});
test("the member vault exposes accessible keyboard tabs with honest Apple Wallet status",()=>{
  const onboarding={percent:40,complete:2,total:5,next:{name:"Design your membership card"}};
  const pending=renderMemberVaultDeck({onboarding,walletReady:false,updatesReady:false});
  assert.match(pending,/role="tablist"/);
  assert.equal((pending.match(/role="tab" /g)||[]).length,4);
  assert.equal((pending.match(/role="tabpanel"/g)||[]).length,4);
  assert.match(pending,/Apple Pass Type signing credentials/);
  assert.match(pending,/No ordering or shipping/);
  assert.doesNotMatch(pending,/You have installed|verified on your iPhone/i);
  const available=renderMemberVaultDeck({onboarding,walletReady:true,updatesReady:true});
  assert.match(available,/Your signed pass is ready/);
  assert.match(available,/Automatic updates can be enabled/);
});

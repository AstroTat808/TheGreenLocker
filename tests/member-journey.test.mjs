import test from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../private/server.mjs";
import { installSecurity } from "../private/security.mjs";
import {
  installMemberJourney,markMemberMilestone,memberJourneySnapshot,
  memberPlatformSnapshot,renderMemberOnboarding,
  renderMemberOperationsPage,renderMemberSecurityPage
} from "../private/member-journey.mjs";

test("onboarding stores first-completed milestone only and excludes Wallet setup from progress",()=>{
  const db=openDb(":memory:");
  try{
    installSecurity(db);
    db.prepare("INSERT INTO users(email,salt,password_hash) VALUES(?,?,?)")
      .run("test@example.com","random-salt","random-hash");
    const user=db.prepare("SELECT * FROM users WHERE email=?").get("test@example.com");
    const initial=memberJourneySnapshot(db,user,{walletReady:false});
    assert.equal(initial.total,5);
    assert.equal(initial.complete,0);
    assert.equal(initial.wallet.signingReady,false);
    assert.match(renderMemberOnboarding(initial),/0 of 5 complete/);
    db.prepare("UPDATE users SET email_verified_at=?,display_name=? WHERE id=?")
      .run(10000,"Test Name",user.id);
    markMemberMilestone(db,user.id,"card",{at:11000});
    markMemberMilestone(db,user.id,"catalog",{at:12000});
    markMemberMilestone(db,user.id,"catalog",{at:13000});
    markMemberMilestone(db,user.id,"security",{at:14000});
    const saved=db.prepare("SELECT * FROM member_journey WHERE user_id=?").get(user.id);
    assert.equal(saved.catalog_viewed_at,12000,"A repeat catalog visit must not replace first completion");
    const updatedUser=db.prepare("SELECT * FROM users WHERE id=?").get(user.id);
    const complete=memberJourneySnapshot(db,updatedUser,{walletReady:false});
    assert.equal(complete.complete,5);
    assert.equal(complete.percent,100);
    assert.equal(complete.next,null);
    assert.equal(complete.wallet.status,"Signing not configured");
    assert.match(renderMemberOnboarding(complete),/Your private member setup is complete/);
    assert.throws(()=>markMemberMilestone(db,user.id,"unknown"),RangeError);
    assert.throws(()=>markMemberMilestone(db,user.id,"card",{at:-1}),TypeError);
  }finally{db.close();}
});

test("membership operational metrics count distinct accounts and avoid account-level exposure",()=>{
  const db=openDb(":memory:");
  try{
    installSecurity(db);
    db.exec("CREATE TABLE collection_concepts(id TEXT PRIMARY KEY);");
    db.exec("CREATE TABLE collection_media(id INTEGER PRIMARY KEY);");
    db.exec("INSERT INTO collection_concepts VALUES('botanical-01'),('vape-flavor-01');");
    db.exec("INSERT INTO collection_media VALUES(1),(2),(3);");
    db.prepare("INSERT INTO users(email,salt,password_hash,email_verified_at,display_name) VALUES(?,?,?,?,?)")
      .run("member@example.com","salt","hash",1234,"A Member");
    db.prepare("INSERT INTO users(email,salt,password_hash,role) VALUES(?,?,?,?)")
      .run("admin@example.com","salt","hash","admin");
    const user=db.prepare("SELECT id FROM users WHERE email=?").get("member@example.com");
    markMemberMilestone(db,user.id,"card",{at:16000});
    markMemberMilestone(db,user.id,"catalog",{at:17000});
    db.prepare("INSERT INTO sessions(id_hash,user_id,csrf,expires_at) VALUES(?,?,?,?)")
      .run("one",user.id,"csrf",Date.now()+60000);
    db.prepare("INSERT INTO sessions(id_hash,user_id,csrf,expires_at) VALUES(?,?,?,?)")
      .run("two",user.id,"csrf",Date.now()+60000);
    const snapshot=memberPlatformSnapshot(db,{walletReady:false,updatesReady:false});
    assert.equal(snapshot.totals.accounts,2);
    assert.equal(snapshot.totals.verified,1);
    assert.equal(snapshot.totals.members,1);
    assert.equal(snapshot.totals.admins,1);
    assert.equal(snapshot.totals.activeAccounts,1);
    assert.equal(snapshot.totals.activeSessions,2);
    assert.equal(snapshot.engagement.cardPersonalizations,1);
    assert.equal(snapshot.engagement.collectionsOpened,1);
    assert.equal(snapshot.assortment.draftSlots,2);
    assert.equal(snapshot.assortment.galleryImages,3);
    const html=renderMemberOperationsPage(snapshot,{layout:(_title,markup)=>markup,user:{role:"admin"},csrf:"csrf-secret"});
    assert.match(html,/Member <em>Operations/);
    assert.match(html,/Card designs/);
    assert.match(html,/Signing pending/);
    assert.doesNotMatch(html,/member@example.com|admin@example.com|csrf-secret/);
  }finally{db.close();}
});

test("security interface escapes account identifiers and never includes session secrets",()=>{
  const markup=renderMemberSecurityPage({
    user:{email:'malicious+<script>@example.test',role:"member"},
    sessionCount:2,csrf:'<dangerous&csrf>',
    layout:(_title,content)=>content
  });
  assert.match(markup,/2<\/strong> unexpired sessions/);
  assert.match(markup,/autocomplete="current-password"/);
  assert.match(markup,/csrf.*&lt;dangerous&amp;csrf&gt;/);
  assert.doesNotMatch(markup,/<script>/);
  assert.match(markup,/Sign out other sessions/);
  assert.doesNotMatch(markup,/session_hash|password_hash|mfa_secret_enc/);
  installMemberJourney; // Named exports remain importable for migration tests.
});

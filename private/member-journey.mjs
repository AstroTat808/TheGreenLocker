/** Account onboarding and operational reporting. Private development preview only.
 *  No ordering, eligibility verification, or Wallet installation claims.
 */
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const MILESTONES = Object.freeze({
  card:"card_customized_at",
  catalog:"catalog_viewed_at",
  wallet:"wallet_downloaded_at",
  security:"security_reviewed_at"
});

export function installMemberJourney(db) {
  db.exec("CREATE TABLE IF NOT EXISTS member_journey ("+
    "user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,"+
    "card_customized_at INTEGER, catalog_viewed_at INTEGER,"+
    "wallet_downloaded_at INTEGER, security_reviewed_at INTEGER);");
}

export function markMemberMilestone(db,userId,milestone,{at=Date.now()}={}) {
  const column=MILESTONES[milestone];
  if(!column)throw new RangeError("Unknown member milestone");
  if(!Number.isSafeInteger(userId)||userId<=0||!Number.isSafeInteger(at)||at<=0)
    throw new TypeError("Invalid member milestone record");
  db.prepare("INSERT INTO member_journey(user_id,"+column+") VALUES(?,?) "+
    "ON CONFLICT(user_id) DO UPDATE SET "+column+"=COALESCE("+column+",excluded."+column+")")
    .run(userId,at);
}

export function memberJourneySnapshot(db,user,{walletReady=false,updatesReady=false}={}) {
  const row=db.prepare("SELECT card_customized_at,catalog_viewed_at,wallet_downloaded_at,security_reviewed_at "+
    "FROM member_journey WHERE user_id=?").get(user.id)||{};
  const steps=[
    {id:"email",name:"Verify email",description:"Your account email has been confirmed.",href:"/member/security",
      complete:user.email_verified_at!==null&&user.email_verified_at!==undefined},
    {id:"profile",name:"Choose your display name",description:"Personalize how The Green Locker greets you.",href:"/member#member-settings",
      complete:typeof user.display_name==="string"&&user.display_name.trim().length>0},
    {id:"card",name:"Design your membership card",description:"Select a finish and edition, then save the card.",href:"/member#member-card",
      complete:Number.isSafeInteger(row.card_customized_at)&&row.card_customized_at>0},
    {id:"catalog",name:"Explore the concept catalog",description:"View the three curated draft collections.",href:"/shop",
      complete:Number.isSafeInteger(row.catalog_viewed_at)&&row.catalog_viewed_at>0},
    {id:"security",name:"Review account security",description:"Check your sessions and recovery options.",href:"/member/security",
      complete:Number.isSafeInteger(row.security_reviewed_at)&&row.security_reviewed_at>0}
  ];
  const complete=steps.filter(step=>step.complete).length;
  const next=steps.find(step=>!step.complete)||null;
  return {
    complete,total:steps.length,percent:Math.round(100*complete/steps.length),steps,next,
    wallet:{
      signingReady:Boolean(walletReady),
      updatesReady:Boolean(updatesReady),
      passDownloaded:Boolean(row.wallet_downloaded_at),
      // Downloading a pass is not evidence that it was added to Apple Wallet.
      status:walletReady?(row.wallet_downloaded_at?"Signed pass downloaded":"Signed pass available"):"Signing not configured"
    }
  };
}

export function renderMemberOnboarding(snapshot) {
  const items=snapshot.steps.map((step,index)=>
    '<li class="member-setup-item'+(step.complete?' is-complete':'')+'">'+
      '<span class="member-setup-marker" aria-hidden="true">'+(step.complete?'✓':String(index+1).padStart(2,"0"))+'</span>'+
      '<div class="member-setup-copy"><strong>'+escapeHtml(step.name)+'</strong>'+
      '<small>'+escapeHtml(step.description)+'</small></div>'+
      '<span class="member-setup-status">'+(step.complete?'Complete':'Not started')+'</span>'+
      (step.complete?'':'<a href="'+step.href+'" class="member-setup-link">Continue</a>')+
    '</li>').join("");
  const wallet=snapshot.wallet.signingReady?
    '<p><strong>Apple Wallet:</strong> '+escapeHtml(snapshot.wallet.status)+
      '. Downloading a signed pass does not confirm installation on your device.</p>':
    '<p><strong>Apple Wallet:</strong> signing certificates are not configured. Your SVG card remains available; this does not affect onboarding completion.</p>';
  return '<section id="member-onboarding" class="member-section member-onboarding" aria-labelledby="member-onboarding-title">'+
    '<div class="member-section-head"><div><span class="eyebrow">YOUR MEMBERSHIP / PRIVATE PREVIEW</span>'+
      '<h2 id="member-onboarding-title">Set up your vault</h2></div>'+
      '<span class="member-setup-count">'+snapshot.complete+' of '+snapshot.total+' complete</span></div>'+
    '<p class="member-setup-intro">Five simple steps to make your private account your own. No purchase or age-eligibility rights are granted.</p>'+
    '<progress class="member-setup-progress" max="'+snapshot.total+'" value="'+snapshot.complete+
      '" aria-label="Membership setup progress"></progress>'+
    '<ol class="member-setup-list">'+items+'</ol>'+
    '<div class="member-setup-foot">'+wallet+
    (snapshot.next?'<a class="member-secondary" href="'+snapshot.next.href+'">Continue setup</a>':
      '<p role="status">Your private member setup is complete.</p>')+'</div>'+
  '</section>';
}

export function memberPlatformSnapshot(db,{at=Date.now(),walletReady=false,updatesReady=false}={}) {
  const totals=db.prepare("SELECT COUNT(*) total,"+
    "COALESCE(SUM(CASE WHEN email_verified_at IS NOT NULL THEN 1 ELSE 0 END),0) verified,"+
    "COALESCE(SUM(CASE WHEN role='member' THEN 1 ELSE 0 END),0) members,"+
    "COALESCE(SUM(CASE WHEN role='admin' THEN 1 ELSE 0 END),0) admins,"+
    "COALESCE(SUM(CASE WHEN LENGTH(TRIM(COALESCE(display_name,'')))>0 THEN 1 ELSE 0 END),0) named,"+
    "COALESCE(SUM(CASE WHEN wallet_updates_enabled=1 THEN 1 ELSE 0 END),0) walletOptIns FROM users").get();
  const journey=db.prepare("SELECT COUNT(*) records,"+
    "COALESCE(SUM(CASE WHEN card_customized_at IS NOT NULL THEN 1 ELSE 0 END),0) cards,"+
    "COALESCE(SUM(CASE WHEN catalog_viewed_at IS NOT NULL THEN 1 ELSE 0 END),0) catalog,"+
    "COALESCE(SUM(CASE WHEN wallet_downloaded_at IS NOT NULL THEN 1 ELSE 0 END),0) walletDownloads,"+
    "COALESCE(SUM(CASE WHEN security_reviewed_at IS NOT NULL THEN 1 ELSE 0 END),0) security "+
    "FROM member_journey").get();
  const sessions=db.prepare("SELECT COUNT(*) total,COUNT(DISTINCT user_id) activeAccounts "+
    "FROM sessions WHERE expires_at>?").get(at);
  const conceptCount=db.prepare("SELECT COUNT(*) total FROM collection_concepts").get().total;
  const mediaCount=db.prepare("SELECT COUNT(*) total FROM collection_media").get().total;
  return {
    totals:{accounts:totals.total,verified:totals.verified,members:totals.members,admins:totals.admins,
      named:totals.named,activeAccounts:sessions.activeAccounts,activeSessions:sessions.total},
    engagement:{cardPersonalizations:journey.cards,collectionsOpened:journey.catalog,
      walletPassDownloads:journey.walletDownloads,securityReviews:journey.security, walletUpdateOptIns:totals.walletOptIns},
    assortment:{draftSlots:conceptCount,galleryImages:mediaCount},
    wallet:{signingReady:Boolean(walletReady),updatesReady:Boolean(updatesReady)}
  };
}

export function renderMemberOperationsPage(snapshot,{layout,user,csrf}) {
  const cards=[
    ["Registered accounts",snapshot.totals.accounts,"All private-preview accounts"],
    ["Verified emails",snapshot.totals.verified,"Mailbox ownership confirmed"],
    ["Active members",snapshot.totals.activeAccounts,"Accounts with an unexpired session"],
    ["Card designs",snapshot.engagement.cardPersonalizations,"Members who saved card preferences"],
    ["Collection visits",snapshot.engagement.collectionsOpened,"Accounts that opened draft collections"],
    ["Security reviews",snapshot.engagement.securityReviews,"Accounts that viewed session controls"],
    ["Wallet downloads",snapshot.engagement.walletPassDownloads,"Issued pass downloads, not confirmed installs"],
    ["Media assets",snapshot.assortment.galleryImages,"Private draft collection gallery images"]
  ].map(([name,value,note])=>'<article class="member-operations-stat"><span>'+escapeHtml(name)+'</span>'+
    '<strong>'+Number(value)+'</strong><small>'+escapeHtml(note)+'</small></article>').join("");
  const wallet=snapshot.wallet.signingReady?
    "Signing configured; "+(snapshot.wallet.updatesReady?"updates configured":"push updates pending"):
    "Signing pending — passes cannot be issued";
  return layout("Membership operations",
    '<section class="private-title"><span class="eyebrow">PRIVATE ADMIN / MEMBERSHIP</span>'+
      '<h1>Member <em>Operations.</em></h1>'+
      '<p>Account and onboarding progress across this private staging instance. These are aggregate records, not retail customer metrics.</p>'+
      '<nav class="wallet-monitor-nav" aria-label="Member operations"><a class="wallet-monitor-nav-link" href="/admin">Admin dashboard</a>'+
      '<a class="wallet-monitor-nav-link" href="/admin/wallet">Wallet operations</a>'+
      '<a class="wallet-monitor-nav-link" href="/admin/quality">Release quality</a></nav></section>'+
    '<section class="member-operations-grid" aria-label="Membership metrics">'+cards+'</section>'+
    '<section class="private-panel member-operations-notes"><h2>Operational readiness</h2>'+
      '<p><strong>Signed Apple Wallet:</strong> '+escapeHtml(wallet)+'.</p>'+
      '<p><strong>Draft content:</strong> '+snapshot.assortment.draftSlots+' concept slots and '+
        snapshot.assortment.galleryImages+' private gallery images. Final product identities must be verified before factual claims.</p>'+
      '<p><strong>Session security:</strong> '+snapshot.totals.activeSessions+' unexpired sessions across '+
        snapshot.totals.activeAccounts+' accounts. Members can revoke other sessions themselves.</p>'+
      '<p>Every count comes from the current staging database; no member emails or MFA secrets are included.</p>'+
    '</section>',user,csrf);
}

export function renderMemberSecurityPage({user,sessionCount,csrf,notice="",layout}) {
  const noticeMessage=notice==="revoked"?"Other active sessions were signed out.":
    notice==="password"?"The password did not match. No sessions were revoked.":"";
  const email=escapeHtml(user.email);
  return layout("Account security",
    '<section class="private-title"><span class="eyebrow">YOUR VAULT / ACCOUNT SECURITY</span>'+
      '<h1>Account <em>Security.</em></h1><p>Review active sign-ins and recovery options for your private account.</p>'+
      '<a class="member-secondary" href="/member#member-onboarding">Back to member setup</a></section>'+
    '<div class="member-security-grid">'+
      '<section class="private-panel"><h2>Your sessions</h2>'+
        '<p>You currently have <strong>'+sessionCount+'</strong> unexpired session'+(sessionCount===1?"":"s")+
        '. This count does not identify individual devices.</p>'+
        '<form action="/member/security/revoke-others" method="post">'+
          '<input type="hidden" name="csrf" value="'+escapeHtml(csrf)+'">'+
          '<label for="security-password">Confirm your password to sign out other sessions</label>'+
          '<input id="security-password" name="password" type="password" minlength="12" maxlength="128" autocomplete="current-password" required>'+
          '<button class="private-button" type="submit">Sign out other sessions</button>'+
        '</form>'+(noticeMessage?'<p class="form-ok" role="status">'+escapeHtml(noticeMessage)+'</p>':'')+
        '<p class="member-security-note">Your current session remains signed in. Password resets also revoke all sessions.</p>'+
      '</section>'+
      '<section class="private-panel"><h2>Recovery and verification</h2>'+
        '<p><strong>Verified email:</strong> '+email+'</p>'+
        '<p>Password resets use a single-use link and sign out existing sessions.</p>'+
        '<a class="member-secondary" href="/forgot-password">Reset account password</a>'+
        '<p class="member-security-note">Administrator accounts require a second authentication factor. A member card is not a login credential or proof of age.</p>'+
      '</section>'+
    '</div>',user,csrf);
}

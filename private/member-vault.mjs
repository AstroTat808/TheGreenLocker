/**
 * Accessible progressive member-vault command deck.
 * Personal data is not persisted in browser storage; the server owns all state.
 */
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const icon=(name)=>'<svg aria-hidden="true" viewBox="0 0 24 24" class="vault-deck-icon" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"><use href="/assets/ui-icons.svg#'+name+'"></use></svg>';
export function renderMemberVaultDeck({onboarding,walletReady,updatesReady,memberState="active"}={}){
  const progress=Number(onboarding?.percent)||0;
  const complete=Number(onboarding?.complete)||0;
  const total=Number(onboarding?.total)||5;
  const ready=Boolean(walletReady);
  const inner=[
    {id:"overview",title:"Overview",prefix:"01",body:
      '<div class="vault-deck-content"><span class="vault-deck-kicker">YOUR PROGRESS</span>'+
      '<strong class="vault-deck-large">'+complete+' <small>/ '+total+' milestones</small></strong>'+
      '<progress max="100" value="'+progress+'" aria-label="Membership onboarding completion"></progress>'+
      '<p>'+esc(onboarding?.next?
        "Your next milestone is "+onboarding.next.name+".":"Your private account setup is complete.")+'</p>'+
      '<a href="#member-onboarding" class="vault-deck-link">Review setup '+icon("right")+'</a></div>'},
    {id:"wallet",title:"Apple Wallet",prefix:"02",body:
      '<div class="vault-deck-content"><span class="vault-deck-kicker">DIGITAL CREDENTIAL</span>'+
      '<strong class="vault-deck-large">'+(ready?"Available":"Pending")+'</strong>'+
      '<p>'+(ready?"Your signed pass is ready for a compatible iPhone.":
        "Apple Pass Type signing credentials must be provisioned before a pass can be installed.")+'</p>'+
      '<p class="vault-deck-small">'+(updatesReady?"Automatic updates can be enabled in your card preferences.":"Automatic pass updates are not configured.")+'</p>'+
      '<a href="#member-card" class="vault-deck-link">Open member card '+icon("right")+'</a></div>'},
    {id:"archive",title:"Collections",prefix:"03",body:
      '<div class="vault-deck-content"><span class="vault-deck-kicker">PRIVATE ARCHIVE</span>'+
      '<strong class="vault-deck-large">3 <small>concept collections</small></strong>'+
      '<p>Explore botanical, vape and crispy-treat concepts in an invitation-only design preview. No ordering or shipping.</p>'+
      '<a href="/shop" class="vault-deck-link">Explore concepts '+icon("up-right")+'</a></div>'},
    {id:"security",title:"Security",prefix:"04",body:
      '<div class="vault-deck-content"><span class="vault-deck-kicker">ACCOUNT PROTECTION</span>'+
      '<strong class="vault-deck-large">'+esc(memberState==="active"?"Active":"Restricted")+'</strong>'+
      '<p>Review signed-in sessions, reset your password, or sign out other sessions.</p>'+
      '<a href="/member/security" class="vault-deck-link">Account security '+icon("up-right")+'</a></div>'}
  ];
  return '<section id="vault-command-deck" class="vault-command-deck" aria-labelledby="vault-command-title">'+
    '<div class="vault-deck-header"><div><span class="eyebrow">THE CONTROL ROOM / YOUR DIGITAL VAULT</span>'+
    '<h2 id="vault-command-title">Your vault, <em>your way.</em></h2></div>'+
    '<span class="vault-deck-live"><span aria-hidden="true"></span>PRIVATE MEMBER</span></div>'+
    '<div class="vault-deck-tabs" role="tablist" aria-label="Member vault compartments">'+
    inner.map((item,i)=>'<button type="button" class="vault-deck-tab" role="tab" id="vault-tab-'+item.id+
      '" aria-controls="vault-panel-'+item.id+'" aria-selected="'+(i===0?"true":"false")+'" tabindex="'+(i===0?"0":"-1")+
      '" data-vault-deck-tab="'+item.id+'"><small>'+item.prefix+'</small>'+esc(item.title)+'</button>').join("")+
    '</div><div class="vault-deck-stage">'+inner.map((item,i)=>'<div role="tabpanel" id="vault-panel-'+item.id+
      '" aria-labelledby="vault-tab-'+item.id+'" class="vault-deck-panel" data-vault-deck-panel="'+item.id+'"'+
      (i===0?"":" hidden")+'>'+item.body+'</div>').join("")+
    '<div class="vault-deck-emblem" aria-hidden="true"><span class="vault-deck-emblem-glow"></span>'+
      '<img src="/logo" alt="" width="150" height="150" loading="lazy" decoding="async"></div></div>'+
    '<p class="vault-deck-footnote">PRIVATE DESIGN MEMBERSHIP · NO PURCHASE OR ACCESS ENTITLEMENTS</p>'+
    '</section>';
}

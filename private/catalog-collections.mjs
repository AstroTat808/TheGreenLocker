/**
 * Three luxury collection concepts, populated from the MFA-protected assortment
 * studio. The optional store in SQLite contains ONLY non-transactional drafts.
 * Without it, retain the existing static placeholder layout for offline QA.
 */
const html=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const botanicalSlots=Object.freeze(Array.from({length:4},(_,i)=>Object.freeze({
 id:"botanical-"+String(i+1).padStart(2,"0"),
 title:"Variety "+String(i+1).padStart(2,"0"),
 state:i<2?"Initial lineup concept":"Optional expansion slot",
 note:i<2?"Cultivar name, origin and verified disclosures pending.":"Reserved for a possible third or fourth variety."
})));
const vapeFlavorSlots=Object.freeze(Array.from({length:12},(_,i)=>Object.freeze({
 id:"vape-flavor-"+String(i+1).padStart(2,"0"),title:"Flavor "+String(i+1).padStart(2,"0")
})));
const treatSlots=Object.freeze(Array.from({length:2},(_,i)=>Object.freeze({
 id:"treat-"+String(i+1).padStart(2,"0"),
 title:"Mushroom crispy treat · Flavor "+String(i+1).padStart(2,"0"),
 note:"Recipe, mushroom species, active ingredients, allergen disclosures and regulatory category are not yet confirmed."
})));
export const CONCEPT_COLLECTIONS=Object.freeze({botanicals:botanicalSlots,vapes:vapeFlavorSlots,treats:treatSlots});
const mediaKey=value=>typeof value==="string"&&/^[a-f0-9]{32}\.webp$/.test(value)?value:null;
function slots(assortment,family){
 const base=CONCEPT_COLLECTIONS[family];
 if(!assortment?.entries?.[family])return base.map((x,i)=>({...x,slot_order:i+1,description:x.note||"Unspecified concept"}));
 const rows=new Map(assortment.entries[family].map(row=>[row.id,row]));
 return base.flatMap((x,i)=>{
  const row=rows.get(x.id);
  if(!row||row.preview_visible!==1)return [];
  return [{...x,title:row.title,description:row.description,note:row.description,slot_order:i+1,image_key:mediaKey(row.image_key)}];
 });
}
function conceptImage(row,family){
 const source=row.image_key?"/concept-media/"+row.image_key:
   "/assets/collection-"+(family==="botanicals"?"botanical":family==="vapes"?"vape":"treat")+".svg";
 return '<img class="collection-art-photo" src="'+source+'" alt="Illustrative '+html(family)+' packaging artwork for '+html(row.title)+'" loading="lazy" decoding="async">';
}
const empty=label=>'<p class="collection-empty">No '+html(label)+' are visible in this private preview. An administrator can enable draft slots in the Assortment Studio.</p>';
export function renderCollectionConcepts(assortment=null){
 const botanicals=slots(assortment,"botanicals");
 const vapes=slots(assortment,"vapes");
 const treats=slots(assortment,"treats");
 const brand=typeof assortment?.brand?.value==="string"&&assortment.brand.value.trim()?assortment.brand.value:"Brand name pending";
 const botanical=botanicals.map(item=>{
  const index=Number(item.slot_order);
  const state=index<3?"Initial lineup concept":"Optional expansion slot";
  return '<article class="collection-concept-card collection-concept-botanical" aria-label="'+html(item.title)+'">'+
    '<div class="collection-concept-art">'+conceptImage(item,"botanicals")+
      '<img src="/assets/shield-logo.webp" class="collection-art-crest" alt="" aria-hidden="true" loading="lazy">'+
      '<span class="collection-art-number">'+String(index).padStart(2,"0")+'</span></div>'+
    '<div class="collection-concept-details"><span class="collection-concept-status">'+state+'</span>'+
      '<h3>'+html(item.title)+'</h3><p>'+html(item.description||item.note||"Details pending.")+'</p></div></article>';
 }).join("");
 const flavors=vapes.map(item=>
  '<li class="collection-flavor" aria-label="'+html(item.title)+'">'+
   '<span aria-hidden="true">'+String(item.slot_order).padStart(2,"0")+'</span>'+
   (item.image_key?'<img class="collection-flavor-thumb" src="/concept-media/'+item.image_key+'" alt="" loading="lazy">':'')+
   '<strong>'+html(item.title)+'</strong>'+
   '<small>'+html(item.description||"Unspecified concept")+'</small></li>'
 ).join("");
 const treatCards=treats.map(item=>
  '<article class="collection-concept-card collection-concept-treat">'+
   '<div class="collection-concept-art">'+conceptImage(item,"treats")+
     '<img src="/assets/shield-logo.webp" class="collection-art-crest" alt="" aria-hidden="true" loading="lazy">'+
     '<span class="collection-art-number">'+String(item.slot_order).padStart(2,"0")+'</span></div>'+
   '<div class="collection-concept-details"><span class="collection-concept-status">Recipe concept</span>'+
     '<h3>'+html(item.title)+'</h3><p>'+html(item.description||item.note||"Recipe description pending.")+'</p></div></article>'
 ).join("");
 return (
  '<div class="collection-preview" id="collections-preview">'+
   '<nav class="collection-preview-nav" aria-label="Product concept collections">'+
    '<a href="#collection-botanicals"><span>01</span> Botanicals <small>2–4 concepts</small></a>'+
    '<a href="#collection-vapes"><span>02</span> Vape flavors <small>1 brand · 12 concepts</small></a>'+
    '<a href="#collection-treats"><span>03</span> Crispy treats <small>2 concepts</small></a></nav>'+
   '<section id="collection-botanicals" class="collection-preview-section" aria-labelledby="collection-botanicals-title">'+
    '<div class="collection-preview-heading"><div><span class="eyebrow">COLLECTION 01 / BOTANICALS</span>'+
     '<h2 id="collection-botanicals-title">The Botanical <em>Vault.</em></h2>'+
     '<p>Two initial concepts with room for two more, presented as premium packaging studies. Names, sources and regulatory disclosures remain unverified.</p></div>'+
     '<span class="collection-count">02 CORE · 02 OPTIONAL</span></div>'+
    '<div class="collection-botanical-grid">'+(botanical||empty("botanical varieties"))+'</div>'+
    '<div class="collection-size-notice"><strong>Draft package names</strong>'+
     '<span>The Key · 1/8 oz</span><span>The Signal · 1/4 oz</span>'+
     '<span>The Cipher · 1/2 oz</span><span>The Vault · 1 oz</span>'+
     '<small>Visual format references only; not proof of legal sale limits or available sizes.</small></div></section>'+
   '<section id="collection-vapes" class="collection-preview-section" aria-labelledby="collection-vapes-title">'+
    '<div class="collection-preview-heading"><div><span class="eyebrow">COLLECTION 02 / VAPE CONCEPTS</span>'+
      '<h2 id="collection-vapes-title">One Brand. <em>Twelve Concepts.</em></h2>'+
      '<p>One proposed brand, twelve flavor-design slots, and artwork that can be replaced from the private studio. Ingredients, device specifications and legal classifications remain unverified.</p></div>'+
      '<span class="collection-count">01 BRAND · 12 FLAVORS</span></div>'+
    '<div class="collection-vape-feature">'+
     '<div class="collection-vape-hero">'+
       '<img src="/assets/collection-vape.svg" class="collection-vape-artwork" alt="Original black, emerald and gold vape packaging study" loading="lazy">'+
       '<img src="/assets/shield-logo.webp" class="collection-vape-crest" alt="" aria-hidden="true" loading="lazy"></div>'+
     '<div class="collection-vape-content"><span class="collection-concept-status">Brand concept · Private preview</span>'+
       '<h3>'+html(brand)+'</h3><p>Editable flavor identities for visual planning only. No formula, stock, sales or purchase claims.</p>'+
       '<ol class="collection-flavor-grid">'+(flavors||empty("vape flavors"))+'</ol></div></div></section>'+
   '<section id="collection-treats" class="collection-preview-section" aria-labelledby="collection-treats-title">'+
    '<div class="collection-preview-heading"><div><span class="eyebrow">COLLECTION 03 / RECIPE DESIGN</span>'+
      '<h2 id="collection-treats-title">The Crispy <em>Studio.</em></h2>'+
      '<p>Two recipe concepts. Mushroom species, ingredients, active content and food-labeling requirements must be verified before commercial claims are made.</p></div>'+
      '<span class="collection-count">02 RECIPE CONCEPTS</span></div>'+
    '<div class="collection-treat-grid">'+(treatCards||empty("treat concepts"))+'</div></section>'+
   '<aside class="collection-policy" aria-label="Private catalog limitations"><strong>Private development preview only</strong>'+
    '<p>All varieties, flavor names, ingredients and formats remain unverified draft concepts. No purchases, payments, checkout, reservations, nationwide shipping promises or customer fulfillment are available here. Legal eligibility and product-specific requirements have not been established.</p></aside>'+
  '</div>'
 );
}

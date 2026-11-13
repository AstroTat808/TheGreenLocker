/**
 * Private three-family product *planning* gallery.
 * Unnamed items are placeholders, NOT inventory, sale offers, dosing advice,
 * certified products, or authorization to ship regulated items.
 *
 * The source-of-truth product registry remains the existing draft database,
 * without any cart, pricing, checkout, address collection or fulfillment route.
 */
const html=value=>String(value??"").replace(/[&<>"']/g,ch=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[ch]));

const botanicalSlots=Object.freeze(Array.from({length:4},(_,i)=>Object.freeze({
  id:"botanical-"+String(i+1).padStart(2,"0"),
  title:"Variety "+String(i+1).padStart(2,"0"),
  state:i<2?"Initial lineup concept":"Optional expansion slot",
  note:i<2?"Cultivar name, origin and verified disclosures pending.":"Reserved for a possible third or fourth variety."
})));
const vapeFlavorSlots=Object.freeze(Array.from({length:12},(_,i)=>Object.freeze({
  id:"vape-flavor-"+String(i+1).padStart(2,"0"),
  title:"Flavor "+String(i+1).padStart(2,"0")
})));
const treatSlots=Object.freeze(Array.from({length:2},(_,i)=>Object.freeze({
  id:"treat-"+String(i+1).padStart(2,"0"),
  title:"Mushroom crispy treat · Flavor "+String(i+1).padStart(2,"0"),
  note:"Recipe, mushroom species, active ingredients, allergen disclosures and regulatory category are not yet confirmed."
})));

export const CONCEPT_COLLECTIONS=Object.freeze({
  botanicals:botanicalSlots,
  vapes:vapeFlavorSlots,
  treats:treatSlots
});

export function renderCollectionConcepts(){
  const botanical=botanicalSlots.map((item,i)=>
    '<article class="collection-concept-card collection-concept-botanical" aria-label="'+html(item.title)+'">'+
      '<div class="collection-concept-art" aria-hidden="true"><span class="collection-symbol">✦</span><span class="collection-art-number">'+String(i+1).padStart(2,"0")+'</span></div>'+
      '<div class="collection-concept-details">'+
        '<span class="collection-concept-status">'+html(item.state)+'</span>'+
        '<h3>'+html(item.title)+'</h3>'+
        '<p>'+html(item.note)+'</p>'+
      '</div>'+
    '</article>'
  ).join("");
  const flavors=vapeFlavorSlots.map((item,i)=>
    '<li class="collection-flavor" aria-label="'+html(item.title)+'">'+
      '<span aria-hidden="true">'+String(i+1).padStart(2,"0")+'</span>'+
      '<strong>'+html(item.title)+'</strong>'+
      '<small>Unspecified concept</small>'+
    '</li>'
  ).join("");
  const treats=treatSlots.map((item,i)=>
    '<article class="collection-concept-card collection-concept-treat">'+
      '<div class="collection-concept-art" aria-hidden="true"><span class="collection-symbol">✦</span><span class="collection-art-number">'+String(i+1).padStart(2,"0")+'</span></div>'+
      '<div class="collection-concept-details"><span class="collection-concept-status">Recipe concept</span>'+
        '<h3>'+html(item.title)+'</h3><p>'+html(item.note)+'</p></div>'+
    '</article>'
  ).join("");
  return (
    '<div class="collection-preview" id="collections-preview">'+
      '<nav class="collection-preview-nav" aria-label="Product concept collections">'+
        '<a href="#collection-botanicals"><span>01</span> Botanicals <small>2–4 concepts</small></a>'+
        '<a href="#collection-vapes"><span>02</span> Vape flavors <small>1 brand · 12 concepts</small></a>'+
        '<a href="#collection-treats"><span>03</span> Crispy treats <small>2 concepts</small></a>'+
      '</nav>'+
      '<section id="collection-botanicals" class="collection-preview-section" aria-labelledby="collection-botanicals-title">'+
        '<div class="collection-preview-heading"><div><span class="eyebrow">COLLECTION 01 / BOTANICALS</span>'+
          '<h2 id="collection-botanicals-title">The Botanical <em>Vault.</em></h2>'+
          '<p>Two planned variety slots, with room for two additional concepts. No strain names or laboratory results have been assigned.</p>'+
        '</div><span class="collection-count">02 CORE · 02 OPTIONAL</span></div>'+
        '<div class="collection-botanical-grid">'+botanical+'</div>'+
        '<div class="collection-size-notice"><strong>Draft package names</strong>'+
          '<span>The Key · 1/8 oz</span><span>The Signal · 1/4 oz</span>'+
          '<span>The Cipher · 1/2 oz</span><span>The Vault · 1 oz</span>'+
          '<small>Visual format references only; not proof of legal sale limits or available sizes.</small></div>'+
      '</section>'+
      '<section id="collection-vapes" class="collection-preview-section" aria-labelledby="collection-vapes-title">'+
        '<div class="collection-preview-heading"><div><span class="eyebrow">COLLECTION 02 / VAPE CONCEPTS</span>'+
          '<h2 id="collection-vapes-title">One Brand. <em>Twelve Concepts.</em></h2>'+
          '<p>One proposed brand identity with twelve flavor-design placeholders. Brand name, ingredients, device specifications and regulatory status are not provided.</p>'+
        '</div><span class="collection-count">01 BRAND · 12 FLAVORS</span></div>'+
        '<div class="collection-vape-feature">'+
          '<div class="collection-vape-hero" aria-hidden="true"><span class="collection-vape-icon">GL</span><span>FLAVOR ARCHIVE / 01–12</span></div>'+
          '<div class="collection-vape-content"><span class="collection-concept-status">Proposed brand · Name pending</span>'+
            '<h3>Flavor Library</h3><p>Use the numbered slots to review the future flavor assortment. These are not confirmed formulas, stock or available products.</p>'+
            '<ol class="collection-flavor-grid">'+flavors+'</ol>'+
          '</div>'+
        '</div>'+
      '</section>'+
      '<section id="collection-treats" class="collection-preview-section" aria-labelledby="collection-treats-title">'+
        '<div class="collection-preview-heading"><div><span class="eyebrow">COLLECTION 03 / RECIPE DESIGN</span>'+
          '<h2 id="collection-treats-title">The Crispy <em>Studio.</em></h2>'+
          '<p>Two mushroom crispy treat concepts. Mushroom species, ingredients, psychoactive content and food-labeling requirements must be confirmed before any commercial representation.</p>'+
        '</div><span class="collection-count">02 RECIPE CONCEPTS</span></div>'+
        '<div class="collection-treat-grid">'+treats+'</div>'+
      '</section>'+
      '<aside class="collection-policy" aria-label="Private catalog limitations">'+
        '<strong>Private development preview only</strong>'+
        '<p>All varieties, flavor names, ingredients and formats remain unverified draft concepts. No purchases, payments, checkout, reservations, nationwide shipping promises or customer fulfillment are available here. Legal eligibility and product-specific requirements have not been established.</p>'+
      '</aside>'+
    '</div>'
  );
}

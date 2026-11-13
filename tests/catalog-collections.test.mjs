import test from "node:test";
import assert from "node:assert/strict";
import {CONCEPT_COLLECTIONS,renderCollectionConcepts} from "../private/catalog-collections.mjs";

test("three draft collections reflect exact requested planning quantities without inventing flavors",()=>{
  assert.equal(CONCEPT_COLLECTIONS.botanicals.length,4);
  assert.equal(CONCEPT_COLLECTIONS.vapes.length,12);
  assert.equal(CONCEPT_COLLECTIONS.treats.length,2);
  assert.deepEqual(CONCEPT_COLLECTIONS.botanicals.map(x=>x.state),
    ["Initial lineup concept","Initial lineup concept","Optional expansion slot","Optional expansion slot"]);
  assert.equal(new Set(Object.values(CONCEPT_COLLECTIONS).flat().map(x=>x.id)).size,18);
  assert.ok(CONCEPT_COLLECTIONS.vapes.every(x=>/^Flavor \d{2}$/.test(x.title)));
  assert.ok(CONCEPT_COLLECTIONS.treats.every(x=>/Mushroom crispy treat/.test(x.title)));
});

test("protected concept gallery has anchored three-category navigation, clearly identifies placeholders, and cannot transact",()=>{
  const html=renderCollectionConcepts();
  for(const id of ["collection-botanicals","collection-vapes","collection-treats"]){
    assert.match(html,new RegExp('id="'+id+'"'));
    assert.match(html,new RegExp('href="#'+id+'"'));
  }
  assert.equal((html.match(/class="collection-concept-botanical"/g)||[]).length,0,
    "Full semantic classes are on collection-concept-card elements.");
  assert.equal((html.match(/class="collection-concept-card collection-concept-botanical"/g)||[]).length,4);
  assert.equal((html.match(/class="collection-flavor"/g)||[]).length,12);
  assert.equal((html.match(/class="collection-concept-card collection-concept-treat"/g)||[]).length,2);
  assert.match(html,/The Botanical/);
  assert.match(html,/One Brand/);
  assert.match(html,/Two recipe concepts/i);
  assert.match(html,/No purchases, payments, checkout/);
  assert.match(html,/shipping promises/);
  assert.match(html,/active ingredients/);
  assert.doesNotMatch(html,/<form|<button|type="submit"|\/checkout|\/cart|add.to.cart|data-price|shipping-fee|\$10/i);
});

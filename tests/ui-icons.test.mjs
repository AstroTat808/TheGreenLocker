import test from "node:test";
import assert from "node:assert/strict";
import { brandIcon } from "../private/ui-icons.mjs";
import { renderCollectionConcepts } from "../private/catalog-collections.mjs";

test("all direction icons use one inert, accessible SVG symbol system",()=>{
  for(const name of ["up-right","right","left","up","down","chevron-left","chevron-right"]){
    const html=brandIcon(name);
    assert.match(html,/<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"/);
    assert.match(html,/focusable="false"/);
    assert.ok(html.includes('/assets/ui-icons.svg#'+name));
    assert.ok(!/[↗↘↖↙⇗⇘→←↑↓‹›]/u.test(html));
  }
  assert.match(brandIcon("up-right","compact-action"),/class="ui-icon compact-action"/);
  assert.throws(()=>brandIcon("unknown"),RangeError);
  assert.throws(()=>brandIcon("up-right",'x" onclick="evil'),TypeError);
});

test("private collection carousel keeps accessible names with vector navigation",()=>{
  const assortment={vapes:[{slot_order:1,title:"Example",description:"Draft",images:[
    {src:"/media/sample-a",alt:"Example view one"},
    {src:"/media/sample-b",alt:"Example view two"}
  ]}]};
  const html=renderCollectionConcepts(assortment);
  // Gallery controls stay labeled even though their glyph is decorative.
  assert.ok(!html.includes("image\">‹</button>"));
  assert.ok(!html.includes("image\">›</button>"));
  assert.ok(!/[↗↘↖↙⇗⇘→←↑↓‹›]/u.test(html));
});

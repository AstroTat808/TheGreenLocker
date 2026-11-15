import fs from "node:fs";
import assert from "node:assert/strict";

const manifest=JSON.parse(fs.readFileSync(new URL("../tests/visual-baselines.json",import.meta.url),"utf8"));
assert.equal(manifest.mode,"enforce","Staging release blocked: visual baselines are not approved");
const required=[
  ...["narrow-chromium","mobile-webkit"].flatMap(browser=>
    [320,375,430].map(width=>"public-"+browser+"-"+width+"-hero")),
  ...["narrow-chromium","mobile-webkit"].flatMap(browser=>
    [320,375,430].map(width=>"public-"+browser+"-"+width+"-collection-card")),
  ...[320,375,430].map(width=>"private-mobile-webkit-"+width+"-member-card"),
  ...[320,375,430].map(width=>"private-mobile-webkit-"+width+"-botanicals"),
  "private-mobile-webkit-375-admin"
];
for(const key of required){
  const entry=manifest.baselines?.[key];
  assert.ok(entry,"Staging release blocked: missing approved visual reference "+key);
  assert.ok(Number.isSafeInteger(entry.width)&&entry.width>100&&entry.width<4000,"Invalid reference width "+key);
  assert.ok(Number.isSafeInteger(entry.height)&&entry.height>80&&entry.height<10000,"Invalid reference height "+key);
  const colors=Buffer.from(entry.colors||"","base64");
  assert.equal(colors.length,288,"Invalid reference grid for "+key);
}
console.log("Visual release contract: ENFORCE ("+required.length+" signed-off reference screens)");

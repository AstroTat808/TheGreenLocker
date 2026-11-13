import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const read = (name) => fs.readFileSync(path.join(root,name),"utf8");
const html = read("index.html");
const css = read("styles.css");
const js = read("app.js");
const shield = fs.readFileSync(path.join(root,"assets/shield-logo.webp"));
const favicon = fs.readFileSync(path.join(root,"assets/shield-favicon.png"));

assert.match(html, /<html lang="en">/);
assert.match(html, /<meta name="viewport"/);
assert.match(html, /<main>/);
assert.match(html, /<nav id="primaryNav"/);
assert.match(html, /<dialog id="ageDialog"/);
assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
assert.match(html, /NOT AN ACTIVE RETAIL STORE/);
assert.match(html, /This is not a live sales or shipping website/);
assert.match(css, /@media\(max-width:900px\)/);
assert.match(css, /prefers-reduced-motion/);
assert.match(js, /NOT a licensed-store age-verification mechanism/);
assert.equal(shield.toString("ascii",0,4),"RIFF");
assert.equal(shield.toString("ascii",8,12),"WEBP");
assert.equal(favicon.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
assert.match(html,/assets\/shield-logo\.webp/);
assert.match(html,/assets\/shield-favicon\.png/);
assert.doesNotMatch(html,/approved-logo\.png|assets\/logo\.svg|circular golden seal/i);

const localFiles = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map(([,f]) => f)
  .filter((f) => !f.startsWith("#") && !/^https?:\/\//.test(f));
for (const file of localFiles) {
  assert(!file.includes(".."), "Parent-relative path not allowed: " + file);
  assert(fs.existsSync(path.join(root,file)), "Missing asset: "+file);
}
for (const href of html.matchAll(/href="#([^"]+)"/g)) {
  assert(html.includes('id="' + href[1] + '"'), "Broken in-page anchor: "+href[1]);
}
console.log("Static site QA: PASS ("+localFiles.length+" local references)");

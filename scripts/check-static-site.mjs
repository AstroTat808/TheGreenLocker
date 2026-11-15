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
const transparentShield = read("assets/shield-logo-transparent.svg");
assert.match(transparentShield, /<mask id="shield-cutout"/);
assert.match(transparentShield, /href="data:image\/webp;base64,/);
assert.match(html,/assets\/shield-logo-transparent\.svg/);
assert.doesNotMatch(html, /<img[^>]+shield-logo\.webp/i);
assert.match(html, /rel="icon" type="image\/svg\+xml" href="assets\/shield-logo-transparent\.svg"/);
assert.match(html, /rel="apple-touch-icon" href="assets\/shield-favicon\.png"/);
assert.match(css,/\.hero-logo\{width:min\(74vw,350px\)/);
const collections=read("private/catalog-collections.mjs");
assert.equal((collections.match(/\/assets\/shield-logo-transparent\.svg/g)||[]).length,3,
  "All collection crests must use the transparent approved shield");
assert.doesNotMatch(collections,/\/assets\/shield-logo\.webp/);
const memberCard=read("private/member-card.mjs");
assert.match(memberCard,/id="card-shield-cutout"/);
assert.match(memberCard,/mask="url\(#card-shield-cutout\)"/);
const arrowSprite=read("assets/ui-icons.svg");
for(const name of ["up-right","right","left","up","down","chevron-left","chevron-right"])
  assert.match(arrowSprite, new RegExp('id="'+name+'"'),"Missing icon "+name);
assert.equal((html.match(/class="circle-arrow"/g)||[]).length,4);
assert.equal((html.match(/assets\/ui-icons\.svg#up-right/g)||[]).length,7);
for(const filename of ["index.html","private/member.mjs","private/server.mjs","private/catalog-collections.mjs"]){
  assert.doesNotMatch(read(filename),/[↗↘↖↙⇗⇘→←↑↓‹›]/u,
    "Platform-dependent text arrows are forbidden: "+filename);
}
assert.match(html,/assets\/shield-favicon\.png/);
assert.doesNotMatch(html,/approved-logo\.png|assets\/logo\.svg|circular golden seal/i);

const localFiles = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map(([,f]) => f)
  .filter((f) => !f.startsWith("#") && !/^https?:\/\//.test(f))
  .map((f) => f.split("#")[0]);
for (const file of localFiles) {
  assert(!file.includes(".."), "Parent-relative path not allowed: " + file);
  assert(fs.existsSync(path.join(root,file)), "Missing asset: "+file);
}
for (const href of html.matchAll(/href="#([^"]+)"/g)) {
  assert(html.includes('id="' + href[1] + '"'), "Broken in-page anchor: "+href[1]);
}
console.log("Static site QA: PASS ("+localFiles.length+" local references)");

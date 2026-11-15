import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root=new URL("../",import.meta.url);
import { PERFORMANCE_BUDGETS } from "../scripts/performance-budgets.mjs";
test("critical UI assets stay within tightly bounded size budgets",()=>{
  for(const [file,maxBytes]of Object.entries(PERFORMANCE_BUDGETS)){
    const current=fs.statSync(new URL(file,root)).size;
    assert.ok(current<=maxBytes,file+" grew to "+current+" bytes (budget "+maxBytes+")");
  }
});
test("above-the-fold hero loading remains high-priority with no remote dependencies",()=>{
  const html=fs.readFileSync(new URL("index.html",root),"utf8");
  assert.match(html,/rel="preload" as="image" href="assets\/shield-logo-transparent\.svg" fetchpriority="high"/);
  assert.match(html,/<img[^>]+class="hero-logo"[^>]+loading="eager"[^>]+fetchpriority="high"/);
  assert.match(html,/<script src="app.js" defer><\/script>/);
  assert.doesNotMatch(html,/<(?:script|link|img)[^>]+(?:src|href)="https?:\/\//i);
  const css=fs.readFileSync(new URL("styles.css",root),"utf8");
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css, /@media\(max-width:700px\) and \(pointer:coarse\)/);
});

import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read = file => readFileSync(new URL("../" + file, import.meta.url), "utf8");

test("prelaunch Netlify header policy stays fail-closed", () => {
  const policy = read("_headers");
  assert.match(policy, /^\/\*\s*$/m);
  for (const header of [
    "Content-Security-Policy:", "X-Content-Type-Options: nosniff",
    "X-Frame-Options: DENY", "Referrer-Policy:",
    "Permissions-Policy:", "X-Robots-Tag: noindex, nofollow"
  ]) assert.ok(policy.includes(header), "Missing " + header);
  assert.match(policy, /script-src 'self'/);
  assert.match(policy, /style-src 'self'/);
  assert.match(policy, /frame-ancestors 'none'/);
  assert.match(policy, /form-action 'none'/);
  assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval/);
});

test("public prototype has no inline script, inline style or dynamic HTML injection", () => {
  const html = read("index.html"), app = read("app.js"), css = read("styles.css");
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc\s*=)/i);
  assert.doesNotMatch(html, /\sstyle\s*=/i);
  assert.doesNotMatch(app, /\binnerHTML\b/);
  assert.match(css, /\.preview-unavailable\{/);
  assert.match(html, /not an active retail store/i);
  assert.match(html, /noindex, nofollow/);
  assert.match(html, /assets\/shield-logo\.webp/);
  assert.match(html, /assets\/shield-favicon\.png/);
  assert.doesNotMatch(html, /approved-logo\.png|assets\/logo\.svg|circular golden seal/i);
});

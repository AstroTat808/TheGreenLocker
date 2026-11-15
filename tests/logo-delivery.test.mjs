import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { brotliDecompressSync } from "node:zlib";
import { createShieldDelivery } from "../private/logo-delivery.mjs";
import { officialLogoIntegrity } from "../scripts/logo-integrity.mjs";

const original=fs.readFileSync(new URL("../assets/shield-logo-transparent.svg",import.meta.url));
const delivery=createShieldDelivery(original);
function call(headers={},privateAsset=false){
  let result;
  delivery.send({req:{headers},res:{},privateAsset,respond(_res,status,body,type,extra){
    result={status,body,type,headers:extra};
  }});
  return result;
}
test("approved crest SVG and source WebP have not changed",()=>{
  const actual=officialLogoIntegrity();
  assert.equal(actual.pass,true,JSON.stringify(actual.results));
});
test("Brotli shield is byte-for-byte identical to the official transparent SVG",()=>{
  const reply=call({"accept-encoding":"gzip, br"});
  assert.equal(reply.status,200);
  assert.equal(reply.type,"image/svg+xml; charset=utf-8");
  assert.equal(reply.headers["Content-Encoding"],"br");
  assert.ok(delivery.compressedBytes<delivery.originalBytes*.85);
  assert.deepEqual(brotliDecompressSync(reply.body),original);
  assert.match(String(reply.body.length),/^\d+$/);
});
test("public logo caches safely and can return an exact HTTP 304",()=>{
  const normal=call({"accept-encoding":"identity"});
  assert.equal(normal.status,200);
  assert.equal(normal.headers["Content-Encoding"],undefined);
  assert.deepEqual(normal.body,original);
  assert.match(normal.headers["Cache-Control"],/^public, max-age=3600/);
  assert.equal(normal.headers.Vary,"Accept-Encoding");
  const cached=call({"accept-encoding":"br","if-none-match":normal.headers.ETag});
  assert.equal(cached.status,304);
  assert.equal(cached.body,"");
});
test("private image uses browser-private cache and disallows executable SVG",()=>{
  const privateReply=call({"accept-encoding":"br"},true);
  assert.match(privateReply.headers["Cache-Control"],/^private, max-age=3600/);
  assert.match(privateReply.headers["Content-Security-Policy"],/script-src 'none'/);
  assert.equal(privateReply.headers["Content-Encoding"],"br");
  assert.notEqual(privateReply.headers.ETag,"");
});

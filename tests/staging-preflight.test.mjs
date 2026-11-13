import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const base={
 TGL_ENV:"staging",
 NODE_ENV:"production",
 TGL_PUBLIC_ORIGIN:"https://staging.thegreenlocker.com",
 STAGING_DOMAIN:"staging.thegreenlocker.com",
 TGL_MAIL_MODE:"resend",
 TGL_RESEND_API_KEY:"synthetic-ci-key-not-a-secret",
 TGL_EMAIL_FROM:"The Green Locker <verified@example.com>",
 TGL_INVITE_CODE:"ci-generated-staging-invite-code-12345",
 TGL_MFA_ENCRYPTION_KEY:randomBytes(32).toString("base64"),
 STAGING_BASIC_AUTH_HASH:"$2y$12$synthetic-test-bcrypt-hash-not-deployable",
 TGL_DB_PATH:"/data/staging.sqlite",
 TGL_IMAGE_DIR:"/data/images"
};
const validate=(patch={})=>spawnSync(process.execPath,["scripts/staging-preflight.mjs"],{env:{...process.env,...base,...patch},encoding:"utf8"});
test("staging preflight accepts isolated structural configuration",()=>{
 const result=validate();
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stdout,/Staging preflight passed/);
});
test("staging preflight rejects production hosts, weak secrets and development mail",()=>{
 for(const patch of [
  {STAGING_DOMAIN:"thegreenlocker.com",TGL_PUBLIC_ORIGIN:"https://thegreenlocker.com"},
  {TGL_MAIL_MODE:"outbox"},
  {TGL_MFA_ENCRYPTION_KEY:"short"},
  {TGL_INVITE_CODE:"short"},
  {TGL_DB_PATH:"/tmp/private.sqlite"},
  {STAGING_BASIC_AUTH_HASH:"plaintext"},
  {NODE_ENV:"development"},
  {TGL_PUBLIC_ORIGIN:"http://staging.thegreenlocker.com"}
 ]){assert.notEqual(validate(patch).status,0,"An insecure staging configuration was accepted: "+Object.keys(patch).join(","));}
});

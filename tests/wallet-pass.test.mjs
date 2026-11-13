import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  walletConfigured,walletPassJson,zipPassFiles,signedWalletPass,PASS_MIME
} from "../private/wallet-pass.mjs";

const memberCode="GL-A1B2-C3D4-E5F6-1234";
const env={
  TGL_WALLET_PASS_TYPE_ID:"pass.com.thegreenlocker.member",
  TGL_WALLET_TEAM_ID:"A1B2C3D4E5"
};

test("Wallet availability requires pass IDs and Apple-issued signing material",()=>{
 assert.equal(walletConfigured({}),false);
 assert.equal(walletConfigured(env),false);
 assert.equal(walletConfigured({...env,TGL_WALLET_SIGNER_CERT_B64:"short"}),false);
 assert.equal(PASS_MIME,"application/vnd.apple.pkpass");
 assert.throws(()=>signedWalletPass({
   memberCode,displayName:"Demo Member",
   iconPng:Buffer.from("not-png"),env
 }),/not configured/i);
});

test("generic pass JSON uses the existing account reference and non-transactional fields",()=>{
 const pass=walletPassJson({
   memberCode,displayName:"Example Member",cardTheme:"obsidian",
   cardTitle:"Vault Explorer",cardMotto:"Stay curious.",env
 });
 assert.equal(pass.passTypeIdentifier,env.TGL_WALLET_PASS_TYPE_ID);
 assert.equal(pass.teamIdentifier,env.TGL_WALLET_TEAM_ID);
 assert.equal(pass.serialNumber,memberCode);
 assert.equal(pass.formatVersion,1);
 assert.equal(pass.sharingProhibited,true);
 assert.equal(pass.generic.primaryFields[0].value,"Example Member");
 assert.equal(pass.generic.secondaryFields[0].value,memberCode);
 assert.equal(pass.generic.auxiliaryFields[0].value,"Vault Explorer");
 assert.match(JSON.stringify(pass.generic.backFields),/Not set|Stay curious/);
 assert.doesNotMatch(JSON.stringify(pass),/barcode|authenticationToken|password|checkout/i);
 assert.throws(()=>walletPassJson({...pass,memberCode:"not-a-reference",env}),/Invalid card reference/);
});

test("pass archive has valid STORE ZIP entries without third-party ZIP library",()=>{
 const files={
   "pass.json":Buffer.from(JSON.stringify({formatVersion:1})),
   "manifest.json":Buffer.from("{}"),
   "signature":randomBytes(256)
 };
 const zip=zipPassFiles(files);
 assert.equal(zip.readUInt32LE(0),0x04034b50);
 assert.equal(zip.readUInt32LE(zip.length-22),0x06054b50);
 assert.equal(zip.readUInt16LE(zip.length-12),3);
 let offset=0;
 const names=[];
 for(let i=0;i<3;i++){
   assert.equal(zip.readUInt32LE(offset),0x04034b50);
   const nameLength=zip.readUInt16LE(offset+26);
   const bodyLength=zip.readUInt32LE(offset+18);
   const name=zip.subarray(offset+30,offset+30+nameLength).toString("utf8");
   names.push(name);
   assert.deepEqual(zip.subarray(offset+30+nameLength,offset+30+nameLength+bodyLength),files[name]);
   offset+=30+nameLength+bodyLength;
 }
 assert.deepEqual(names,["pass.json","manifest.json","signature"]);
});


test("real OpenSSL detached signature wraps a complete generic pass archive",t=>{
 // Ephemeral self-signed TEST material never stored, deployed or used as Apple credentials.
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"tgl-wallet-ci-"));
 t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
 const key=path.join(tmp,"test.key");
 const cert=path.join(tmp,"test.crt");
 execFileSync("openssl",[
   "req","-x509","-newkey","rsa:2048","-nodes",
   "-keyout",key,"-out",cert,"-days","1",
   "-subj","/UID=pass.com.thegreenlocker.member/OU=A1B2C3D4E5/O=Test Issuer/C=US"
 ],{timeout:15000,stdio:["ignore","ignore","pipe"]});
 const signingEnv={
   ...env,
   TGL_WALLET_SIGNER_CERT_B64:fs.readFileSync(cert).toString("base64"),
   TGL_WALLET_PRIVATE_KEY_B64:fs.readFileSync(key).toString("base64"),
   TGL_WALLET_WWDR_CERT_B64:fs.readFileSync(cert).toString("base64")
 };
 assert.equal(walletConfigured(signingEnv),true);
 // A valid minimal test PNG (real pass uses official Green Locker PNG).
 const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==","base64");
 const zip=signedWalletPass({
   memberCode,displayName:"Member Test",cardTheme:"gilded",
   cardTitle:"The Collector",cardMotto:"Make it yours.",iconPng:png,env:signingEnv
 });
 const extracted={};
 let pos=0;
 while(pos+30<zip.length && zip.readUInt32LE(pos)===0x04034b50){
   const method=zip.readUInt16LE(pos+8);
   const size=zip.readUInt32LE(pos+18);
   const nameLength=zip.readUInt16LE(pos+26);
   const extraLength=zip.readUInt16LE(pos+28);
   assert.equal(method,0);
   const filename=zip.subarray(pos+30,pos+30+nameLength).toString();
   const from=pos+30+nameLength+extraLength;
   extracted[filename]=zip.subarray(from,from+size);
   pos=from+size;
 }
 assert.deepEqual(Object.keys(extracted),[
   "pass.json","icon.png","icon@2x.png","logo.png","logo@2x.png",
   "manifest.json","signature"
 ]);
 const json=JSON.parse(extracted["pass.json"]);
 assert.equal(json.serialNumber,memberCode);
 assert.equal(json.generic.auxiliaryFields[0].value,"The Collector");
 const manifest=JSON.parse(extracted["manifest.json"]);
 for(const [filename,digest] of Object.entries(manifest))
   assert.equal(createHash("sha1").update(extracted[filename]).digest("hex"),digest);
 const sig=path.join(tmp,"signature.der");
 const content=path.join(tmp,"manifest.json");
 fs.writeFileSync(sig,extracted.signature);
 fs.writeFileSync(content,extracted["manifest.json"]);
 const verify=execFileSync("openssl",[
   "smime","-verify","-inform","DER","-in",sig,
   "-content",content,"-noverify","-out",path.join(tmp,"verified.json")
 ],{timeout:8000,stdio:["ignore","pipe","pipe"]});
 assert.ok(Buffer.isBuffer(verify));
 assert.deepEqual(fs.readFileSync(path.join(tmp,"verified.json")),extracted["manifest.json"]);
});

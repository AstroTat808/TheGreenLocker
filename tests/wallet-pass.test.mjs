import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
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

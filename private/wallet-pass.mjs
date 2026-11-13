/**
 * Apple Wallet generic member pass builder.
 *
 * Signing secrets are read only from runtime environment variables, never from
 * the repository, the page, or browser storage. A .pkpass is ONLY emitted after
 * a detached PKCS#7 signature has been generated with the matching Apple pass
 * certificate and WWDR chain. Do not distribute unsigned ZIPs as Wallet passes.
 *
 * The card reference is a display-only identifier, never an auth token or
 * purchase credential. No barcode or wallet update web service is included.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const PASS_MIME="application/vnd.apple.pkpass";
const CERT_KEYS=[
  "TGL_WALLET_SIGNER_CERT_B64",
  "TGL_WALLET_PRIVATE_KEY_B64",
  "TGL_WALLET_WWDR_CERT_B64"
];

export { PASS_MIME };

export function walletConfigured(env=process.env) {
  return typeof env.TGL_WALLET_PASS_TYPE_ID==="string" &&
    /^pass\.[a-zA-Z0-9.-]{8,200}$/.test(env.TGL_WALLET_PASS_TYPE_ID) &&
    typeof env.TGL_WALLET_TEAM_ID==="string" &&
    /^[A-Z0-9]{10}$/.test(env.TGL_WALLET_TEAM_ID) &&
    CERT_KEYS.every(k=>typeof env[k]==="string" && env[k].length>100);
}

export function walletPassJson({memberCode,displayName,cardTheme="emerald",cardTitle="Private Member",cardMotto="",env=process.env}) {
  if(!/^GL-(?:[A-F0-9]{4}-){3}[A-F0-9]{4}$/.test(memberCode)) throw new Error("Invalid card reference");
  if(!/^pass\.[a-zA-Z0-9.-]{8,200}$/.test(env.TGL_WALLET_PASS_TYPE_ID||"")||
     !/^[A-Z0-9]{10}$/.test(env.TGL_WALLET_TEAM_ID||""))
    throw new Error("Wallet pass identifiers must be configured");
  const palette={
    emerald:{bg:"rgb(6, 29, 17)",fg:"rgb(255, 239, 196)",label:"rgb(226, 192, 121)"},
    obsidian:{bg:"rgb(12, 16, 22)",fg:"rgb(246, 232, 203)",label:"rgb(202, 183, 152)"},
    gilded:{bg:"rgb(68, 48, 19)",fg:"rgb(255, 249, 228)",label:"rgb(244, 219, 165)"}
  }[cardTheme]||{bg:"rgb(6, 29, 17)",fg:"rgb(255, 239, 196)",label:"rgb(226, 192, 121)"};
  return {
    formatVersion:1,
    passTypeIdentifier:env.TGL_WALLET_PASS_TYPE_ID,
    serialNumber:memberCode,
    teamIdentifier:env.TGL_WALLET_TEAM_ID,
    organizationName:"The Green Locker",
    description:"The Green Locker private concept membership card",
    logoText:"THE GREEN LOCKER",
    backgroundColor:palette.bg,
    foregroundColor:palette.fg,
    labelColor:palette.label,
    sharingProhibited:true,
    generic:{
      primaryFields:[{key:"memberName",label:"MEMBER",value:String(displayName).slice(0,80)}],
      secondaryFields:[{key:"memberReference",label:"REFERENCE",value:memberCode}],
      auxiliaryFields:[{key:"title",label:"CARD TITLE",value:String(cardTitle).slice(0,40)}],
      backFields:[
        {key:"motto",label:"PERSONAL NOTE",value:String(cardMotto||"Not set").slice(0,80)},
        {key:"use",label:"ABOUT THIS PASS",value:"Private, non-transactional brand concept. Does not authenticate the holder, verify age or identity, grant venue entry, or authorize purchases."},
        {key:"updates",label:"UPDATING",value:"Download the pass again after personalizing your card to replace this version."}
      ]
    }
  };
}

// Standard ZIP local file records and central directory with STORE method.
// Small fixed assets only; deliberately no third-party archive dependency.
function crc32(bytes) {
  let crc=0xFFFFFFFF;
  for(const byte of bytes){
    crc^=byte;
    for(let i=0;i<8;i++) crc=(crc>>>1)^((crc&1)?0xEDB88320:0);
  }
  return (crc^0xFFFFFFFF)>>>0;
}
export function zipPassFiles(files) {
  const local=[],central=[];let offset=0;
  for(const [filename,bytes] of Object.entries(files)) {
    const name=Buffer.from(filename,"utf8");
    const body=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);
    if(!/^[A-Za-z0-9@._-]{1,80}$/.test(filename) || body.length>12_000_000)
      throw new Error("Invalid pass asset");
    const crc=crc32(body);
    const lh=Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50,0);
    lh.writeUInt16LE(20,4);
    lh.writeUInt32LE(crc,14);
    lh.writeUInt32LE(body.length,18);
    lh.writeUInt32LE(body.length,22);
    lh.writeUInt16LE(name.length,26);
    local.push(lh,name,body);
    const ch=Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50,0);
    ch.writeUInt16LE(20,4);
    ch.writeUInt16LE(20,6);
    ch.writeUInt32LE(crc,16);
    ch.writeUInt32LE(body.length,20);
    ch.writeUInt32LE(body.length,24);
    ch.writeUInt16LE(name.length,28);
    ch.writeUInt32LE(offset,42);
    central.push(ch,name);
    offset+=lh.length+name.length+body.length;
  }
  if(central.length/2>100)throw new Error("Unexpected number of pass assets");
  const directory=Buffer.concat(central);
  const end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);
  end.writeUInt16LE(central.length/2,8);
  end.writeUInt16LE(central.length/2,10);
  end.writeUInt32LE(directory.length,12);
  end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,directory,end]);
}

function decodePem(env,name) {
  const base64=env[name]||"";
  if(base64.length>100000 || !/^[a-zA-Z0-9+/\r\n=]+$/.test(base64))throw new Error("Wallet signing secrets are malformed");
  const value=Buffer.from(base64,"base64").toString("utf8");
  if(!value.includes("-----BEGIN ") || !value.includes("-----END "))
    throw new Error("Wallet signing secrets must be PEM encoded");
  return value;
}

export function signedWalletPass({memberCode,displayName,cardTheme,cardTitle,cardMotto,iconPng,env=process.env}) {
  if(!walletConfigured(env)) throw new Error("Apple Wallet signing is not configured");
  if(!Buffer.isBuffer(iconPng) || iconPng.subarray(0,8).toString("hex")!=="89504e470d0a1a0a")
    throw new Error("Wallet pass requires the official PNG shield icon");
  const passJson=Buffer.from(JSON.stringify(walletPassJson({
    memberCode,displayName,cardTheme,cardTitle,cardMotto,env
  })));
  const files={
    "pass.json":passJson,
    "icon.png":iconPng,
    "icon@2x.png":iconPng,
    "logo.png":iconPng,
    "logo@2x.png":iconPng
  };
  const manifest={};
  for(const [name,data] of Object.entries(files))
    manifest[name]=createHash("sha1").update(data).digest("hex");
  const manifestData=Buffer.from(JSON.stringify(manifest));

  const temp=fs.mkdtempSync(path.join(os.tmpdir(),"tgl-wallet-"));
  try{
    fs.chmodSync(temp,0o700);
    const signer=path.join(temp,"signer.pem");
    const key=path.join(temp,"key.pem");
    const wwdr=path.join(temp,"wwdr.pem");
    const manifestPath=path.join(temp,"manifest.json");
    const signaturePath=path.join(temp,"signature");
    fs.writeFileSync(signer,decodePem(env,CERT_KEYS[0]),{mode:0o600});
    fs.writeFileSync(key,decodePem(env,CERT_KEYS[1]),{mode:0o600});
    fs.writeFileSync(wwdr,decodePem(env,CERT_KEYS[2]),{mode:0o600});
    fs.writeFileSync(manifestPath,manifestData,{mode:0o600});
    // Detached DER PKCS#7 signature, includes signer and WWDR intermediate.
    execFileSync("openssl",[
      "smime","-binary","-sign",
      "-in",manifestPath,"-signer",signer,"-inkey",key,
      "-certfile",wwdr,"-outform","DER","-out",signaturePath
    ],{timeout:8000,stdio:["ignore","pipe","pipe"],maxBuffer:64*1024});
    const signature=fs.readFileSync(signaturePath);
    if(signature.length<100)throw new Error("Wallet signature was not generated");
    return zipPassFiles({...files,"manifest.json":manifestData,signature});
  } finally {
    fs.rmSync(temp,{recursive:true,force:true});
  }
}

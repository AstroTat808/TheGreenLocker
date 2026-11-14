/**
 * Encrypted, region-separated private-preview backups.
 * Format: TGLBK1 (6 bytes) | HKDF salt (16) | AES-GCM IV (12) |
 *         encrypted tar.gz | GCM tag (16).
 * Backups contain a SQLite online snapshot, all referenced artwork, and the
 * preview's credential/MFA seed file. Never publish the archive or its key.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {createHash,createHmac,randomBytes,hkdfSync,createCipheriv,createDecipheriv} from "node:crypto";
import {pipeline} from "node:stream/promises";
import {Readable} from "node:stream";
import {fileURLToPath} from "node:url";
import {DatabaseSync} from "node:sqlite";
import {createGallerySnapshot,verifyGallerySnapshot} from "./gallery-backup.mjs";

const MAGIC=Buffer.from("TGLBK1","ascii");
const HEADER_BYTES=MAGIC.length+16+12;
const TAG_BYTES=16;
const EMPTY_SHA256=createHash("sha256").update("").digest("hex");
const backupName=/^daily\/\d{4}-\d{2}-\d{2}\/[a-f0-9]{24}\.tglbk$/;
const imageFile=/^[a-f0-9]{32}\.webp$/;
const shaFile=p=>{
 const hash=createHash("sha256"),fd=fs.openSync(p,"r"),chunk=Buffer.allocUnsafe(64*1024);
 try{
  let read;
  while((read=fs.readSync(fd,chunk,0,chunk.length,null))>0)hash.update(chunk.subarray(0,read));
 }finally{fs.closeSync(fd);}
 return hash.digest("hex");
};
const hexKey=value=>{
 if(typeof value!=="string"||!/^[a-f0-9]{64}$/i.test(value))throw Error("TGL_BACKUP_ENCRYPTION_KEY must be 32 bytes of hex.");
 return Buffer.from(value,"hex");
};
const keyFor=(secret,salt)=>Buffer.from(hkdfSync("sha256",hexKey(secret),salt,"tgl-backup-archive-v1",32));
const cleanUp=dir=>fs.rmSync(dir,{recursive:true,force:true});
const temporary=()=>fs.mkdtempSync(path.join(os.tmpdir(),"tgl-backup-"));
const mustBeFile=p=>{if(!fs.statSync(p).isFile())throw Error("Not a regular file: "+path.basename(p));};
const safeJson=p=>JSON.parse(fs.readFileSync(p,"utf8"));
const copyPrivate=(source,target)=>{
 mustBeFile(source);
 fs.copyFileSync(source,target,fs.constants.COPYFILE_EXCL);
 fs.chmodSync(target,0o600);
};

export async function encryptArchive(archive,destination,masterHex){
 const salt=randomBytes(16),iv=randomBytes(12);
 const header=Buffer.concat([MAGIC,salt,iv]);
 const cipher=createCipheriv("aes-256-gcm",keyFor(masterHex,salt),iv);
 cipher.setAAD(header);
 fs.writeFileSync(destination,header,{flag:"wx",mode:0o600});
 try{
  await pipeline(fs.createReadStream(archive),cipher,fs.createWriteStream(destination,{flags:"a",mode:0o600}));
  fs.appendFileSync(destination,cipher.getAuthTag());
 }catch(e){fs.rmSync(destination,{force:true});throw e;}
 return {sha256:shaFile(destination),bytes:fs.statSync(destination).size};
}
export async function decryptArchive(encrypted,archive,masterHex){
 const size=fs.statSync(encrypted).size;
 if(size<HEADER_BYTES+TAG_BYTES+1)throw Error("Encrypted archive is truncated.");
 const handle=fs.openSync(encrypted,"r");
 let header,tag;
 try{
  header=Buffer.alloc(HEADER_BYTES);tag=Buffer.alloc(TAG_BYTES);
  fs.readSync(handle,header,0,HEADER_BYTES,0);
  fs.readSync(handle,tag,0,TAG_BYTES,size-TAG_BYTES);
 }finally{fs.closeSync(handle);}
 if(!header.subarray(0,MAGIC.length).equals(MAGIC))throw Error("Invalid encrypted backup format.");
 const salt=header.subarray(MAGIC.length,MAGIC.length+16);
 const iv=header.subarray(MAGIC.length+16);
 const decipher=createDecipheriv("aes-256-gcm",keyFor(masterHex,salt),iv);
 decipher.setAAD(header);
 decipher.setAuthTag(tag);
 try{
  await pipeline(fs.createReadStream(encrypted,{start:HEADER_BYTES,end:size-TAG_BYTES-1}),
    decipher,fs.createWriteStream(archive,{flags:"wx",mode:0o600}));
 }catch(e){fs.rmSync(archive,{force:true});throw Error("Backup authentication or decryption failed.");}
}
function validateFixture(credentials){
 if(!credentials||typeof credentials!=="object"||
   !credentials.inviteCode||Buffer.from(credentials.mfaKey||"","base64").length!==32||
   !credentials.adminEmail||!credentials.memberEmail||!credentials.adminPassword||!credentials.memberPassword)
  throw Error("Restored credential/MFA material is missing or invalid.");
}
async function buildArchive({dbPath,dataDirectory,masterHex,work}){
 const snap=path.join(work,"snapshot");
 await createGallerySnapshot({dbPath,dataDirectory,destination:snap});
 const creds=path.join(dataDirectory,"credentials.json");
 copyPrivate(creds,path.join(snap,"credentials.json"));
 validateFixture(safeJson(path.join(snap,"credentials.json")));
 const outbox=path.join(dataDirectory,"email-outbox.ndjson");
 if(fs.existsSync(outbox))copyPrivate(outbox,path.join(snap,"email-outbox.ndjson"));
 const files=["credentials.json",...(fs.existsSync(path.join(snap,"email-outbox.ndjson"))?["email-outbox.ndjson"]:[])];
 const manifest={
  format:1,
  files:Object.fromEntries(files.map(name=>[name,shaFile(path.join(snap,name))]))
 };
 fs.writeFileSync(path.join(snap,"full-manifest.json"),JSON.stringify(manifest)+"\n",{flag:"wx",mode:0o600});
 const archive=path.join(work,"snapshot.tar.gz"),sealed=path.join(work,"snapshot.tglbk");
 execFileSync("tar",["-czf",archive,"-C",work,"snapshot"],{timeout:120000});
 const encrypted=await encryptArchive(archive,sealed,masterHex);
 return {sealed,encrypted};
}
function validateExtractList(archive){
 const listing=execFileSync("tar",["-tzf",archive],{timeout:120000,maxBuffer:8*1024*1024})
  .toString("utf8").split(/\r?\n/).filter(Boolean);
 if(!listing.length||listing.length>1000)throw Error("Unexpected backup entry count.");
 const regular=new Set(["snapshot/","snapshot/concept-art/","snapshot/snapshot.sqlite",
  "snapshot/manifest.json","snapshot/full-manifest.json","snapshot/credentials.json","snapshot/email-outbox.ndjson"]);
 for(const name of listing){
  if(!regular.has(name)&&!(name.startsWith("snapshot/concept-art/")&&
     imageFile.test(name.slice("snapshot/concept-art/".length))))
   throw Error("Unexpected or unsafe archive entry.");
 }
 if(new Set(listing).size!==listing.length)throw Error("Duplicate backup entries rejected.");
}
function checkRestoredSnapshot(snap){
 const gallery=verifyGallerySnapshot(snap);
 const meta=safeJson(path.join(snap,"full-manifest.json"));
 if(meta.format!==1||!meta.files||Object.keys(meta.files).some(x=>!["credentials.json","email-outbox.ndjson"].includes(x))||
    !meta.files["credentials.json"])throw Error("Full restore manifest invalid.");
 for(const [name,sha] of Object.entries(meta.files)){
  if(!/^[a-f0-9]{64}$/.test(sha)||shaFile(path.join(snap,name))!==sha)
   throw Error("Full restore file integrity failed.");
 }
 validateFixture(safeJson(path.join(snap,"credentials.json")));
 const db=new DatabaseSync(path.join(snap,"snapshot.sqlite"),{readOnly:true});
 let users;
 try{users=Number(db.prepare("SELECT COUNT(*) AS n FROM users").get().n);}finally{db.close();}
 return {images:gallery.images,users,credentialsIncluded:true};
}
/**
 * Does not overwrite or alter running data. Restore into a fresh isolated dir;
 * stop the running app and migrate verified files separately if ever needed.
 */
export async function restoreEncryptedBackup({encrypted,masterHex,targetDirectory}){
 const target=path.resolve(targetDirectory);
 if(fs.existsSync(target))throw Error("Restore destination exists; never overwrite running data.");
 const work=temporary();
 try{
  const archive=path.join(work,"restore.tar.gz");
  await decryptArchive(encrypted,archive,masterHex);
  validateExtractList(archive);
  execFileSync("tar",["-xzf",archive,"-C",work],{timeout:120000});
  const restored=path.join(work,"snapshot");
  const result=checkRestoredSnapshot(restored);
  fs.renameSync(path.join(restored,"snapshot.sqlite"),path.join(restored,"preview.sqlite"));
  fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});
  try{
   fs.renameSync(restored,target);
  }catch(error){
   if(error.code!=="EXDEV")throw error;
   // Recovery targets are often separate mounted volumes; support cross-device copy.
   fs.cpSync(restored,target,{recursive:true,force:false,errorOnExist:true});
  }
  fs.chmodSync(target,0o700);
  return result;
 }finally{cleanUp(work);}
}
const awsEncode=value=>encodeURIComponent(value).replace(/[!'()*]/g,c=>"%"+c.charCodeAt(0).toString(16).toUpperCase());
const hmac=(key,value)=>createHmac("sha256",key).update(value).digest();
function s3Configuration(env,prefix="TGL_BACKUP_S3_"){
 const value=name=>env[prefix+name];
 const endpoint=new URL(value("ENDPOINT")||"");
 if(endpoint.protocol!=="https:"||endpoint.username||endpoint.password||endpoint.search||
   endpoint.hash||endpoint.pathname!=="/")throw Error("Invalid HTTPS S3 backup endpoint.");
 const bucket=value("BUCKET"),region=value("REGION");
 const keyId=value("ACCESS_KEY_ID"),secret=value("SECRET_ACCESS_KEY");
 const style=value("STYLE");
 if(!/^[a-z0-9][a-z0-9.-]{2,100}$/.test(bucket||"")||!region||!keyId||!secret||
    !["path","virtual-host"].includes(style))throw Error("Backup object storage is not fully configured.");
 return {endpoint,bucket,region,keyId,secret,style};
}
function signedS3({config,method,objectKey="",payloadSha,query=""}){
 if(objectKey&&!backupName.test(objectKey))throw Error("Invalid private backup key.");
 const {endpoint,bucket,region,keyId,secret,style}=config;
 const uri="/"+(style==="path"?awsEncode(bucket)+"/":"")+
    (objectKey?objectKey.split("/").map(awsEncode).join("/"):"");
 const host=(style==="virtual-host"?bucket+".":"")+endpoint.host;
 const url=new URL("https://"+host+uri+(query?"?"+query:""));
 const stamp=new Date().toISOString().replace(/[:-]|\.\d{3}/g,""),date=stamp.slice(0,8);
 const headers="host:"+host+"\n"+"x-amz-content-sha256:"+payloadSha+"\n"+"x-amz-date:"+stamp+"\n";
 const signedNames="host;x-amz-content-sha256;x-amz-date";
 const canonical=[method,uri,query,headers,signedNames,payloadSha].join("\n");
 const scope=[date,region,"s3","aws4_request"].join("/");
 const toSign=["AWS4-HMAC-SHA256",stamp,scope,createHash("sha256").update(canonical).digest("hex")].join("\n");
 const kDate=hmac("AWS4"+secret,date),kRegion=hmac(kDate,region),
   kService=hmac(kRegion,"s3"),kSigning=hmac(kService,"aws4_request");
 const signature=createHmac("sha256",kSigning).update(toSign).digest("hex");
 const authorization="AWS4-HMAC-SHA256 Credential="+keyId+"/"+scope+
  ", SignedHeaders="+signedNames+", Signature="+signature;
 return {url,headers:{"x-amz-content-sha256":payloadSha,"x-amz-date":stamp,"Authorization":authorization}};
}
const xmlText=(xml,key)=>{
 const hit=xml.match(new RegExp("<"+key+">([\\s\\S]*?)<\\/"+key+">"));
 return hit?hit[1].replace(/&amp;/g,"&").replace(/&lt;/g,"<")
   .replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'"):null;
};
export function createS3Store(env=process.env,prefix="TGL_BACKUP_S3_"){
 const config=s3Configuration(env,prefix);
 return {
  async putFile(objectKey,file){
   const signed=signedS3({config,method:"PUT",objectKey,payloadSha:shaFile(file)});
   const response=await fetch(signed.url,{method:"PUT",
    headers:{...signed.headers,"Content-Type":"application/octet-stream",
      "Content-Length":String(fs.statSync(file).size)},
    body:fs.createReadStream(file),duplex:"half",signal:AbortSignal.timeout(120000)});
   if(!response.ok){await response.body?.cancel();throw Error("S3 backup upload failed: HTTP "+response.status);}
   await response.body?.cancel();
  },
  async getFile(objectKey,file){
   const signed=signedS3({config,method:"GET",objectKey,payloadSha:EMPTY_SHA256});
   const response=await fetch(signed.url,{method:"GET",headers:signed.headers,signal:AbortSignal.timeout(120000)});
   if(!response.ok||!response.body){await response.body?.cancel();throw Error("S3 backup retrieval failed: HTTP "+response.status);}
   await pipeline(Readable.fromWeb(response.body),fs.createWriteStream(file,{flags:"wx",mode:0o600}));
  },
  async listFiles(){
   const result=[];let continuation=null;
   for(let page=0;page<100;page++){
    const params=[["list-type","2"],["prefix","daily/"]];
    if(continuation)params.push(["continuation-token",continuation]);
    const query=params.sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>awsEncode(k)+"="+awsEncode(v)).join("&");
    const signed=signedS3({config,method:"GET",payloadSha:EMPTY_SHA256,query});
    const response=await fetch(signed.url,{method:"GET",headers:signed.headers,signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error("Backup list failed: HTTP "+response.status);
    const xml=await response.text();
    for(const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)){
     const key=xmlText(match[1],"Key"),lastModified=xmlText(match[1],"LastModified");
     if(!key||!lastModified)throw Error("Backup listing has incomplete metadata.");
     if(backupName.test(key))result.push({key,lastModified});
    }
    if(xmlText(xml,"IsTruncated")!=="true")return result;
    const token=xmlText(xml,"NextContinuationToken");
    if(!token||token===continuation)throw Error("Backup listing pagination invalid.");
    continuation=token;
   }
   throw Error("Backup listing exceeded safe pagination limit.");
  },
  async deleteFile(objectKey){
   const signed=signedS3({config,method:"DELETE",objectKey,payloadSha:EMPTY_SHA256});
   const response=await fetch(signed.url,{method:"DELETE",headers:signed.headers,signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw Error("Backup deletion rejected: HTTP "+response.status);
   await response.body?.cancel();
  }
 };
}
function backupStatus(dataDirectory){
 try{return safeJson(path.join(dataDirectory,"backup-status.json"));}
 catch{return null;}
}
const catalogFile=dir=>path.join(dir,"backup-catalog.json");
function recentCatalog(dir){
 try{
  const data=JSON.parse(fs.readFileSync(catalogFile(dir),"utf8"));
  return Array.isArray(data)?data.filter(x=>x&&backupName.test(x.objectKey||"")):[];
 }catch{return [];}
}
function saveCatalog(dir,rows){
 const target=catalogFile(dir),tmp=target+"."+randomBytes(6).toString("hex")+".tmp";
 fs.writeFileSync(tmp,JSON.stringify(rows.slice(-1000),null,2)+"\n",{mode:0o600,flag:"wx"});
 fs.renameSync(tmp,target);
}
export async function previewBackupRetention({dataDirectory,objectStore,secondaryStore=null,
 retentionDays=90,minimumCopies=14}){
 if(!Number.isInteger(retentionDays)||retentionDays<30||retentionDays>365)
  throw Error("Invalid retention policy.");
 const [primary,mirrored]=await Promise.all([
  objectStore.listFiles(),secondaryStore?secondaryStore.listFiles():Promise.resolve([])
 ]);
 const mirrors=new Set(mirrored.map(x=>x.key));
 const catalog=recentCatalog(dataDirectory);
 const verified=new Set(catalog.filter(x=>x.secondaryVerified===true)
   .map(x=>x.objectKey));
 const protectedKeys=new Set(primary.slice().sort((a,b)=>
   Date.parse(b.lastModified)-Date.parse(a.lastModified)).slice(0,minimumCopies).map(x=>x.key));
 const latest=backupStatus(dataDirectory)?.objectKey;
 if(latest)protectedKeys.add(latest);
 const expiry=Date.now()-retentionDays*24*60*60*1000;
 const eligible=primary.filter(x=>backupName.test(x.key)&&
   Date.parse(x.lastModified)<expiry&&
   Number.isFinite(Date.parse(x.lastModified))&&
   verified.has(x.key)&&mirrors.has(x.key)&&!protectedKeys.has(x.key));
 return {total:primary.length,mirrored:mirrored.length,eligible,
  oldest:primary.map(x=>x.lastModified).sort()[0]||null,
  retentionDays,minimumCopies,canDelete:!!secondaryStore};
}
export async function enforceBackupRetention({dataDirectory,objectStore,
 secondaryStore=null,policy,env=process.env}){
 const plan=await previewBackupRetention({dataDirectory,objectStore,secondaryStore,
  retentionDays:policy.retentionDays,minimumCopies:policy.minimumCopies||14});
 const authorized=policy.mode==="enforce"&&env.TGL_BACKUP_RETENTION_ALLOW_DELETE==="1"&&
  env.TGL_BACKUP_ESCROW_CONFIRMED==="1"&&!!secondaryStore;
 if(!authorized)return {...plan,deleted:0,mode:"dry-run"};
 let count=0;
 // Only delete the Railway primary copy when a verified matching archive remains
 // in the separately administered secondary provider.
 for(const item of plan.eligible.slice(0,30)){
  await objectStore.deleteFile(item.key);
  count++;
 }
 return {...plan,deleted:count,mode:"enforced"};
}
export async function runAndVerifyOffsiteBackup({
 dataDirectory,dbPath,masterHex,objectStore=createS3Store(),
 secondaryStore=null,requireSecondary=false,force=false
}){
 if(!masterHex)throw Error("Backup encryption key is missing.");
 hexKey(masterHex);
 if(requireSecondary&&!secondaryStore)throw Error("Independent backup destination is required but missing.");
 const status=backupStatus(dataDirectory);
 const fresh=status?.verifiedAt&&Date.now()-Date.parse(status.verifiedAt)<24*60*60*1000;
 if(!force&&fresh&&(!secondaryStore||status?.targets?.secondary?.verifiedAt))
  return {skipped:true,objectKey:status.objectKey};
 const work=temporary();
 try{
  const {sealed,encrypted}=await buildArchive({dbPath,dataDirectory,masterHex,work});
  const now=new Date().toISOString();
  const objectKey="daily/"+now.slice(0,10)+"/"+randomBytes(12).toString("hex")+".tglbk";
  async function verify(store,target){
   await store.putFile(objectKey,sealed);
   const downloaded=path.join(work,target+".tglbk");
   await store.getFile(objectKey,downloaded);
   if(shaFile(downloaded)!==encrypted.sha256)
    throw Error("Remote encrypted object SHA-256 mismatch at "+target+".");
   const result=await restoreEncryptedBackup({
    encrypted:downloaded,masterHex,targetDirectory:path.join(work,target+"-restore")
   });
   return {verifiedAt:now,images:result.images,users:result.users,
    encryptedSha256:encrypted.sha256};
  }
  const primary=await verify(objectStore,"primary");
  const secondary=secondaryStore?await verify(secondaryStore,"secondary"):null;
  const payload={verifiedAt:now,objectKey,encryptedSha256:encrypted.sha256,
    bytes:encrypted.bytes,images:primary.images,users:primary.users,
    credentialsIncluded:true,targets:{primary,secondary}};
  const marker=path.join(dataDirectory,"backup-status.json");
  const tmp=marker+"."+randomBytes(6).toString("hex")+".tmp";
  fs.writeFileSync(tmp,JSON.stringify(payload)+"\n",{mode:0o600,flag:"wx"});
  fs.renameSync(tmp,marker);
  const catalog=recentCatalog(dataDirectory);
  catalog.push({objectKey,verifiedAt:now,sha256:encrypted.sha256,
   primaryVerified:true,secondaryVerified:!!secondary});
  saveCatalog(dataDirectory,catalog);
  return payload;
 }finally{cleanUp(work);}
}
export function installBackupWriteGuard(server){
 const original=server.listeners("request");
 if(!original.length)throw Error("Install backup guard after the application request listener.");
 server.removeAllListeners("request");
 let locked=false,active=0;
 server.on("request",(req,res)=>{
  const write=!["GET","HEAD","OPTIONS"].includes(req.method);
  if(write&&locked){
   res.writeHead(503,{"Content-Type":"text/plain","Retry-After":"20","Cache-Control":"no-store"});
   res.end("Gallery maintenance; retry your request.");return;
  }
  if(write){
   active++;let finished=false;
   const release=()=>{if(finished)return;finished=true;active--;};
   res.once("finish",release);res.once("close",release);
  }
  for(const handler of original)handler.call(server,req,res);
 });
 return {
  async exclusive(fn){
   if(locked)throw Error("A backup is already in progress.");
   locked=true;
   try{
    const deadline=Date.now()+30000;
    while(active>0){
     if(Date.now()>deadline)throw Error("Could not drain existing write requests for backup.");
     await new Promise(resolve=>setTimeout(resolve,100));
    }
    return await fn();
   }finally{locked=false;}
  }
 };
}
export function startScheduledOffsiteBackups({guard,dataDirectory,dbPath,env=process.env}){
 if(env.TGL_BACKUP_ENABLED!=="1")return ()=>{};
 const masterHex=env.TGL_BACKUP_ENCRYPTION_KEY;
 hexKey(masterHex);
 const store=createS3Store(env);
 let busy=false,stopped=false;
 const check=async()=>{
  if(stopped||busy)return;
  busy=true;
  try{
   const result=await guard.exclusive(()=>runAndVerifyOffsiteBackup({
    dataDirectory,dbPath,masterHex,objectStore:store
   }));
   if(!result.skipped)console.info("Offsite backup verified:",result.objectKey,
     "images:",result.images,"users:",result.users);
  }catch(e){console.error("Offsite backup failure:",e instanceof Error?e.message:"Unknown error");}
  finally{busy=false;}
 };
 const handle=setInterval(()=>void check(),60*60*1000);
 handle.unref();
 setImmediate(()=>void check());
 return ()=>{stopped=true;clearInterval(handle);};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [command,encrypted,targetDirectory]=process.argv.slice(2);
 if(command!=="restore"||!encrypted||!targetDirectory){
  console.error("Usage: TGL_BACKUP_ENCRYPTION_KEY=<key> node scripts/offsite-backup.mjs restore <archive.tglbk> <NEW-isolated-directory>");
  process.exitCode=2;
 }else restoreEncryptedBackup({
  encrypted,masterHex:process.env.TGL_BACKUP_ENCRYPTION_KEY,targetDirectory
 }).then(result=>console.info("Isolated restore verified:",JSON.stringify(result)))
  .catch(error=>{console.error("Recovery blocked:",error.message);process.exitCode=1;});
}

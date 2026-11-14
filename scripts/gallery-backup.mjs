/**
 * Operator-initiated gallery snapshot and restore integrity verifier.
 *
 * Does NOT configure a backup schedule or upload data off-site.
 * Run while gallery writes are quiesced; use a separate encrypted backup
 * destination and protect workshop credentials/MFA keys separately.
 */
import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {backup,DatabaseSync} from "node:sqlite";
import {fileURLToPath} from "node:url";

const imageKey=/^[a-f0-9]{32}\.webp$/;
const hashFile=file=>createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const ensureSeparate=(src,dest)=>{
 const from=path.resolve(src),to=path.resolve(dest);
 const relative=path.relative(from,to);
 if(relative===""||(!relative.startsWith(".."+path.sep)&&relative!==".."&&!path.isAbsolute(relative)))
  throw Error("The backup destination must be outside the source data volume.");
};
const integrity=db=>{
 const check=db.prepare("PRAGMA integrity_check").get();
 if(Object.values(check||{})[0]!=="ok")throw Error("SQLite integrity check failed.");
};
const fileRefs=db=>{
 const exists=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='collection_media'").get();
 return exists?db.prepare("SELECT DISTINCT file_key FROM collection_media ORDER BY file_key").all()
  .map(item=>item.file_key):[];
};
export function verifyGallerySnapshot(destination){
 const folder=path.resolve(destination);
 const manifest=JSON.parse(fs.readFileSync(path.join(folder,"manifest.json"),"utf8"));
 if(manifest.format!==1||manifest.files.some(item=>
    !imageKey.test(item.key)||!/^[a-f0-9]{64}$/.test(item.sha256)))
  throw Error("Invalid backup manifest.");
 const database=path.join(folder,"snapshot.sqlite");
 if(hashFile(database)!==manifest.database_sha256)throw Error("Database digest mismatch.");
 const db=new DatabaseSync(database,{readOnly:true});
 let refs;
 try{integrity(db);refs=fileRefs(db);}finally{db.close();}
 const fileSet=new Set(manifest.files.map(item=>item.key));
 if(refs.length!==manifest.files.length||refs.some(key=>!fileSet.has(key)))
  throw Error("Gallery media references differ from the backup manifest.");
 for(const item of manifest.files){
  const full=path.join(folder,"concept-art",item.key);
  if(!fs.statSync(full).isFile()||hashFile(full)!==item.sha256)
   throw Error("Image backup digest mismatch: "+item.key);
 }
 return {ok:true,images:refs.length,db_sha256:manifest.database_sha256};
}
export async function createGallerySnapshot({dbPath,dataDirectory,destination}){
 const dbFile=path.resolve(dbPath),sourceDir=path.resolve(dataDirectory),dest=path.resolve(destination);
 ensureSeparate(sourceDir,dest);
 if(!fs.statSync(dbFile).isFile())throw Error("Source database not found.");
 if(fs.existsSync(dest))throw Error("Destination already exists; never overwrite a backup.");
 fs.mkdirSync(dest,{recursive:true,mode:0o700});
 try{
  const targetDb=path.join(dest,"snapshot.sqlite");
  const live=new DatabaseSync(dbFile,{readOnly:true});
  try{await backup(live,targetDb);}finally{live.close();}
  fs.chmodSync(targetDb,0o600);
  const snapshot=new DatabaseSync(targetDb,{readOnly:true});
  let refs;
  try{integrity(snapshot);refs=fileRefs(snapshot);}finally{snapshot.close();}
  fs.mkdirSync(path.join(dest,"concept-art"),{mode:0o700});
  const files=[];
  for(const key of refs){
   if(!imageKey.test(key))throw Error("Unsafe image key in snapshot.");
   const image=path.join(sourceDir,"concept-art",key);
   if(!fs.statSync(image).isFile()||fs.statSync(image).size>2*1024*1024)
    throw Error("Missing or oversized gallery image: "+key);
   const output=path.join(dest,"concept-art",key);
   fs.copyFileSync(image,output,fs.constants.COPYFILE_EXCL);
   fs.chmodSync(output,0o600);
   files.push({key,sha256:hashFile(output)});
  }
  const manifest={format:1,created_at:new Date().toISOString(),database_sha256:hashFile(targetDb),files};
  fs.writeFileSync(path.join(dest,"manifest.json"),JSON.stringify(manifest,null,2)+"\n",
    {flag:"wx",mode:0o600});
  return verifyGallerySnapshot(dest);
 }catch(error){
  fs.rmSync(dest,{recursive:true,force:true});
  throw error;
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [dbPath,dataDirectory,destination]=process.argv.slice(2);
 if(!dbPath||!dataDirectory||!destination){
  process.stderr.write("Usage: node scripts/gallery-backup.mjs <sqlite-file> <source-data-dir> <external-backup-dir>\n");
  process.exitCode=2;
 }else createGallerySnapshot({dbPath,dataDirectory,destination})
  .then(result=>process.stdout.write(JSON.stringify(result)+"\n"))
  .catch(error=>{process.stderr.write("Backup failed integrity check: "+error.message+"\n");process.exitCode=1;});
}

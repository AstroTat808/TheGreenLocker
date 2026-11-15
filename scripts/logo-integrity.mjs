import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

/**
 * Authorized artwork from the Green Locker shield approval. Git blob fingerprints
 * are computed from raw source bytes, detecting silent changes to the WebP or
 * its transparent SVG wrapper.
 */
export const APPROVED_LOGO_BLOBS=Object.freeze({
  "assets/shield-logo.webp":"7810c241191409e27e34712692de2603b018c635",
  "assets/shield-logo-transparent.svg":"86fe60aa28ce2582c48db0197555f468e6c16f76"
});
export function gitBlobFingerprint(bytes){
  const body=Buffer.from(bytes);
  return createHash("sha1").update("blob "+body.length+String.fromCharCode(0))
    .update(body).digest("hex");
}
export function officialLogoIntegrity(workingDir=fileURLToPath(new URL("../",import.meta.url))){
  const results=Object.entries(APPROVED_LOGO_BLOBS).map(([filename,approved])=>{
    const actual=gitBlobFingerprint(fs.readFileSync(path.join(workingDir,filename)));
    return {filename,approved,actual,pass:approved===actual};
  });
  return {pass:results.every(x=>x.pass),results};
}

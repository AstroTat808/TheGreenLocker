import { brotliCompressSync, constants as zlibConstants } from "node:zlib";
import { createHash } from "node:crypto";

/**
 * Losslessly transmit the approved shield SVG without ever modifying its
 * embedded official WebP, geometry, alpha mask or typography.
 * The public /logo URL is intentionally shared by the login and member views.
 */
export function createShieldDelivery(original) {
  const raw=Buffer.from(original);
  const br=brotliCompressSync(raw,{
    params:{[zlibConstants.BROTLI_PARAM_QUALITY]:8}
  });
  const etag='"'+createHash("sha256").update(raw).digest("hex").slice(0,32)+'"';
  const csp="default-src 'none'; img-src data:; style-src 'none'; script-src 'none'; object-src 'none'; frame-ancestors 'none'; sandbox";
  return {
    originalBytes:raw.length, compressedBytes:br.length, etag,
    send({req,res,respond,privateAsset=false}){
      const supported=String(req.headers["accept-encoding"]||"").split(",")
        .some(entry=>{
          const parts=entry.trim().toLowerCase().split(";").map(x=>x.trim());
          return parts[0]==="br"&&!parts.slice(1).some(x=>/^q\s*=\s*0(?:\.0+)?$/.test(x));
        });
      const headers={
        "Content-Security-Policy":csp,
        "Cache-Control":privateAsset?"private, max-age=3600, must-revalidate":"public, max-age=3600, must-revalidate",
        "ETag":etag,
        "Vary":"Accept-Encoding",
        ...(supported?{"Content-Encoding":"br"}:{})
      };
      if(String(req.headers["if-none-match"]||"").split(",").map(x=>x.trim()).includes(etag))
        return respond(res,304,"","image/svg+xml; charset=utf-8",headers);
      return respond(res,200,supported?br:raw,"image/svg+xml; charset=utf-8",headers);
    }
  };
}

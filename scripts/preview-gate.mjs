/**
 * Fail-closed HTTP Basic access gate for the isolated Railway visual preview.
 * Only /healthz is unauthenticated for platform health checks.
 * This is NOT a substitute for production identity or rate-limiting controls.
 */
import { createHash, timingSafeEqual } from "node:crypto";
const sha=value=>createHash("sha256").update(value,"utf8").digest();
const equal=(a,b)=>timingSafeEqual(sha(a),sha(b));
const failures=new Map();
export function enforcePreviewGate(server) {
  const username=process.env.TGL_PREVIEW_GATE_USER || "";
  const password=process.env.TGL_PREVIEW_GATE_PASSWORD || "";
  if(username.length<4 || username.length>80 || !/^[a-zA-Z0-9_.@-]+$/.test(username) || password.length<24)
    throw new Error("Private cloud preview requires a dedicated gateway username and >=24-character random password.");
  const previous=server.listeners("request");
  if(previous.length===0)throw new Error("The preview app has no request handler.");
  server.removeAllListeners("request");
  server.on("request",(req,res)=>{
    if(req.url?.split("?")[0]==="/healthz"){
      res.writeHead(200,{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store","X-Robots-Tag":"noindex, nofollow"});
      res.end("ok"); return;
    }
    const key=req.socket.remoteAddress || "unknown",now=Date.now();
    const item=failures.get(key);
    if(item?.until>now && item.count>=20){
      res.writeHead(429,{"Cache-Control":"no-store","Retry-After":"900","X-Robots-Tag":"noindex, nofollow"});
      res.end("Too many attempts"); return;
    }
    let ok=false;
    const header=String(req.headers.authorization || "");
    if(header.startsWith("Basic ") && header.length<=500){
      try{
        const decoded=Buffer.from(header.slice(6),"base64").toString("utf8");
        const i=decoded.indexOf(":");
        if(i!==-1)ok=equal(decoded.slice(0,i),username)&&equal(decoded.slice(i+1),password);
      }catch{}
    }
    if(!ok){
      const next=item?.until>now ? item : {count:0,until:now+900000};
      next.count++;
      if(failures.size>5000)failures.clear();
      failures.set(key,next);
      res.writeHead(401,{
        "WWW-Authenticate":'Basic realm="Green Locker Private Preview", charset="UTF-8"',
        "Cache-Control":"no-store, private",
        "X-Robots-Tag":"noindex, nofollow",
        "X-Content-Type-Options":"nosniff"
      });res.end("Private preview authentication required");return;
    }
    for(const listener of previous)listener.call(server,req,res);
  });
}

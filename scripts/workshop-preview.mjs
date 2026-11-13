/**
 * The Green Locker — Workshop private development preview.
 * Generates random local demo accounts and seed data. No production use.
 */
import fs from "node:fs";
import path from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
import { createApp } from "../private/server.mjs";
import { enforcePreviewGate } from "./preview-gate.mjs";

if (process.env.NODE_ENV === "production" || ["staging","production"].includes(process.env.TGL_ENV)) {
  throw new Error("Workshop preview fixtures are development-only; staging and production are blocked.");
}
const host = process.env.WORKSHOP_PREVIEW_BIND || "127.0.0.1";
if (!["127.0.0.1","0.0.0.0"].includes(host)) throw new Error("Invalid bind address.");
if (host === "0.0.0.0" && process.env.WORKSHOP_ALLOW_CLOUD_PREVIEW !== "1") {
  throw new Error("Explicitly enable cloud preview and restrict access in Workshop first.");
}
const port = Number(process.env.PORT || 4174);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("Invalid port.");
const dir = path.resolve(process.env.TGL_WORKSHOP_DIR || ".workshop-preview");
const credentialsPath = path.join(dir,"credentials.json");
fs.mkdirSync(dir,{recursive:true,mode:0o700});
const randomSecret=()=>randomBytes(24).toString("base64url");
let fixture;
if (fs.existsSync(credentialsPath)) {
  fixture = JSON.parse(fs.readFileSync(credentialsPath,"utf8"));
} else {
  fixture = {
    inviteCode:randomSecret(),
    mfaKey:randomBytes(32).toString("base64"),
    memberEmail:"preview-member@example.test",
    memberPassword:process.env.TGL_PREVIEW_MEMBER_PASSWORD || randomSecret(),
    adminEmail:"preview-admin@example.test",
    adminPassword:process.env.TGL_PREVIEW_ADMIN_PASSWORD || randomSecret()
  };
  fs.writeFileSync(credentialsPath,JSON.stringify(fixture,null,2)+"\n",{flag:"wx",mode:0o600});
}
if (!fixture.inviteCode || Buffer.from(fixture.mfaKey,"base64").length!==32) throw new Error("Invalid preview credentials file.");
process.env.NODE_ENV="development";
process.env.TGL_MAIL_MODE="outbox";
process.env.TGL_INVITE_CODE=fixture.inviteCode;
process.env.TGL_MFA_ENCRYPTION_KEY=fixture.mfaKey;
process.env.TGL_DB_PATH=path.join(dir,"preview.sqlite");
process.env.TGL_OUTBOX_PATH=path.join(dir,"email-outbox.ndjson");
const origin=process.env.WORKSHOP_PREVIEW_ORIGIN || ("http://127.0.0.1:"+port);
const {server,db}=createApp({inviteCode:fixture.inviteCode,dbPath:process.env.TGL_DB_PATH,publicOrigin:origin});
if(host === "0.0.0.0")enforcePreviewGate(server);

function seedUser(email,password,role) {
 const existing=db.prepare("SELECT id FROM users WHERE email=?").get(email);
 if(existing)return Number(existing.id);
 const salt=randomBytes(16).toString("hex");
 const passwordHash=scryptSync(password,salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024}).toString("hex");
 return Number(db.prepare("INSERT INTO users(email,salt,password_hash,role,email_verified_at) VALUES(?,?,?,?,?)")
  .run(email,salt,passwordHash,role,Date.now()).lastInsertRowid);
}
db.exec("BEGIN IMMEDIATE");
try {
 seedUser(fixture.memberEmail,fixture.memberPassword,"member");
 const adminId=seedUser(fixture.adminEmail,fixture.adminPassword,"admin");
 const sampleSupplier=db.prepare("SELECT id FROM suppliers WHERE name=?").get("Workshop Demo Supplier");
 const supplierId=sampleSupplier ? Number(sampleSupplier.id) : Number(db.prepare("INSERT INTO suppliers(name,notes) VALUES(?,?)")
   .run("Workshop Demo Supplier","Illustrative sample only; not a real vendor.").lastInsertRowid);
 const samples=[
  {sku:"DEMO-ACCESSORY-01",name:"Concept Accessory",category:"Accessories",lot:"DEMO-A01",count:22},
  {sku:"DEMO-LIFESTYLE-01",name:"Signature Lifestyle Concept",category:"Lifestyle",lot:"DEMO-L01",count:14},
  {sku:"DEMO-BOTANICAL-01",name:"Botanical Collection Concept",category:"Botanicals",lot:"DEMO-B01",count:18}
 ];
 for(const sample of samples){
   const inserted=db.prepare("INSERT OR IGNORE INTO products(sku,name,category,supplier_id,created_by) VALUES(?,?,?,?,?)")
    .run(sample.sku,sample.name,sample.category,supplierId,adminId);
   if(inserted.changes){
     const productId=Number(db.prepare("SELECT id FROM products WHERE sku=?").get(sample.sku).id);
     const lotId=Number(db.prepare("INSERT INTO inventory_lots(product_id,lot_code,supplier_id) VALUES(?,?,?)")
      .run(productId,sample.lot,supplierId).lastInsertRowid);
     db.prepare("INSERT INTO movements(product_id,lot_id,delta,reason,actor_id) VALUES(?,?,?,?,?)")
      .run(productId,lotId,sample.count,"Workshop demo fixture",adminId);
   }
 }
 db.exec("COMMIT");
}catch(error){db.exec("ROLLBACK");throw error;}

server.listen(port,host,()=>{
 console.log("\nTHE GREEN LOCKER — PRIVATE WORKSHOP PREVIEW");
 console.log("App server: http://127.0.0.1:"+port);
 console.log("Open port "+port+" in the Workshop preview pane.");
 if(process.env.TGL_PREVIEW_SHOW_CREDENTIALS === "1" && host === "127.0.0.1") {
   console.log("Member: "+fixture.memberEmail+" / "+fixture.memberPassword);
   console.log("Admin: "+fixture.adminEmail+" / "+fixture.adminPassword);
   console.log("New-account invitation code: "+fixture.inviteCode);
 }else{
   console.log("Demo member email: "+fixture.memberEmail);
   console.log("Demo admin email: "+fixture.adminEmail);
   console.log("Credentials are not printed in cloud logs.");
 }
 console.log("Admin MFA enrollment is required.");
 console.log("Development email outbox: "+process.env.TGL_OUTBOX_PATH);
 console.log("DO NOT PUBLISH THIS DEV SERVER OR ENABLE SALES.");
 console.log("Credentials and sample data are stored in a gitignored local directory.\n");
});

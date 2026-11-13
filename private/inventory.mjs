import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

const initialCategories=["Botanicals","Formulations","Accessories","Lifestyle"];
const text=v=>String(v??"").trim();
const html=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const options=(rows,id,label,blank="")=>(blank?'<option value="">'+html(blank)+'</option>':"")+rows.map(row=>'<option value="'+html(row[id])+'">'+html(row[label])+'</option>').join("");
const field=(label,name,extra="",value="")=>'<label>'+html(label)+'<input name="'+name+'" value="'+html(value)+'" '+extra+' required></label>';
const box=(title,contents)=>'<article class="private-panel"><h2>'+html(title)+'</h2>'+contents+'</article>';
const csrfInput=v=>'<input type="hidden" name="csrf" value="'+html(v)+'">';
const asInt=v=>/^-?\d+$/.test(text(v))&&Number.isSafeInteger(Number(v))?Number(v):null;
const dateValid=v=>!v||/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+"T00:00:00Z"));
function validName(v,max=120){return v.length>=2&&v.length<=max&&!/[\u0000-\u001F\u007F]/.test(v);}
function csvEscape(v){
 let s=String(v??"");
 if(/^[=+@-]/.test(s))s="'"+s; // Prevent spreadsheet formula execution on export.
 return '"'+s.replaceAll('"','""')+'"';
}
function asCsv(headers,records){
 return "\uFEFF"+[headers,...records].map(row=>row.map(csvEscape).join(",")).join("\r\n")+"\r\n";
}
export function parseCsv(input) {
 if(typeof input!=="string"||input.length>100000||input.includes("\0"))throw new Error("CSV exceeds 100KB or contains invalid characters.");
 const rows=[],row=[];let cell="",quoted=false,closed=false;
 for(let i=0;i<input.length;i++){
  const c=input[i];
  if(quoted){
   if(c==='"'&&input[i+1]==='"'){cell+='"';i++;}
   else if(c==='"'){quoted=false;closed=true;}
   else cell+=c;
  }else if(c==='"' && !cell&&!closed){quoted=true;}
  else if(c===","){row.push(cell);cell="";closed=false;}
  else if(c==="\r"||c==="\n"){
   if(c==="\r"&&input[i+1]==="\n")i++;
   row.push(cell);cell="";closed=false;
   if(row.some(v=>v!==""))rows.push([...row]);
   row.length=0;
  }else if(!closed&&c!=='"'){cell+=c;}
  else throw new Error("Malformed CSV quoting.");
 }
 if(quoted)throw new Error("Unclosed CSV quote.");
 row.push(cell);if(row.some(v=>v!==""))rows.push([...row]);
 if(!rows.length)throw new Error("CSV is empty.");
 if(rows.length>501)throw new Error("CSV import limited to 500 data rows.");
 const [headers,...body]=rows;
 const lowered=headers.map(h=>h.trim().replace(/^\uFEFF/,"").toLowerCase());
 if(new Set(lowered).size!==lowered.length)throw new Error("Duplicate CSV columns.");
 for(const row of body)if(row.length!==lowered.length)throw new Error("CSV row does not match header width.");
 return body.map(row=>Object.fromEntries(lowered.map((h,i)=>[h,row[i].trim()])));
}
export function installInventory(db) {
 const cols=(table)=>db.prepare("PRAGMA table_info("+table+")").all().map(c=>c.name);
 db.exec("CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);");
 db.exec("CREATE TABLE IF NOT EXISTS suppliers (id INTEGER PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE, contact_email TEXT, contact_phone TEXT, notes TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);");
 db.exec("CREATE TABLE IF NOT EXISTS inventory_lots (id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id), lot_code TEXT NOT NULL, supplier_id INTEGER REFERENCES suppliers(id), received_on TEXT, expires_on TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(product_id,lot_code));");
 db.exec("CREATE TABLE IF NOT EXISTS product_images (id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id), file_key TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL, uploaded_by INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);");
 if(!cols("products").includes("supplier_id"))db.exec("ALTER TABLE products ADD COLUMN supplier_id INTEGER REFERENCES suppliers(id)");
 if(!cols("movements").includes("lot_id"))db.exec("ALTER TABLE movements ADD COLUMN lot_id INTEGER REFERENCES inventory_lots(id)");
 for(const name of initialCategories)db.prepare("INSERT OR IGNORE INTO categories(name) VALUES(?)").run(name);
 db.exec("CREATE INDEX IF NOT EXISTS idx_inventory_lots_product ON inventory_lots(product_id);");
 db.exec("CREATE INDEX IF NOT EXISTS idx_inventory_images_product ON product_images(product_id);");
}
const imageTypes={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"};
function magicMatches(buffer,mime) {
 if(mime==="image/png")return buffer.length>=24&&buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 if(mime==="image/jpeg")return buffer.length>=4&&buffer[0]===0xff&&buffer[1]===0xd8&&buffer[2]===0xff;
 if(mime==="image/webp")return buffer.length>=16&&buffer.toString("ascii",0,4)==="RIFF"&&buffer.toString("ascii",8,12)==="WEBP";
 return false;
}
async function imageBytes(req,max=2097152) {
 const chunks=[];let size=0;
 for await(const chunk of req){size+=chunk.length;if(size>max)throw new Error("Image must be 2MB or smaller");chunks.push(chunk);}
 return Buffer.concat(chunks);
}
export function createInventory({db,dbPath,respond,redirect,formBody,layout}) {
 installInventory(db);
 const imageDir=process.env.TGL_IMAGE_DIR || path.join(dbPath===":memory:"?process.cwd():path.dirname(dbPath),"private-images");
 const categories=()=>db.prepare("SELECT id,name FROM categories ORDER BY name").all();
 const suppliers=()=>db.prepare("SELECT id,name,contact_email,contact_phone,notes FROM suppliers ORDER BY name").all();
 const categoryExists=name=>Boolean(db.prepare("SELECT id FROM categories WHERE name=?").get(name));
 const categoryOptions=()=>categories().map(c=>'<option>'+html(c.name)+'</option>').join("");
 const products=()=>db.prepare("SELECT p.id,p.sku,p.name,p.category,p.supplier_id,s.name supplier_name,COALESCE((SELECT SUM(delta) FROM movements m WHERE m.product_id=p.id),0) stock FROM products p LEFT JOIN suppliers s ON s.id=p.supplier_id ORDER BY p.sku").all();
 const lots=()=>db.prepare("SELECT l.id,l.product_id,l.lot_code,l.supplier_id,l.received_on,l.expires_on,p.sku,s.name supplier_name,COALESCE((SELECT SUM(m.delta) FROM movements m WHERE m.lot_id=l.id),0) stock FROM inventory_lots l JOIN products p ON p.id=l.product_id LEFT JOIN suppliers s ON s.id=l.supplier_id ORDER BY l.id DESC").all();
 const images=()=>db.prepare("SELECT im.id,im.file_key,p.sku,p.name product_name FROM product_images im JOIN products p ON p.id=im.product_id ORDER BY im.id DESC LIMIT 100").all();
 function adminPanel(csrf){
  const ps=products(),ss=suppliers(),ls=lots(),cs=categories(),im=images();
  const productOpts=options(ps,"id","sku"),supOpts=options(ss,"id","name","No supplier");
  const supplierOptions=ss.map(s=>'<option value="'+s.id+'">'+html(s.name)+'</option>').join("");
  const lotOptions=ls.map(l=>'<option value="'+l.id+'">'+html(l.sku+" / "+l.lot_code)+'</option>').join("");
  const catRows=cs.map(c=>'<span class="category-chip">'+html(c.name)+'</span>').join(" ");
  const suppliersRows=ss.map(s=>'<tr><td>'+html(s.name)+'</td><td>'+html(s.contact_email||"")+'</td><td>'+html(s.contact_phone||"")+'</td></tr>').join("");
  const lotRows=ls.map(l=>'<tr><td>'+html(l.sku)+'</td><td>'+html(l.lot_code)+'</td><td>'+html(l.supplier_name||"—")+'</td><td>'+html(l.received_on||"")+'</td><td>'+html(l.expires_on||"")+'</td><td>'+l.stock+'</td></tr>').join("");
  const imageRows=im.map(i=>'<figure class="inventory-image"><img src="/media/'+encodeURIComponent(i.file_key)+'" alt="Internal product image for '+html(i.product_name)+'" loading="lazy"><figcaption>'+html(i.sku)+'</figcaption></figure>').join("");
  const postForm=(url,content,label)=>'<form method="post" action="'+url+'">'+csrfInput(csrf)+content+'<button class="private-button" type="submit">'+label+'</button></form>';
  const categoryForm=box("Product categories",'<div class="category-chips">'+(catRows||"No categories")+'</div>'+postForm("/admin/categories",field("New category","name",'maxlength="60"'),"Add category"));
  const supplierForm=box("Suppliers",postForm("/admin/suppliers",field("Supplier name","name",'maxlength="120"')+'<label>Contact email<input type="email" name="email" maxlength="254"></label><label>Phone<input name="phone" maxlength="40"></label><label>Notes<textarea name="notes" maxlength="500"></textarea></label>',"Add supplier")+'<div class="scroll-table"><table><thead><tr><th>Name</th><th>Email</th><th>Phone</th></tr></thead><tbody>'+suppliersRows+'</tbody></table></div>');
  const assignSupplier=box("Assign supplier to draft product",postForm("/admin/products/supplier",'<label>Draft product<select name="product_id" required>'+productOpts+'</select></label><label>Supplier<select name="supplier_id">'+supOpts+'</select></label>',"Update supplier"));
  const lotForm=box("Receive or register a product lot",postForm("/admin/lots",'<label>Product<select name="product_id" required>'+productOpts+'</select></label>'+field("Lot / batch code","lot_code",'maxlength="80" pattern="[A-Za-z0-9._-]{2,80}"')+'<label>Supplier<select name="supplier_id">'+supOpts+'</select></label><label>Received on<input type="date" name="received_on"></label><label>Expires on<input type="date" name="expires_on"></label>'+field("Initial units","quantity",'type="number" min="0" max="100000" value="0"'),"Create lot"));
  const lotAdjust=box("Adjust lot-level stock",postForm("/admin/lots/adjust",'<label>Tracked lot<select name="lot_id" required>'+lotOptions+'</select></label>'+field("Quantity change","delta",'type="number" min="-100000" max="100000"')+field("Reason","reason",'maxlength="200"'),"Record lot movement"));
  const lotTable=box("Lot traceability",'<div class="scroll-table"><table><thead><tr><th>SKU</th><th>Lot</th><th>Supplier</th><th>Received</th><th>Expires</th><th>Units</th></tr></thead><tbody>'+lotRows+'</tbody></table></div>');
  const upload=box("Product image library",'<form class="image-upload-form" data-upload-form><input type="hidden" name="csrf" value="'+html(csrf)+'"><label>Draft product<select name="product_id">'+productOpts+'</select></label><label>Upload PNG, JPEG or WebP (max 2MB)<input name="image" type="file" accept="image/png,image/jpeg,image/webp" required></label><button type="submit" class="private-button">Upload image</button><p class="upload-result" aria-live="polite"></p></form><div class="inventory-gallery">'+(imageRows||'<p>No images uploaded</p>')+'</div>');
  const csvForms=box("CSV import / export",'<p>Import only draft records. Up to 500 rows per file; all rows are validated before saving.</p><p><a href="/admin/export/products.csv">Export product catalog CSV</a> · <a href="/admin/export/lots.csv">Export lot and inventory CSV</a></p>'+postForm("/admin/import/products",'<label>Import product CSV (sku,name,category,supplier)<input type="file" accept=".csv,text/csv" data-csv-file="productCsv"></label><label>CSV contents<textarea id="productCsv" name="csv" maxlength="100000" rows="6" required></textarea></label>',"Import draft products")+postForm("/admin/import/lots",'<label>Import lots CSV (sku,lot_code,supplier,received_on,expires_on,quantity)<input type="file" accept=".csv,text/csv" data-csv-file="lotCsv"></label><label>CSV contents<textarea id="lotCsv" name="csv" maxlength="100000" rows="6" required></textarea></label>',"Import lots"));
  return '<section class="private-title"><span class="eyebrow">EXTENDED INVENTORY</span><h2>Catalog operations</h2><p>Development-only records; all stock values are administrative entries, not online availability.</p></section><section class="forms-grid">'+categoryForm+supplierForm+assignSupplier+lotForm+lotAdjust+upload+'</section>'+lotTable+csvForms+'<script src="/inventory-client.js" defer></script>';
 }
 function errorPage(res,user,error){return respond(res,400,layout("Entry rejected",'<section class="private-panel"><h1>Unable to save</h1><p>'+html(error)+'</p><a href="/admin">Return to the dashboard</a></section>',user,user.csrf));}
 const notice=(res,msg)=>redirect(res,"/admin?notice="+encodeURIComponent(msg));
 const csrfValid=(request,user,fields)=>fields.get("csrf")===user.csrf;
 function supplierId(name){
  if(!name)return null;
  const found=db.prepare("SELECT id FROM suppliers WHERE name=?").get(name);
  if(!found)throw new Error("Supplier is not registered: "+name);
  return found.id;
 }
 function inTx(fn){
  db.exec("BEGIN IMMEDIATE");
  try{const out=fn();db.exec("COMMIT");return out;}catch(e){db.exec("ROLLBACK");throw e;}
 }
 function importProducts(rows,user) {
  const required=["sku","name","category","supplier"];
  if(rows.some(r=>required.some(k=>!(k in r))))throw new Error("Expected CSV columns: "+required.join(", "));
  const seen=new Set(),prepared=rows.map(r=>{
    const sku=text(r.sku).toUpperCase(),name=text(r.name),category=text(r.category),supplier=text(r.supplier);
    if(!/^[A-Z0-9-]{3,32}$/.test(sku)||!validName(name)||!categoryExists(category)||supplier.length>120)throw new Error("Invalid product SKU, name, category, or supplier.");
    if(seen.has(sku))throw new Error("Duplicate SKU in CSV: "+sku);
    seen.add(sku);
    return {sku,name,category,supplier_id:supplierId(supplier)};
  });
  inTx(()=>{for(const r of prepared)db.prepare("INSERT INTO products(sku,name,category,supplier_id,created_by) VALUES(?,?,?,?,?) ON CONFLICT(sku) DO UPDATE SET name=excluded.name,category=excluded.category,supplier_id=excluded.supplier_id").run(r.sku,r.name,r.category,r.supplier_id,user.id);});
  return prepared.length;
 }
 function importLots(rows,user){
  const required=["sku","lot_code","supplier","received_on","expires_on","quantity"];
  if(rows.some(r=>required.some(k=>!(k in r))))throw new Error("Expected CSV columns: "+required.join(", "));
  const seen=new Set(),prepared=rows.map(r=>{
   const sku=text(r.sku).toUpperCase(),lot_code=text(r.lot_code),qty=asInt(r.quantity),supplier=text(r.supplier),received_on=text(r.received_on),expires_on=text(r.expires_on);
   const prod=db.prepare("SELECT id FROM products WHERE sku=?").get(sku);
   if(!prod||!/^[A-Za-z0-9._-]{2,80}$/.test(lot_code)||qty===null||qty<0||qty>100000||!dateValid(received_on)||!dateValid(expires_on)||(received_on&&expires_on&&received_on>expires_on))throw new Error("Invalid lot fields or unknown product.");
   const key=sku+":"+lot_code;
   if(seen.has(key)||db.prepare("SELECT id FROM inventory_lots WHERE product_id=? AND lot_code=?").get(prod.id,lot_code))throw new Error("Duplicate existing or incoming lot: "+key);
   seen.add(key);
   return {product_id:prod.id,lot_code,supplier_id:supplierId(supplier),received_on:received_on||null,expires_on:expires_on||null,qty};
  });
  inTx(()=>{
   for(const r of prepared){
     const created=db.prepare("INSERT INTO inventory_lots(product_id,lot_code,supplier_id,received_on,expires_on) VALUES(?,?,?,?,?)").run(r.product_id,r.lot_code,r.supplier_id,r.received_on,r.expires_on);
     if(r.qty>0)db.prepare("INSERT INTO movements(product_id,lot_id,delta,reason,actor_id) VALUES(?,?,?,?,?)").run(r.product_id,created.lastInsertRowid,r.qty,"CSV lot opening count",user.id);
   }
  });
  return prepared.length;
 }
 async function mediaRoute({req,res,pathname}){
  if(req.method!=="GET"||!pathname.startsWith("/media/"))return false;
  const key=decodeURIComponent(pathname.slice("/media/".length));
  if(!/^[a-f0-9]{32}\.(png|jpg|webp)$/.test(key))return respond(res,404,"Not found","text/plain; charset=utf-8"),true;
  const record=db.prepare("SELECT mime_type FROM product_images WHERE file_key=?").get(key);
  if(!record)return respond(res,404,"Not found","text/plain; charset=utf-8"),true;
  try{return respond(res,200,fs.readFileSync(path.join(imageDir,key)),record.mime_type),true;}
  catch{return respond(res,404,"Not found","text/plain; charset=utf-8"),true;}
 }
 async function adminRoutes({req,res,user,pathname,method,url}){
  if(user?.role!=="admin"||!pathname.startsWith("/admin/"))return false;
  if(method==="GET"&&pathname==="/admin/export/products.csv"){
   const rows=products().map(p=>[p.sku,p.name,p.category,p.supplier_name??"",p.stock]);
   return respond(res,200,asCsv(["sku","name","category","supplier","stock"],rows),"text/csv; charset=utf-8",{"Content-Disposition":'attachment; filename="greenlocker-draft-products.csv"'}),true;
  }
  if(method==="GET"&&pathname==="/admin/export/lots.csv"){
   const rows=lots().map(l=>[l.sku,l.lot_code,l.supplier_name??"",l.received_on??"",l.expires_on??"",l.stock]);
   return respond(res,200,asCsv(["sku","lot_code","supplier","received_on","expires_on","quantity"],rows),"text/csv; charset=utf-8",{"Content-Disposition":'attachment; filename="greenlocker-draft-lots.csv"'}),true;
  }
  if(method==="POST"&&pathname==="/admin/images"){
   if(req.headers["x-csrf-token"]!==user.csrf)return respond(res,403,"Invalid CSRF token","text/plain; charset=utf-8"),true;
   const mime=String(req.headers["content-type"]||"").split(";")[0];
   const product_id=asInt(url.searchParams.get("product_id"));
   if(!imageTypes[mime]||!product_id||!db.prepare("SELECT id FROM products WHERE id=?").get(product_id))return respond(res,400,"Invalid image or product","text/plain; charset=utf-8"),true;
   try{
    const buffer=await imageBytes(req);
    if(!magicMatches(buffer,mime))return respond(res,400,"Unsupported or invalid image format","text/plain; charset=utf-8"),true;
    if(mime==="image/png"){
      const w=buffer.readUInt32BE(16),h=buffer.readUInt32BE(20);
      if(!w||!h||w>8000||h>8000)return respond(res,400,"Image dimensions are not supported","text/plain; charset=utf-8"),true;
    }
    fs.mkdirSync(imageDir,{recursive:true,mode:0o700});
    const key=randomBytes(16).toString("hex")+"."+imageTypes[mime],filename=path.join(imageDir,key);
    fs.writeFileSync(filename,buffer,{mode:0o600,flag:"wx"});
    try{db.prepare("INSERT INTO product_images(product_id,file_key,mime_type,uploaded_by) VALUES(?,?,?,?)").run(product_id,key,mime,user.id);}
    catch(e){fs.rmSync(filename,{force:true});throw e;}
    return respond(res,201,JSON.stringify({ok:true}),"application/json"),true;
   }catch(e){return respond(res,400,html(e.message),"text/plain; charset=utf-8"),true;}
  }
  const actions=["/admin/categories","/admin/suppliers","/admin/products/supplier","/admin/lots","/admin/lots/adjust","/admin/import/products","/admin/import/lots"];
  if(method!=="POST"||!actions.includes(pathname))return false;
  const p=await formBody(req,350000);
  if(!csrfValid(req,user,p))return respond(res,403,"Invalid request token","text/plain; charset=utf-8"),true;
  try{
   if(pathname==="/admin/categories"){
    const name=text(p.get("name"));
    if(!validName(name,60))throw new Error("Category name must be 2–60 printable characters.");
    db.prepare("INSERT INTO categories(name) VALUES(?)").run(name);
    return notice(res,"Category added"),true;
   }
   if(pathname==="/admin/suppliers"){
    const name=text(p.get("name")),email=text(p.get("email")),phone=text(p.get("phone")),notes=text(p.get("notes"));
    if(!validName(name)||email.length>254||email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||phone.length>40||notes.length>500)throw new Error("Invalid supplier details.");
    db.prepare("INSERT INTO suppliers(name,contact_email,contact_phone,notes) VALUES(?,?,?,?)").run(name,email||null,phone||null,notes||null);
    return notice(res,"Supplier added"),true;
   }
   if(pathname==="/admin/products/supplier"){
    const product_id=asInt(p.get("product_id")),supplier_id=p.get("supplier_id")?asInt(p.get("supplier_id")):null;
    if(!product_id||!db.prepare("SELECT id FROM products WHERE id=?").get(product_id)||supplier_id&&!db.prepare("SELECT id FROM suppliers WHERE id=?").get(supplier_id))throw new Error("Unknown product or supplier.");
    db.prepare("UPDATE products SET supplier_id=? WHERE id=?").run(supplier_id,product_id);
    return notice(res,"Supplier assigned"),true;
   }
   if(pathname==="/admin/lots"){
    const product_id=asInt(p.get("product_id")),lot_code=text(p.get("lot_code")),supplier_id=p.get("supplier_id")?asInt(p.get("supplier_id")):null,received_on=text(p.get("received_on")),expires_on=text(p.get("expires_on")),qty=asInt(p.get("quantity"));
    if(!product_id||!db.prepare("SELECT id FROM products WHERE id=?").get(product_id)||!/^[A-Za-z0-9._-]{2,80}$/.test(lot_code)||qty===null||qty<0||qty>100000||!dateValid(received_on)||!dateValid(expires_on)||(received_on&&expires_on&&received_on>expires_on)||supplier_id&&!db.prepare("SELECT id FROM suppliers WHERE id=?").get(supplier_id))throw new Error("Invalid lot details.");
    inTx(()=>{const created=db.prepare("INSERT INTO inventory_lots(product_id,lot_code,supplier_id,received_on,expires_on) VALUES(?,?,?,?,?)").run(product_id,lot_code,supplier_id,received_on||null,expires_on||null);if(qty>0)db.prepare("INSERT INTO movements(product_id,lot_id,delta,reason,actor_id) VALUES(?,?,?,?,?)").run(product_id,created.lastInsertRowid,qty,"Opening lot count",user.id);});
    return notice(res,"Lot created"),true;
   }
   if(pathname==="/admin/lots/adjust"){
    const lot_id=asInt(p.get("lot_id")),delta=asInt(p.get("delta")),reason=text(p.get("reason"));
    if(!lot_id||delta===null||delta===0||Math.abs(delta)>100000||!validName(reason,200))throw new Error("Invalid lot stock adjustment.");
    inTx(()=>{
      const lot=db.prepare("SELECT product_id FROM inventory_lots WHERE id=?").get(lot_id);
      if(!lot)throw new Error("Lot does not exist.");
      const stock=db.prepare("SELECT COALESCE(SUM(delta),0) stock FROM movements WHERE lot_id=?").get(lot_id).stock;
      if(stock+delta<0)throw new Error("Stock cannot become negative.");
      db.prepare("INSERT INTO movements(product_id,lot_id,delta,reason,actor_id) VALUES(?,?,?,?,?)").run(lot.product_id,lot_id,delta,reason,user.id);
    });
    return notice(res,"Lot inventory updated"),true;
   }
   const csv=text(p.get("csv"));
   const rows=parseCsv(csv),count=pathname==="/admin/import/products"?importProducts(rows,user):importLots(rows,user);
   return notice(res,count+" CSV rows imported"),true;
  }catch(e){return errorPage(res,user,e.message||"Invalid inventory input"),true;}
 }
 return {categoryOptions,categoryExists,adminPanel,mediaRoute,adminRoutes};
}

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, createHash, timingSafeEqual, scryptSync } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { createSecurity } from "./security.mjs";
import { createInventory } from "./inventory.mjs";
import { installLockerFiles, renderLockerSizeChoices, validLockerCodename } from "./locker-files.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const MS8H = 8 * 60 * 60 * 1000;
const CATEGORIES = ["Botanicals", "Formulations", "Accessories", "Lifestyle"];
const LIMITS = new Map();
const now = () => Date.now();
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const hash = value => createHash("sha256").update(value).digest("hex");
const random = () => randomBytes(32).toString("base64url");
const passHash = (password, salt) => scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString("hex");
const validEmail = value => typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const safeCompare = (a, b) => timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
const csrfField = value => '<input type="hidden" name="csrf" value="' + esc(value) + '">';
const link = (href, title) => '<a href="' + href + '">' + esc(title) + '</a>';
const header = (title, user, csrf) => '<header class="private-header"><a class="private-logo" href="' + (user ? "/" : "/login") + '"><img src="/logo" alt="" width="52" height="52"><span>THE GREEN <b>LOCKER</b></span></a><nav aria-label="Private navigation">' + (user ? link("/", "Brand home") + link("/catalog", "Concept catalog") + (user.role === "admin" ? link("/admin", "Dashboard") : "") + '<form action="/logout" method="post">' + csrfField(csrf) + '<button type="submit">Log out</button></form>' : link("/login", "Log in") + link("/register", "Register")) + '</nav></header><div class="private-notice">PRIVATE DEVELOPMENT PREVIEW · NO SALES OR ORDERING</div>';
const layout = (title, contents, user = null, csrf = "") => '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>' + esc(title) + ' | The Green Locker</title><link rel="stylesheet" href="/private.css"></head><body>' + header(title,user,csrf) + '<main class="private-main">' + contents + '</main><footer class="private-footer">The Green Locker · Internal pre-launch software · No purchases, shipping, or fulfillment</footer></body></html>';
const statusCard = text => '<p role="alert" class="form-error">' + esc(text) + '</p>';
const authPage = (register, error = "", info = "") => layout(register ? "Register" : "Log in", '<section class="auth-panel"><span class="eyebrow">PRIVATE MEMBERS AREA</span><h1>' + (register ? "Register for access" : "Welcome back") + '</h1><p>' + (register ? "Registration requires a private invitation code. All accounts are internal previews." : "Log in to access the concept website. This is not an active retailer.") + '</p>' + (error ? statusCard(error) : "") + (info ? '<p class="form-ok">' + esc(info) + '</p>' : "") + '<form method="post" action="' + (register ? "/register" : "/login") + '"><label>Email address<input type="email" name="email" maxlength="254" autocomplete="email" required></label><label>Password<input type="password" name="password" minlength="12" maxlength="128" autocomplete="' + (register ? "new-password" : "current-password") + '" required></label>' + (register ? '<label>Invitation code<input type="password" name="invite" autocomplete="off" required></label>' : "") + '<button class="private-button" type="submit">' + (register ? "Create private account" : "Log in") + '</button></form><p class="auth-switch">' + (register ? link("/login", "Already registered? Log in") : link("/register", "Have an invitation? Register")) + '</p><p class="auth-switch"><a href="/forgot-password">Forgot your password?</a> · <a href="/resend-verification">Resend verification</a></p></section>');
const productRows = (products,db) => products.map(p => '<article class="catalog-card">' + (p.image_key ? '<img class="catalog-image" src="/media/' + encodeURIComponent(p.image_key) + '" alt="Draft product image for ' + esc(p.name) + '" loading="lazy">' : "") + '<div class="catalog-tag">FILE ' + esc(p.sku) + ' · ' + esc(p.category) + ' / CONCEPT</div><h2>' + esc(p.codename || p.name) + '</h2>' + (p.codename ? '<p class="locker-real-name">Internal identification: ' + esc(p.name) + '</p>' : "") + renderLockerSizeChoices(db,p) + '<small>Private draft archive · No prices, reservations or sales</small></article>').join("");
const catalogPage = (products, user, csrf,db) => layout("The Locker Files", '<section class="private-title"><span class="eyebrow">THE GREEN LOCKER / PRIVATE ARCHIVE</span><h1>THE LOCKER <em>FILES.</em></h1><p>Distinctive codenames. Concept formats. Members-only development preview. These are design records, not orderable products.</p></section><section class="catalog-grid">' + (products.length ? productRows(products,db) : '<p class="empty-state">The catalog is empty. An administrator can create the first draft item.</p>') + '</section>',user,csrf);
const adminPage = (products, movements, usersCount, user, csrf, notice = "", extras = "", categoryOptions = "") => {
 const total = products.reduce((sum,p)=>sum+p.stock,0);
 const rows = products.map(p=>'<tr><td>' + esc(p.sku) + '</td><td>' + esc(p.name) + '</td><td>' + esc(p.codename || '—') + '</td><td>' + esc(p.category) + '</td><td>' + p.stock + '</td><td>Draft only</td></tr>').join("");
 const history = movements.map(m=>'<tr><td>' + esc(m.created_at) + '</td><td>' + esc(m.sku) + '</td><td>' + (m.delta > 0 ? "+" : "") + m.delta + '</td><td>' + esc(m.reason) + '</td><td>' + esc(m.actor_email) + '</td></tr>').join("");
 const options = products.map(p=>'<option value="' + p.id + '">' + esc(p.sku) + ' — ' + esc(p.name) + '</option>').join("");
 const codenameForm = '<section class="private-panel"><h2>Locker Files · Codename assignment</h2><p>Assign or revise a private codename without changing the underlying product identity. Codenames are unique across draft products.</p><form action="/admin/products/codename" method="post">' + csrfField(csrf) + '<label>Draft product<select name="product_id" required>' + options + '</select></label><label>Codename<input name="codename" minlength="3" maxlength="56" placeholder="Ghost Key · leave blank to clear"></label><button type="submit" class="private-button">Update codename</button></form></section>';
 return layout("Administration", '<section class="private-title"><span class="eyebrow">ADMINISTRATION · DEVELOPMENT ONLY</span><h1>Operations dashboard</h1><p>Draft catalog and internal stock ledger. Sales are disabled by design.</p>' + (notice ? '<p class="form-ok">' + esc(notice) + '</p>' : "") + '</section><section class="stats"><article><strong>' + products.length + '</strong><span>Draft items</span></article><article><strong>' + total + '</strong><span>Recorded units</span></article><article><strong>' + usersCount + '</strong><span>Registered accounts</span></article></section><section class="forms-grid"><article class="private-panel"><h2>Create draft product</h2><form action="/admin/products" method="post">' + csrfField(csrf) + '<label>SKU<input name="sku" pattern="[A-Za-z0-9-]{3,32}" maxlength="32" required></label><label>Name<input name="name" maxlength="120" required></label><label>Locker Files codename (optional)<input name="codename" maxlength="56" placeholder="Ghost Key"></label><label>Category<select name="category">' + categoryOptions + '</select></label><button class="private-button" type="submit">Save draft</button></form></article><article class="private-panel"><h2>Record inventory movement</h2><form action="/admin/stock" method="post">' + csrfField(csrf) + '<label>Draft item<select name="product_id" required>' + options + '</select></label><label>Quantity change<input type="number" name="delta" min="-100000" max="100000" step="1" required></label><label>Reason<input name="reason" maxlength="200" required></label><button class="private-button" type="submit">Record adjustment</button></form></article></section>' + codenameForm + '<section class="private-panel"><h2>Draft catalog ledger</h2><div class="scroll-table"><table><thead><tr><th>SKU</th><th>Product identity</th><th>Codename</th><th>Category</th><th>Units</th><th>Status</th></tr></thead><tbody>' + (rows || '<tr><td colspan="6">No products yet</td></tr>') + '</tbody></table></div></section><section class="private-panel"><h2>Latest stock movements</h2><div class="scroll-table"><table><thead><tr><th>UTC time</th><th>SKU</th><th>Delta</th><th>Reason</th><th>Recorded by</th></tr></thead><tbody>' + (history || '<tr><td colspan="5">No movements yet</td></tr>') + '</tbody></table></div></section>' + extras, user, csrf);
};

export function openDb(dbPath) {
 if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(dbPath), { recursive: true, mode: 0o700 });
 const db = new DatabaseSync(dbPath);
 db.exec("PRAGMA foreign_keys=ON;");
 db.exec("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member','admin')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);");
 db.exec("CREATE TABLE IF NOT EXISTS sessions (id_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, csrf TEXT NOT NULL, expires_at INTEGER NOT NULL);");
 db.exec("CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY, sku TEXT NOT NULL UNIQUE, name TEXT NOT NULL, category TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft' CHECK(status='draft'), created_by INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);");
 db.exec("CREATE TABLE IF NOT EXISTS movements (id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id), delta INTEGER NOT NULL CHECK(delta<>0), reason TEXT NOT NULL, actor_id INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);");
 return db;
}
function listProducts(db) {
 return db.prepare("SELECT p.*, COALESCE(SUM(m.delta),0) AS stock,(SELECT file_key FROM product_images im WHERE im.product_id=p.id ORDER BY im.id DESC LIMIT 1) image_key FROM products p LEFT JOIN movements m ON m.product_id=p.id GROUP BY p.id ORDER BY p.id DESC").all();
}
function respond(res, code, body, type = "text/html; charset=utf-8", additional = {}) {
 res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "same-origin", "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'", ...additional });
 res.end(body);
}
const redirect = (res, to, extra = {}) => respond(res, 303, "", "text/plain; charset=utf-8", {Location:to,...extra});
const cookies = request => Object.fromEntries((request.headers.cookie || "").split(";").map(pair => pair.trim().split("=").map(decodeURIComponent)).filter(pair=>pair.length===2));
const sessionCookie = token => "tgl_session=" + encodeURIComponent(token) + "; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800" + (process.env.NODE_ENV === "production" ? "; Secure" : "");
const clearCookie = () => "tgl_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0" + (process.env.NODE_ENV === "production" ? "; Secure" : "");
const blocked = (ip, route, max = 10) => {
 const key = ip + ":" + route;
 const entry = LIMITS.get(key);
 const current = entry && entry.until > now() ? entry : { count: 0, until: now() + 900000 };
 entry && entry.until <= now() && LIMITS.delete(key);
 current.count++;
 if (LIMITS.size > 5000) LIMITS.clear();
 LIMITS.set(key,current);
 return current.count > max;
};
async function formBody(request,maxLength=16384) {
 let body = "";
 for await (const chunk of request) {
   body += chunk.toString("utf8");
   if (body.length > maxLength) throw new Error("Request exceeds allowed size");
 }
 return new URLSearchParams(body);
}
const bodyValue = (params, name) => String(params.get(name) ?? "").trim();
const queryString = url => new URL(url, "http://localhost");
export function createApp({ inviteCode = process.env.TGL_INVITE_CODE, dbPath = process.env.TGL_DB_PATH || path.join(root,"data","private.sqlite"), mailSender, publicOrigin = process.env.TGL_PUBLIC_ORIGIN || "http://127.0.0.1:4174" } = {}) {
 if (!inviteCode || inviteCode.length < 16) throw new Error("Set a unique TGL_INVITE_CODE with at least 16 characters.");
 if (process.env.NODE_ENV === "production" && process.env.TGL_ENV !== "staging") throw new Error("Public production runtime is disabled; only explicitly isolated staging is permitted.");
 const db = openDb(dbPath);
 const security = createSecurity({db,dbPath,origin:publicOrigin,mailSender,respond,redirect,formBody,layout,csrfField});
 const inventory = createInventory({db,dbPath,respond,redirect,formBody,layout});
 installLockerFiles(db);
 const server = http.createServer(async (req,res) => {
  try {
   const url = queryString(req.url);
   const pathname = url.pathname;
   const method = req.method;
   if (method === "GET" && (pathname === "/logo" || pathname === "/favicon.ico")) return respond(res,200,fs.readFileSync(path.join(root,"assets/approved-logo.png")),"image/png");
   if (method === "GET" && pathname === "/private.css") return respond(res,200,fs.readFileSync(path.join(root,"private/private.css"),"utf8"),"text/css; charset=utf-8");
   if (method === "GET" && pathname === "/healthz") return respond(res,200,"ok","text/plain; charset=utf-8");
   const token = cookies(req).tgl_session;
   const session = token ? db.prepare("SELECT s.id_hash,s.csrf,s.expires_at,s.mfa_verified_at,u.id,u.email,u.role,u.email_verified_at FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.id_hash=?").get(hash(token)) : null;
   const user = session && session.expires_at > now() ? session : null;
   if (method === "GET" && pathname === "/login") return user ? redirect(res,"/") : respond(res,200,authPage(false));
   if (method === "GET" && pathname === "/register") return user ? redirect(res,"/") : respond(res,200,authPage(true));
   if (["POST","PUT","PATCH","DELETE"].includes(method) && req.headers.origin) {
     // Token confirmation forms intentionally use no-referrer, which can produce Origin: null.
     // Restrict this exception to one-use, high-entropy token-consuming endpoints only.
     const tokenConfirmation = method === "POST" && (pathname === "/verify-email" || pathname === "/reset-password");
     if (!(req.headers.origin === "null" && tokenConfirmation)) {
       let originHost;
       try { originHost = new URL(req.headers.origin).host; } catch { return respond(res,403,"Invalid request origin","text/plain; charset=utf-8"); }
       if (originHost !== req.headers.host) return respond(res,403,"Origin mismatch","text/plain; charset=utf-8");
     }
   }
   if (await security.publicRoutes({req,res,url,pathname,method})) return;
   if (method === "POST" && (pathname === "/login" || pathname === "/register")) {
     if (blocked(req.socket.remoteAddress || "unknown",pathname,pathname === "/register" ? 5 : 10)) return respond(res,429,authPage(pathname==="/register","Too many attempts; retry later."));
     const p = await formBody(req);
     const email = bodyValue(p,"email").toLowerCase();
     const password = String(p.get("password") || "");
     if (pathname === "/register") {
       if (!validEmail(email) || password.length < 12 || password.length > 128 || !safeCompare(String(p.get("invite") || ""),inviteCode)) return respond(res,400,authPage(true,"Invalid registration details or invitation code."));
       if (db.prepare("SELECT id FROM users WHERE email=?").get(email)) return respond(res,400,authPage(true,"Registration could not be completed."));
       const salt = randomBytes(16).toString("hex");
       db.prepare("INSERT INTO users(email,salt,password_hash) VALUES(?,?,?)").run(email,salt,passHash(password,salt));
       await security.issue(email,"verify");
       return redirect(res,"/check-email");
     }
     const userRow = validEmail(email) && db.prepare("SELECT * FROM users WHERE email=?").get(email);
     const actualHash = userRow ? passHash(password,userRow.salt) : passHash(password,"00000000000000000000000000000000");
     const expected = userRow ? userRow.password_hash : "0".repeat(128);
     if (!userRow || !safeCompare(actualHash,expected)) return respond(res,401,authPage(false,"Incorrect email or password."));
     if (userRow.email_verified_at === null) return respond(res,403,authPage(false,"Confirm your email address before signing in."));
     const newToken = random();
     db.prepare("INSERT INTO sessions(id_hash,user_id,csrf,expires_at) VALUES(?,?,?,?)").run(hash(newToken),userRow.id,random(),now()+MS8H);
     return redirect(res,userRow.role === "admin" ? "/admin/mfa" : "/",{"Set-Cookie":sessionCookie(newToken)});
   }
   if (!user) return method==="GET" ? redirect(res,"/login") : respond(res,401,"Authentication required","text/plain; charset=utf-8");
   if (await security.mfaRoutes({req,res,user,pathname,method})) return;
   if (user.role === "admin" && !user.mfa_verified_at && pathname !== "/logout") return method==="GET" ? redirect(res,"/admin/mfa") : respond(res,403,"Administrator two-factor authentication required","text/plain; charset=utf-8");
   if (method === "GET" && pathname === "/") {
     let html = fs.readFileSync(path.join(root,"index.html"),"utf8");
     html = html.replace("</head>",'<link rel="stylesheet" href="/private.css"></head>');
     html = html.replace("<body>","<body>" + '<div class="site-private-bar"><span>PRIVATE PREVIEW · NO SALES</span>' + link("/catalog","Internal catalog") + (user.role==="admin" ? link("/admin","Admin dashboard") : "") + '<form method="post" action="/logout">' + csrfField(user.csrf) + '<button>Log out</button></form></div>');
     return respond(res,200,html);
   }
   if (method === "GET" && ["/styles.css","/app.js","/assets/logo.svg"].includes(pathname)) return respond(res,200,fs.readFileSync(path.join(root,pathname.slice(1))),pathname.endsWith(".css") ? "text/css; charset=utf-8" : pathname.endsWith(".js") ? "text/javascript; charset=utf-8" : "image/svg+xml");
   if (method === "GET" && pathname === "/assets/approved-logo.png") return respond(res,200,fs.readFileSync(path.join(root,"assets/approved-logo.png")),"image/png");
   if (method === "GET" && pathname === "/catalog") return respond(res,200,catalogPage(listProducts(db),user,user.csrf,db));
   if (await inventory.mediaRoute({req,res,pathname})) return;
   if (method === "GET" && pathname === "/inventory-client.js" && user.role === "admin") return respond(res,200,fs.readFileSync(path.join(root,"private/inventory-client.js")),"text/javascript; charset=utf-8");
   if (await inventory.adminRoutes({req,res,url,pathname,method,user})) return;
   if (method === "POST" && pathname === "/logout") {
     const p = await formBody(req);
     if (!safeCompare(bodyValue(p,"csrf"),user.csrf)) return respond(res,403,"Invalid request token","text/plain; charset=utf-8");
     db.prepare("DELETE FROM sessions WHERE id_hash=?").run(user.id_hash);
     return redirect(res,"/login",{"Set-Cookie":clearCookie()});
   }
   if (pathname.startsWith("/admin")) {
     if (user.role !== "admin") return respond(res,403,layout("Access denied",'<h1>Administrator access required</h1>',user,user.csrf));
     if (method === "GET" && pathname === "/admin") {
       const products = listProducts(db);
       const movements = db.prepare("SELECT m.*,p.sku,u.email actor_email FROM movements m JOIN products p ON p.id=m.product_id JOIN users u ON u.id=m.actor_id ORDER BY m.id DESC LIMIT 30").all();
       const usersCount = db.prepare("SELECT COUNT(*) count FROM users").get().count;
       return respond(res,200,adminPage(products,movements,usersCount,user,user.csrf,url.searchParams.get("notice") || "",inventory.adminPanel(user.csrf),inventory.categoryOptions()));
     }
     if (method === "POST" && ["/admin/products","/admin/products/codename","/admin/stock"].includes(pathname)) {
       const p = await formBody(req);
       if (!safeCompare(bodyValue(p,"csrf"),user.csrf)) return respond(res,403,"Invalid request token","text/plain; charset=utf-8");
       try {
         if (pathname === "/admin/products/codename") {
           const productId=Number(bodyValue(p,"product_id")), codename=bodyValue(p,"codename");
           if(!Number.isSafeInteger(productId) || productId<1 || !db.prepare("SELECT id FROM products WHERE id=?").get(productId) || (codename && !validLockerCodename(codename))) throw new Error("Invalid product or Locker Files codename");
           db.prepare("UPDATE products SET codename=? WHERE id=?").run(codename||null,productId);
           return redirect(res,"/admin?notice=Codename%20updated");
         }
         if (pathname === "/admin/products") {
           const sku = bodyValue(p,"sku").toUpperCase(), name = bodyValue(p,"name"), category = bodyValue(p,"category"), codename=bodyValue(p,"codename");
           if (!/^[A-Z0-9-]{3,32}$/.test(sku) || name.length < 2 || name.length > 120 || !inventory.categoryExists(category) || (codename && !validLockerCodename(codename))) throw new Error("Invalid product fields");
           db.prepare("INSERT INTO products(sku,name,category,codename,created_by) VALUES(?,?,?,?,?)").run(sku,name,category,codename||null,user.id);
           return redirect(res,"/admin?notice=Draft%20saved");
         }
         const productId = Number(bodyValue(p,"product_id")), delta = Number(bodyValue(p,"delta")), reason = bodyValue(p,"reason");
         if (!Number.isSafeInteger(productId) || !Number.isSafeInteger(delta) || delta===0 || Math.abs(delta)>100000 || reason.length<3 || reason.length>200) throw new Error("Invalid adjustment");
         db.exec("BEGIN IMMEDIATE");
         try {
           const prod = db.prepare("SELECT id FROM products WHERE id=?").get(productId);
           if (!prod) throw new Error("Product not found");
           const old = db.prepare("SELECT COALESCE(SUM(delta),0) stock FROM movements WHERE product_id=?").get(productId).stock;
           if (old + delta < 0) throw new Error("Stock cannot become negative");
           db.prepare("INSERT INTO movements(product_id,delta,reason,actor_id) VALUES(?,?,?,?)").run(productId,delta,reason,user.id);
           db.exec("COMMIT");
         } catch (e) { db.exec("ROLLBACK"); throw e; }
         return redirect(res,"/admin?notice=Inventory%20movement%20recorded");
       } catch (e) { return respond(res,400,layout("Invalid entry",'<h1>Unable to save</h1><p>' + esc(e.message==="Stock cannot become negative" ? e.message : "Please check the fields or duplicate SKU.") + '</p>' + link("/admin","Return to dashboard"),user,user.csrf)); }
     }
   }
   return respond(res,404,layout("Not found","<h1>Page not found</h1>",user,user.csrf));
  } catch (error) {
   console.error("Private preview request error:", error instanceof Error ? error.message : "Unknown error");
   return !res.headersSent && respond(res,500,"An internal error occurred","text/plain; charset=utf-8");
  }
 });
 return { server, db };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
 const { server } = createApp();
 const port = Number(process.env.PORT || 4174);
 const host = process.env.TGL_HOST || "127.0.0.1";
 server.listen(port,host,()=>console.log("The Green Locker private preview listening on http://" + host + ":" + port));
}

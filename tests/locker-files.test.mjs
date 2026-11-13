import test from "node:test";
import assert from "node:assert/strict";
import {openDb} from "../private/server.mjs";
import {LOCKER_FILE_NAMES,LOCKER_TIERS,installLockerFiles,renderLockerSizeChoices,renderInternalLockerPackage,validLockerCodename} from "../private/locker-files.mjs";

const expected=[["xs",1],["s",2],["m",4],["l",8],["xl",32]];
const record=(db,productId)=>db.prepare("SELECT tier,weight_eighth_oz,status FROM product_size_variants WHERE product_id=?").all(productId)
  .map(row=>[row.tier,row.weight_eighth_oz,row.status])
  .sort((a,b)=>a[1]-b[1]);

test("twelve distinct codenames and five exact XS–XL draft-only formats",()=>{
 assert.equal(LOCKER_FILE_NAMES.length,12);
 assert.equal(new Set(LOCKER_FILE_NAMES.map(v=>v.toLowerCase())).size,12);
 assert.deepEqual(LOCKER_TIERS.map(v=>[v.tier,v.eighthOunces]),expected);
 assert.deepEqual(LOCKER_TIERS.map(v=>v.display),["1/8 oz","1/4 oz","1/2 oz","1 oz","1/4 lb · 4 oz"]);
 assert.deepEqual(LOCKER_TIERS.map(v=>v.label),["THE KEY","THE SIGNAL","THE CIPHER","THE VAULT","THE ARCHIVE"]);
 assert.deepEqual(LOCKER_TIERS.map(v=>v.internalOnly),[false,false,false,false,true]);
 for(const codename of LOCKER_FILE_NAMES)assert.equal(validLockerCodename(codename),true,codename);
 for(const invalid of ["","AB","<script>alert(1)</script>","Bad\nCode","X".repeat(57)])assert.equal(validLockerCodename(invalid),false);
});

test("fresh install backfills, creates five fixed draft formats, and handles category changes",()=>{
 const db=openDb(":memory:");
 try{
  const user=Number(db.prepare("INSERT INTO users(email,salt,password_hash) VALUES(?,?,?)")
    .run("test@example.test","salt","hash").lastInsertRowid);
  const old=Number(db.prepare("INSERT INTO products(sku,name,category,created_by) VALUES(?,?,?,?)")
    .run("OLD-001","Original identification","Botanicals",user).lastInsertRowid);
  installLockerFiles(db);
  installLockerFiles(db);
  assert.deepEqual(record(db,old),expected.map(([tier,n])=>[tier,n,"draft"]));
  assert.throws(()=>db.prepare("UPDATE product_size_variants SET weight_eighth_oz=3 WHERE product_id=? AND tier='m'").run(old),/CHECK constraint/);
  assert.throws(()=>db.prepare("UPDATE product_size_variants SET status='available' WHERE product_id=?").run(old),/CHECK constraint/);
  assert.throws(()=>db.prepare("UPDATE product_size_variants SET tier='large' WHERE product_id=?").run(old),/CHECK constraint/);
  const nonbot=Number(db.prepare("INSERT INTO products(sku,name,category,created_by) VALUES(?,?,?,?)")
    .run("NON-001","Lifestyle concept","Lifestyle",user).lastInsertRowid);
  assert.equal(record(db,nonbot).length,0);
  const fresh=Number(db.prepare("INSERT INTO products(sku,name,category,codename,created_by) VALUES(?,?,?,?,?)")
    .run("GL-001","Neutral botanical concept","Botanicals","Ghost Key",user).lastInsertRowid);
  assert.deepEqual(record(db,fresh),expected.map(([tier,n])=>[tier,n,"draft"]));
  assert.throws(()=>db.prepare("INSERT INTO products(sku,name,category,codename,created_by) VALUES(?,?,?,?,?)")
    .run("GL-002","Another concept","Botanicals","ghost key",user),/UNIQUE constraint/);
  let html=renderLockerSizeChoices(db,{id:fresh,category:"Botanicals"});
  assert.equal((html.match(/class="locker-tier-face"/g)||[]).length,4);
  assert.match(html,/1\/8 oz/);
  assert.match(html,/1\/4 oz/);
  assert.match(html,/1\/2 oz/);
  assert.match(html,/1 oz/);
  assert.match(html,/THE KEY/);
  assert.match(html,/THE SIGNAL/);
  assert.match(html,/THE CIPHER/);
  assert.match(html,/THE VAULT/);
  assert.doesNotMatch(html,/THE ARCHIVE|1\/4 lb|>4 oz</);
  const internal=renderInternalLockerPackage();
  assert.match(internal,/THE ARCHIVE/);
  assert.match(internal,/1\/4 lb/);
  assert.match(internal,/4 oz/);
  assert.match(internal,/Not visible as a member package choice/);
  assert.doesNotMatch(html,/16 oz|add to cart|buy now|checkout|purchase now|order now/i);
  assert.equal(renderLockerSizeChoices(db,{id:nonbot,category:"Lifestyle"}),"");
  db.prepare("UPDATE products SET category='Botanicals' WHERE id=?").run(nonbot);
  assert.equal(record(db,nonbot).length,5);
  db.prepare("UPDATE products SET category='Lifestyle' WHERE id=?").run(nonbot);
  assert.equal(record(db,nonbot).length,0);
 }finally{db.close();}
});

test("legacy 1/4/16-ounce schema migrates transactionally to 1/8,1/4,1/2,1,4 ounces",()=>{
 const db=openDb(":memory:");
 try{
  const user=Number(db.prepare("INSERT INTO users(email,salt,password_hash) VALUES(?,?,?)")
    .run("legacy@example.test","salt","hash").lastInsertRowid);
  const product=Number(db.prepare("INSERT INTO products(sku,name,category,created_by) VALUES(?,?,?,?)")
    .run("LEG-001","Real identity retained","Botanicals",user).lastInsertRowid);
  db.prepare("INSERT INTO movements(product_id,delta,reason,actor_id) VALUES(?,?,?,?)")
    .run(product,9,"Existing ledger item",user);
  db.exec("CREATE TABLE product_size_variants(product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,tier TEXT NOT NULL CHECK(tier IN ('small','medium','large')),weight_oz INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'draft',PRIMARY KEY(product_id,tier));");
  const old=db.prepare("INSERT INTO product_size_variants(product_id,tier,weight_oz) VALUES(?,?,?)");
  for(const [tier,n] of [["small",1],["medium",4],["large",16]])old.run(product,tier,n);
  db.exec("CREATE TRIGGER trg_locker_size_on_create AFTER INSERT ON products WHEN NEW.category='Botanicals' BEGIN INSERT OR IGNORE INTO product_size_variants(product_id,tier,weight_oz) VALUES(NEW.id,'small',1); END;");
  installLockerFiles(db);
  installLockerFiles(db);
  assert.deepEqual(record(db,product),expected.map(([tier,n])=>[tier,n,"draft"]));
  assert.equal(db.prepare("SELECT COUNT(*) count FROM movements WHERE product_id=?").get(product).count,1);
  assert.equal(db.prepare("SELECT SUM(delta) balance FROM movements WHERE product_id=?").get(product).balance,9);
  assert.equal(db.prepare("SELECT name FROM products WHERE id=?").get(product).name,"Real identity retained");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM product_size_variants").get().n,5);
  assert.throws(()=>db.prepare("INSERT INTO product_size_variants(product_id,tier,weight_eighth_oz) VALUES(?,?,?)").run(product,"large",128),/CHECK constraint/);
 }finally{db.close();}
});

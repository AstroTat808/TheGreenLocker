import test from "node:test";
import assert from "node:assert/strict";
import {openDb} from "../private/server.mjs";
import {
  LOCKER_FILE_NAMES,
  LOCKER_TIERS,
  installLockerFiles,
  renderLockerSizeChoices,
  validLockerCodename
} from "../private/locker-files.mjs";

test("twelve distinct brand codenames and immutable draft-only 1/4/16oz reference formats",()=>{
 assert.equal(LOCKER_FILE_NAMES.length,12);
 assert.equal(new Set(LOCKER_FILE_NAMES.map(v=>v.toLowerCase())).size,12);
 assert.deepEqual(LOCKER_TIERS.map(v=>[v.tier,v.ounces]),[["small",1],["medium",4],["large",16]]);
 assert.equal(LOCKER_TIERS[2].notes.includes("Not for retail"),true);
 for(const codename of LOCKER_FILE_NAMES)assert.equal(validLockerCodename(codename),true,codename);
 for(const invalid of ["","AB","<script>alert(1)</script>","Bad\nCode","X".repeat(57)])assert.equal(validLockerCodename(invalid),false);
});

test("Locker Files migration backfills existing botanical drafts; rejects incorrect size or availability state",()=>{
 const db=openDb(":memory:");
 try{
  const user=Number(db.prepare("INSERT INTO users(email,salt,password_hash) VALUES(?,?,?)").run("test@example.test","salt","hash").lastInsertRowid);
  const old=Number(db.prepare("INSERT INTO products(sku,name,category,created_by) VALUES(?,?,?,?)").run("OLD-001","Original identification","Botanicals",user).lastInsertRowid);
  installLockerFiles(db);
  installLockerFiles(db); // Idempotent migration
  assert.deepEqual(db.prepare("SELECT tier,weight_oz,status FROM product_size_variants WHERE product_id=? ORDER BY weight_oz").all(old).map(x=>[x.tier,x.weight_oz,x.status]),
    [["small",1,"draft"],["medium",4,"draft"],["large",16,"draft"]]);
  assert.throws(()=>db.prepare("UPDATE product_size_variants SET weight_oz=3 WHERE product_id=? AND tier='medium'").run(old),/CHECK constraint/);
  assert.throws(()=>db.prepare("UPDATE product_size_variants SET status='available' WHERE product_id=?").run(old),/CHECK constraint/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM product_size_variants WHERE product_id=?").get(old).n,3);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM product_size_variants").get().n,3);
  const nonbot=Number(db.prepare("INSERT INTO products(sku,name,category,created_by) VALUES(?,?,?,?)").run("NON-001","Lifestyle concept","Lifestyle",user).lastInsertRowid);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM product_size_variants WHERE product_id=?").get(nonbot).n,0);
  const fresh=Number(db.prepare("INSERT INTO products(sku,name,category,codename,created_by) VALUES(?,?,?,?,?)").run("GL-001","Neutral botanical concept","Botanicals","Ghost Key",user).lastInsertRowid);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM product_size_variants WHERE product_id=?").get(fresh).n,3);
  assert.throws(()=>db.prepare("INSERT INTO products(sku,name,category,codename,created_by) VALUES(?,?,?,?,?)").run("GL-002","Another neutral concept","Botanicals","ghost key",user),/UNIQUE constraint/);
  const html=renderLockerSizeChoices(db,{id:fresh,category:"Botanicals"});
  assert.match(html,/SMALL/);assert.match(html,/MEDIUM/);assert.match(html,/LARGE/);
  assert.match(html,/1 oz/);assert.match(html,/4 oz/);assert.match(html,/16 oz/);
  assert.match(html,/Internal planning only/);
  assert.doesNotMatch(html,/add to cart|buy now|purchase now|checkout|order now/i);
  assert.equal(renderLockerSizeChoices(db,{id:nonbot,category:"Lifestyle"}),"");
 }finally{db.close();}
});

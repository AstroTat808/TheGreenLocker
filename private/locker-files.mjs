/**
 * The Green Locker — internal-only codename and draft format model.
 * A codename does not replace actual product identification or mandated disclosures.
 * No availability, sale, inventory allocations, prices or order endpoints.
 */
export const LOCKER_TIERS = Object.freeze([
  Object.freeze({tier:"small", ounces:1, label:"SMALL", display:"1 oz", notes:"Draft concept"}),
  Object.freeze({tier:"medium", ounces:4, label:"MEDIUM", display:"¼ lb · 4 oz", notes:"Subject to applicable patient limits"}),
  Object.freeze({tier:"large", ounces:16, label:"LARGE", display:"1 lb · 16 oz", notes:"Internal planning only · Not for retail"})
]);

export const LOCKER_FILE_NAMES = Object.freeze([
  "Ghost Key",
  "Midnight Protocol",
  "Blackout",
  "Phantom Reserve",
  "Gold Cipher",
  "Nightshift",
  "Shadow Signal",
  "Velvet Static",
  "Dead Frequency",
  "Secret Society",
  "Eclipse",
  "Vault Zero"
]);

export function validLockerCodename(value) {
  return typeof value==="string" && value.length>=3 && value.length<=56
    && /^[\p{L}\p{N}][\p{L}\p{N} ._'-]{2,55}$/u.test(value)
    && !/[\u0000-\u001f\u007f]/.test(value);
}

export function installLockerFiles(db) {
  const cols=db.prepare("PRAGMA table_info(products)").all().map(row=>row.name);
  if(!cols.includes("codename"))
    db.exec("ALTER TABLE products ADD COLUMN codename TEXT");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_locker_codename ON products(codename COLLATE NOCASE) WHERE codename IS NOT NULL;");
  db.exec(`CREATE TABLE IF NOT EXISTS product_size_variants(
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    tier TEXT NOT NULL CHECK(tier IN ('small','medium','large')),
    weight_oz INTEGER NOT NULL CHECK(
      (tier='small' AND weight_oz=1) OR
      (tier='medium' AND weight_oz=4) OR
      (tier='large' AND weight_oz=16)
    ),
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status='draft'),
    PRIMARY KEY(product_id,tier)
  );`);
  db.exec(`CREATE TRIGGER IF NOT EXISTS trg_locker_size_on_create
    AFTER INSERT ON products WHEN NEW.category='Botanicals'
    BEGIN
      INSERT OR IGNORE INTO product_size_variants(product_id,tier,weight_oz) VALUES(NEW.id,'small',1);
      INSERT OR IGNORE INTO product_size_variants(product_id,tier,weight_oz) VALUES(NEW.id,'medium',4);
      INSERT OR IGNORE INTO product_size_variants(product_id,tier,weight_oz) VALUES(NEW.id,'large',16);
    END;`);
  db.exec(`CREATE TRIGGER IF NOT EXISTS trg_locker_size_on_category
    AFTER UPDATE OF category ON products WHEN NEW.category='Botanicals'
    BEGIN
      INSERT OR IGNORE INTO product_size_variants(product_id,tier,weight_oz) VALUES(NEW.id,'small',1);
      INSERT OR IGNORE INTO product_size_variants(product_id,tier,weight_oz) VALUES(NEW.id,'medium',4);
      INSERT OR IGNORE INTO product_size_variants(product_id,tier,weight_oz) VALUES(NEW.id,'large',16);
    END;`);
  for(const v of LOCKER_TIERS)
    db.prepare("INSERT OR IGNORE INTO product_size_variants(product_id,tier,weight_oz) SELECT id,?,? FROM products WHERE category='Botanicals'").run(v.tier,v.ounces);
}

const html=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function renderLockerSizeChoices(db,product) {
  if(product.category!=="Botanicals")return "";
  const variants=db.prepare("SELECT tier,weight_oz FROM product_size_variants WHERE product_id=? AND status='draft'").all(product.id);
  const present=new Map(variants.map(item=>[item.tier,item.weight_oz]));
  const visible=LOCKER_TIERS.filter(item=>present.get(item.tier)===item.ounces);
  if(!visible.length)return "";
  const cards=visible.map((item,i)=>
    '<label class="locker-tier'+(item.tier==="large"?' locker-tier-internal':"")+'">'+
    '<input type="radio" name="locker-tier-'+Number(product.id)+'" value="'+item.tier+'" '+(i===0?"checked":"")+' aria-label="'+item.label+', '+html(item.display)+' — '+html(item.notes)+'">'+
    '<span class="locker-tier-face"><strong>'+item.label+'</strong><span>'+html(item.display)+'</span><small>'+html(item.notes)+'</small></span></label>'
  ).join("");
  return '<fieldset class="locker-tier-choices"><legend>LOCKER FORMATS <span>· preview only</span></legend>'+
    '<div class="locker-tier-grid">'+cards+'</div>'+
    '<p class="locker-tier-note">Format selection is a visual concept only. No pricing, reservation, ordering or sale is available. Legal limits and licensing apply.</p>'+
    '</fieldset>';
}

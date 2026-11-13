/**
 * The Green Locker — internal-only codename and draft format model.
 * A codename does not replace actual product identification or mandated disclosures.
 * No availability, sale, inventory allocations, prices or order endpoints.
 */
export const LOCKER_TIERS = Object.freeze([
  Object.freeze({tier:"xs", eighthOunces:1, label:"XS", display:"1/8 oz", notes:"Draft concept"}),
  Object.freeze({tier:"s", eighthOunces:2, label:"S", display:"1/4 oz", notes:"Draft concept"}),
  Object.freeze({tier:"m", eighthOunces:4, label:"M", display:"1/2 oz", notes:"Draft concept"}),
  Object.freeze({tier:"l", eighthOunces:8, label:"L", display:"1 oz", notes:"Draft concept"}),
  Object.freeze({tier:"xl", eighthOunces:32, label:"XL", display:"1/4 lb · 4 oz", notes:"Subject to applicable limits"})
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

const formatSchema = table => `CREATE TABLE ${table} (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK(tier IN ('xs','s','m','l','xl')),
  weight_eighth_oz INTEGER NOT NULL CHECK(
    (tier='xs' AND weight_eighth_oz=1) OR
    (tier='s' AND weight_eighth_oz=2) OR
    (tier='m' AND weight_eighth_oz=4) OR
    (tier='l' AND weight_eighth_oz=8) OR
    (tier='xl' AND weight_eighth_oz=32)
  ),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status='draft'),
  PRIMARY KEY(product_id,tier)
)`;

export function installLockerFiles(db) {
  // Keep product identity, all inventory movements, and existing lot records intact.
  // All size variants are design-only drafts; no quantities are allocated to formats.
  db.exec("BEGIN IMMEDIATE;");
  try {
    const cols=db.prepare("PRAGMA table_info(products)").all().map(row=>row.name);
    if(!cols.includes("codename"))db.exec("ALTER TABLE products ADD COLUMN codename TEXT");
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_locker_codename ON products(codename COLLATE NOCASE) WHERE codename IS NOT NULL;");
    const exists=Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='product_size_variants'").get());
    const variantColumns=exists?db.prepare("PRAGMA table_info(product_size_variants)").all().map(row=>row.name):[];
    // Remove old three-tier triggers before transforming the backing table.
    db.exec("DROP TRIGGER IF EXISTS trg_locker_size_on_create;");
    db.exec("DROP TRIGGER IF EXISTS trg_locker_size_on_category;");
    db.exec("DROP TRIGGER IF EXISTS trg_locker_size_off_category;");
    if(!exists){
      db.exec(formatSchema("product_size_variants"));
    } else if(!variantColumns.includes("weight_eighth_oz")) {
      // Legacy SMALL=1oz maps to new L; old MEDIUM=4oz maps to new XL.
      // The former 16oz LARGE concept is intentionally dropped.
      // Atomic replacement preserves product records and never touches stock/lot tables.
      db.exec(formatSchema("product_size_variants_next"));
      db.exec(`INSERT INTO product_size_variants_next(product_id,tier,weight_eighth_oz,status)
        SELECT v.product_id,
          CASE v.tier WHEN 'small' THEN 'l' WHEN 'medium' THEN 'xl' END,
          CASE v.tier WHEN 'small' THEN 8 WHEN 'medium' THEN 32 END,
          v.status
        FROM product_size_variants v JOIN products p ON p.id=v.product_id
        WHERE p.category='Botanicals' AND
          ((v.tier='small' AND v.weight_oz=1) OR (v.tier='medium' AND v.weight_oz=4));`);
      db.exec("DROP TABLE product_size_variants;");
      db.exec("ALTER TABLE product_size_variants_next RENAME TO product_size_variants;");
    }
    const addStatements=LOCKER_TIERS.map(item=>
      "INSERT OR IGNORE INTO product_size_variants(product_id,tier,weight_eighth_oz) VALUES(NEW.id,'"+
      item.tier+"',"+item.eighthOunces+");"
    ).join("\n");
    db.exec(`CREATE TRIGGER trg_locker_size_on_create AFTER INSERT ON products
      WHEN NEW.category='Botanicals' BEGIN ${addStatements} END;`);
    db.exec(`CREATE TRIGGER trg_locker_size_on_category AFTER UPDATE OF category ON products
      WHEN NEW.category='Botanicals' BEGIN ${addStatements} END;`);
    db.exec(`CREATE TRIGGER trg_locker_size_off_category AFTER UPDATE OF category ON products
      WHEN NEW.category!='Botanicals' BEGIN
        DELETE FROM product_size_variants WHERE product_id=NEW.id;
      END;`);
    db.prepare("DELETE FROM product_size_variants WHERE product_id IN (SELECT id FROM products WHERE category!='Botanicals')").run();
    for(const item of LOCKER_TIERS){
      db.prepare("INSERT OR IGNORE INTO product_size_variants(product_id,tier,weight_eighth_oz) SELECT id,?,? FROM products WHERE category='Botanicals'")
        .run(item.tier,item.eighthOunces);
    }
    db.exec("COMMIT;");
  }catch(error){db.exec("ROLLBACK;");throw error;}
}

const html=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function renderLockerSizeChoices(db,product) {
  if(product.category!=="Botanicals")return "";
  const variants=db.prepare("SELECT tier,weight_eighth_oz FROM product_size_variants WHERE product_id=? AND status='draft'").all(product.id);
  const present=new Map(variants.map(item=>[item.tier,item.weight_eighth_oz]));
  const visible=LOCKER_TIERS.filter(item=>present.get(item.tier)===item.eighthOunces);
  if(!visible.length)return "";
  const cards=visible.map((item,i)=>
    '<label class="locker-tier'+(item.tier==="xl"?' locker-tier-limit':"")+'">'+
    '<input type="radio" name="locker-tier-'+Number(product.id)+'" value="'+item.tier+'" '+(i===0?"checked":"")+' aria-label="'+item.label+', '+html(item.display)+' — '+html(item.notes)+'">'+
    '<span class="locker-tier-face"><strong>'+item.label+'</strong><span>'+html(item.display)+'</span><small>'+html(item.notes)+'</small></span></label>'
  ).join("");
  return '<fieldset class="locker-tier-choices"><legend>LOCKER FORMATS <span>· preview only</span></legend>'+
    '<div class="locker-tier-grid">'+cards+'</div>'+
    '<p class="locker-tier-note">Format selection is a visual concept only. No pricing, reservation, ordering or sale is available. Legal limits and licensing apply.</p>'+
    '</fieldset>';
}

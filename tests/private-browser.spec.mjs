import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { totpAt } from "../private/security.mjs";

const invite="ci-playwright-invitation-12345";
const password="Secure-preview-password-567";
const emailFor=()=>("preview-"+randomBytes(7).toString("hex")+"@example.com");
const assertNoOverflow=async page=>{
 const widths=await page.evaluate(()=>{
   const viewport=document.documentElement.clientWidth;
   const offenders=[...document.querySelectorAll("body *")].filter(el=>el.getBoundingClientRect().right>viewport+1).slice(0,10).map(el=>({tag:el.tagName,className:String(el.className).slice(0,70),right:Math.round(el.getBoundingClientRect().right)}));
   return {viewport,content:document.documentElement.scrollWidth,offenders};
 });
 expect(widths.content,"Unexpected horizontal scrolling; overflow elements: "+JSON.stringify(widths.offenders)).toBeLessThanOrEqual(widths.viewport+1);
};
async function register(page,email) {
 await page.goto("/register");
 await expect(page.getByRole("heading",{name:"Register for access"})).toBeVisible();
 await page.getByLabel("Email address").fill(email);
 await page.getByLabel("Password").fill(password);
 await page.getByLabel("Invitation code").fill(invite);
 const responsePromise=page.waitForResponse(r=>r.request().method()==="POST" && r.url().endsWith("/register"));
 await page.getByRole("button",{name:"Create private account"}).click();
 expect((await responsePromise).status()).toBe(303);
 await expect(page).toHaveURL(/\/check-email$/);
 const outbox=path.join(process.cwd(),"data","browser-ci.sqlite.outbox.ndjson");
 await expect.poll(()=>{
   if(!fs.existsSync(outbox))return "";
   const records=fs.readFileSync(outbox,"utf8").trim().split("\n").filter(Boolean).map(s=>JSON.parse(s));
   const matching=records.filter(item=>item.to===email&&item.subject.includes("Verify"));
   return matching.length?matching.at(-1).text.match(/https?:\/\/[^\s]+/)?.[0]||"":"";
 },{timeout:8000}).not.toBe("");
 const records=fs.readFileSync(outbox,"utf8").trim().split("\n").filter(Boolean).map(line=>JSON.parse(line));
 const verificationURL=new URL(records.filter(item=>item.to===email&&item.subject.includes("Verify")).at(-1).text.match(/https?:\/\/[^\s]+/)[0]);
 await page.goto(verificationURL.pathname+verificationURL.search);
 const verificationResponse=page.waitForResponse(r=>r.request().method()==="POST"&&new URL(r.url()).pathname==="/verify-email");
 await page.getByRole("button",{name:"Confirm email address"}).click();
 const verificationResult=await verificationResponse;
 expect(verificationResult.status(),(await verificationResult.text()).slice(0,350)).toBe(200);
 await expect(page.getByRole("heading",{name:"Email verified"})).toBeVisible();
 await page.goto("/login");
}
async function login(page,email) {
 await page.getByLabel("Email address").fill(email);
 await page.getByLabel("Password").fill(password);
 await page.getByRole("button",{name:"Log in",exact:true}).click();
 await expect(page).toHaveURL(/\/member$/);
 const ageYes=page.getByRole("button",{name:"YES, I AM 21+"});
 if (await ageYes.isVisible()) await ageYes.click();
}
test("anonymous visitors are redirected to login instead of seeing the homepage",async({page})=>{
 await page.goto("/");
 await expect(page).toHaveURL(/\/login$/);
 await expect(page.getByRole("heading",{name:"Welcome back"})).toBeVisible();
 await assertNoOverflow(page);
 await page.goto("/catalog");
 await expect(page).toHaveURL(/\/login$/);
 await page.goto("/member");
 await expect(page).toHaveURL(/\/login$/);
});
test("invited member can register, log in, and view concept-only catalog",async({page})=>{
 const email=emailFor();
 await register(page,email);
 await login(page,email);
 await expect(page.getByRole("heading",{level:1})).toBeVisible();
 await assertNoOverflow(page);
 await page.getByRole("link",{name:"Concept catalog"}).click();
 await expect(page.getByRole("heading",{name:/THE LOCKER FILES/i})).toBeVisible();
 const portal=page.locator("#locker-entry-portal");
 const skipIntro=page.getByRole("button",{name:"Skip intro"});
 const replayIntro=page.getByRole("button",{name:"Replay vault opening"});
 await expect(portal).toBeVisible();
 await expect(portal).toHaveAttribute("aria-describedby","locker-entry-instructions");
 await expect(page.locator(".locker-entry-orbit")).toHaveCount(1);
 await expect(page.locator(".locker-entry-footer")).toContainText("THE GREEN LOCKER");
 await expect(skipIntro).toBeFocused();
 await expect(page.locator(".catalog-grid")).toHaveJSProperty("inert",true);
 await expect(page.locator("body")).toHaveClass(/locker-entry-active/);
 expect(await skipIntro.evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
 await page.keyboard.press("Tab");
 await expect(skipIntro).toBeFocused();
 await expect(page.locator(".locker-entry-door-left")).toHaveCSS("animation-name","vault-entry-left");
 await page.keyboard.press("Escape");
 await expect(portal).toBeHidden();
 await expect(page.locator(".catalog-grid")).toHaveJSProperty("inert",false);
 await expect(page.locator("body")).not.toHaveClass(/locker-entry-active/);
 await expect(page.getByRole("heading",{name:/THE LOCKER FILES/i})).toBeFocused();
 await replayIntro.click();
 await expect(portal).toBeVisible();
 await skipIntro.click();
 await expect(portal).toBeHidden();
 await expect(replayIntro).toBeFocused(); // Replaying returns keyboard focus to its trigger.
 await page.reload();
 await expect(portal).toBeHidden(); // only once per browser tab
 await page.emulateMedia({reducedMotion:"reduce"});
 await page.reload();
 await expect(portal).toBeHidden();
 await expect(replayIntro).toBeHidden();
 await expect(page.getByText("Nothing available")).toHaveCount(0);
 await assertNoOverflow(page);
 if (test.info().project.name === "private-mobile-webkit") {
   // Guard narrow iPhone SE-sized layouts and wider modern phones.
   for (const width of [320, 375, 430]) {
     await page.setViewportSize({width,height:740});
     await assertNoOverflow(page);
     const nav = page.locator(".private-header nav");
     await expect(nav).toHaveCSS("display","grid");
     const navHeight = await nav.getByRole("link").first().evaluate(el=>el.getBoundingClientRect().height);
     expect(navHeight).toBeGreaterThanOrEqual(44);
   }
 }
 await page.getByRole("button",{name:"Log out"}).click();
 await expect(page).toHaveURL(/\/login$/);
 await page.goto("/catalog");
 await expect(page).toHaveURL(/\/login$/);
});
test("member vault dashboard personalizes greeting, remembers opt-in and unlocks accessibly",async({page})=>{
 const email=emailFor();
 await register(page,email);
 await login(page,email);
 await expect(page.getByRole("heading",{name:/Aloha,/})).toBeVisible();
 await expect(page.getByRole("link",{name:/Unlock the vault/})).toBeVisible();
 await expect(page.getByRole("link",{name:"My vault"})).toBeVisible();
 await expect(page.getByRole("link",{name:"Brand home"})).toBeVisible();
 await expect(page.getByRole("link",{name:/Browse without animation/})).toBeVisible();
 await expect(page.locator(".member-stat")).toHaveCount(3);
 await expect(page.getByText(/No prices, cart, purchases, reservations/i)).toBeVisible();
 await assertNoOverflow(page);

 const sound=page.getByRole("checkbox",{name:/Mechanical sound/});
 const haptics=page.getByRole("checkbox",{name:/Gentle haptics/});
 await expect(sound).not.toBeChecked();
 await expect(haptics).not.toBeChecked();
 if(await sound.isEnabled()){
   await sound.check();
   await expect(sound).toBeChecked();
 }
 const hapticsAvailable=await haptics.isEnabled();
 if(hapticsAvailable){
   await haptics.check();
   await expect(haptics).toBeChecked();
 }else{
   await expect(page.locator("[data-vault-feedback-hint]")).toContainText("not supported");
 }
 await page.reload();
 if(await sound.isEnabled()) await expect(sound).toBeChecked();
 if(hapticsAvailable) await expect(haptics).toBeChecked();

 await page.getByLabel("Display name").fill("Christopher");
 await page.getByRole("button",{name:"Save display name"}).click();
 await expect(page).toHaveURL(/\/member\?saved=1$/);
 await expect(page.getByRole("heading",{name:"Aloha, Christopher."})).toBeVisible();
 await page.reload();
 await expect(page.getByRole("heading",{name:"Aloha, Christopher."})).toBeVisible();
 await expect(page.locator("#member-display-name")).toHaveValue("Christopher");
 await assertNoOverflow(page);

 if(test.info().project.name==="private-mobile-webkit"){
   for(const width of [320,375,430]){
     await page.setViewportSize({width,height:740});
     await assertNoOverflow(page);
     const ctaHeight=await page.getByRole("link",{name:/Unlock the vault/}).evaluate(el=>el.getBoundingClientRect().height);
     expect(ctaHeight).toBeGreaterThanOrEqual(44);
   }
 }
 await page.getByRole("link",{name:/Unlock the vault/}).click();
 await expect(page.locator("#locker-entry-portal")).toBeVisible();
 await expect(page.locator(".locker-entry-skip")).toBeFocused();
 await expect(page.locator("body")).toHaveClass(/locker-entry-active/);
 await page.getByRole("button",{name:"Skip intro"}).click();
 await expect(page).toHaveURL(/\/catalog$/);
 await expect(page.locator("#locker-entry-portal")).toBeHidden();
 await expect(page.getByRole("heading",{name:/THE LOCKER FILES/i})).toBeVisible();
 await expect(page.getByRole("button",{name:/buy|checkout|order/i})).toHaveCount(0);
 await page.goto("/member");
 await page.getByRole("link",{name:"Browse without animation"}).click();
 await expect(page).toHaveURL(/\/catalog$/);
 await expect(page.locator("#locker-entry-portal")).toBeHidden();
 await assertNoOverflow(page);
});

test("administrator can manage draft products and stock without sales actions",async({page})=>{
 const email=emailFor();
 await register(page,email);
 await login(page,email);
 execFileSync(process.execPath,["private/admin-cli.mjs",email],{cwd:process.cwd(),env:{...process.env,TGL_DB_PATH:path.join(process.cwd(),"data","browser-ci.sqlite")}});
 await page.goto("/admin");
 await expect(page).toHaveURL(/\/admin\/mfa$/);
 await page.getByRole("button",{name:"Begin authenticator setup"}).click();
 const secret=await page.locator(".mfa-secret code").textContent();
 expect(secret).toMatch(/^[A-Z2-7]{32}$/);
 await page.getByLabel("Authentication code").fill(totpAt(secret));
 await page.getByRole("button",{name:"Verify identity"}).click();
 await expect(page.getByText("MFA enabled")).toBeVisible();
 await page.goto("/admin");
 await expect(page.locator(".private-logo img")).toHaveAttribute("src","/logo");
 await expect(page.getByRole("heading",{name:"Operations dashboard"})).toBeVisible();
 await assertNoOverflow(page);
 const sku="SAMPLE-"+randomBytes(3).toString("hex").toUpperCase();
 const productName="Sample accessory "+sku;
 const createForm=page.locator('form[action="/admin/products"]');
 await createForm.getByLabel("SKU",{exact:true}).fill(sku);
 await createForm.getByLabel("Name",{exact:true}).fill(productName);
 await createForm.locator('select[name="category"]').selectOption("Lifestyle");
 await createForm.getByRole("button",{name:"Save draft"}).click();
 await expect(page.getByText("Draft saved")).toBeVisible();
 await expect(page.getByText(sku,{exact:true}).first()).toBeVisible();
 const stockForm=page.locator('form[action="/admin/stock"]');
 await stockForm.getByLabel("Draft item").selectOption({label:sku+" — "+productName});
 await stockForm.getByLabel("Quantity change").fill("5");
 const movementReason="Development counted samples for "+sku;
 await stockForm.getByLabel("Reason").fill(movementReason);
 await stockForm.getByRole("button",{name:"Record adjustment"}).click();
 await expect(page.getByText("Inventory movement recorded")).toBeVisible();
 await expect(page.getByRole("cell",{name:movementReason,exact:true})).toBeVisible();
 await assertNoOverflow(page);
 await page.goto("/catalog");
 const card=page.locator(".catalog-card").filter({has:page.getByRole("heading",{name:productName,exact:true})});
 await expect(card).toBeVisible();
 await expect(card.getByText(/No prices, reservations or sales/i)).toBeVisible();
 await expect(page.getByRole("button",{name:/buy|checkout|order/i})).toHaveCount(0);
 await page.goto("/admin");
 const botanicalSku="BOT-"+randomBytes(4).toString("hex").toUpperCase();
 const botanicalCode="Vault Zero "+botanicalSku;
 const botanicalForm=page.locator('form[action="/admin/products"]');
 await botanicalForm.locator('input[name="sku"]').fill(botanicalSku);
 await botanicalForm.locator('input[name="name"]').fill("Botanical development concept "+botanicalSku);
 await botanicalForm.locator('input[name="codename"]').fill(botanicalCode);
 await botanicalForm.locator('select[name="category"]').selectOption("Botanicals");
 await botanicalForm.getByRole("button",{name:"Save draft"}).click();
 await expect(page.getByText("Draft saved")).toBeVisible();
 await page.goto("/catalog");
 const botanicalCard=page.locator(".catalog-card").filter({has:page.getByRole("heading",{name:botanicalCode,exact:true})});
 await expect(botanicalCard).toBeVisible();
 await expect(botanicalCard.locator(".locker-tier-face")).toHaveCount(4);
 if (test.info().project.name === "private-mobile-webkit") {
   const heights = await botanicalCard.locator(".locker-tier-face").evaluateAll(elements=>elements.map(el=>el.getBoundingClientRect().height));
   expect(Math.min(...heights)).toBeGreaterThanOrEqual(156);
 }
 for (const [index,pkg] of [
   {name:"THE KEY",weight:"1/8 oz"},
   {name:"THE SIGNAL",weight:"1/4 oz"},
   {name:"THE CIPHER",weight:"1/2 oz"},
   {name:"THE VAULT",weight:"1 oz"}
 ].entries()) {
   await expect(botanicalCard.locator(".locker-tier-face").nth(index)).toContainText(pkg.name);
   await expect(botanicalCard.locator(".locker-tier-face").nth(index)).toContainText(pkg.weight);
 }
 await expect(botanicalCard.getByText(/THE ARCHIVE|1\/4 lb|16 oz/i)).toHaveCount(0);
 await botanicalCard.locator(".locker-tier").nth(2).click();
 await expect(botanicalCard.locator('input[value="m"]')).toBeChecked();
 await expect(botanicalCard.locator(".locker-tier").nth(2)).toHaveClass(/is-unlocking/);
 await expect(botanicalCard.locator(".locker-tier-status")).toContainText("THE CIPHER · 1/2 oz · Preview unlocked · No sales");
 await expect(botanicalCard.locator(".locker-tier")).toHaveCount(4);
 await page.emulateMedia({reducedMotion:"reduce"});
 await botanicalCard.locator(".locker-tier").nth(3).click();
 await expect(botanicalCard.locator('input[value="l"]')).toBeChecked();
 await expect(botanicalCard.locator(".locker-tier-status")).toContainText("THE VAULT · 1 oz · Preview unlocked · No sales");
 await expect(botanicalCard.locator(".locker-tier.is-unlocking")).toHaveCount(0);
 await expect(page.getByRole("button",{name:/buy|checkout|order|reserve/i})).toHaveCount(0);
 await assertNoOverflow(page);
 await page.goto("/admin");
 await expect(page.locator(".locker-internal-package")).toContainText("THE ARCHIVE");
 await expect(page.locator(".locker-internal-package")).toContainText("1/4 lb");
 await assertNoOverflow(page);

});

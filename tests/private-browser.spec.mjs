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
 test.slow(); // Full authenticated mobile visual audit captures 21 screenshots.
 const email=emailFor();
 await register(page,email);
 await login(page,email);
 await expect(page.getByRole("heading",{level:1})).toBeVisible();
 await assertNoOverflow(page);
 await expect(page.getByRole("heading",{name:/Aloha,/})).toBeVisible();
 await expect(page.getByRole("link",{name:/Unlock the vault/})).toBeVisible();
 await expect(page.getByRole("link",{name:"My vault"})).toBeVisible();
 await expect(page.locator(".private-header nav").getByRole("link",{name:"Brand home"})).toBeVisible();
 await expect(page.getByRole("link",{name:"Browse without animation"})).toBeVisible();
 await expect(page.locator(".member-stat")).toHaveCount(3);
 await expect(page.getByText(/No prices, cart, purchases, reservations/i)).toBeVisible();
 const silent=page.getByRole("radio",{name:/^Silent/});
 const classic=page.getByRole("radio",{name:/^Classic/});
 const cinematic=page.getByRole("radio",{name:/^Cinematic/});
 const preview=page.getByRole("button",{name:"Preview selected sound"});
 const haptics=page.getByRole("checkbox",{name:/Gentle haptics/});
 await expect(page.locator("[data-vault-profile]")).toHaveCount(3);
 await expect(silent).toBeChecked();
 await expect(haptics).not.toBeChecked();
 await preview.click();
 await expect(page.locator("[data-vault-feedback-hint]")).toContainText("Silent mode");
 await expect(classic).toBeEnabled();
 await classic.check();
 await preview.click();
 await expect(page.locator("[data-vault-feedback-hint]")).toContainText("Previewing Classic");
 await cinematic.check();
 await preview.click();
 await expect(page.locator("[data-vault-feedback-hint]")).toContainText("Previewing Cinematic");
 const hapticsAvailable=await haptics.isEnabled();
 if(hapticsAvailable) await haptics.check();
 else await expect(page.locator("[data-vault-support]")).toContainText("not supported");
 await page.reload();
 await expect(cinematic).toBeChecked();
 if(hapticsAvailable) await expect(haptics).toBeChecked();
 const preferences=await page.evaluate(()=>JSON.parse(localStorage.getItem("tgl:vault-feedback:v2")||"{}"));
 expect(preferences.profile).toBe("cinematic");
 await silent.check();
 await page.reload();
 await expect(silent).toBeChecked();
 await expect(page.locator(".member-compartment")).toHaveCount(4);
 const memberCode=await page.locator("[data-member-code]").textContent();
 expect(memberCode).toMatch(/^GL-(?:[A-F0-9]{4}-){3}[A-F0-9]{4}$/);
 await expect(page.locator("#member-card")).toContainText(memberCode);
 const cardResponse=await page.request.get("/member/card.svg");
 expect(cardResponse.status()).toBe(200);
 expect(cardResponse.headers()["content-type"]).toMatch(/^image\/svg\+xml/);
 expect(cardResponse.headers()["content-disposition"]).toContain("attachment");
 const cardSvg=await cardResponse.text();
 expect(cardSvg).toContain(memberCode);
 expect(cardSvg).toContain("data:image/webp;base64,");
 expect(cardSvg).not.toContain(email);
 await page.locator('.member-compartment[href="#member-card"]').click();
 await expect(page).toHaveURL(/#member-card$/);
 await expect(page.locator("#member-card")).toBeFocused();
 await page.locator('.member-compartment[href="#member-settings"]').click();
 await expect(page).toHaveURL(/#member-settings$/);
 await expect(page.locator("#member-settings")).toBeFocused();
 await assertNoOverflow(page);
 await page.getByLabel("Display name").fill("Christopher");
 await page.getByRole("button",{name:"Save display name"}).click();
 await expect(page).toHaveURL(/\/member\?saved=1$/);
 await expect(page.getByRole("heading",{name:"Aloha, Christopher."})).toBeVisible();
 await page.reload();
 await expect(page.getByRole("heading",{name:"Aloha, Christopher."})).toBeVisible();
 await expect(page.locator("#member-display-name")).toHaveValue("Christopher");
 await expect(page.locator("[data-member-code]")).toHaveText(memberCode);
 await expect(page.locator("[data-card-scene]")).toHaveAttribute("data-card-theme","emerald");
 await expect(page.getByText("Apple Wallet setup pending")).toBeVisible();
 const walletAttempt=await page.request.get("/member/wallet.pkpass");
 expect(walletAttempt.status()).toBe(503);
 expect(walletAttempt.headers()["content-type"]).toContain("text/plain");
 const walletText=await walletAttempt.text();
 expect(walletText).toContain("signing is not yet configured");
 await expect(page.getByRole("button",{name:"Flip to back of membership card"})).toBeVisible();
 // This explicitly catches the iPhone WebKit defect in which both mirrored
 // card faces were painted through each other despite backface-visibility.
 await expect(page.locator("[data-card-front]")).toHaveCSS("visibility","visible");
 await expect(page.locator("[data-card-back]")).toHaveCSS("visibility","hidden");
 await page.getByRole("button",{name:"Flip to back of membership card"}).click();
 await expect(page.locator("[data-card-scene]")).toHaveAttribute("data-card-face","back");
 await expect(page.locator("[data-card-back]")).toHaveAttribute("aria-hidden","false");
 await expect(page.locator("[data-card-front]")).toHaveCSS("visibility","hidden",{timeout:3000});
 await expect(page.locator("[data-card-back]")).toHaveCSS("visibility","visible",{timeout:3000});
 await page.getByRole("button",{name:"Flip to front of membership card"}).click();
 await expect(page.locator("[data-card-scene]")).toHaveAttribute("data-card-face","front");
 await expect(page.locator("[data-card-front]")).toHaveCSS("visibility","visible",{timeout:3000});
 await expect(page.locator("[data-card-back]")).toHaveCSS("visibility","hidden",{timeout:3000});
 await page.getByLabel("Card finish").selectOption("obsidian");
 await page.getByLabel("Card edition").selectOption("Vault Explorer");
 await page.getByLabel("Personal motto (optional)").fill("Stay curious. Stay original.");
 await page.getByRole("button",{name:"Save card design"}).click();
 await expect(page).toHaveURL(/\/member\?card_saved=1#member-card$/);
 await expect(page.getByText("Your card design was saved.")).toBeVisible();
 await expect(page.locator("[data-card-scene]")).toHaveAttribute("data-card-theme","obsidian");
 await expect(page.locator(".member-edition")).toHaveText("Vault Explorer");
 await page.reload();
 await expect(page.getByLabel("Card finish")).toHaveValue("obsidian");
 await expect(page.getByLabel("Card edition")).toHaveValue("Vault Explorer");
 await expect(page.getByLabel("Personal motto (optional)")).toHaveValue("Stay curious. Stay original.");
 const brandedSVG=await (await page.request.get("/member/card.svg")).text();
 expect(brandedSVG).toContain("Stay curious. Stay original.");
 expect(brandedSVG).toContain("Vault Explorer");
 expect(brandedSVG).toContain(memberCode);
 const renamedSvg=await (await page.request.get("/member/card.svg")).text();
 expect(renamedSvg).toContain("Christopher");
 expect(renamedSvg).toContain(memberCode);
 await assertNoOverflow(page);
 if(test.info().project.name==="private-mobile-webkit"){
   const directory=path.join("test-results","green-locker-mobile-visual-qa");
   fs.mkdirSync(directory,{recursive:true});
   await page.emulateMedia({reducedMotion:"reduce"});
   for(const width of [320,375,430]){
     await page.setViewportSize({width,height:780});
     await assertNoOverflow(page);
     const ctaHeight=await page.getByRole("link",{name:/Unlock the vault/}).evaluate(el=>el.getBoundingClientRect().height);
     expect(ctaHeight).toBeGreaterThanOrEqual(44);
     await expect(page.locator(".member-compartment")).toHaveCount(4);
     const cardWidth=await page.locator("[data-card-scene]").evaluate(el=>el.getBoundingClientRect().width);
     expect(cardWidth).toBeLessThanOrEqual(width);
     const flipHeight=await page.locator("[data-card-flip]").evaluate(el=>el.getBoundingClientRect().height);
     expect(flipHeight).toBeGreaterThanOrEqual(44);
     const faceMetric=await page.locator("[data-card-front]").evaluate(face=>{
       const r=face.getBoundingClientRect();
       const items=[".member-credential-top",".member-credential-details",".member-credential-foot"]
         .map(selector=>{
           const el=face.querySelector(selector);
           const b=el.getBoundingClientRect();
           return {top:b.top,bottom:b.bottom,left:b.left,right:b.right};
         });
       return {face:{top:r.top,bottom:r.bottom,left:r.left,right:r.right},
         items,front:window.getComputedStyle(face).visibility,
         back:window.getComputedStyle(document.querySelector("[data-card-back]")).visibility};
     });
     expect(faceMetric.front).toBe("visible");
     expect(faceMetric.back).toBe("hidden");
     for(const item of faceMetric.items){
       expect(item.left).toBeGreaterThanOrEqual(faceMetric.face.left-2);
       expect(item.right).toBeLessThanOrEqual(faceMetric.face.right+2);
       expect(item.top).toBeGreaterThanOrEqual(faceMetric.face.top-2);
       expect(item.bottom).toBeLessThanOrEqual(faceMetric.face.bottom+2);
     }
     expect(faceMetric.items[0].bottom).toBeLessThanOrEqual(faceMetric.items[1].top+1);
     expect(faceMetric.items[1].bottom).toBeLessThanOrEqual(faceMetric.items[2].top+1);
     for(const [name,selector] of [
       ["welcome",".member-hero"],
       ["overview",".member-overview"],
       ["compartments",".member-compartments"],
       ["card-front","#member-card"],
       ["settings","#member-settings"]
     ]){
       await expect(page.locator(selector)).toBeVisible();
       await page.locator(selector).screenshot({
         path:path.join(directory,width+"-"+name+".png"),animations:"disabled"
       });
     }
     await page.getByRole("button",{name:"Flip to back of membership card"}).click();
     await expect(page.locator("[data-card-scene]")).toHaveAttribute("data-card-face","back");
     await expect(page.locator("[data-card-front]")).toHaveCSS("visibility","hidden");
     await expect(page.locator("[data-card-back]")).toHaveCSS("visibility","visible");
     await page.locator("#member-card").screenshot({
       path:path.join(directory,width+"-card-back.png"),animations:"disabled"
     });
     await page.getByRole("button",{name:"Flip to front of membership card"}).click();
     await assertNoOverflow(page);
     await page.screenshot({path:path.join(directory,width+"-full-dashboard.png"),fullPage:true,animations:"disabled"});
   }
   await page.emulateMedia({reducedMotion:"no-preference"});
 }
 await page.getByRole("link",{name:"Concept catalog"}).click();
 await expect(page.getByRole("heading",{name:/THE COLLECTION VAULT/i})).toBeVisible();
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
 await expect(page.getByRole("heading",{name:/THE COLLECTION VAULT/i})).toBeFocused();
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
 await page.emulateMedia({reducedMotion:"reduce"});
 await page.goto("/member");
 await page.locator('.member-compartment[href="#member-card"]').click();
 await expect(page).toHaveURL(/#member-card$/);
 await expect(page.locator(".member-compartment.is-opening")).toHaveCount(0);
 await page.emulateMedia({reducedMotion:"no-preference"});
 await page.goto("/member");
 await page.getByRole("link",{name:/Unlock the vault/}).click();
 await expect(page.locator("#locker-entry-portal")).toBeVisible();
 await expect(page.locator(".locker-entry-skip")).toBeFocused();
 await expect(page.locator("body")).toHaveClass(/locker-entry-active/);
 await page.getByRole("button",{name:"Skip intro"}).click();
 await expect(page).toHaveURL(/\/catalog$/);
 await expect(page.locator("#locker-entry-portal")).toBeHidden();
 await page.goto("/member");
 await page.getByRole("link",{name:"Browse without animation"}).click();
 await expect(page).toHaveURL(/\/catalog$/);
 await expect(page.locator("#locker-entry-portal")).toBeHidden();
 await assertNoOverflow(page);
 // The /shop route is a secured design gallery, never a commerce endpoint.
 await page.goto("/shop");
 await expect(page).toHaveURL(/\/shop$/);
 await expect(page.getByRole("heading",{name:/THE COLLECTION VAULT/i})).toBeVisible();
 await expect(page.locator(".collection-preview-section")).toHaveCount(3);
 await expect(page.locator(".collection-concept-botanical")).toHaveCount(4);
 await expect(page.locator(".collection-flavor")).toHaveCount(12);
 await expect(page.locator(".collection-concept-treat")).toHaveCount(2);
 await expect(page.locator(".catalog-card")).toHaveCount(0); // Legacy fixtures stay off the curated shop page.
 await expect(page.getByRole("link",{name:/Vape flavors/})).toHaveAttribute("href","#collection-vapes");
 await expect(page.locator(".collection-policy")).toContainText("No purchases, payments, checkout");
 await expect(page.getByRole("button",{name:/add to cart|buy now|purchase|checkout/i})).toHaveCount(0);
 await assertNoOverflow(page);
 if (test.info().project.name === "private-mobile-webkit") {
   const directory=path.join("test-results","green-locker-mobile-visual-qa");
   fs.mkdirSync(directory,{recursive:true});
   for(const width of [320,375,430]){
     await page.setViewportSize({width,height:770});
     await assertNoOverflow(page);
     for(const [name,selector] of [
       ["botanicals","#collection-botanicals"],
       ["vape-flavors","#collection-vapes"],
       ["crispy-treats","#collection-treats"]
     ]) {
       const panel=page.locator(selector);
       await expect(panel).toBeVisible();
       await panel.screenshot({
         path:path.join(directory,width+"-collection-"+name+".png"),animations:"disabled"
       });
     }
   }
 }
 await page.getByRole("button",{name:"Log out"}).click();
 await expect(page).toHaveURL(/\/login$/);
 await page.goto("/catalog");
 await expect(page).toHaveURL(/\/login$/);
 await page.goto("/shop");
 await expect(page).toHaveURL(/\/login$/);
});
test("administrator can manage draft products and stock without sales actions",async({page})=>{
 test.slow(); // Authenticated admin Wallet QA includes three responsive captures.
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
 await page.getByRole("link",{name:/Assortment Studio/}).click();
 await expect(page).toHaveURL(/\/admin\/assortment$/);
 await expect(page.locator(".assortment-editor-card")).toHaveCount(18);
 await expect(page.locator("#edit-botanicals .assortment-editor-card")).toHaveCount(4);
 await expect(page.locator("#edit-vapes .assortment-editor-card")).toHaveCount(12);
 await expect(page.locator("#edit-treats .assortment-editor-card")).toHaveCount(2);
 await expect(page.getByRole("heading",{name:"Vape brand identity"})).toBeVisible();
 await expect(page.getByText("No pricing, ordering, shipping or sale availability", {exact:false})).toBeVisible();
 await assertNoOverflow(page);
 if(test.info().project.name==="private-mobile-webkit"){
   const dir=path.join("test-results","green-locker-mobile-visual-qa");
   fs.mkdirSync(dir,{recursive:true});
   for(const width of [320,375,430]){
     await page.setViewportSize({width,height:750});
     await assertNoOverflow(page);
     await page.locator("#edit-botanicals").screenshot({
       path:path.join(dir,width+"-assortment-studio.png"),animations:"disabled"
     });
     const touch=await page.locator("#edit-botanical-01 summary").evaluate(el=>el.getBoundingClientRect().height);
     expect(touch).toBeGreaterThanOrEqual(44);
   }
 }
 const first=page.locator("#edit-botanical-01");
 await first.locator("summary").click();
 const editForm=first.locator('form[action="/admin/assortment/entry"]');
 await editForm.locator('input[name="title"]').fill("Coastal Gold Concept");
 await editForm.locator('textarea[name="description"]').fill("A premium emerald pouch concept; artwork and sourcing remain under review.");
 await editForm.getByRole("button",{name:"Save concept"}).click();
 await expect(page).toHaveURL(/\/admin\/assortment\?notice=/);
 await expect(page.getByRole("status",{name:""}).filter({hasText:"Concept saved"})).toBeVisible();
 const brandForm=page.locator('form[action="/admin/assortment/brand"]');
 await brandForm.locator('input[name="brand"]').fill("Night Vault Editions");
 await brandForm.getByRole("button",{name:"Save brand identity"}).click();
 await expect(page.getByText("Brand name saved",{exact:true})).toBeVisible();
 await page.locator("#edit-botanical-01 summary").click(); // Refresh closes details; reopen before clicking upload.
 const imageForm=page.locator('[data-concept-upload][data-slot="botanical-01"]');
 await imageForm.locator('input[type="file"]').setInputFiles({
   name:"preview.png",mimeType:"image/png",
   buffer:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAIAAAADnC86AAAAM0lEQVR4nO3NMQ0AMAgAsLEbHcjAvyxkkJDWQCO73oa/sorFYrFYLBaLxWKxWCwWi4/GA0xTAMBzt/a8AAAAAElFTkSuQmCC","base64")
 });
 // Admin artwork is stripped of source metadata and re-encoded as WebP.
 await imageForm.getByRole("button",{name:/Optimize & upload image/}).click();
 await expect(page.getByText("Artwork uploaded",{exact:true})).toBeVisible({timeout:15000});
 await expect(page.locator('#edit-botanical-01 .assortment-editor-thumb img')).toHaveAttribute("src",/\/concept-media\/[a-f0-9]{32}\.webp/);
 await page.locator("#edit-botanical-01 summary").click();
 const secondForm=page.locator('[data-concept-upload][data-slot="botanical-01"]');
 await secondForm.locator('input[type="file"]').setInputFiles({
   name:"alternate.png",mimeType:"image/png",
   buffer:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAIAAAADnC86AAAAM0lEQVR4nO3NMQ0AMAgAsLEbHcjAvyxkkJDWQCO73oa/sorFYrFYLBaLxWKxWCwWi4/GA0xTAMBzt/a8AAAAAElFTkSuQmCC","base64")
 });
 await secondForm.getByRole("button",{name:/Optimize & upload image/}).click();
 await expect(page.getByText("Artwork uploaded",{exact:true})).toBeVisible({timeout:15000});
 await page.locator("#edit-botanical-01 summary").click();
 const panel=page.locator("#edit-botanical-01 [data-gallery]");
 await expect(panel.locator("[data-photo-id]")).toHaveCount(2);
 await expect(panel.locator(".assortment-gallery-counter")).toContainText("2 / 8");
 // Mobile-accessible cover choice must preserve the new cover in SQLite.
 await panel.locator('[data-gallery-action="cover"]').last().click();
 await expect(panel.locator("[data-photo-id]").first().locator(".assortment-gallery-position")).toHaveText("Cover image");
 await panel.getByRole("button",{name:"Save image order"}).click();
 await expect(page.getByText("Gallery updated",{exact:true})).toBeVisible({timeout:10000});
 await page.locator("#edit-botanical-01 summary").click();
 await expect(page.locator("#edit-botanical-01 [data-gallery] [data-photo-id]")).toHaveCount(2);
 if(test.info().project.name==="private-mobile-webkit"){
   const dir=path.join("test-results","green-locker-mobile-visual-qa");
   for(const width of [320,375,430]){
     await page.setViewportSize({width,height:760});
     await assertNoOverflow(page);
     await page.locator("#edit-botanical-01").screenshot({
       path:path.join(dir,width+"-media-gallery-admin.png"),animations:"disabled"
     });
   }
 }
 await page.goto("/shop");
 await expect(page.getByText("Coastal Gold Concept",{exact:true})).toBeVisible();
 await expect(page.getByText("Night Vault Editions",{exact:true})).toBeVisible();
 const botanicalCard=page.locator(".collection-concept-botanical").first();
 await expect(botanicalCard.locator("img.collection-art-photo")).toHaveCount(2);
 await expect(botanicalCard.locator("img.collection-art-photo").first()).toHaveAttribute("src",/\/concept-media\/[a-f0-9]{32}\.webp/);
 await expect(botanicalCard.locator("img.collection-art-photo").nth(1)).toBeHidden();
 const firstSource=await botanicalCard.locator("img.collection-art-photo").first().getAttribute("src");
 await botanicalCard.getByRole("button",{name:/Next Coastal Gold Concept image/}).click();
 await expect(botanicalCard.locator("[data-gallery-counter]")).toHaveText("2 / 2");
 await expect(botanicalCard.locator("img.collection-art-photo").first()).toBeHidden();
 await expect(botanicalCard.locator("img.collection-art-photo").nth(1)).toBeVisible();
 expect(await botanicalCard.locator("img.collection-art-photo").nth(1).getAttribute("src")).not.toBe(firstSource);
 if(test.info().project.name==="private-mobile-webkit"){
   const dir=path.join("test-results","green-locker-mobile-visual-qa");
   for(const width of [320,375,430]){
     await page.setViewportSize({width,height:760});
     await assertNoOverflow(page);
     await page.locator("#collection-botanicals").screenshot({
       path:path.join(dir,width+"-multi-image-shop.png"),animations:"disabled"
     });
   }
 }
 await expect(page.getByRole("button",{name:/checkout|order now|buy now|pay now/i})).toHaveCount(0);
 await page.goto("/admin");
 await expect(page.getByRole("link",{name:/Wallet Operations/})).toBeVisible();
 await page.getByRole("link",{name:/Wallet Operations/}).click();
 await expect(page).toHaveURL(/\/admin\/wallet$/);
 await expect(page.getByRole("heading",{name:"Wallet Operations."})).toBeVisible();
 await expect(page.getByRole("heading",{name:"Operational alerts"})).toBeVisible();
 await expect(page.getByText("Apple Wallet signing is not configured.",{exact:false})).toBeVisible();
 await expect(page.getByText("No Wallet device registrations yet.")).toBeVisible();
 await expect(page.locator(".wallet-monitor-metric").getByText("APNs accepted",{exact:true})).toBeVisible();
 await expect(page.locator(".wallet-monitor-metric")).toHaveCount(8);
 await expect(page.locator(".wallet-cert-row")).toHaveCount(2);
 await assertNoOverflow(page);
 if (test.info().project.name==="private-mobile-webkit") {
   const beforeViewport=page.viewportSize();
   const dir=path.join("test-results","green-locker-mobile-visual-qa");
   fs.mkdirSync(dir,{recursive:true});
   for(const width of [320,375,430]) {
     await page.setViewportSize({width,height:790});
     await assertNoOverflow(page);
     await page.screenshot({
       path:path.join(dir,width+"-wallet-operations.png"),fullPage:true,animations:"disabled"
     });
     const navHeight=await page.locator(".wallet-monitor-return").evaluate(el=>el.getBoundingClientRect().height);
     expect(navHeight).toBeGreaterThanOrEqual(44);
   }
   await page.setViewportSize(beforeViewport);
 }
 await page.getByRole("link",{name:"Return to operations dashboard"}).click();
 await expect(page.getByRole("heading",{name:"Operations dashboard"})).toBeVisible();
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

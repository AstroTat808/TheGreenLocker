import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";

const invite="ci-playwright-invitation-12345";
const password="Secure-preview-password-567";
const emailFor=()=>("preview-"+randomBytes(7).toString("hex")+"@example.com");
const assertNoOverflow=async page=>{
 const widths=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,content:document.documentElement.scrollWidth}));
 expect(widths.content,"Unexpected horizontal scrolling on protected page").toBeLessThanOrEqual(widths.viewport+1);
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
 await expect(page).toHaveURL(/\/login\?registered=1/);
}
async function login(page,email) {
 await page.getByLabel("Email address").fill(email);
 await page.getByLabel("Password").fill(password);
 await page.getByRole("button",{name:"Log in",exact:true}).click();
 await expect(page).toHaveURL(/\/$/);
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
});
test("invited member can register, log in, and view concept-only catalog",async({page})=>{
 const email=emailFor();
 await register(page,email);
 await login(page,email);
 await expect(page.getByRole("heading",{level:1})).toBeVisible();
 await assertNoOverflow(page);
 await page.getByRole("link",{name:"Internal catalog"}).click();
 await expect(page.getByRole("heading",{name:"Catalog concepts"})).toBeVisible();
 await expect(page.getByText("Nothing available")).toHaveCount(0);
 await assertNoOverflow(page);
 await page.getByRole("button",{name:"Log out"}).click();
 await expect(page).toHaveURL(/\/login$/);
 await page.goto("/catalog");
 await expect(page).toHaveURL(/\/login$/);
});
test("administrator can manage draft products and stock without sales actions",async({page})=>{
 const email=emailFor();
 await register(page,email);
 await login(page,email);
 execFileSync(process.execPath,["private/admin-cli.mjs",email],{cwd:process.cwd(),env:{...process.env,TGL_DB_PATH:path.join(process.cwd(),"data","browser-ci.sqlite")}});
 await page.goto("/admin");
 await expect(page.getByRole("heading",{name:"Operations dashboard"})).toBeVisible();
 await assertNoOverflow(page);
 const sku="SAMPLE-"+randomBytes(3).toString("hex").toUpperCase();
 const productName="Sample accessory "+sku;
 await page.getByLabel("SKU").fill(sku);
 await page.getByLabel("Name").fill(productName);
 await page.getByLabel("Category").selectOption("Lifestyle");
 await page.getByRole("button",{name:"Save draft"}).click();
 await expect(page.getByText("Draft saved")).toBeVisible();
 await expect(page.getByText(sku,{exact:true}).first()).toBeVisible();
 await page.getByLabel("Draft item").selectOption({label:sku+" — "+productName});
 await page.getByLabel("Quantity change").fill("5");
 const movementReason="Development counted samples for "+sku;
 await page.getByLabel("Reason").fill(movementReason);
 await page.getByRole("button",{name:"Record adjustment"}).click();
 await expect(page.getByText("Inventory movement recorded")).toBeVisible();
 await expect(page.getByRole("cell",{name:movementReason,exact:true})).toBeVisible();
 await assertNoOverflow(page);
 await page.goto("/catalog");
 const card=page.locator(".catalog-card").filter({has:page.getByRole("heading",{name:productName,exact:true})});
 await expect(card).toBeVisible();
 await expect(card.getByText("No prices or sales")).toBeVisible();
 await expect(page.getByRole("button",{name:/buy|checkout|order/i})).toHaveCount(0);
});

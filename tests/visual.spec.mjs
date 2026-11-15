import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { verifyVisual } from "./visual-fingerprint.mjs";

test("homepage mobile visual snapshots enforce approved icon and layout signatures",async({page})=>{
  const project=test.info().project.name;
  if(!["mobile-webkit","narrow-chromium"].includes(project))test.skip();
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto("/?preview=1");
  const directory=path.join("test-results","green-locker-visual-qa");
  fs.mkdirSync(directory,{recursive:true});
  for(const width of [320,375,430]){
    await page.setViewportSize({width,height:780});
    await expect(page.locator(".hero h1")).toBeVisible();
    await expect(page.locator(".circle-arrow .ui-icon")).toHaveCount(4);
    const screenshot=await page.locator(".hero").screenshot({
      path:path.join(directory,project+"-"+width+"-hero.png"),animations:"disabled"
    });
    verifyVisual("public-"+project+"-"+width+"-hero",screenshot);
    const collectionShot=await page.locator(".collection-card.card-one").screenshot({
      path:path.join(directory,project+"-"+width+"-collection-card.png"),animations:"disabled"
    });
    verifyVisual("public-"+project+"-"+width+"-collection-card",collectionShot);
    const geometry=await page.evaluate(()=>({
      document:document.documentElement.scrollWidth,viewport:document.documentElement.clientWidth,
      buttons:[...document.querySelectorAll(".hero-actions a")].map(el=>el.getBoundingClientRect().width),
      logo:document.querySelector(".hero-logo").getBoundingClientRect().width
    }));
    expect(geometry.document).toBeLessThanOrEqual(geometry.viewport+1);
    expect(geometry.buttons.every(w=>w>=44)).toBe(true);
    expect(geometry.logo).toBeLessThanOrEqual(geometry.viewport*.77);
  }
});

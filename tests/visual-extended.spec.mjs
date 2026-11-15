import { test,expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { verifyOrCaptureNewVisual } from "./visual-fingerprint.mjs";

const scenarios={
  "desktop-chromium":{width:1440,height:900,slug:"desktop-chromium-1440x900"},
  "tablet-chromium":{width:768,height:1024,slug:"tablet-chromium-768x1024"},
  "mobile-webkit":{width:844,height:390,slug:"mobile-webkit-844x390"}
};

test("desktop, tablet and landscape iPhone artwork and layout are protected",async({page})=>{
  const cfg=scenarios[test.info().project.name];
  if(!cfg)test.skip();
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.setViewportSize({width:cfg.width,height:cfg.height});
  await page.goto("/?preview=1");
  await page.locator(".hero-logo").evaluate(img=>img.decode());
  const dir=path.join("test-results","green-locker-extended-visual-qa");
  fs.mkdirSync(dir,{recursive:true});
  for(const [name,selector] of [["hero",".hero"],["collection-card",".collection-card.card-one"]]){
    const panel=page.locator(selector);
    await expect(panel).toBeVisible();
    const shot=await panel.screenshot({
      path:path.join(dir,cfg.slug+"-"+name+".png"),animations:"disabled"
    });
    verifyOrCaptureNewVisual("public-"+cfg.slug+"-"+name,shot);
  }
  const result=await page.evaluate(()=>({
    viewport:document.documentElement.clientWidth,
    content:document.documentElement.scrollWidth,
    logo:document.querySelector(".hero-logo").getBoundingClientRect().width,
    clippedHeadline:document.querySelector(".hero h1").scrollWidth-document.querySelector(".hero h1").clientWidth,
    iconCount:document.querySelectorAll(".circle-arrow .ui-icon").length
  }));
  expect(result.content,"No horizontal overflow in "+cfg.slug).toBeLessThanOrEqual(result.viewport+1);
  expect(result.clippedHeadline,"No clipped editorial headline").toBeLessThanOrEqual(1);
  expect(result.logo,"Crest must fit within viewport").toBeLessThanOrEqual(cfg.width);
  expect(result.iconCount).toBe(4);
});

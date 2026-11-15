import { test, expect } from "@playwright/test";

test("homepage local navigation and transfer satisfy iPhone performance gate",async({page})=>{
  await page.addInitScript(()=>{
    window.__tglLayoutShift=0;
    if("PerformanceObserver" in window){
      try{
        new PerformanceObserver(list=>{
          for(const entry of list.getEntries())
            if(!entry.hadRecentInput)window.__tglLayoutShift+=entry.value;
        }).observe({type:"layout-shift",buffered:true});
      }catch{}
    }
  });
  await page.goto("/?preview=1",{waitUntil:"load"});
  await expect(page.locator(".hero h1")).toBeVisible();
  const measurement=await page.evaluate(()=>{
    const nav=performance.getEntriesByType("navigation")[0];
    const entries=performance.getEntriesByType("resource");
    const images=[...document.querySelectorAll(".hero img")];
    return {
      dcl:nav?.domContentLoadedEventEnd||0,
      load:nav?.loadEventEnd||0,
      resourceBytes:entries.reduce((sum,x)=>sum+(x.transferSize||x.decodedBodySize||0),0),
      cls:window.__tglLayoutShift||0,
      heroLoaded:images.every(x=>x.complete&&x.naturalWidth>0),
      heroPriority:images.every(x=>x.getAttribute("fetchpriority")==="high"),
      viewport:document.documentElement.clientWidth,
      document:document.documentElement.scrollWidth
    };
  });
  expect(measurement.dcl).toBeGreaterThan(0);
  expect(measurement.dcl,"DOM content ready should not block on expensive JS").toBeLessThan(3500);
  expect(measurement.load,"Local homepage load became unexpectedly slow").toBeLessThan(4500);
  expect(measurement.resourceBytes,"Homepage transferred excessive bytes").toBeLessThan(460000);
  expect(measurement.cls,"Unstable hero layout").toBeLessThanOrEqual(.1);
  expect(measurement.heroLoaded).toBe(true);
  expect(measurement.heroPriority).toBe(true);
  expect(measurement.document).toBeLessThanOrEqual(measurement.viewport+1);
  await page.emulateMedia({reducedMotion:"reduce"});
  const reduced=await page.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior);
  expect(reduced).toBe("auto");
});

import { test, expect } from "@playwright/test";

test("preview acknowledgement works without implying verified age", async ({ page }) => {
  await page.goto("/");
  const dialog = page.locator("#ageDialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByText("not identity verification")).toBeVisible();
  await page.getByRole("button", { name: "YES, I AM 21+" }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(dialog).not.toBeVisible();
});

test("declining adult acknowledgement exits the preview", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "NO, EXIT PREVIEW" }).click();
  await expect(page.getByText("Preview unavailable")).toBeVisible();
  await expect(page.locator(".hero")).toHaveCount(0);
});

test("navigation, visual media, and layout fit viewport", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", err => pageErrors.push(err.message));
  await page.goto("/?preview=1");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("img.hero-logo")).toHaveAttribute("src","assets/shield-logo-transparent.svg");
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href","assets/shield-logo-transparent.svg");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href","assets/shield-favicon.png");
  const toggle = page.locator("#navToggle");
  if (await toggle.isVisible()) {
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
    await page.getByRole("navigation").getByRole("link", { name: "Collections" }).click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  } else {
    await expect(page.getByRole("navigation")).toBeVisible();
  }
  // Images inside the closed age-acknowledgement dialog are intentionally hidden.
  // Scroll only images that participate in the current layout; verify their loading separately.
  for (const img of await page.locator('img:visible').all()) await img.scrollIntoViewIfNeeded();
  const metrics = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    heroText: document.querySelector(".hero h1").scrollWidth,
    heroBox: document.querySelector(".hero h1").clientWidth,
    unloaded: Array.from(document.images).filter(i => !i.complete || i.naturalWidth === 0).map(i => i.src),
    missingAnchors: Array.from(document.querySelectorAll('a[href^="#"]'))
      .map(a => a.getAttribute("href").slice(1)).filter(id => id && !document.getElementById(id))
  }));
  expect(metrics.document, "Unexpected horizontal scrolling").toBeLessThanOrEqual(metrics.viewport + 1);
  expect(metrics.heroText, "Hero headline is clipped").toBeLessThanOrEqual(metrics.heroBox + 1);
  expect(metrics.unloaded).toEqual([]);
  expect(metrics.missingAnchors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("required document semantics and no sales actions", async ({ page }) => {
  await page.goto("/?preview=1");
  await expect(page.getByRole("main")).toHaveCount(1);
  // Responsive layouts collapse the navigation with display:none until the menu opens.
  // Verify the semantic landmark exists in the DOM, even while intentionally collapsed.
  await expect(page.locator('nav[aria-label="Primary navigation"]')).toHaveCount(1);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  await expect(page.getByText("NOT AN ACTIVE RETAIL STORE")).toBeVisible();
  await expect(page.locator("form[action], input[type=payment], button[name=checkout]")).toHaveCount(0);
});


test("transparent official crest loads without a rectangular background", async ({ page }) => {
  await page.goto("/?preview=1");
  const result = await page.evaluate(async () => {
    const response = await fetch("/assets/shield-logo-transparent.svg");
    if (!response.ok) throw new Error("Transparent crest request failed");
    const text = await response.text();
    const svg = new DOMParser().parseFromString(text, "image/svg+xml");
    const image = new Image();
    image.src = "/assets/shield-logo-transparent.svg";
    await image.decode();
    return {
      masked: !!svg.querySelector('mask#shield-cutout path[fill="#fff"]'),
      imageInsideMask: svg.querySelector('image')?.getAttribute("mask") === "url(#shield-cutout)",
      logoLoaded: image.naturalWidth === 800 && image.naturalHeight === 800
    };
  });
  expect(result).toEqual({masked:true,imageInsideMask:true,logoLoaded:true});
});

test("mobile brand header and hero preserve compact proportions without clipping", async ({ page }) => {
  await page.goto("/?preview=1");
  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({width,height:812});
    const m = await page.evaluate(() => {
      const logo = document.querySelector(".hero-logo").getBoundingClientRect();
      const brand = document.querySelector(".brand img").getBoundingClientRect();
      const eyebrow = document.querySelector(".hero .eyebrow").getBoundingClientRect();
      const head = document.querySelector(".hero h1");
      return {
        viewport:document.documentElement.clientWidth,
        document:document.documentElement.scrollWidth,
        logoWidth:logo.width,
        brandWidth:brand.width,
        visualGap:eyebrow.top-logo.bottom,
        titleWidth:head.scrollWidth,
        titleBox:head.clientWidth
      };
    });
    expect(m.document,"Horizontal overflow at "+width).toBeLessThanOrEqual(m.viewport+1);
    expect(m.logoWidth,"Hero logo is too dominant at "+width).toBeLessThanOrEqual(m.viewport*.77);
    expect(m.brandWidth,"Unexpected brand logo size at "+width).toBeGreaterThanOrEqual(46);
    expect(m.brandWidth).toBeLessThanOrEqual(49);
    expect(m.visualGap,"Oversized space between crest and headline at "+width).toBeLessThanOrEqual(34);
    expect(m.titleWidth,"Headline clipped at "+width).toBeLessThanOrEqual(m.titleBox+1);
  }
});

test("all public direction symbols are branded vectors, not emoji on iPhone",async({page})=>{
  await page.goto("/?preview=1");
  await expect(page.locator(".circle-arrow svg.ui-icon")).toHaveCount(4);
  const symbols=await page.locator(".ui-icon use").evaluateAll(nodes=>
    nodes.map(el=>el.getAttribute("href")));
  expect(symbols.length).toBeGreaterThanOrEqual(11);
  expect(symbols.every(x=>/^assets\/ui-icons\.svg#(up-right|right|left|down|up|chevron-left|chevron-right)$/.test(x))).toBe(true);
  const response=await page.request.get("/assets/ui-icons.svg");
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain('id="up-right"');
  const color=await page.locator(".circle-arrow").first().evaluate(el=>({
    fg:getComputedStyle(el).color,bg:getComputedStyle(el).backgroundColor,
    icon:getComputedStyle(el.querySelector("svg")).stroke
  }));
  expect(color.fg).toBe("rgb(233, 199, 140)");
  expect(color.bg).toBe("rgb(14, 45, 29)");
  expect(color.icon).toBe("rgb(233, 199, 140)");
  expect(await page.locator("a,button").allTextContents()).not.toContain("↗");
});

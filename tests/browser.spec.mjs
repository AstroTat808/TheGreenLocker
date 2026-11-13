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
  await expect(page.locator("img.hero-logo")).toHaveAttribute("src","assets/shield-logo.webp");
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href","assets/shield-favicon.png");
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

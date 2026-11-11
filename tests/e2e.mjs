// End-to-end check of the built site:  node tests/e2e.mjs <playwright module dir> [base url]
// Walks the real buying journey and crawls every internal link.
import { createRequire } from "node:module";
import path from "node:path";

const [pwDir, baseUrl = "http://localhost:4321/pieza-demo/"] = process.argv.slice(2);
const { chromium } = createRequire(path.join(pwDir, "package.json"))("playwright");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
let failed = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failed++; };
const go = (p) => page.goto(new URL(p, baseUrl).href, { waitUntil: "networkidle" });

// Home: base piece tabs switch the bench, keyboard works
await go("");
await page.click("[data-pick='switch-2']");
ok(await page.isVisible("#bench-switch-2") && !(await page.isVisible("#bench-iphone-16e")), "base piece tab shows the Switch 2 bench");
await page.focus("[data-pick='switch-2']");
await page.keyboard.press("ArrowRight");
ok(await page.isVisible("#bench-canon-r50"), "arrow key moves to the next base piece");
await page.click("#bench-canon-r50 [data-add]"); // first fitting piece for the Canon: the DJI drone
await page.waitForFunction(() => document.querySelector("[data-cart-count]").textContent === "1", null, { timeout: 3000 }).catch(() => {});
ok((await page.textContent("[data-cart-count]")) === "1", "'+ Sumar' on the bench adds to cart");

// Catalog: drawer filter, search, sort
await go("productos/?cajon=gaming");
ok((await page.locator(".slot:visible").count()) === 8, "drawer filter shows the 8 gaming products");
await page.fill("#q", "airpods");
await page.waitForTimeout(400);
ok((await page.locator(".slot:visible").count()) === 3, "typing 'airpods' leaves 3 products");
await page.fill("#q", "zzzz");
await page.waitForTimeout(400);
ok(await page.isVisible("[data-empty]"), "no results message shows");
await go("productos/?orden=asc");
const prices = await page.$$eval(".slot:not([hidden])", (els) => els.map((e) => +e.dataset.price));
ok(prices.every((p, i) => !i || prices[i - 1] <= p), "sort by price ascending");

// Product: cuotas calculator + add 2
await go("p/iphone-16e/");
await page.click(".cuotas__opts label:nth-child(2)");
ok((await page.textContent("[data-cuota]")).replace(/\D/g, "") === "470333", "3 cuotas of $470.333 for $1.410.999");
await page.fill("#qty", "2");
await page.click(".buy button");
await page.waitForFunction(() => document.querySelector("[data-cart-count]").textContent === "3", null, { timeout: 3000 }).catch(() => {});
ok((await page.textContent("[data-cart-count]")) === "3", "adding 2 iPhones makes the cart 3");
ok(await page.isVisible(".toast.is-on"), "toast confirms the add");
await go("p/ps-portal/");
ok((await page.locator(".buy").count()) === 0 && (await page.isVisible(".stock--out")), "out of stock product cannot be bought");

// Map: preselected piece lights its neighbours
await go("mapa/?pieza=canon-r50");
ok((await page.locator(".pin.is-near").count()) === 4 && (await page.locator(".mapview__links line").count()) === 4, "map shows 4 neighbours with lines");

// Cart: quantities, totals, validation, simulated payment
await go("carrito/");
ok((await page.locator(".line").count()) === 2, "cart lists 2 lines");
await page.click("[data-line='iphone-16e'] [data-qty='-1']");
ok((await page.textContent("[data-cart-count]")) === "2", "minus button lowers the quantity");
await page.waitForFunction(() => document.querySelector("[data-line='iphone-16e'] output")?.textContent === "1");
const total = await page.textContent(".total dd");
ok(total.replace(/\D/g, "") === String(1410999 + 1787999), "total = iPhone 16e + DJI Mini 4 Pro, free shipping");
await page.click("[data-pay]");
ok((await page.locator(".field.is-bad").count()) === 7, "empty form shows 7 errors");
ok(await page.evaluate(() => document.activeElement.id === "f-name"), "focus goes to the first wrong field");
await page.fill("#f-name", "Lucía Gómez");
await page.fill("#f-email", "lucia@");
await page.fill("#f-phone", "261 555 1234");
await page.fill("#f-street", "San Martín 1200");
await page.fill("#f-city", "Mendoza");
await page.selectOption("#f-prov", "Mendoza");
await page.fill("#f-zip", "55");
await page.click("[data-pay]");
ok((await page.textContent("#f-email-err")).includes("email") && (await page.textContent("#f-zip-err")).includes("postal"), "bad email and postal code are explained");
await page.fill("#f-email", "lucia@example.com");
await page.fill("#f-zip", "5500");
await Promise.all([page.waitForURL(/pedido\/\?n=PZ-/, { timeout: 8000 }), page.click("[data-pay]")]);
ok((await page.textContent("[data-order-title]")).includes("Lucía"), "order page thanks the buyer by name");
ok((await page.locator("[data-order-lines] .line").count()) === 2, "order page lists the items");
ok((await page.textContent("[data-cart-count]")) === "0", "cart is empty after paying");

// Crawl every internal link from every page
const seen = new Set(), queue = [baseUrl], broken = [];
while (queue.length) {
  const u = queue.shift();
  if (seen.has(u)) continue;
  seen.add(u);
  const res = await page.goto(u, { waitUntil: "domcontentloaded" });
  if (!res || res.status() >= 400) { broken.push(`${res?.status()} ${u}`); continue; }
  if (!res.headers()["content-type"]?.includes("html")) continue;
  const links = await page.$$eval("a[href], img[src], link[href], script[src]", (els) => els.map((e) => e.href || e.src));
  for (const l of links) {
    const clean = l.split("#")[0];
    if (clean.startsWith(baseUrl) && !seen.has(clean)) {
      if (/\.(webp|css|js|svg|json)$/.test(clean)) { const r = await page.request.get(clean); seen.add(clean); if (r.status() >= 400) broken.push(`${r.status()} ${clean}`); }
      else queue.push(clean);
    }
  }
}
ok(broken.length === 0, `crawled ${seen.size} internal URLs, broken: ${broken.join(", ") || "none"}`);
ok(errors.length === 0, `browser errors: ${errors.join(" | ") || "none"}`);
await browser.close();
console.log(failed ? `${failed} FAILED` : "ALL PASSED");
process.exit(failed ? 1 : 0);

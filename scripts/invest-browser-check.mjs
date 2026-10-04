import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";

const base = process.env.APP_BASE_URL || "http://127.0.0.1:8081";
const out = "artifacts/browser";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
let activePage;
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    activePage = page;
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base + "/#feed");
    await page.getByRole("heading", { name: "Market data feed" }).waitFor();
    await page.getByRole("button", { name: "Test company", exact: true }).click();
    await page.getByText("Choose a provider and enter its API key.", { exact: true }).waitFor();
    await page.getByLabel("Provider", { exact: true }).selectOption("Finnhub");
    await page.getByLabel("API key", { exact: true }).fill("fixture-key");
    await page.getByLabel("Refresh daily while this app is open", { exact: true }).check();
    // Persisted changes must survive reload. Disable scheduling before a provider request is due.
    await page.getByLabel("Refresh daily while this app is open", { exact: true }).uncheck();
    await page.reload();
    await page.getByRole("heading", { name: "Market data feed" }).waitFor();
    assert.equal(await page.getByLabel("API key", { exact: true }).inputValue(), "fixture-key");
    await page.getByLabel("Provider", { exact: true }).selectOption("Polygon");
    assert.equal(await page.getByLabel("API key", { exact: true }).inputValue(), "");
    await page.getByRole("button", { name: "Clear key", exact: true }).click();
    await page.getByRole("button", { name: "US stocks", exact: true }).click();
    await page.locator("main").getByRole("button", { name: "Live feed", exact: true }).click();
    assert.equal(new URL(page.url()).hash, "#feed");
    await page.getByRole("button", { name: "Rules", exact: true }).click();
    await page.getByLabel("Cap floor USD bn", { exact: true }).fill("1");
    assert.equal(await page.getByLabel("Cap floor USD bn", { exact: true }).inputValue(), "10");
    await page.getByLabel("Historical EPS CAGR", { exact: true }).fill("1");
    await page.getByLabel("Company guidance", { exact: true }).fill("0");
    await page.getByRole("button", { name: "US stocks", exact: true }).click();
    await page.getByRole("button", { name: "Import US stocks", exact: true }).click();
    await page.getByText("Choose Financial Modeling Prep, Finnhub, or Polygon on Live feed, and paste the key there.", { exact: true }).waitFor();
    await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("invest-desk-v1"));
      data.listings = [{ ticker: "TEST", name: "Fixture Industries", sector: "Industrials", industry: "Machinery", exchange: "NYSE", marketCapBn: 40, price: 20 }];
      data.view = "listings";
      localStorage.setItem("invest-desk-v1", JSON.stringify(data));
    });
    await page.reload();
    await page.getByRole("button", { name: "Add to research", exact: true }).click();
    await page.getByRole("heading", { name: "Research universe", exact: true }).waitFor();
    assert.ok((await page.locator("main").innerText()).includes("Fixture Industries"));
    await page.getByLabel("Last annual fiscal year end", { exact: true }).waitFor();
    await page.screenshot({ path: out + "/research-" + viewport.width + ".png", fullPage: true });
    for (const label of ["Pilot board", "Rules", "Equations", "Live feed", "US stocks"]) {
      await page.getByRole("navigation", { name: "Sections" }).getByRole("button", { name: label, exact: true }).click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      assert.equal(overflow, false, label + " overflows at " + viewport.width);
    }
    await page.screenshot({ path: out + "/stocks-" + viewport.width + ".png", fullPage: true });
    assert.deepEqual(errors, [], "Uncaught browser errors at " + viewport.width);
    console.log("PASS: feed validation, persistence, provider switch, rules, directory staging, navigation and layout at " + viewport.width + "px");
    await context.close();
  }
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: out + "/failure.png", fullPage: true });
    console.error("BROWSER_STATE=" + JSON.stringify({ url: activePage.url(), text: await activePage.locator("body").innerText() }));
  }
  throw error;
} finally { await browser.close(); }
